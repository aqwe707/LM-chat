# LM Chat Android APK Build Script
# 用法: 在 android-capacitor 目录下运行此脚本

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
    Write-Host "  ERROR: Java not found. Please install JDK 17+" -ForegroundColor Red
    Write-Host "  Download from: https://adoptium.net/" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Java: $($javaExe.Source)" -ForegroundColor Green

# Auto-detect ANDROID_HOME
$androidSdk = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $androidSdk)) {
    $androidSdk = $env:ANDROID_HOME
}
if (-not (Test-Path $androidSdk)) {
    Write-Host "  WARNING: Android SDK not found." -ForegroundColor Yellow
    Write-Host "  Expected: C:\Users\YourName\AppData\Local\Android\Sdk" -ForegroundColor Yellow
    Write-Host "  Set ANDROID_HOME environment variable." -ForegroundColor Yellow
} else {
    Write-Host "  Android SDK: $androidSdk" -ForegroundColor Green
}

# Step 2: Install npm dependencies
Write-Host ""
Write-Host "[2/6] Installing Capacitor dependencies..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed" -ForegroundColor Green

# Step 3: Sync web assets to Android
Write-Host ""
Write-Host "[3/6] Syncing web assets..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: cap sync failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Web assets synced" -ForegroundColor Green

# Step 4: Configure local.properties for Android SDK
Write-Host ""
Write-Host "[4/6] Configuring Android SDK path..." -ForegroundColor Yellow
if (Test-Path $androidSdk) {
    $localProps = "sdk.dir=$androidSdk"
    [System.IO.File]::WriteAllText("$ProjectRoot\android\local.properties", $localProps, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  local.properties created" -ForegroundColor Green
} else {
    Write-Host "  SKIPPED: Android SDK not found" -ForegroundColor Yellow
}

# Step 5: Build APK
Write-Host ""
Write-Host "[5/6] Building APK..." -ForegroundColor Yellow
$env:ANDROID_HOME = $androidSdk
Set-Location "$ProjectRoot\android"

# Use cmd to ensure env vars propagate
$batContent = @"
@echo off
set ANDROID_HOME=$androidSdk
set JAVA_HOME=%JAVA_HOME%
gradlew.bat assembleDebug --no-daemon
"@
$batPath = "$ProjectRoot\build-temp.bat"
[System.IO.File]::WriteAllText($batPath, $batContent, [System.Text.Encoding]::UTF8)
cmd /c $batPath
$exitCode = $LASTEXITCODE
Remove-Item $batPath -Force -ErrorAction SilentlyContinue

if ($exitCode -ne 0) {
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