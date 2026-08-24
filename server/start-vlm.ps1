<#
  Starts the vision model that reads the blood-pressure display.

  This is a *development and home-network* helper. The app works without it —
  see server/README.md for what it is and why the app does not require it.

  Listens on 127.0.0.1:6001 (loopback only). The phone never talks to this
  directly; it talks to ocr_server.py on port 6000, which forwards to here.

  ## Memory

  Three flags carry the whole "VRAM only, and RAM must not creep" requirement:

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

  Note llama.cpp still needs a little RAM per request to hold the decoded image
  before it is uploaded. That is transient and released; it is not a leak.
#>

$ErrorActionPreference = 'Continue'

$LlamaServer = 'D:\AiApiStuff\runtime\llamacpp\llama-server.exe'
$Model       = 'D:\AiApiStuff\models\Qwen3VL-8B-Instruct-Q4_K_M.gguf'
$MMProj      = 'D:\AiApiStuff\models\mmproj-Qwen3VL-8B-Instruct-F16.gguf'

# Vulkan0 is the RTX 3060; Vulkan1 is the Radeon 8060S iGPU. Check the current
# order with: llama-server.exe --list-devices
$Device = if ($env:HH_VLM_DEVICE) { $env:HH_VLM_DEVICE } else { 'Vulkan0' }
$Port   = if ($env:HH_VLM_PORT)   { $env:HH_VLM_PORT }   else { '6001' }

foreach ($path in @($LlamaServer, $Model, $MMProj)) {
  if (-not (Test-Path $path)) {
    Write-Error "Missing: $path`nSee server/README.md for the download commands."
    exit 1
  }
}

Write-Host "Qwen3-VL-8B on $Device, listening on 127.0.0.1:$Port" -ForegroundColor Cyan

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
