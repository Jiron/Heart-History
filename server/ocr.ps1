<#
  Start, stop and inspect the assisted reader.

      .\server\ocr.ps1 start
      .\server\ocr.ps1 stop
      .\server\ocr.ps1 status
      .\server\ocr.ps1 restart
      .\server\ocr.ps1 reload     (the wrapper only -- keeps the model loaded)
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
  [ValidateSet('start', 'stop', 'restart', 'reload', 'status')]
  [string]$Action = 'status',

  # Off by default so the secret does not end up in a terminal buffer or a
  # screenshot. The truncated form is enough to check the app has the same one.
  [switch]$ShowToken,

  # Which card to load the model onto: 'igpu', 'nvidia', or an exact device id
  # such as 'Vulkan1'. Omitted means whatever start-vlm.ps1 defaults to.
  #
  # A parameter rather than only the environment variable, because setting the
  # variable inline is easy to get wrong from the shell that is already running:
  #
  #     powershell -Command "$env:HH_VLM_GPU='nvidia'; ./server/ocr.ps1 restart"
  #
  # expands `$env:HH_VLM_GPU` in the *outer* shell -- to nothing -- and hands the
  # inner one `='nvidia'`, which is a syntax error, after which the restart
  # proceeds on the default card and looks like it worked.
  [string]$Gpu = ''
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

function Resolve-DeviceName([string]$Id) {
  # Which physical card is 'Vulkan1'?
  #
  # Read back from what start-vlm.ps1 announced at launch, not by asking
  # llama-server again. Asking again is the obvious implementation and it is
  # wrong: device numbering is not stable between enumerations, so a status
  # check minutes after the start can map the same id to the other card. That
  # was observed here -- the model started on 'Vulkan0 (NVIDIA GeForce RTX
  # 3060)' and a later --list-devices called Vulkan0 the Radeon.
  #
  # The launch line is the only record made at the moment the choice was made,
  # and the log is truncated on each start, so it describes the running process.
  # If it does not name the id the process was actually given, say nothing
  # rather than guess.
  $log = Join-Path $LogDir 'model.log'
  if (-not (Test-Path $log)) { return '' }
  foreach ($line in (Get-Content $log -ErrorAction SilentlyContinue)) {
    if ($line -match 'on\s+(\w+?\d+)\s+\((.+?)\), listening' -and $Matches[1] -eq $Id) {
      return $Matches[2]
    }
  }
  return ''
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
  # Inherited by both child processes: Start-Process passes the current
  # environment through, and start-vlm.ps1 reads HH_VLM_GPU from it.
  if ($Gpu) { $env:HH_VLM_GPU = $Gpu }

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

function Restart-Wrapper {
  # The prompt, the schema and every refusal rule live in ocr_server.py, so
  # changing how a display is read means restarting that and nothing else.
  # Reloading the 8B model as well costs half a minute and achieves nothing --
  # which matters when the loop being run is "edit the prompt, re-grade".
  $s = Get-Servers
  if ($null -eq $s.Model) {
    Write-Host "The model is not running. Use 'start'." -ForegroundColor Yellow
    return
  }
  if ($null -ne $s.Wrapper) {
    Stop-Process -Id $s.Wrapper.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
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
    # The device id alone ('Vulkan1') says nothing about which card that is,
    # and llama.cpp's numbering moves between launches -- so resolve it back to
    # the adapter name, which is the thing anyone reading this wants to know.
    $device = 'unknown GPU'
    if ($s.Model.CommandLine -match '--device\s+(\S+)') { $device = $Matches[1] }
    $name = Resolve-DeviceName $device
    $shown = if ($name) { "$device ($name)" } else { $device }
    Write-Host ("  model    running  pid {0}  on {1}" -f $s.Model.ProcessId, $shown) -ForegroundColor Green
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
    # The model's *own* VRAM, not the adapter's.
    #
    # This used to report the busiest adapter, which is wrong on a machine with
    # two: with the iGPU carve in use by something else it read 37 GB while the
    # model sat in 6 GB on the RTX. The per-process counter answers the question
    # actually being asked -- how much video memory is this model holding.
    #
    # Dedicated usage is also the figure that means what it says. Private bytes
    # count video allocations WDDM has charged to commit, and --list-devices
    # reports the carve plus a system-memory aperture; neither answers it. See
    # the memory section of README.md.
    $mine = (Get-Counter ("\GPU Process Memory(pid_{0}*)\Dedicated Usage" -f $s.Model.ProcessId) -ErrorAction SilentlyContinue).CounterSamples |
      Measure-Object -Property CookedValue -Sum
    if ($null -ne $mine -and $mine.Sum -gt 0) {
      Write-Host ("  vram     {0:N2} GB held by the model" -f ($mine.Sum / 1GB)) -ForegroundColor DarkGray
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
  'reload'  { Restart-Wrapper }
  'status'  { Show-Status }
}
