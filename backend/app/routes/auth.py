"""
Authentication routes for user registration and login.
"""

from datetime import timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.rate_limit import LOGIN_RATE_LIMIT, limiter
from app.database import get_db
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.schemas.user import UserCreate, UserResponse, Token
from app.schemas.profile import PersonalInfo, ProfileData, Skills
from app.services.auth import hash_password, verify_password, create_access_token
from app.services.dependencies import get_current_active_user
from app.services import refresh as refresh_service
from app.config import settings


router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    """Attach the rotating refresh token as an httpOnly cookie (not readable by JS)."""
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.refresh_cookie_name, path="/")


def _issue_access_token(user: User) -> str:
    return create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )


# A real bcrypt hash, used to spend the same time verifying a password when the
# email is unknown (constant-time login → no user enumeration by timing).
_DUMMY_PASSWORD_HASH = hash_password("constant-time-placeholder")


@router.post(
    "/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """
    Register a new user account.

    - Validates that email doesn't already exist
    - Hashes the password securely
    - Creates user with default USER role
    - Creates empty profile for the user
    - Returns user information (without password)
    """
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Create new user
    hashed_password = hash_password(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        role=UserRole.USER,  # Default role
    )

    db.add(new_user)
    await db.flush()  # Get the user ID

    # Create empty profile for the user with minimal valid structure
    empty_profile_data = ProfileData(
        personal_info=PersonalInfo(
            first_name="",
            last_name="",
            email=user_data.email,
            phone=None,
            linkedin=None,
            address=None,
            city=None,
            postal_code=None,
            country="France",
        ),
        summary="",
        experiences=[],
        educations=[],
        skills=Skills(hard=[], soft=[]),  # Updated to new Skills structure
        projects=[],
        certifications=[],
    )

    new_profile = UserProfile(
        user_id=new_user.id, profile_data=empty_profile_data.model_dump(mode="json")
    )

    db.add(new_profile)
    await db.commit()
    await db.refresh(new_user)

    return new_user


@router.post("/login", response_model=Token)
@limiter.limit(LOGIN_RATE_LIMIT)
async def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
):
    """
    Login with email and password.

    - Uses OAuth2PasswordRequestForm (username field contains email)
    - Validates credentials
    - Returns a short-lived JWT access token in the body and sets a long-lived,
      rotating refresh token as an httpOnly cookie (used by POST /auth/refresh).
    """
    # Get user by email (OAuth2 uses 'username' field)
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    # Constant-time check: always run verify_password (against a dummy hash when the
    # user is unknown) so response timing does not reveal whether an email exists.
    if user is None:
        verify_password(form_data.password, _DUMMY_PASSWORD_HASH)
        password_ok = False
    else:
        password_ok = verify_password(form_data.password, user.hashed_password)

    if not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Short-lived access token (body) + long-lived rotating refresh token (cookie).
    access_token = _issue_access_token(user)
    raw_refresh = await refresh_service.issue_refresh_token(db, user.id)
    _set_refresh_cookie(response, raw_refresh)

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/refresh", response_model=Token)
async def refresh(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: Optional[str] = Cookie(
        default=None, alias=settings.refresh_cookie_name
    ),
):
    """
    Exchange a valid refresh-token cookie for a new access token.

    Rotates the refresh token (single-use): the old cookie is invalidated and a
    fresh one is set. Any invalid / expired / revoked / reused token → 401 and the
    cookie is cleared.
    """
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing refresh token",
        )

    try:
        user, new_raw = await refresh_service.rotate_refresh_token(db, refresh_token)
    except refresh_service.InvalidRefreshToken:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    access_token = _issue_access_token(user)
    _set_refresh_cookie(response, new_raw)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    refresh_token: Optional[str] = Cookie(
        default=None, alias=settings.refresh_cookie_name
    ),
):
    """
    Log out: revoke the current refresh token and clear its cookie.

    Idempotent and unauthenticated by design — it only needs the cookie, and a
    missing/unknown token still returns 204 (nothing to revoke).
    """
    if refresh_token:
        await refresh_service.revoke_refresh_token(db, refresh_token)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    """
    Get current authenticated user information.

    - Requires valid JWT token in Authorization header
    - Returns user profile without sensitive data
    """
    return current_user
