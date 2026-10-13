<#
  Starts the vision model that reads the blood-pressure display.

  This is a *development and home-network* helper. The app works without it —
  see server/README.md for what it is and why the app does not require it.

  Listens on 127.0.0.1:6001 (loopback only). The phone never talks to this
  directly; it talks to ocr_server.py on port 6000, which forwards to here.

  ## Paths

      $env:HH_LLAMA_SERVER = 'C:\llama.cpp\llama-server.exe'
      $env:HH_VLM_MODEL    = 'C:\models\Qwen3VL-8B-Instruct-Q4_K_M.gguf'
      $env:HH_VLM_MMPROJ   = 'C:\models\mmproj-Qwen3VL-8B-Instruct-F16.gguf'

  Unset, each falls back to where the author's machine keeps it.

  ## Choosing a GPU

      $env:HH_VLM_GPU = 'igpu'     # first AMD or Intel adapter — the default
      $env:HH_VLM_GPU = 'nvidia'   # first NVIDIA adapter
      $env:HH_VLM_GPU = 'Vulkan1'  # an exact device id, if you know it

  Selected by *name*, not by index, and that is not fussiness. llama.cpp's
  device numbering is not stable: on this machine `--list-devices` reported
  Vulkan0 as the RTX 3060 one hour and as the Radeon the next, with no change to
  the build or the hardware. Hardcoding `Vulkan0` therefore silently loads the
  model onto whichever card happens to enumerate first, which is how you end up
  wondering why it got slower. The id is resolved below, at every launch.

  ## Memory

  Three flags carry the "VRAM only, and RAM must not creep" requirement:

    --load-mode dio   Reads the weights from disk straight into VRAM using
                      DirectIO. The default (mmap) leaves the whole 5 GB file
                      resident in the OS page cache, which is what makes it look
                      like the model has been loaded twice.

    --cache-ram 0     Disables the host-side prompt cache. It defaults to 8192
                      MiB, and it is the reason RAM climbs with every request:
                      each new conversation gets its KV state parked in RAM when
                      it is evicted from the slot. We never reuse a prompt
                      across requests, so the cache buys nothing here.

    --n-gpu-layers 999  Every layer on the GPU. Partial offload keeps the
                      remainder in RAM and computes it on the CPU.

  On the author's machine the iGPU does *not* come out of system RAM: 64 GB is
  carved off in the BIOS as dedicated VRAM, so a model in it costs the OS nothing. Measured
  by diffing the dedicated-usage counter across a restart, this model occupies
  5.55 GB of that carve against a 949 MB process working set. Both numbers
  depend on the flag above — with mmap the weights land in system RAM *and* get
  copied into the carve, paid for twice out of the same silicon.
#>

$ErrorActionPreference = 'Continue'

# Where llama.cpp and the model live. Set these to your own paths; the
# fallbacks are where the author's machine keeps them.
$LlamaServer = if ($env:HH_LLAMA_SERVER) { $env:HH_LLAMA_SERVER } else { 'D:\AiApiStuff\runtime\llamacpp\llama-server.exe' }
$Model       = if ($env:HH_VLM_MODEL)    { $env:HH_VLM_MODEL }    else { 'D:\AiApiStuff\models\Qwen3VL-8B-Instruct-Q4_K_M.gguf' }
$MMProj      = if ($env:HH_VLM_MMPROJ)   { $env:HH_VLM_MMPROJ }   else { 'D:\AiApiStuff\models\mmproj-Qwen3VL-8B-Instruct-F16.gguf' }

$Port = if ($env:HH_VLM_PORT) { $env:HH_VLM_PORT } else { '6001' }
$Want = if ($env:HH_VLM_GPU)  { $env:HH_VLM_GPU }  else { 'igpu' }

foreach ($path in @($LlamaServer, $Model, $MMProj)) {
  if (-not (Test-Path $path)) {
    Write-Error "Missing: $path`nSee server/README.md for the download commands."
    exit 1
  }
}

# Ask the runtime what it can see, right now, rather than trusting a note.
$devices = @()
foreach ($line in (& $LlamaServer --list-devices 2>&1)) {
  if ("$line" -match '^\s*(\w+?\d+):\s*(.+?)\s*\(') {
    $devices += [pscustomobject]@{ Id = $Matches[1]; Name = $Matches[2] }
  }
}

if ($devices.Count -eq 0) {
  Write-Error "No GPU devices reported by llama-server. Is the Vulkan runtime installed?"
  exit 1
}

if ($Want -match '^\w+?\d+$' -and ($devices.Id -contains $Want)) {
  $Device = $Want
} else {
  $pattern = if ($Want -eq 'nvidia') { 'NVIDIA|GeForce|RTX' } else { 'Radeon|AMD|Intel|Iris' }
  $match = $devices | Where-Object { $_.Name -match $pattern } | Select-Object -First 1
  if ($null -eq $match) {
    Write-Error "No device matching '$Want'. Available: $(($devices | ForEach-Object { "$($_.Id) = $($_.Name)" }) -join '; ')"
    exit 1
  }
  $Device = $match.Id
}

$chosen = $devices | Where-Object { $_.Id -eq $Device } | Select-Object -First 1
Write-Host "Qwen3-VL-8B on $($chosen.Id) ($($chosen.Name)), listening on 127.0.0.1:$Port" -ForegroundColor Cyan

& $LlamaServer `
  --model $Model `
  --mmproj $MMProj `
  --alias heart-history-vlm `
  --device $Device `
  --n-gpu-layers 999 `
  --load-mode dio `
  --cache-ram 0 `
  --ctx-size 8192 `
  --parallel 1 `
  --flash-attn on `
  --image-min-tokens 1024 `
  --image-max-tokens 2048 `
  --temp 0 `
  --host 127.0.0.1 `
  --port $Port
