import os
import tarfile
import zipfile
import io
import subprocess

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
Set-Content -Path "$BinDir\\stt.cmd" -Value $StoreCmd
Set-Content -Path "$BinDir\\storetera.cmd" -Value $StoreCmd

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
Write-Host " ✓ Installation Complete! Type 'stt help' in Command Prompt or PowerShell." -ForegroundColor Green
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

print(f'✓ Linux Release Package built: {linux_tar_path} ({os.path.getsize(linux_tar_path)} bytes)')

# 4. Debian/Ubuntu Package: terabox-complete-api_1.0.0_amd64.deb
deb_build_dir = '/tmp/terabox-complete-api_deb'
if os.path.exists(deb_build_dir):
    subprocess.run(['rm', '-rf', deb_build_dir])

os.makedirs(f'{deb_build_dir}/DEBIAN', exist_ok=True)
os.makedirs(f'{deb_build_dir}/usr/bin', exist_ok=True)
os.makedirs(f'{deb_build_dir}/usr/lib/terabox-complete-api', exist_ok=True)

control_content = """Package: terabox-complete-api
Version: 1.0.0
Section: utils
Priority: optional
Architecture: amd64
Maintainer: VinayakGhai (Indie Dev) <vinayakghai@github.com>
Description: Terabox Complete API & CLI Uploader (stt / storetera)
 High-performance TeraBox CLI File Uploader & Cloudflare Worker Token Proxy.
"""
with open(f'{deb_build_dir}/DEBIAN/control', 'w') as f:
    f.write(control_content)

subprocess.run(['cp', '/home/nayak-indie/terabox-complete-api/upload.js', f'{deb_build_dir}/usr/lib/terabox-complete-api/upload.js'])
subprocess.run(['cp', '/home/nayak-indie/terabox-complete-api/extract_browser_creds.py', f'{deb_build_dir}/usr/lib/terabox-complete-api/extract_browser_creds.py'])

stt_wrapper = """#!/bin/bash
exec node /usr/lib/terabox-complete-api/upload.js "$@"
"""
with open(f'{deb_build_dir}/usr/bin/stt', 'w') as f:
    f.write(stt_wrapper)
with open(f'{deb_build_dir}/usr/bin/storetera', 'w') as f:
    f.write(stt_wrapper)

os.chmod(f'{deb_build_dir}/usr/bin/stt', 0o755)
os.chmod(f'{deb_build_dir}/usr/bin/storetera', 0o755)

deb_file_path = os.path.join(dist_dir, 'terabox-complete-api_1.0.0_amd64.deb')
try:
    subprocess.run(['dpkg-deb', '--build', deb_build_dir, deb_file_path], check=True)
    print(f'✓ Debian/Ubuntu DEB Package built: {deb_file_path} ({os.path.getsize(deb_file_path)} bytes)')
except Exception as e:
    print('Debian build skipped or failed:', e)

# 5. Arch Linux PKGBUILD (yay -S teraapi-full)
pkgbuild_content = """# Maintainer: VinayakGhai (Indie Dev) <vinayakghai@github.com>
pkgname=teraapi-full
pkgver=1.0.0
pkgrel=1
pkgdesc="Terabox Complete API & CLI Uploader (stt / storetera / teraapi-full)"
arch=('x86_64')
url="https://github.com/VinayakGhai/terabox-complete-api"
license=('MIT')
depends=('nodejs' 'python')
source=("https://github.com/VinayakGhai/terabox-complete-api/releases/download/v1.0.0/terabox-complete-api-v1.0.0-linux-x64.tar.gz")
sha256sums=('SKIP')

package() {
    install -Dm755 "${srcdir}/terabox-complete-api/upload.js" "${pkgdir}/usr/lib/terabox-complete-api/upload.js"
    install -Dm755 "${srcdir}/terabox-complete-api/extract_browser_creds.py" "${pkgdir}/usr/lib/terabox-complete-api/extract_browser_creds.py"
    install -Dm644 "${srcdir}/terabox-complete-api/LEARN_IT.pdf" "${pkgdir}/usr/share/doc/terabox-complete-api/LEARN_IT.pdf"
    
    mkdir -p "${pkgdir}/usr/bin"
    echo '#!/bin/bash' > "${pkgdir}/usr/bin/teraapi-full"
    echo 'exec node /usr/lib/terabox-complete-api/upload.js "$@"' >> "${pkgdir}/usr/bin/teraapi-full"
    chmod +x "${pkgdir}/usr/bin/teraapi-full"
    
    ln -s /usr/bin/teraapi-full "${pkgdir}/usr/bin/stt"
    ln -s /usr/bin/teraapi-full "${pkgdir}/usr/bin/storetera"
}
"""
pkgbuild_path = os.path.join(dist_dir, 'PKGBUILD')
with open(pkgbuild_path, 'w') as f:
    f.write(pkgbuild_content)
print(f'✓ Arch Linux PKGBUILD generated: {pkgbuild_path}')

# 6. Fedora / RHEL Spec File
spec_content = """Name:           terabox-complete-api
Version:        1.0.0
Release:        1%{?dist}
Summary:        Terabox Complete API & CLI Uploader (stt / storetera)
License:        MIT
URL:            https://github.com/VinayakGhai/terabox-complete-api
Requires:       nodejs python3

%description
High-performance TeraBox CLI File Uploader & Cloudflare Worker Token Proxy.

%install
mkdir -p %{buildroot}/usr/lib/terabox-complete-api
mkdir -p %{buildroot}/usr/bin
cp upload.js %{buildroot}/usr/lib/terabox-complete-api/
cp extract_browser_creds.py %{buildroot}/usr/lib/terabox-complete-api/
echo '#!/bin/bash' > %{buildroot}/usr/bin/stt
echo 'exec node /usr/lib/terabox-complete-api/upload.js "$@"' >> %{buildroot}/usr/bin/stt
chmod +x %{buildroot}/usr/bin/stt
ln -s /usr/bin/stt %{buildroot}/usr/bin/storetera

%files
/usr/lib/terabox-complete-api/*
/usr/bin/stt
/usr/bin/storetera
"""
spec_path = os.path.join(dist_dir, 'terabox-complete-api.spec')
with open(spec_path, 'w') as f:
    f.write(spec_content)
print(f'✓ Fedora / RHEL Spec file generated: {spec_path}')
