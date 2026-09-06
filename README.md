# ⚡ ShellPanel (Híbrido & Portável)

O **ShellPanel** é um modelo padrão, distribuível e portável de painel visual com terminal integrado para gerenciar e executar comandos em ambientes **Linux / Ubuntu** (diretamente ou via WSL) e **Windows**.

---

## 🎯 Arquitetura Híbrida e Portável

O projeto foi projetado para rodar em **qualquer ambiente sem configurações específicas de hardware ou máquina**:

- **🐧 Em Servidores / Desktops Linux (Ubuntu, Debian, etc.)**:
  - Detecta o host Linux nativo automaticamente e executa os comandos diretamente via `/bin/bash` ou `/bin/sh`.
- **🪟 No Windows com WSL / Git Bash**:
  - Alterna dinamicamente entre comandos nativos do Windows (PowerShell / CMD) e comandos Linux via qualquer distribuição WSL instalada ou Git Bash.
- **🐳 Em Containers Docker**:
  - Pronto para rodar via Docker / Docker Compose em qualquer servidor ou nuvem.

---

## 🚀 Como Executar em Qualquer Sistema

### Opção 1: Execução Direta (Node.js)

1. Clone ou extraia este projeto.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Configure as credenciais no arquivo `.env` (baseie-se no `.env.example`):
   ```env
   PORT=3000
   HOST=0.0.0.0
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-chave-anon-publica-do-supabase
   ```
4. Inicie o servidor:
   ```bash
   npm start
   ```
5. Acesse: **`http://localhost:3000`** *(faça login com as credenciais cadastradas no Supabase)*

---

### Opção 2: Docker / Docker Compose

```bash
docker compose up -d
```
Acesse em **`http://localhost:3000`**.

---

## ✨ Funcionalidades

- **🔘 Botão de Alternância no Topo (`🪟 Windows` / `🐧 Ubuntu`)**:
  - Altera instantaneamente o ambiente de execução e a interface.
- **📁 Gerenciador de Arquivos e Perfis (`presets/*.json`)**:
  - Salve e compartilhe arquivos de comandos (ex: `default.json`, `ubuntu.json`, `deploy.json`).
  - Importe e exporte arquivos JSON com 1 clique pelo navegador.
- **⚡ Inserção de Comandos na Hora**:
  - Barra rápida no topo com suporte a histórico e tecla `Enter`.
  - Botão para salvar qualquer comando digitado como um novo botão persistente.
- **🧩 Parâmetros Dinâmicos**:
  - Sintaxe `{parametro}` (ex: `sudo apt install {pacote}` ou `git commit -m "{mensagem}"`).
- **💻 Terminal Integrado em Tempo Real**:
  - Suporte a cores ANSI, auto-scroll, cópia de log e parada de processos (`kill`).
  - Entrada interativa (`stdin`).
