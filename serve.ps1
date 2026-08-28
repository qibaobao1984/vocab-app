$ErrorActionPreference = 'Stop'
$port = 8787
$root = Join-Path $PSScriptRoot 'dist'
if (-not (Test-Path $root)) { Write-Host 'dist folder not found. Run: npm run build first.' -ForegroundColor Red; Read-Host 'Press Enter to exit'; exit 1 }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.json' = 'application/json; charset=utf-8'
  '.ico'  = 'image/x-icon'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
$url = "http://localhost:$port/"
Write-Host ""
Write-Host "==================================" -ForegroundColor Green
Write-Host "  Vocab app running at: $url" -ForegroundColor Green
Write-Host "  Keep this window open." -ForegroundColor Green
Write-Host "  Close this window to stop." -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green
Write-Host ""

try { Start-Process $url } catch { Write-Host "Open your browser and visit: $url" -ForegroundColor Yellow }

$enc = [Text.Encoding]::ASCII
while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 8000
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::ASCII)
    $line = $reader.ReadLine()
    if ($null -eq $line) { continue }
    while ($null -ne ($h = $reader.ReadLine()) -and $h -ne '') {}
    if ($line -match 'GET\s+(\S+)') {
      $reqPath = [Uri]::UnescapeDataString($matches[1])
      $rel = $reqPath -replace '^/',''
      if ($rel -eq '' -or $rel -notmatch '\.') { $rel = 'index.html' }
      $rel = $rel -replace '\.\.\\','' -replace '\.\./',''
      $file = Join-Path $root $rel
      if (Test-Path $file -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
      } else {
        $bytes = [Text.Encoding]::UTF8.GetBytes('404 Not Found: ' + $rel)
        $ct = 'text/plain; charset=utf-8'
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: $ct`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
      }
      $hb = $enc.GetBytes($header)
      $stream.Write($hb, 0, $hb.Length)
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush()
    }
  } catch {
    Write-Host "Request error: $($_.Exception.Message)" -ForegroundColor DarkGray
  } finally {
    $client.Close()
  }
}
