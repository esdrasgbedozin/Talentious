"""
Authentication and security services.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings


# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hash a plain text password using bcrypt.

    Args:
        password: Plain text password to hash

    Returns:
        Hashed password string
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain text password against a hashed password.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Hashed password to compare against

    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary of data to encode in the token
        expires_delta: Optional custom expiration time

    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()

    # Use timezone-aware timestamps (UTC). Encode 'exp' as an int timestamp.
    # JWT 'exp' claim is defined in seconds since epoch (RFC 7519 NumericDate), so sub-second precision is not needed.
    if expires_delta:
        expire_ts = int((datetime.now(timezone.utc) + expires_delta).timestamp())
    else:
        expire_ts = int(
            (
                datetime.now(timezone.utc)
                + timedelta(minutes=settings.access_token_expire_minutes)
            ).timestamp()
        )

    to_encode.update({"exp": expire_ts})
    encoded_jwt = jwt.encode(
        to_encode, settings.secret_key, algorithm=settings.algorithm
    )

    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and verify a JWT access token.

    Args:
        token: JWT token string to decode

    Returns:
        Decoded token payload as dictionary, or None if invalid
    """
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        return payload
    except JWTError:
        return None


def create_email_token(user_id, purpose: str, extra: Optional[dict] = None) -> str:
    """Create a short-lived signed token for an email link (verification, reset,
    email change).

    The ``purpose`` claim scopes the token so a verification link can never be
    replayed as a reset link (and vice versa). ``extra`` carries additional
    claims (e.g. the new address for an email change).
    """
    expire_ts = int(
        (
            datetime.now(timezone.utc)
            + timedelta(hours=settings.email_token_expire_hours)
        ).timestamp()
    )
    claims = {"sub": str(user_id), "purpose": purpose, "exp": expire_ts}
    if extra:
        claims.update(extra)
    return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)


def decode_email_token_payload(token: str, expected_purpose: str) -> Optional[dict]:
    """Full payload of a valid email token of the expected purpose, else None."""
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
    except JWTError:
        return None
    if payload.get("purpose") != expected_purpose:
        return None
    return payload


def decode_email_token(token: str, expected_purpose: str) -> Optional[str]:
    """Return the user id from a valid email token of the expected purpose, else None."""
    payload = decode_email_token_payload(token, expected_purpose)
    return payload.get("sub") if payload else None
