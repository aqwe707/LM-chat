# LM Chat Android APK Build Script
# Usage: Run this script in the android-capacitor directory

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LM Chat Android APK Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/5] Checking prerequisites..." -ForegroundColor Yellow

$javaHome = $env:JAVA_HOME
if (-not $javaHome) {
    Write-Host "  WARNING: JAVA_HOME not set. Trying to find Java..." -ForegroundColor Yellow
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if (-not $javaPath) {
        Write-Host "  ERROR: Java not found. Please install JDK 17+" -ForegroundColor Red
        Write-Host "  Download from: https://adoptium.net/" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "  Java found: $javaHome" -ForegroundColor Green
}

$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}
if (-not $androidHome) {
    Write-Host "  WARNING: ANDROID_HOME not set. Build may fail." -ForegroundColor Yellow
    Write-Host "  Set it to: C:\Users\YourName\AppData\Local\Android\Sdk" -ForegroundColor Yellow
} else {
    Write-Host "  Android SDK found: $androidHome" -ForegroundColor Green
}

# Step 2: Install npm dependencies
Write-Host ""
Write-Host "[2/5] Installing Capacitor dependencies..." -ForegroundColor Yellow
Set-Location $ProjectRoot
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed" -ForegroundColor Green

# Step 3: Sync web assets to Android
Write-Host ""
Write-Host "[3/5] Syncing web assets..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: cap sync failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Web assets synced" -ForegroundColor Green

# Step 4: Build APK
Write-Host ""
Write-Host "[4/5] Building APK..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\android"
.\gradlew.bat assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Gradle build failed" -ForegroundColor Red
    Write-Host "  See errors above for details." -ForegroundColor Yellow
    exit 1
}
Write-Host "  Build completed!" -ForegroundColor Green

# Step 5: Report output
Write-Host ""
Write-Host "[5/5] APK generated!" -ForegroundColor Green
$apkPath = "$ProjectRoot\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $item = Get-Item $apkPath
    $sizeMB = $item.Length / 1MB
    Write-Host "  Location: $apkPath" -ForegroundColor Cyan
    Write-Host "  Size: $([math]::Round($sizeMB, 2)) MB" -ForegroundColor Cyan
} else {
    Write-Host "  APK not found at expected location" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Done! Install APK on your device:" -ForegroundColor Cyan
Write-Host "  adb install $apkPath" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan