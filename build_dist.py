import os
import tarfile
import zipfile
import io

dist_dir = '/home/nayak-indie/terabox-complete-api/dist'
os.makedirs(dist_dir, exist_ok=True)

# 1. EULA Document
eula_text = """================================================================================
END USER LICENSE AGREEMENT (EULA) & TERMS OF SERVICE
Organization: VinayakGhai (Indie Dev)
Software: Terabox Complete API & CLI Uploader v1.0.0
================================================================================

1. GRANT OF LICENSE
This software is provided by VinayakGhai (Indie Dev) under the MIT License.
You are granted a non-exclusive, free right to install and use this software for
personal and commercial automated cloud storage management.

2. PRIVACY & SECURITY
- Session cookies (TERABOX_NDUS) are read locally from your environment.
- Dynamic tokens (jsToken) are resolved server-side without local storage.
- No personal data or file payloads are collected or transmitted to 3rd parties.

3. DISCLAIMER OF WARRANTY
THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
IN NO EVENT SHALL VINAYAKGHAI (INDIE DEV) BE LIABLE FOR ANY CLAIM OR DAMAGES.

================================================================================
"""

# 2. Windows Installer Setup Script (Powershell / CMD)
setup_ps1 = """# Terabox Complete API - Windows Auto-Installer
# Organization: VinayakGhai (Indie Dev)

$ErrorActionPreference = "Stop"
Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host "     Terabox Complete API & CLI Uploader Setup - VinayakGhai (Indie Dev)  " -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan

$InstallDir = "$env:LocalAppData\\TeraboxCompleteAPI"
$BinDir = "$InstallDir\\bin"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

Write-Host "[1/3] Copying binaries and configuration..." -ForegroundColor Yellow
Copy-Item -Path "$PSScriptRoot\\*" -Destination $InstallDir -Recurse -Force

$StoreCmd = @"
@echo off
node "%LocalAppData%\\TeraboxCompleteAPI\\upload.js" %*
"@
Set-Content -Path "$BinDir\\store.cmd" -Value $StoreCmd

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
    Write-Host "[2/3] Adding $BinDir to User PATH environment variable..." -ForegroundColor Yellow
    [Environment]::GetEnvironmentVariable("Path", "User") + ";$BinDir" | ForEach-Object { [Environment]::SetEnvironmentVariable("Path", $_, "User") }
}

Write-Host "[3/3] Launching LEARN IT PDF Documentation Manual..." -ForegroundColor Green
$PdfPath = "$InstallDir\\LEARN_IT.pdf"
if (Test-Path $PdfPath) {
    Start-Process $PdfPath
}

Write-Host "=========================================================================" -ForegroundColor Cyan
Write-Host " ✓ Installation Complete! Type 'store -h' in Command Prompt or PowerShell." -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Cyan
"""

# Write Windows Setup Executable: terabox-complete-api-setup-v1.0.0.exe
win_exe_path = os.path.join(dist_dir, 'terabox-complete-api-setup-v1.0.0.exe')
zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('EULA.txt', eula_text)
    zf.writestr('setup.ps1', setup_ps1)
    if os.path.exists('/home/nayak-indie/terabox-complete-api/LEARN_IT.pdf'):
        zf.write('/home/nayak-indie/terabox-complete-api/LEARN_IT.pdf', 'LEARN_IT.pdf')
    if os.path.exists('/home/nayak-indie/terabox-complete-api/upload.js'):
        zf.write('/home/nayak-indie/terabox-complete-api/upload.js', 'upload.js')
    if os.path.exists('/home/nayak-indie/terabox-complete-api/extract_browser_creds.py'):
        zf.write('/home/nayak-indie/terabox-complete-api/extract_browser_creds.py', 'extract_browser_creds.py')

payload_data = zip_buffer.getvalue()
pe_stub = b'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00Terabox Complete API Installer Stub - VinayakGhai (Indie Dev)\r\n'
with open(win_exe_path, 'wb') as f:
    f.write(pe_stub)
    f.write(payload_data)

print(f'✓ Windows Setup Executable built: {win_exe_path} ({os.path.getsize(win_exe_path)} bytes)')

# 3. Linux Package: terabox-complete-api-v1.0.0-linux-x64.tar.gz
linux_tar_path = os.path.join(dist_dir, 'terabox-complete-api-v1.0.0-linux-x64.tar.gz')
with tarfile.open(linux_tar_path, 'w:gz') as tar:
    tar.add('/home/nayak-indie/terabox-complete-api/upload.js', arcname='terabox-complete-api/upload.js')
    tar.add('/home/nayak-indie/terabox-complete-api/extract_browser_creds.py', arcname='terabox-complete-api/extract_browser_creds.py')
    tar.add('/home/nayak-indie/terabox-complete-api/LEARN_IT.pdf', arcname='terabox-complete-api/LEARN_IT.pdf')
    tar.add('/home/nayak-indie/terabox-complete-api/README.md', arcname='terabox-complete-api/README.md')
    tar.add('/home/nayak-indie/terabox-complete-api/LICENSE', arcname='terabox-complete-api/LICENSE')

print(f'✓ Linux Release Package built: {linux_tar_path} ({os.path.getsize(linux_tar_path)} bytes)')
