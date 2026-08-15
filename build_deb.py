import os, tarfile, io

dist_dir = '/home/nayak-indie/terabox-complete-api/dist'
deb_path = os.path.join(dist_dir, 'terabox-complete-api_1.0.0_amd64.deb')

debian_binary = b"2.0\n"

# control.tar.gz
control_buf = io.BytesIO()
with tarfile.open(fileobj=control_buf, mode='w:gz') as tar:
    control_data = (
        "Package: terabox-complete-api\n"
        "Version: 1.0.0\n"
        "Section: utils\n"
        "Priority: optional\n"
        "Architecture: amd64\n"
        "Maintainer: VinayakGhai (Indie Dev) <vinayakghai@github.com>\n"
        "Description: Terabox Complete API & CLI Uploader (stt / storetera)\n"
        " High-performance TeraBox CLI File Uploader & Cloudflare Worker Token Proxy.\n"
    ).encode('utf-8')
    ti = tarfile.TarInfo(name='./control')
    ti.size = len(control_data)
    ti.mode = 0o644
    tar.addfile(ti, io.BytesIO(control_data))

control_bytes = control_buf.getvalue()

# data.tar.gz
data_buf = io.BytesIO()
with tarfile.open(fileobj=data_buf, mode='w:gz') as tar:
    with open('/home/nayak-indie/terabox-complete-api/upload.js', 'rb') as f:
        content = f.read()
    ti = tarfile.TarInfo(name='./usr/lib/terabox-complete-api/upload.js')
    ti.size = len(content)
    ti.mode = 0o755
    tar.addfile(ti, io.BytesIO(content))

    with open('/home/nayak-indie/terabox-complete-api/extract_browser_creds.py', 'rb') as f:
        content = f.read()
    ti = tarfile.TarInfo(name='./usr/lib/terabox-complete-api/extract_browser_creds.py')
    ti.size = len(content)
    ti.mode = 0o755
    tar.addfile(ti, io.BytesIO(content))

    wrapper = b"#!/bin/bash\nexec node /usr/lib/terabox-complete-api/upload.js \"$@\"\n"
    ti = tarfile.TarInfo(name='./usr/bin/stt')
    ti.size = len(wrapper)
    ti.mode = 0o755
    tar.addfile(ti, io.BytesIO(wrapper))

    ti = tarfile.TarInfo(name='./usr/bin/storetera')
    ti.size = len(wrapper)
    ti.mode = 0o755
    tar.addfile(ti, io.BytesIO(wrapper))

data_bytes = data_buf.getvalue()

def make_ar_header(filename, size):
    name_b = filename.encode('utf-8').ljust(16)
    mtime_b = b"0".ljust(12)
    owner_b = b"0".ljust(6)
    group_b = b"0".ljust(6)
    mode_b = b"100644".ljust(8)
    size_b = str(size).encode('utf-8').ljust(10)
    magic_b = b"`\n"
    return name_b + mtime_b + owner_b + group_b + mode_b + size_b + magic_b

def pad(data):
    return data + b'\n' if len(data) % 2 != 0 else data

with open(deb_path, 'wb') as f:
    f.write(b"!<arch>\n")
    f.write(make_ar_header('debian-binary', len(debian_binary)))
    f.write(pad(debian_binary))

    f.write(make_ar_header('control.tar.gz', len(control_bytes)))
    f.write(pad(control_bytes))

    f.write(make_ar_header('data.tar.gz', len(data_bytes)))
    f.write(pad(data_bytes))

print(f"✓ Created Debian DEB package: {deb_path} ({os.path.getsize(deb_path)} bytes)")
