# Requires: Windows PowerShell 5.1+
# Starts: FastAPI backend (8000), Ticket API (5000), Vite frontend (5173)
# Logs: .\.run-logs\backend.log, ticket.log, frontend.log

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
Set-Location -LiteralPath $Root

$LogDir = Join-Path $Root '.run-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Info([string]$Message) {
  Write-Host $Message
}

function Get-PythonExe {
  $venvPy = Join-Path $Root 'BOT\Scripts\python.exe'
  if (Test-Path -LiteralPath $venvPy) { return $venvPy }

  $altVenvPy = Join-Path $Root '.venv\Scripts\python.exe'
  if (Test-Path -LiteralPath $altVenvPy) { return $altVenvPy }

  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($py) { return $py.Source }

  throw "Python not found. Install Python or ensure it's on PATH (or create the venv under .\BOT).
" 
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMs = 1000) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Ensure-EnvFile {
  $envPath = Join-Path $Root '.env'
  $envExample = Join-Path $Root '.env.example'
  if (-not (Test-Path -LiteralPath $envPath) -and (Test-Path -LiteralPath $envExample)) {
    Copy-Item -LiteralPath $envExample -Destination $envPath
    Write-Info 'Created .env from .env.example (edit if needed).'
  }
}

function Ensure-PythonDeps([string]$PythonExe) {
  Write-Info 'Installing Python dependencies (requirements.txt)…'
  & $PythonExe -m pip install --upgrade pip | Out-Null
  $pipLog = Join-Path $LogDir 'pip-install.log'
  & $PythonExe -m pip install -r (Join-Path $Root 'requirements.txt') *>> $pipLog
}

function Ensure-VectorDb([string]$PythonExe) {
  $vectorDb = Join-Path $Root 'vectordb'
  $needsIngest = $false
  if (-not (Test-Path -LiteralPath $vectorDb)) { $needsIngest = $true }
  else {
    $items = Get-ChildItem -LiteralPath $vectorDb -Force -ErrorAction SilentlyContinue
    if (-not $items -or $items.Count -eq 0) { $needsIngest = $true }
  }

  if ($needsIngest) {
    Write-Info 'Vector DB not found/empty; running ingestion (python -m backend.ingest)…'
    $ingestLog = Join-Path $LogDir 'ingest.log'
    & $PythonExe -m backend.ingest *>> $ingestLog
  }
}

function Ensure-NodeTools {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is missing (node not found on PATH).' }
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm is missing (npm not found on PATH).' }
}

function Ensure-NpmInstall([string]$Dir, [string]$LogName) {
  $nodeModules = Join-Path $Dir 'node_modules'
  if (-not (Test-Path -LiteralPath $nodeModules)) {
    Write-Info "Installing npm dependencies in: $Dir"
    $log = Join-Path $LogDir $LogName
    Push-Location -LiteralPath $Dir
    try {
      npm install *>> $log
    } finally {
      Pop-Location
    }
  }
}

# --- Main ---
$PythonExe = Get-PythonExe
Write-Info "Using Python: $PythonExe"

Ensure-EnvFile
Ensure-PythonDeps -PythonExe $PythonExe

# Fail-fast checks so the app is self-starting with clear guidance.
Write-Info 'Checking MongoDB on 127.0.0.1:27017…'
if (-not (Test-TcpPort -HostName '127.0.0.1' -Port 27017 -TimeoutMs 1000)) {
  throw "MongoDB does not seem to be running on 127.0.0.1:27017.
Start MongoDB (Docker example):
  docker run --name intranet-mongo -p 27017:27017 -d mongo:7"
}

Write-Info 'Checking Ollama on http://localhost:11434…'
try {
  Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 | Out-Null
} catch {
  throw "Ollama is not reachable at http://localhost:11434.
Start Ollama, then pull models:
  ollama pull llama3.2
  ollama pull nomic-embed-text"
}

Ensure-VectorDb -PythonExe $PythonExe

Ensure-NodeTools
Ensure-NpmInstall -Dir (Join-Path $Root 'frontend') -LogName 'npm-frontend-install.log'
if (Test-Path -LiteralPath (Join-Path $Root 'Ticket\Backend\package.json')) {
  Ensure-NpmInstall -Dir (Join-Path $Root 'Ticket\Backend') -LogName 'npm-ticket-install.log'
}

$backendLog = Join-Path $LogDir 'backend.log'
$frontendLog = Join-Path $LogDir 'frontend.log'
$ticketLog = Join-Path $LogDir 'ticket.log'

$backendProc = $null
$frontendProc = $null
$ticketProc = $null

try {
  Write-Info 'Starting FastAPI backend on http://127.0.0.1:8000 …'
  $backendProc = Start-Process -FilePath $PythonExe -ArgumentList @('-m','uvicorn','backend.api:app','--reload','--port','8000') -WorkingDirectory $Root -PassThru -RedirectStandardOutput $backendLog -RedirectStandardError $backendLog

  if (Test-Path -LiteralPath (Join-Path $Root 'Ticket\Backend\index.js')) {
    Write-Info 'Starting Ticket API on http://127.0.0.1:5000 …'
    $ticketProc = Start-Process -FilePath 'node' -ArgumentList @('index.js') -WorkingDirectory (Join-Path $Root 'Ticket\Backend') -PassThru -RedirectStandardOutput $ticketLog -RedirectStandardError $ticketLog
  }

  Write-Info 'Starting Vite frontend on http://127.0.0.1:5173 …'
  $frontendProc = Start-Process -FilePath 'npm' -ArgumentList @('run','dev','--','--host','127.0.0.1','--port','5173') -WorkingDirectory (Join-Path $Root 'frontend') -PassThru -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendLog

  Write-Info ''
  Write-Info 'All services launched:'
  Write-Info '  - Frontend: http://127.0.0.1:5173'
  Write-Info '  - Backend:  http://127.0.0.1:8000/docs'
  Write-Info '  - Ticket:   http://127.0.0.1:5000 (if enabled)'
  Write-Info "Logs: $LogDir"
  Write-Info 'Press Ctrl+C to stop.'

  # Keep the script alive while frontend runs
  Wait-Process -Id $frontendProc.Id
} finally {
  Write-Info ''
  Write-Info 'Stopping services…'
  foreach ($p in @($frontendProc, $backendProc, $ticketProc)) {
    if ($p -and -not $p.HasExited) {
      try { Stop-Process -Id $p.Id -Force } catch { }
    }
  }
}
