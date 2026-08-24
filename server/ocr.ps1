<#
  Start, stop and inspect the assisted reader.

      .\server\ocr.ps1 start
      .\server\ocr.ps1 stop
      .\server\ocr.ps1 status
      .\server\ocr.ps1 restart
      .\server\ocr.ps1 status -ShowToken

  There are two processes: llama-server holding the model on 127.0.0.1:6001, and
  ocr_server.py on 0.0.0.0:6000 which is the only one the phone talks to. They
  are started and stopped together because neither is useful alone.

  ## Not killing the wrong thing

  There is more than one llama-server on this machine. `stop` matches on the
  model filename in the command line rather than on the executable name, so an
  unrelated server -- a chat model, someone else's project -- is left running.
  A process-name kill would have taken it out, which is the sort of thing you
  only notice later.
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status')]
  [string]$Action = 'status',

  # Off by default so the secret does not end up in a terminal buffer or a
  # screenshot. The truncated form is enough to check the app has the same one.
  [switch]$ShowToken
)

$ErrorActionPreference = 'Continue'
$Here = $PSScriptRoot
$ModelMatch = 'Qwen3VL'
$WrapperMatch = 'ocr_server.py'
$LogDir = Join-Path $Here 'logs'

function Get-Servers {
  $model = Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" |
    Where-Object { $_.CommandLine -like "*$ModelMatch*" }
  $wrapper = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -like "*$WrapperMatch*" }
  return [pscustomobject]@{ Model = $model; Wrapper = $wrapper }
}

function Test-Endpoint([string]$Url, [string]$Token) {
  try {
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $r = Invoke-WebRequest -Uri $Url -Headers $headers -TimeoutSec 5 -UseBasicParsing
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Get-Token {
  try { return (& python (Join-Path $Here 'ocr_server.py') --show-token 2>$null).Trim() }
  catch { return '' }
}

function Get-LanAddress {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Sort-Object -Property SkipAsSource, InterfaceMetric |
    Select-Object -First 1
  if ($null -eq $ip) { return $null }
  return $ip.IPAddress
}

function Stop-Servers {
  $s = Get-Servers
  $stopped = 0
  foreach ($p in @($s.Model) + @($s.Wrapper)) {
    if ($null -ne $p) {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
      $stopped++
    }
  }
  if ($stopped -eq 0) { Write-Host "Nothing was running." -ForegroundColor DarkGray }
  else { Write-Host "Stopped $stopped process(es)." -ForegroundColor Yellow }
}

function Start-Servers {
  $s = Get-Servers
  if ($null -ne $s.Model -or $null -ne $s.Wrapper) {
    Write-Host "Already running. Use 'restart' to reload." -ForegroundColor Yellow
    return
  }

  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

  Start-Process -FilePath 'powershell' `
    -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Here 'start-vlm.ps1') `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'model.log') `
    -RedirectStandardError (Join-Path $LogDir 'model.err.log')

  Write-Host "Loading the model" -NoNewline
  $token = ''
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Endpoint 'http://127.0.0.1:6001/health' '') { break }
    Write-Host '.' -NoNewline
  }
  Write-Host ''

  if (-not (Test-Endpoint 'http://127.0.0.1:6001/health' '')) {
    Write-Host "The model did not come up. See $LogDir\model.err.log" -ForegroundColor Red
    return
  }

  Start-Process -FilePath 'python' `
    -ArgumentList (Join-Path $Here 'ocr_server.py') `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir 'wrapper.log') `
    -RedirectStandardError (Join-Path $LogDir 'wrapper.err.log')

  $token = Get-Token
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Endpoint 'http://127.0.0.1:6000/health' $token) { break }
  }
  Show-Status
}

function Show-Status {
  $s = Get-Servers
  $token = Get-Token

  $modelUp = $null -ne $s.Model
  $wrapperUp = $null -ne $s.Wrapper
  $answering = Test-Endpoint 'http://127.0.0.1:6000/health' $token

  Write-Host ''
  if ($modelUp) {
    $device = 'unknown GPU'
    if ($s.Model.CommandLine -match '--device\s+(\S+)') { $device = $Matches[1] }
    Write-Host ("  model    running  pid {0}  on {1}" -f $s.Model.ProcessId, $device) -ForegroundColor Green
  } else {
    Write-Host "  model    stopped" -ForegroundColor DarkGray
  }

  if ($wrapperUp) {
    Write-Host ("  reader   running  pid {0}  on :6000" -f $s.Wrapper.ProcessId) -ForegroundColor Green
  } else {
    Write-Host "  reader   stopped" -ForegroundColor DarkGray
  }

  if ($modelUp -and $wrapperUp) {
    if ($answering) { Write-Host "  health   answering" -ForegroundColor Green }
    else { Write-Host "  health   not answering yet" -ForegroundColor Yellow }
  }

  if ($modelUp) {
    # Dedicated usage is the figure that means what it says. Private bytes count
    # video allocations WDDM has charged to commit, and --list-devices reports
    # the carve plus a system-memory aperture; neither answers "how much is in
    # use". See the memory section of README.md.
    $gpu = (Get-Counter "\GPU Adapter Memory(*)\Dedicated Usage" -ErrorAction SilentlyContinue).CounterSamples |
      Where-Object CookedValue -gt 0 |
      Sort-Object CookedValue -Descending | Select-Object -First 1
    if ($null -ne $gpu) {
      Write-Host ("  vram     {0:N1} GB dedicated in use on the busiest adapter" -f ($gpu.CookedValue / 1GB)) -ForegroundColor DarkGray
    }
    Write-Host ("  ram      {0:N0} MB working set" -f ($s.Model.WorkingSetSize / 1MB)) -ForegroundColor DarkGray
  }

  if ($token) {
    if ($ShowToken) { Write-Host "  token    $token" -ForegroundColor Cyan }
    else { Write-Host ("  token    {0}...  (-ShowToken for the full value)" -f $token.Substring(0, [Math]::Min(6, $token.Length))) -ForegroundColor DarkGray }
  }

  if ($modelUp -and $wrapperUp) {
    $lan = Get-LanAddress
    Write-Host ''
    if ($lan) { Write-Host "  In the app, Settings -> Assisted reading:  ${lan}:6000" -ForegroundColor Cyan }
    Write-Host "  Through the tunnel, use its hostname instead." -ForegroundColor DarkGray
  }
  Write-Host ''
}

switch ($Action) {
  'start'   { Start-Servers }
  'stop'    { Stop-Servers }
  'restart' { Stop-Servers; Start-Sleep -Seconds 3; Start-Servers }
  'status'  { Show-Status }
}
