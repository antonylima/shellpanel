// ShellPanel Frontend Client Logic (Portable Hybrid Windows / Ubuntu / Linux)

let currentEnv = 'windows'; // 'windows' | 'ubuntu'
let socket = null;
let currentPreset = {
  name: "Comandos Padrão",
  description: "",
  commands: []
};
let currentPresetFilename = "default.json";
let currentCategory = "all";
let activeProcessId = null;
let processStartTime = null;
let processTimerInterval = null;
let autoScroll = true;
let currentCwd = "";
let serverInfo = {};

// DOM Elements
const wsStatus = document.getElementById('wsStatus');
const presetSelect = document.getElementById('presetSelect');
const cwdDisplay = document.getElementById('cwdDisplay');
const cwdBadge = document.getElementById('cwdBadge');
const shellSelect = document.getElementById('shellSelect');
const btnEnvWindows = document.getElementById('btnEnvWindows');
const btnEnvUbuntu = document.getElementById('btnEnvUbuntu');
const currentEnvBadge = document.getElementById('currentEnvBadge');
const promptSymbol = document.getElementById('promptSymbol');
const quickCommandInput = document.getElementById('quickCommandInput');
const btnQuickRun = document.getElementById('btnQuickRun');
const btnQuickSave = document.getElementById('btnQuickSave');
const searchInput = document.getElementById('searchInput');
const categoryChips = document.getElementById('categoryChips');
const commandsGrid = document.getElementById('commandsGrid');
const emptyState = document.getElementById('emptyState');
const btnNewCommand = document.getElementById('btnNewCommand');
const btnEmptyNewCommand = document.getElementById('btnEmptyNewCommand');
const terminalBody = document.getElementById('terminalBody');
const terminalOutput = document.getElementById('terminalOutput');
const activeProcessBadge = document.getElementById('activeProcessBadge');
const processTimer = document.getElementById('processTimer');
const btnKillProcess = document.getElementById('btnKillProcess');
const btnAutoScroll = document.getElementById('btnAutoScroll');
const btnCopyTerminal = document.getElementById('btnCopyTerminal');
const btnClearTerminal = document.getElementById('btnClearTerminal');
const stdinInput = document.getElementById('stdinInput');
const btnSendStdin = document.getElementById('btnSendStdin');

// Modals
const commandModal = document.getElementById('commandModal');
const commandForm = document.getElementById('commandForm');
const commandModalTitle = document.getElementById('commandModalTitle');
const cmdEditId = document.getElementById('cmdEditId');
const cmdTitle = document.getElementById('cmdTitle');
const cmdText = document.getElementById('cmdText');
const cmdCategory = document.getElementById('cmdCategory');
const cmdColor = document.getElementById('cmdColor');
const cmdDescription = document.getElementById('cmdDescription');
const categoryDatalist = document.getElementById('categoryDatalist');

const presetsModal = document.getElementById('presetsModal');
const btnManagePresets = document.getElementById('btnManagePresets');
const presetsList = document.getElementById('presetsList');
const newPresetName = document.getElementById('newPresetName');
const btnSaveAsPreset = document.getElementById('btnSaveAsPreset');
const importFileInput = document.getElementById('importFileInput');
const btnImportFile = document.getElementById('btnImportFile');
const btnExportFile = document.getElementById('btnExportFile');

const paramsModal = document.getElementById('paramsModal');
const paramsForm = document.getElementById('paramsForm');
const paramsCommandPreview = document.getElementById('paramsCommandPreview');
const paramsFieldsContainer = document.getElementById('paramsFieldsContainer');
let pendingParamCommand = null;

const cwdModal = document.getElementById('cwdModal');
const cwdForm = document.getElementById('cwdForm');
const newCwdInput = document.getElementById('newCwdInput');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadSystemInfo();
  await loadPresetsList();
  connectWebSocket();
});

// Setup All UI Event Listeners
function setupEventListeners() {
  // OS Toggle Buttons
  btnEnvWindows.addEventListener('click', () => setEnvironment('windows'));
  btnEnvUbuntu.addEventListener('click', () => setEnvironment('ubuntu'));

  // Quick Runner
  btnQuickRun.addEventListener('click', runQuickCommand);
  quickCommandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runQuickCommand();
  });
  btnQuickSave.addEventListener('click', saveQuickCommandAsButton);

  // Search & Filter
  searchInput.addEventListener('input', renderCommands);
  
  // New Command Buttons
  btnNewCommand.addEventListener('click', () => openCommandModal());
  btnEmptyNewCommand.addEventListener('click', () => openCommandModal());
  commandForm.addEventListener('submit', handleSaveCommandForm);

  // Preset Select Change
  presetSelect.addEventListener('change', (e) => loadPreset(e.target.value));
  btnManagePresets.addEventListener('click', openPresetsModal);
  btnSaveAsPreset.addEventListener('click', handleSaveAsPreset);
  btnImportFile.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', handleImportFile);
  btnExportFile.addEventListener('click', handleExportPreset);

  // CWD Change
  cwdBadge.addEventListener('click', () => {
    newCwdInput.value = currentCwd;
    openModal(cwdModal);
  });
  cwdForm.addEventListener('submit', handleSaveCwd);

  // Terminal Controls
  btnClearTerminal.addEventListener('click', () => {
    terminalOutput.innerHTML = '';
  });
  btnCopyTerminal.addEventListener('click', () => {
    navigator.clipboard.writeText(terminalOutput.innerText);
    showToast('Saída do terminal copiada!', 'info');
  });
  btnAutoScroll.addEventListener('click', () => {
    autoScroll = !autoScroll;
    btnAutoScroll.classList.toggle('active', autoScroll);
  });
  btnKillProcess.addEventListener('click', killActiveProcess);

  // Stdin
  btnSendStdin.addEventListener('click', sendStdin);
  stdinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendStdin();
  });

  // Modal Closers
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.currentTarget.getAttribute('data-close');
      closeModal(document.getElementById(modalId));
    });
  });

  // Keyboard Shortcuts (Ctrl+F for search, Esc to close modals)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(closeModal);
    }
  });

  // Params form submit
  paramsForm.addEventListener('submit', handleParamsSubmit);
}

// OS Switch Handler
function setEnvironment(env) {
  if (currentEnv === env) return;
  currentEnv = env;
  updateEnvironmentUI();

  // Suggest / Auto-switch preset if appropriate
  if (env === 'ubuntu') {
    const hasUbuntuPreset = Array.from(presetSelect.options).some(o => o.value === 'ubuntu.json');
    if (hasUbuntuPreset && currentPresetFilename === 'default.json') {
      loadPreset('ubuntu.json');
      presetSelect.value = 'ubuntu.json';
    }
    showToast('Modo Ubuntu / Linux ativado!', 'info');
  } else {
    const hasDefaultPreset = Array.from(presetSelect.options).some(o => o.value === 'default.json');
    if (hasDefaultPreset && currentPresetFilename === 'ubuntu.json') {
      loadPreset('default.json');
      presetSelect.value = 'default.json';
    }
    showToast('Modo Windows ativado!', 'info');
  }
}

function updateEnvironmentUI() {
  document.body.setAttribute('data-theme-env', currentEnv);

  btnEnvWindows.classList.toggle('active', currentEnv === 'windows');
  btnEnvUbuntu.classList.toggle('active', currentEnv === 'ubuntu');

  if (currentEnv === 'windows') {
    currentEnvBadge.textContent = '🪟 WIN';
    promptSymbol.textContent = 'PS >';
    quickCommandInput.placeholder = 'Digite comando Windows (ex: dir, git status, ping)... [Enter]';
    
    // Update Shell options
    shellSelect.innerHTML = `
      <option value="powershell" selected>PowerShell</option>
      <option value="cmd">CMD</option>
    `;
  } else {
    currentEnvBadge.textContent = '🐧 UBUNTU';
    promptSymbol.textContent = 'ubuntu:~$';
    quickCommandInput.placeholder = 'Digite comando Ubuntu / Linux (ex: ls -la, sudo apt update, df -h)... [Enter]';
    
    // Update Shell options
    shellSelect.innerHTML = `
      <option value="bash" selected>Bash</option>
      <option value="sh">sh</option>
    `;
  }
}

// REST API Calls
async function loadSystemInfo() {
  try {
    const res = await fetch('/api/info');
    serverInfo = await res.json();
    currentCwd = serverInfo.cwd || '';
    cwdDisplay.textContent = currentCwd;
    cwdDisplay.title = `${currentCwd} (${serverInfo.platform})`;

    // If host platform is Linux, default to Ubuntu/Linux mode
    if (serverInfo.isLinux) {
      currentEnv = 'ubuntu';
    } else {
      currentEnv = 'windows';
    }
    updateEnvironmentUI();
  } catch (err) {
    console.error('Falha ao carregar informações do sistema:', err);
  }
}

async function handleSaveCwd(e) {
  e.preventDefault();
  const dir = newCwdInput.value.trim();
  if (!dir) return;

  try {
    const res = await fetch('/api/info/cwd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd: dir })
    });
    const data = await res.json();
    if (res.ok) {
      currentCwd = data.cwd;
      cwdDisplay.textContent = currentCwd;
      cwdDisplay.title = currentCwd;
      closeModal(cwdModal);
      showToast('Pasta de trabalho atualizada!', 'success');
    } else {
      showToast(data.error || 'Erro ao alterar pasta', 'error');
    }
  } catch (err) {
    showToast('Erro de conexão ao alterar diretório', 'error');
  }
}

async function loadPresetsList() {
  try {
    const res = await fetch('/api/presets');
    const presets = await res.json();
    
    presetSelect.innerHTML = '';
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.filename;
      opt.textContent = `${p.name} (${p.commandsCount} cmds)`;
      presetSelect.appendChild(opt);
    });

    if (presets.length > 0) {
      const defaultFilename = currentEnv === 'ubuntu' ? 'ubuntu.json' : 'default.json';
      const selected = presets.find(p => p.filename === defaultFilename) || presets[0];
      presetSelect.value = selected.filename;
      await loadPreset(selected.filename);
    }
  } catch (err) {
    console.error('Erro ao listar presets:', err);
    showToast('Erro ao carregar lista de perfis', 'error');
  }
}

async function loadPreset(filename) {
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error('Falha na resposta do servidor');
    currentPreset = await res.json();
    currentPresetFilename = filename;
    
    if (!Array.isArray(currentPreset.commands)) {
      currentPreset.commands = [];
    }

    renderCategoryChips();
    renderCommands();
    updateCategoryDatalist();
  } catch (err) {
    console.error('Erro ao ler preset:', err);
    showToast('Erro ao carregar preset: ' + filename, 'error');
  }
}

async function saveCurrentPresetToBackend() {
  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(currentPresetFilename)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentPreset)
    });
    if (res.ok) {
      showToast('Alterações salvas com sucesso!', 'success');
      loadPresetsList();
    }
  } catch (err) {
    showToast('Erro ao salvar no arquivo', 'error');
  }
}

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    wsStatus.className = 'status-indicator online';
    wsStatus.querySelector('.status-text').textContent = 'Online';
  };

  socket.onclose = () => {
    wsStatus.className = 'status-indicator offline';
    wsStatus.querySelector('.status-text').textContent = 'Desconectado';
    setTimeout(connectWebSocket, 3000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket erro:', err);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSocketMessage(msg);
    } catch (e) {
      console.error('Erro ao processar mensagem WS:', e);
    }
  };
}

function handleSocketMessage(msg) {
  const { type, id, stream, data, code, signal, message, duration, command, cwd, shell, env } = msg;

  if (type === 'started') {
    activeProcessId = id;
    startProcessTimer();
    btnKillProcess.classList.remove('hidden');
    activeProcessBadge.classList.remove('hidden');
    
    const isUbuntu = env === 'ubuntu' || env === 'linux';
    const envPrefix = isUbuntu ? '🐧 [Ubuntu/Linux]' : '🪟 [Windows]';
    const headerClass = isUbuntu ? 'log-cmd-header log-cmd-header-ubuntu' : 'log-cmd-header';

    appendTerminalHtml(`\n<div class="${headerClass}">▶ ${envPrefix} [${new Date().toLocaleTimeString()}] ${escapeHtml(command)} <span style="color:#64748b;font-size:0.75rem;">(cwd: ${escapeHtml(cwd)} | shell: ${escapeHtml(shell)})</span></div>`);
  } else if (type === 'output') {
    const formatted = formatAnsiToHtml(data);
    appendTerminalHtml(formatted);
  } else if (type === 'error') {
    appendTerminalHtml(`\n<div class="log-exit-error">✖ Erro: ${escapeHtml(message || 'Falha na execução')}</div>`);
    stopProcessTimer();
  } else if (type === 'exit') {
    stopProcessTimer();
    const isOk = code === 0;
    const durSec = (duration / 1000).toFixed(2);
    const badgeClass = isOk ? 'log-exit-success' : 'log-exit-error';
    const statusText = isOk ? 'Concluído com sucesso' : `Finalizado com código ${code}${signal ? ` (${signal})` : ''}`;
    
    appendTerminalHtml(`\n<div class="${badgeClass}">✔ [${new Date().toLocaleTimeString()}] ${statusText} em ${durSec}s</div>`);
  } else if (type === 'killed') {
    stopProcessTimer();
    appendTerminalHtml(`\n<div class="log-exit-error">⏹ Processo interrompido pelo usuário.</div>`);
  }
}

// Process Timer
function startProcessTimer() {
  processStartTime = Date.now();
  if (processTimerInterval) clearInterval(processTimerInterval);
  processTimerInterval = setInterval(() => {
    const elapsed = ((Date.now() - processStartTime) / 1000).toFixed(1);
    processTimer.textContent = `${elapsed}s`;
  }, 100);
}

function stopProcessTimer() {
  if (processTimerInterval) {
    clearInterval(processTimerInterval);
    processTimerInterval = null;
  }
  activeProcessId = null;
  btnKillProcess.classList.add('hidden');
  activeProcessBadge.classList.add('hidden');
}

// Execution Handlers
function executeCommand(rawCommand, options = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showToast('Servidor desconectado. Aguarde reconexão.', 'error');
    return;
  }

  // Check for dynamic parameters {paramName}
  const placeholders = extractPlaceholders(rawCommand);
  if (placeholders.length > 0 && !options.skipParamsModal) {
    openParamsModal(rawCommand, placeholders, options);
    return;
  }

  const cmdId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
  const selectedShell = shellSelect.value || (currentEnv === 'ubuntu' ? 'bash' : 'powershell');

  socket.send(JSON.stringify({
    type: 'run',
    id: cmdId,
    command: rawCommand,
    cwd: currentCwd,
    env: currentEnv,
    shell: selectedShell
  }));
}

function runQuickCommand() {
  const cmd = quickCommandInput.value.trim();
  if (!cmd) return;
  executeCommand(cmd);
}

function saveQuickCommandAsButton() {
  const cmd = quickCommandInput.value.trim();
  if (!cmd) {
    showToast('Digite um comando no campo antes de salvar', 'error');
    return;
  }
  openCommandModal({
    title: cmd.length > 25 ? cmd.substring(0, 22) + '...' : cmd,
    command: cmd,
    category: currentEnv === 'ubuntu' ? 'Ubuntu' : 'Rápidos',
    color: currentEnv === 'ubuntu' ? 'amber' : 'emerald'
  });
}

function killActiveProcess() {
  if (activeProcessId && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'kill',
      id: activeProcessId
    }));
  }
}

function sendStdin() {
  const text = stdinInput.value;
  if (activeProcessId && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'input',
      id: activeProcessId,
      data: text
    }));
    appendTerminalHtml(`\n<span style="color:#a855f7;">&gt; ${escapeHtml(text)}</span>\n`);
    stdinInput.value = '';
  }
}

// Render Categories
function renderCategoryChips() {
  const categories = new Set(['all']);
  (currentPreset.commands || []).forEach(cmd => {
    if (cmd.category) categories.add(cmd.category);
  });

  categoryChips.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `chip ${cat === currentCategory ? 'active' : ''}`;
    btn.dataset.category = cat;
    btn.textContent = cat === 'all' ? 'Todos' : cat;
    btn.addEventListener('click', () => {
      currentCategory = cat;
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      renderCommands();
    });
    categoryChips.appendChild(btn);
  });
}

function updateCategoryDatalist() {
  const categories = new Set();
  (currentPreset.commands || []).forEach(cmd => {
    if (cmd.category) categories.add(cmd.category);
  });
  categoryDatalist.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    categoryDatalist.appendChild(opt);
  });
}

// Render Command Cards
function renderCommands() {
  const query = searchInput.value.toLowerCase().trim();
  const commands = currentPreset.commands || [];

  const filtered = commands.filter(cmd => {
    const matchesCategory = currentCategory === 'all' || cmd.category === currentCategory;
    const matchesSearch = !query || 
      (cmd.title && cmd.title.toLowerCase().includes(query)) ||
      (cmd.command && cmd.command.toLowerCase().includes(query)) ||
      (cmd.description && cmd.description.toLowerCase().includes(query)) ||
      (cmd.category && cmd.category.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  commandsGrid.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  filtered.forEach(cmd => {
    const card = document.createElement('div');
    card.className = 'command-card';

    const color = cmd.color || (currentEnv === 'ubuntu' ? 'amber' : 'blue');
    const hasParams = extractPlaceholders(cmd.command).length > 0;

    card.innerHTML = `
      <div class="command-card-header">
        <div class="command-title-wrap">
          <span class="command-title">${escapeHtml(cmd.title || 'Sem título')}</span>
          ${cmd.category ? `<span class="command-category-tag tag-${color}">${escapeHtml(cmd.category)}</span>` : ''}
        </div>
        <div class="command-actions-menu">
          <button class="btn-card-action btn-edit" title="Editar comando">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-card-action btn-duplicate" title="Duplicar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
          <button class="btn-card-action btn-delete" title="Excluir">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>

      <div class="command-code-box" title="${escapeHtml(cmd.command)}">
        <code>${escapeHtml(cmd.command)}</code>
      </div>

      ${cmd.description ? `<p class="command-description">${escapeHtml(cmd.description)}</p>` : ''}

      <div class="command-card-footer">
        <button class="btn-run-command" title="Executar este comando">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>${hasParams ? 'Executar...' : 'Executar'}</span>
        </button>
      </div>
    `;

    // Event listeners on card
    card.querySelector('.btn-run-command').addEventListener('click', () => {
      executeCommand(cmd.command);
    });

    card.querySelector('.btn-edit').addEventListener('click', () => {
      openCommandModal(cmd);
    });

    card.querySelector('.btn-duplicate').addEventListener('click', () => {
      const newCmd = {
        ...cmd,
        id: 'cmd_' + Date.now(),
        title: `${cmd.title} (Cópia)`
      };
      currentPreset.commands.push(newCmd);
      saveCurrentPresetToBackend();
      renderCommands();
      showToast('Comando duplicado!', 'info');
    });

    card.querySelector('.btn-delete').addEventListener('click', () => {
      if (confirm(`Deseja realmente remover o botão "${cmd.title}"?`)) {
        currentPreset.commands = currentPreset.commands.filter(c => c.id !== cmd.id);
        saveCurrentPresetToBackend();
        renderCategoryChips();
        renderCommands();
        showToast('Comando removido', 'info');
      }
    });

    commandsGrid.appendChild(card);
  });
}

// Dynamic Parameters Handling
function extractPlaceholders(cmdStr) {
  const matches = cmdStr.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(1, -1).trim()))];
}

function openParamsModal(rawCommand, placeholders, options) {
  pendingParamCommand = { rawCommand, options };
  paramsCommandPreview.textContent = rawCommand;
  paramsFieldsContainer.innerHTML = '';

  placeholders.forEach(param => {
    const group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = `
      <label for="param_${param}">${escapeHtml(param)}</label>
      <input type="text" id="param_${param}" data-param="${escapeHtml(param)}" placeholder="Valor para ${escapeHtml(param)}" required />
    `;
    paramsFieldsContainer.appendChild(group);
  });

  openModal(paramsModal);
  const firstInput = paramsFieldsContainer.querySelector('input');
  if (firstInput) setTimeout(() => firstInput.focus(), 100);
}

function handleParamsSubmit(e) {
  e.preventDefault();
  if (!pendingParamCommand) return;

  let replaced = pendingParamCommand.rawCommand;
  const inputs = paramsFieldsContainer.querySelectorAll('input[data-param]');
  inputs.forEach(input => {
    const param = input.dataset.param;
    const val = input.value.trim();
    replaced = replaced.replaceAll(`{${param}}`, val);
  });

  closeModal(paramsModal);
  executeCommand(replaced, { skipParamsModal: true });
  pendingParamCommand = null;
}

// Modal Handlers: Command CRUD
function openCommandModal(cmd = null) {
  if (cmd) {
    commandModalTitle.textContent = 'Editar Botão de Comando';
    cmdEditId.value = cmd.id || '';
    cmdTitle.value = cmd.title || '';
    cmdText.value = cmd.command || '';
    cmdCategory.value = cmd.category || '';
    cmdColor.value = cmd.color || (currentEnv === 'ubuntu' ? 'amber' : 'emerald');
    cmdDescription.value = cmd.description || '';
  } else {
    commandModalTitle.textContent = 'Criar Novo Botão de Comando';
    cmdEditId.value = '';
    cmdTitle.value = '';
    cmdText.value = '';
    cmdCategory.value = currentCategory !== 'all' ? currentCategory : (currentEnv === 'ubuntu' ? 'Ubuntu' : 'Geral');
    cmdColor.value = currentEnv === 'ubuntu' ? 'amber' : 'emerald';
    cmdDescription.value = '';
  }
  openModal(commandModal);
  cmdTitle.focus();
}

function handleSaveCommandForm(e) {
  e.preventDefault();
  const id = cmdEditId.value || ('cmd_' + Date.now());
  const title = cmdTitle.value.trim();
  const command = cmdText.value.trim();
  const category = cmdCategory.value.trim() || 'Geral';
  const color = cmdColor.value;
  const description = cmdDescription.value.trim();

  if (!title || !command) {
    showToast('Título e comando são obrigatórios', 'error');
    return;
  }

  const newCmdObj = { id, title, command, category, color, description };

  const existingIndex = currentPreset.commands.findIndex(c => c.id === id);
  if (existingIndex >= 0) {
    currentPreset.commands[existingIndex] = newCmdObj;
  } else {
    currentPreset.commands.push(newCmdObj);
  }

  closeModal(commandModal);
  saveCurrentPresetToBackend();
  renderCategoryChips();
  renderCommands();
  showToast('Comando salvo com sucesso!', 'success');
}

// Modal Handlers: Presets & Files
async function openPresetsModal() {
  openModal(presetsModal);
  try {
    const res = await fetch('/api/presets');
    const presets = await res.json();
    
    presetsList.innerHTML = '';
    presets.forEach(p => {
      const item = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `
        <div class="preset-item-info">
          <span class="preset-item-title">${escapeHtml(p.name)}</span>
          <span class="preset-item-meta">${p.filename} • ${p.commandsCount} comandos</span>
        </div>
        <div class="preset-item-actions">
          <button class="btn btn-sm btn-primary btn-load-preset" data-file="${p.filename}">Carregar</button>
          ${(p.filename !== 'default.json' && p.filename !== 'ubuntu.json') ? `<button class="btn btn-sm btn-danger btn-del-preset" data-file="${p.filename}">Excluir</button>` : ''}
        </div>
      `;

      item.querySelector('.btn-load-preset').addEventListener('click', async () => {
        await loadPreset(p.filename);
        presetSelect.value = p.filename;
        closeModal(presetsModal);
        showToast(`Perfil "${p.name}" carregado!`, 'success');
      });

      const delBtn = item.querySelector('.btn-del-preset');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (confirm(`Excluir o arquivo ${p.filename}?`)) {
            await fetch(`/api/presets/${encodeURIComponent(p.filename)}`, { method: 'DELETE' });
            openPresetsModal();
            loadPresetsList();
            showToast('Arquivo excluído', 'info');
          }
        });
      }

      presetsList.appendChild(item);
    });
  } catch (err) {
    showToast('Erro ao carregar lista de perfis', 'error');
  }
}

async function handleSaveAsPreset() {
  const name = newPresetName.value.trim();
  if (!name) {
    showToast('Digite um nome para o novo perfil', 'error');
    return;
  }
  const filename = name.endsWith('.json') ? name : `${name}.json`;
  const copy = {
    ...currentPreset,
    name: name.replace('.json', '')
  };

  try {
    const res = await fetch(`/api/presets/${encodeURIComponent(filename)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(copy)
    });
    if (res.ok) {
      newPresetName.value = '';
      await loadPresetsList();
      await loadPreset(filename);
      presetSelect.value = filename;
      closeModal(presetsModal);
      showToast(`Perfil salvo como "${filename}"!`, 'success');
    }
  } catch (err) {
    showToast('Erro ao salvar novo perfil', 'error');
  }
}

function handleExportPreset() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentPreset, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", currentPresetFilename || "commands.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Download do arquivo iniciado!', 'info');
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!Array.isArray(parsed.commands)) {
        throw new Error('O arquivo JSON precisa conter um array "commands".');
      }

      const filename = file.name;
      const res = await fetch(`/api/presets/${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });

      if (res.ok) {
        await loadPresetsList();
        await loadPreset(filename);
        presetSelect.value = filename;
        closeModal(presetsModal);
        showToast(`Arquivo "${file.name}" importado e carregado!`, 'success');
      }
    } catch (err) {
      showToast('Arquivo JSON inválido: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// Modal UI Helpers
function openModal(modalEl) {
  modalEl.classList.remove('hidden');
}

function closeModal(modalEl) {
  modalEl.classList.add('hidden');
}

// Terminal Helpers & ANSI Formatter
function appendTerminalHtml(htmlChunk) {
  const welcome = terminalBody.querySelector('.terminal-welcome');
  if (welcome) welcome.remove();

  terminalOutput.insertAdjacentHTML('beforeend', htmlChunk);

  if (autoScroll) {
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
}

function formatAnsiToHtml(text) {
  let escaped = escapeHtml(text);
  
  // Basic ANSI color replacement
  escaped = escaped
    .replace(/\x1b\[0m/g, '</span>')
    .replace(/\x1b\[1m/g, '<span style="font-weight:bold;">')
    .replace(/\x1b\[31m/g, '<span style="color:#f87171;">') // Red
    .replace(/\x1b\[32m/g, '<span style="color:#34d399;">') // Green
    .replace(/\x1b\[33m/g, '<span style="color:#fbbf24;">') // Yellow
    .replace(/\x1b\[34m/g, '<span style="color:#60a5fa;">') // Blue
    .replace(/\x1b\[35m/g, '<span style="color:#c084fc;">') // Magenta
    .replace(/\x1b\[36m/g, '<span style="color:#22d3ee;">') // Cyan
    .replace(/\x1b\[37m/g, '<span style="color:#f1f5f9;">') // White
    .replace(/\x1b\[90m/g, '<span style="color:#94a3b8;">') // Gray
    .replace(/\x1b\[\d+;?\d*m/g, ''); // Strip remaining

  return escaped;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
