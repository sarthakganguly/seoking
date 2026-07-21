import sqlite3
import hashlib
import secrets

def hash_string(plain_text: str, salt: str = None) -> str:
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        'sha256',
        plain_text.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}${dk.hex()}"

conn = sqlite3.connect('data/seoking.db')
c = conn.cursor()
hashed = hash_string('password123')
c.execute("UPDATE users SET password_hash = ? WHERE username = 'username'", (hashed,))
conn.commit()
conn.close()
print("Reset password for 'username' to 'password123'")
