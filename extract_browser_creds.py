#!/usr/bin/env python3
"""
extract_browser_creds.py
Extracts TeraBox ndus session cookie directly from local Brave / Chrome browser SQLite cookie store.
Runs instantly in the background with zero window popups.
"""

import os
import sys
import sqlite3
import shutil
import re

def get_brave_cookie():
    paths = [
        os.path.expanduser('~/.config/BraveSoftware/Brave-Browser/Default/Cookies'),
        os.path.expanduser('~/.config/google-chrome/Default/Cookies'),
        os.path.expanduser('~/.config/chromium/Default/Cookies')
    ]

    db_path = None
    for p in paths:
        if os.path.exists(p):
            db_path = p
            break

    if not db_path:
        return None

    try:
        import secretstorage
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
        from cryptography.hazmat.primitives import hashes

        bus = secretstorage.dbus_init()
        collection = secretstorage.get_default_collection(bus)
        key = b'peanuts'
        for item in collection.get_all_items():
            if item.get_label() in ['Brave Safe Storage', 'Chrome Safe Storage', 'Chromium Safe Storage']:
                key = item.get_secret()
                break
        salt = b'saltysalt'
        kdf = PBKDF2HMAC(algorithm=hashes.SHA1(), length=16, salt=salt, iterations=1, backend=None)
        aes_key = kdf.derive(key)

        tmp_path = f'/tmp/browser_cookies_{os.getpid()}.db'
        shutil.copy2(db_path, tmp_path)

        conn = sqlite3.connect(tmp_path)
        cursor = conn.cursor()
        cursor.execute("SELECT host_key, name, encrypted_value FROM cookies WHERE host_key LIKE '%terabox%' AND name = 'ndus'")

        extracted_tokens = []
        for host_key, name, enc_val in cursor.fetchall():
            if enc_val.startswith(b'v10') or enc_val.startswith(b'v11'):
                enc_val = enc_val[3:]
            iv = b' ' * 16
            cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            decrypted = decryptor.update(enc_val) + decryptor.finalize()

            val = decrypted.decode('utf-8', errors='ignore')
            # Extract alphanumeric sequences
            parts = re.findall(r'[a-zA-Z0-9_-]{20,}', val)
            for token in parts:
                if len(token) > 40:
                    token = token[-40:]
                if len(token) >= 20:
                    extracted_tokens.append((host_key, token))

        try:
            os.remove(tmp_path)
        except Exception:
            pass

        # Prioritize .terabox.com
        for host, token in extracted_tokens:
            if host == '.terabox.com' or host == 'terabox.com':
                return token

        if extracted_tokens:
            return extracted_tokens[0][1]

    except Exception:
        pass

    return None

if __name__ == '__main__':
    ndus = get_brave_cookie()
    if ndus:
        print(ndus)
        sys.exit(0)
    else:
        sys.exit(1)
