# LM Chat Android APK Build Script
# Usage: Run in the android-capacitor directory

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LM Chat Android APK Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Yellow

$javaExe = Get-Command java -ErrorAction SilentlyContinue
if (-not $javaExe) {
    Write-Host "  ERROR: Java not found" -ForegroundColor Red
    exit 1
}
$javaPath = $javaExe.Source
Write-Host "  Java: $javaPath" -ForegroundColor Green

# Auto-detect Android SDK
$androidSdk = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $androidSdk)) {
    $androidSdk = $env:ANDROID_HOME
}
if (-not (Test-Path $androidSdk)) {
    Write-Host "  WARNING: Android SDK not found" -ForegroundColor Yellow
} else {
    Write-Host "  Android SDK: $androidSdk" -ForegroundColor Green
}

# Step 2: Install npm dependencies
Write-Host ""
Write-Host "[2/6] Installing Capacitor dependencies..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm install --silent
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: npm install failed" -ForegroundColor Red; exit 1 }
Write-Host "  Dependencies installed" -ForegroundColor Green

# Step 3: Sync web assets
Write-Host ""
Write-Host "[3/6] Syncing web assets..." -ForegroundColor Yellow
npx cap sync android 
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: cap sync failed" -ForegroundColor Red; exit 1 }
Write-Host "  Web assets synced" -ForegroundColor Green

# Step 4: Configure local.properties
Write-Host ""
Write-Host "[4/6] Configuring Android SDK path..." -ForegroundColor Yellow
if (Test-Path $androidSdk) {
    "sdk.dir=$androidSdk" | Set-Content -Encoding UTF8 "$ProjectRoot\android\local.properties"
    Write-Host "  local.properties created" -ForegroundColor Green
} else {
    Write-Host "  SKIPPED: Android SDK not found" -ForegroundColor Yellow
}

# Step 5: Build APK
Write-Host ""
Write-Host "[5/6] Building APK..." -ForegroundColor Yellow
$env:ANDROID_HOME = $androidSdk
Set-Location "$ProjectRoot\android"

if ($env:JAVA_HOME) {
    $javaBin = Join-Path $env:JAVA_HOME "bin\java.exe"
} else {
    $javaBin = $javaPath
}

$gradlewPath = Join-Path $PWD "gradlew.bat"
$jarPath = Join-Path $PWD "gradle\wrapper\gradle-wrapper.jar"

Write-Host "  Running Gradle build..." -ForegroundColor Yellow

& $javaBin -classpath "$jarPath" org.gradle.wrapper.GradleWrapperMain assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Gradle build failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Build completed!" -ForegroundColor Green

# Step 6: Report output
Write-Host ""
Write-Host "[6/6] APK generated!" -ForegroundColor Green
$apkPath = "$ProjectRoot\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $item = Get-Item $apkPath
    $sizeMB = [math]::Round($item.Length / 1MB, 2)
    Write-Host "  Location: $apkPath" -ForegroundColor Cyan
    Write-Host "  Size: ${sizeMB} MB" -ForegroundColor Cyan
} else {
    Write-Host "  APK not found at expected location" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Done! Install on your phone:" -ForegroundColor Cyan
Write-Host "  adb install $apkPath" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan