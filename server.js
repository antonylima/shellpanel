require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
global.WebSocket = WebSocket;
const path = require('path');
const fs = require('fs');
const { spawn, execSync, exec } = require('child_process');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PRESETS_DIR = path.join(__dirname, 'presets');

// Supabase Auth Setup
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const isAuthEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const supabase = isAuthEnabled ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    transport: WebSocket
  }
}) : null;

// Ensure presets directory exists
if (!fs.existsSync(PRESETS_DIR)) {
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Public Auth Configuration Endpoint
app.get('/api/auth/config', (req, res) => {
  res.json({
    authRequired: isAuthEnabled,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY
  });
});

// Middleware for Authenticated REST API Endpoints
async function requireAuth(req, res, next) {
  if (!isAuthEnabled) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login para continuar.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Falha na validação da sessão: ' + err.message });
  }
}

// Protect all /api endpoints below, except /api/auth/config
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/config') {
    return next();
  }
  return requireAuth(req, res, next);
});

// Store active processes: id -> { process, cwd, command, startTime }
const activeProcesses = new Map();
let currentDefaultCwd = process.cwd();

// Platform & Capabilities Detection (Generic & Portable)
function detectHostCapabilities() {
  const platform = os.platform(); // 'win32' | 'linux' | 'darwin'
  const isWin = platform === 'win32';
  const isLinux = platform === 'linux';
  const isMac = platform === 'darwin';

  let hasWsl = false;
  let hasBash = false;
  let hasPowershell = false;

  if (isWin) {
    // Check if WSL is available
    try {
      execSync('where wsl.exe', { stdio: 'ignore' });
      hasWsl = true;
    } catch (e) {
      hasWsl = false;
    }

    // Check if standard bash (Git Bash / MSYS) is available
    try {
      execSync('where bash.exe', { stdio: 'ignore' });
      hasBash = true;
    } catch (e) {
      hasBash = false;
    }

    hasPowershell = true;
  } else {
    // Linux or macOS
    hasBash = true;
    try {
      execSync('which pwsh', { stdio: 'ignore' });
      hasPowershell = true;
    } catch (e) {
      hasPowershell = false;
    }
  }

  return {
    platform,
    isWin,
    isLinux,
    isMac,
    hasWsl,
    hasBash,
    hasPowershell
  };
}

// REST API: System Info & Capabilities
app.get('/api/info', (req, res) => {
  const caps = detectHostCapabilities();
  let username = 'user';
  try {
    username = os.userInfo().username;
  } catch (e) {}

  res.json({
    cwd: currentDefaultCwd,
    platform: caps.platform,
    isLinux: caps.isLinux,
    isWin: caps.isWin,
    isMac: caps.isMac,
    hasWsl: caps.hasWsl,
    hasBash: caps.hasBash,
    hasPowershell: caps.hasPowershell,
    hostname: os.hostname(),
    username: username,
    homedir: os.homedir()
  });
});

// REST API: Change CWD
app.post('/api/info/cwd', (req, res) => {
  const { cwd } = req.body;
  if (!cwd) return res.status(400).json({ error: 'Diretório não informado' });
  
  try {
    const resolved = path.resolve(cwd);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      currentDefaultCwd = resolved;
      return res.json({ success: true, cwd: currentDefaultCwd });
    } else {
      return res.status(400).json({ error: 'Diretório não existe ou não é uma pasta válida' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// REST API: List presets
app.get('/api/presets', (req, res) => {
  try {
    const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));
    const presetsList = files.map(file => {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, file), 'utf8'));
        return {
          filename: file,
          name: content.name || file.replace('.json', ''),
          description: content.description || '',
          environment: content.environment || 'generic',
          commandsCount: Array.isArray(content.commands) ? content.commands.length : 0
        };
      } catch (err) {
        return {
          filename: file,
          name: file.replace('.json', ''),
          description: 'Erro ao analisar JSON',
          environment: 'generic',
          commandsCount: 0
        };
      }
    });
    res.json(presetsList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST API: Get specific preset
app.get('/api/presets/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(PRESETS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo de preset não encontrado' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao ler JSON: ' + err.message });
  }
});

// REST API: Save preset
app.post('/api/presets/:filename', (req, res) => {
  const filename = path.basename(req.params.filename).endsWith('.json')
    ? path.basename(req.params.filename)
    : `${path.basename(req.params.filename)}.json`;
  
  const filePath = path.join(PRESETS_DIR, filename);

  try {
    const presetData = req.body;
    fs.writeFileSync(filePath, JSON.stringify(presetData, null, 2), 'utf8');
    res.json({ success: true, filename, message: 'Preset salvo com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar preset: ' + err.message });
  }
});

// REST API: Delete preset
app.delete('/api/presets/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(PRESETS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Preset excluído' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir preset: ' + err.message });
  }
});

// Cross-Platform Process Killer
function killProcessTree(pid) {
  if (os.platform() === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`, () => {});
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (e) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (e2) {}
    }
  }
}

// WebSocket Connection Handling
wss.on('connection', async (ws, req) => {
  if (isAuthEnabled) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const token = parsedUrl.searchParams.get('token');

      if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Token de autenticação ausente. Acesso negado.' }));
        ws.close(4001, 'Unauthorized');
        return;
      }

      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        ws.send(JSON.stringify({ type: 'error', message: 'Sessão inválida ou expirada. Conexão rejeitada.' }));
        ws.close(4001, 'Unauthorized');
        return;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', message: 'Erro ao autenticar conexão: ' + err.message }));
      ws.close(4001, 'Auth Error');
      return;
    }
  }

  const clientProcesses = new Set();

  ws.on('message', (messageText) => {
    let msg;
    try {
      msg = JSON.parse(messageText);
    } catch (e) {
      return ws.send(JSON.stringify({ type: 'error', message: 'Formato JSON inválido' }));
    }

    const { type, id, command, cwd, shell: preferredShell, env: targetEnv, data } = msg;

    if (type === 'run') {
      if (!command || !id) {
        return ws.send(JSON.stringify({ type: 'error', id, message: 'Comando e ID são obrigatórios' }));
      }

      const execCwd = (cwd && fs.existsSync(cwd)) ? cwd : currentDefaultCwd;
      const caps = detectHostCapabilities();
      const env = targetEnv || 'windows';

      let shellExecutable;
      let shellArgs = [];

      if (caps.isWin) {
        // HOST IS WINDOWS
        if (env === 'ubuntu' || env === 'linux') {
          // User wants to run in Ubuntu / Linux environment on Windows
          if (caps.hasWsl) {
            // Standard generic WSL execution (works on any WSL installation)
            shellExecutable = 'wsl.exe';
            shellArgs = ['--', 'bash', '-c', command];
          } else if (caps.hasBash) {
            // Fallback to Git Bash / MSYS Bash
            shellExecutable = 'bash.exe';
            shellArgs = ['-c', command];
          } else {
            // No Linux subsystem installed on Windows
            return ws.send(JSON.stringify({
              type: 'error',
              id,
              message: 'WSL ou Bash não foram encontrados neste computador Windows. Instale o WSL (wsl --install) ou o Git Bash para executar comandos Linux.'
            }));
          }
        } else {
          // Windows execution
          if (preferredShell === 'cmd') {
            shellExecutable = 'cmd.exe';
            shellArgs = ['/d', '/s', '/c', command];
          } else {
            // Default PowerShell
            shellExecutable = 'powershell.exe';
            shellArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
          }
        }
      } else {
        // HOST IS LINUX OR MACOS
        if (env === 'ubuntu' || env === 'linux') {
          // Native Linux/Ubuntu execution
          shellExecutable = preferredShell === 'sh' ? '/bin/sh' : '/bin/bash';
          shellArgs = ['-c', command];
        } else {
          // User selected Windows on a Linux/Mac host
          if (caps.hasPowershell) {
            shellExecutable = 'pwsh';
            shellArgs = ['-NoProfile', '-Command', command];
          } else {
            // Fallback to native bash with an informational notice
            shellExecutable = '/bin/bash';
            shellArgs = ['-c', command];
          }
        }
      }

      try {
        const proc = spawn(shellExecutable, shellArgs, {
          cwd: execCwd,
          env: process.env,
          windowsHide: true
        });

        const procData = {
          process: proc,
          cwd: execCwd,
          command,
          env,
          startTime: Date.now()
        };

        activeProcesses.set(id, procData);
        clientProcesses.add(id);

        ws.send(JSON.stringify({
          type: 'started',
          id,
          command,
          cwd: execCwd,
          env,
          shell: `${shellExecutable} ${shellArgs.slice(0, 2).join(' ')}`.trim(),
          pid: proc.pid,
          timestamp: Date.now()
        }));

        proc.stdout.on('data', (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'output',
              id,
              stream: 'stdout',
              data: chunk.toString()
            }));
          }
        });

        proc.stderr.on('data', (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'output',
              id,
              stream: 'stderr',
              data: chunk.toString()
            }));
          }
        });

        proc.on('error', (err) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'error',
              id,
              message: err.message
            }));
          }
          activeProcesses.delete(id);
          clientProcesses.delete(id);
        });

        proc.on('close', (code, signal) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'exit',
              id,
              code: code !== null ? code : (signal ? 1 : 0),
              signal: signal || null,
              duration: Date.now() - procData.startTime
            }));
          }
          activeProcesses.delete(id);
          clientProcesses.delete(id);
        });

      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          id,
          message: 'Erro ao iniciar processo: ' + err.message
        }));
      }
    } else if (type === 'kill') {
      if (id && activeProcesses.has(id)) {
        const { process: proc } = activeProcesses.get(id);
        if (proc && proc.pid) {
          killProcessTree(proc.pid);
        }
        activeProcesses.delete(id);
        clientProcesses.delete(id);
        ws.send(JSON.stringify({ type: 'killed', id }));
      }
    } else if (type === 'input') {
      if (id && activeProcesses.has(id)) {
        const { process: proc } = activeProcesses.get(id);
        if (proc && proc.stdin && proc.stdin.writable) {
          proc.stdin.write(data + '\n');
        }
      }
    }
  });

  ws.on('close', () => {
    for (const id of clientProcesses) {
      if (activeProcesses.has(id)) {
        const { process: proc } = activeProcesses.get(id);
        if (proc && proc.pid) {
          killProcessTree(proc.pid);
        }
        activeProcesses.delete(id);
      }
    }
    clientProcesses.clear();
  });
});

server.listen(PORT, HOST, () => {
  const caps = detectHostCapabilities();
  const osName = caps.isWin ? 'Windows' : (caps.isLinux ? 'Linux / Ubuntu' : 'macOS');
  console.log(`====================================================`);
  console.log(`🚀 ShellPanel Híbrido Iniciado (Padrão Distribuível)`);
  console.log(`🖥️  Sistema Operacional Host: ${osName} (${caps.platform})`);
  console.log(`🌐 Acesse no seu navegador: http://localhost:${PORT}`);
  console.log(`📁 Diretório Inicial: ${currentDefaultCwd}`);
  console.log(`🔐 Autenticação Supabase: ${isAuthEnabled ? 'ATIVADA (Protegido por Supabase Auth)' : 'DESATIVADA (Preencha o .env para ativar)'}`);
  console.log(`====================================================`);
});
