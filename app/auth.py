import hashlib
import secrets
import logging
from fastapi import Cookie, HTTPException
from app.database import get_db_connection

logger = logging.getLogger("seoking.auth")


# Dependency to check session authentication
async def get_current_user(session_token: str = Cookie(None)):
    if not session_token:
        raise HTTPException(status_code=401, detail="Session cookie missing")
    user_id = await get_user_from_session(session_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Session invalid or expired")
    return user_id

def hash_string(plain_text: str, salt: str = None) -> str:
    """
    Hashes a string securely using PBKDF2 with SHA-256.
    If salt is not provided, a random 16-byte salt is generated.
    Returns: salt_hex$hash_hex
    """
    if salt is None:
        salt = secrets.token_hex(16)
    
    dk = hashlib.pbkdf2_hmac(
        'sha256',
        plain_text.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}${dk.hex()}"

def verify_string(plain_text: str, stored_hash: str) -> bool:
    """
    Verifies a plain text string against a stored salt$hash string.
    """
    try:
        parts = stored_hash.split('$')
        if len(parts) != 2:
            return False
        salt, _ = parts
        computed_hash = hash_string(plain_text, salt)
        return secrets.compare_digest(computed_hash, stored_hash)
    except Exception as e:
        logger.error(f"Error verifying string hash: {e}")
        return False

async def register_user(username: str, password_plain: str) -> tuple[str, str]:
    """
    Registers a new user in the database.
    Generates a secure recovery code.
    Returns: (recovery_code_plain, error_message)
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        # Check if user already exists
        await cursor.execute("SELECT id FROM users LIMIT 1")
        if await cursor.fetchone():
            return "", "A user account already exists. SEO King is configured for a single user."

        # Generate a unique recovery code
        recovery_code = secrets.token_hex(16)  # 32 characters
        
        # Hash password and recovery code
        password_hash = hash_string(password_plain)
        recovery_code_hash = hash_string(recovery_code)

        await cursor.execute(
            "INSERT INTO users (username, password_hash, recovery_code_hash) VALUES (?, ?, ?)",
            (username, password_hash, recovery_code_hash)
        )
        await conn.commit()
        
        logger.info(f"User {username} registered successfully.")
        return recovery_code, ""
    except Exception as e:
        await conn.rollback()
        logger.error(f"Failed to register user: {e}")
        return "", str(e)
    finally:
        await conn.close()

async def authenticate_user(username: str, password_plain: str) -> tuple[int | None, str]:
    """
    Authenticates a user against stored username and password hash.
    Returns: (user_id, error_message)
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,))
        row = await cursor.fetchone()
        if not row:
            return None, "Invalid username or password"
        
        if verify_string(password_plain, row["password_hash"]):
            logger.info(f"User {username} authenticated successfully.")
            return row["id"], ""
        else:
            return None, "Invalid username or password"
    except Exception as e:
        logger.error(f"Error during authentication: {e}")
        return None, str(e)
    finally:
        await conn.close()

async def recover_account(username: str, recovery_code_plain: str, new_password_plain: str) -> bool:
    """
    Resets user password if the recovery code matches.
    Returns: True if successful, False otherwise.
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT id, recovery_code_hash FROM users WHERE username = ?", (username,))
        row = await cursor.fetchone()
        if not row:
            return False
        
        if verify_string(recovery_code_plain, row["recovery_code_hash"]):
            new_password_hash = hash_string(new_password_plain)
            await cursor.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (new_password_hash, row["id"])
            )
            await conn.commit()
            logger.info(f"Password reset successful for user {username} via recovery code.")
            return True
        else:
            logger.warning(f"Failed recovery attempt for user {username}: invalid recovery code.")
            return False
    except Exception as e:
        await conn.rollback()
        logger.error(f"Error recovering account: {e}")
        return False
    finally:
        await conn.close()

async def create_session(user_id: int) -> str:
    """
    Creates a new session and returns the session token.
    """
    session_token = secrets.token_hex(32)
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("INSERT INTO user_sessions (session_token, user_id) VALUES (?, ?)", (session_token, user_id))
        await conn.commit()
        logger.info(f"Created session for user_id: {user_id}")
        return session_token
    except Exception as e:
        await conn.rollback()
        logger.error(f"Error creating session: {e}")
        raise
    finally:
        await conn.close()

async def get_user_from_session(session_token: str) -> int | None:
    """
    Resolves a session token to a user ID.
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("SELECT user_id FROM user_sessions WHERE session_token = ?", (session_token,))
        row = await cursor.fetchone()
        return row["user_id"] if row else None
    except Exception as e:
        logger.error(f"Error fetching session: {e}")
        return None
    finally:
        await conn.close()

async def delete_session(session_token: str):
    """
    Invalidates a session token.
    """
    conn = await get_db_connection()
    cursor = await conn.cursor()
    try:
        await cursor.execute("DELETE FROM user_sessions WHERE session_token = ?", (session_token,))
        await conn.commit()
        logger.info("Session deleted successfully.")
    except Exception as e:
        await conn.rollback()
        logger.error(f"Error deleting session: {e}")
    finally:
        await conn.close()
