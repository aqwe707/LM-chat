# LM Chat - Startup Script
$ErrorActionPreference = "SilentlyContinue"
$rootDir = $PSScriptRoot

# Read config
$configPath = Join-Path $rootDir "config.json"
$passcode = ""
$backendPort = 8081
if (Test-Path $configPath) {
    $raw = Get-Content $configPath -Raw -Encoding UTF8
    if ($raw -match '"passcode"\s*:\s*"([^"]*)"') { $passcode = $matches[1] }
    if ($raw -match '"port"\s*:\s*(\d+)') { $backendPort = [int]$matches[1] }
}
$proxyPort = 8080

# Get IPv4 addresses
$ipv4List = @()
try {
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.Name -notlike "*VMware*" -and $_.Name -notlike "*Virtual*" -and $_.Name -notlike "*Bluetooth*" }
    foreach ($adapter in $adapters) {
        $ipConf = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
        foreach ($ip in $ipConf) {
            if ($ip.IPAddress -notlike "127.*" -and $ip.IPAddress -notlike "169.254.*") {
                $ipv4List += $ip.IPAddress
            }
        }
    }
} catch {}
if ($ipv4List.Count -eq 0) { $ipv4List = @("(check your network)") }

# Get IPv6 addresses (excluding loopback ::1)
$ipv6List = @()
try {
    $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" -and $_.Name -notlike "*VMware*" -and $_.Name -notlike "*Virtual*" -and $_.Name -notlike "*Bluetooth*" }
    foreach ($adapter in $adapters) {
        $ipConf = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue
        foreach ($ip in $ipConf) {
            if ($ip.IPAddress -ne "::1" -and $ip.PrefixOrigin -ne "WellKnown") {
                $ipv6List += @{ Address = $ip.IPAddress; Interface = $adapter.Name; ZoneIndex = $ip.InterfaceIndex }
            }
        }
    }
} catch {}

# Display info
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "      LM Chat - Local Network AI Chat" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

if ($passcode -eq "") {
    Write-Host "  [PASSWORD] NONE - no password required" -ForegroundColor Yellow
    Write-Host "  Just click UNLOCK with empty password" -ForegroundColor Yellow
} else {
    Write-Host "  [PASSWORD] $passcode" -ForegroundColor Green
}
Write-Host "  [PORT]     $proxyPort (proxy) / $backendPort (backend)" -ForegroundColor White
Write-Host ""

Write-Host "  Access URLs (IPv4):" -ForegroundColor White
Write-Host "  Local:  http://localhost:$proxyPort" -ForegroundColor Yellow
foreach ($ip in $ipv4List) {
    Write-Host "  LAN:    http://$($ip):$proxyPort" -ForegroundColor Yellow
}

if ($ipv6List.Count -gt 0) {
    Write-Host ""
    Write-Host "  Access URLs (IPv6):" -ForegroundColor White
    foreach ($item in $ipv6List) {
        $addr = $item.Address
        $ifName = $item.Interface
        if ($addr -like "fe80:*") {
            $zoneUrl = "http://[" + $addr + "%25" + $ifName + "]:" + $proxyPort
            Write-Host "  LAN:    $zoneUrl  (link-local, $ifName)" -ForegroundColor Cyan
        } else {
            Write-Host "  LAN:    http://[$addr]:$proxyPort" -ForegroundColor Cyan
        }
    }
}

Write-Host ""

# Kill old processes
Get-Process -Name "lm-chat" -ErrorAction SilentlyContinue | Stop-Process -Force
$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
foreach ($p in $nodeProcs) {
    try {
        $conn = netstat -ano 2>$null | Select-String ":$proxyPort"
        if ($conn -match [regex]::Escape($p.Id.ToString())) { $p | Stop-Process -Force }
    } catch {}
}
Start-Sleep 1

# Start backend
$exePath = Join-Path $rootDir "lm-chat.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "  ERROR: lm-chat.exe not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  [1/3] Starting backend (lm-chat.exe port $backendPort)..." -ForegroundColor Yellow
$pBackend = Start-Process -FilePath $exePath -WorkingDirectory $rootDir -WindowStyle Hidden -PassThru
Write-Host "    PID: $($pBackend.Id)" -ForegroundColor Green
Start-Sleep 2

try {
    $r = Invoke-WebRequest -Uri "http://localhost:$backendPort/api/verify" -Method POST -Body '{"passcode":""}' -ContentType "application/json" -TimeoutSec 3
    if ($r.Content -match '"ok":true') { Write-Host "    Backend OK" -ForegroundColor Green }
} catch { Write-Host "    Backend may not be ready: $_" -ForegroundColor Yellow }

# Start proxy
$proxyPath = Join-Path $rootDir "server-proxy.js"
if (-not (Test-Path $proxyPath)) {
    Write-Host "  ERROR: server-proxy.js not found!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "  [2/3] Starting proxy (port $proxyPort, IPv4 + IPv6)..." -ForegroundColor Yellow
$pProxy = Start-Process -FilePath "node" -ArgumentList "`"$proxyPath`"" -WorkingDirectory $rootDir -WindowStyle Hidden -PassThru
Write-Host "    PID: $($pProxy.Id)" -ForegroundColor Green
Start-Sleep 2

try {
    $r = Invoke-WebRequest -Uri "http://localhost:$proxyPort/" -TimeoutSec 3
    Write-Host "    Proxy OK (HTTP $($r.StatusCode), $($r.Content.Length) bytes)" -ForegroundColor Green
} catch { Write-Host "    Proxy may not be ready: $_" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  [3/3] Server is RUNNING!" -ForegroundColor Green
Write-Host ""

Write-Host "  Open on your phone (pick the one that works):" -ForegroundColor White
foreach ($ip in $ipv4List) {
    Write-Host "  http://$($ip):$proxyPort" -ForegroundColor Cyan
}
foreach ($item in $ipv6List) {
    $addr = $item.Address
    $ifName = $item.Interface
    if ($addr -like "fe80:*") {
        Write-Host "  http://[$addr%25$ifName]:$proxyPort  (IPv6 link-local)" -ForegroundColor Cyan
    } else {
        Write-Host "  http://[$addr]:$proxyPort  (IPv6)" -ForegroundColor Cyan
    }
}

if ($passcode -eq "") {
    Write-Host ""
    Write-Host "  Password is NOT set. Tap UNLOCK without typing." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "" -ForegroundColor DarkGray
Write-Host "=========================================" -ForegroundColor Cyan

# Monitor processes
while ($true) {
    Start-Sleep 3
    $p1 = Get-Process -Id $pBackend.Id -ErrorAction SilentlyContinue
    $p2 = Get-Process -Id $pProxy.Id -ErrorAction SilentlyContinue
    if (-not $p1 -and -not $p2) { Write-Host "Both processes stopped." -ForegroundColor Red; break }
    if (-not $p1) { Write-Host "Backend (lm-chat.exe) stopped!" -ForegroundColor Red; break }
    if (-not $p2) { Write-Host "Proxy (server-proxy.js) stopped!" -ForegroundColor Red; break }
}
