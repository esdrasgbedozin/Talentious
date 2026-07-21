"""
Authentication routes for user registration and login.
"""

import logging
from datetime import timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.rate_limit import EMAIL_RATE_LIMIT, LOGIN_RATE_LIMIT, limiter
from app.database import get_db
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.schemas.user import (
    UserCreate,
    UserResponse,
    Token,
    VerifyEmailRequest,
    ForgotPasswordRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    ChangeEmailRequest,
    ConfirmEmailChangeRequest,
)
from app.schemas.profile import PersonalInfo, ProfileData, Skills
from app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_email_token,
    decode_email_token,
    decode_email_token_payload,
)
from app.services.dependencies import get_current_active_user
from app.services import refresh as refresh_service
from app.services import password_reset as reset_service
from app.services import email_service
from app.config import settings

logger = logging.getLogger(__name__)

EMAIL_VERIFY_PURPOSE = "email_verify"
EMAIL_CHANGE_PURPOSE = "email_change"


async def _user_response(db: AsyncSession, user: User) -> UserResponse:
    """UserResponse enrichi du display_name (prénom du profil, s'il existe)."""
    profile = await db.get(UserProfile, user.id)
    first_name = None
    if profile and isinstance(profile.profile_data, dict):
        first_name = (profile.profile_data.get("personal_info") or {}).get(
            "first_name"
        ) or None
    response = UserResponse.model_validate(user)
    return response.model_copy(update={"display_name": first_name})


async def _send_verification_email(user: User) -> None:
    """Best-effort: email a verification link. Never blocks the caller on failure."""
    token = create_email_token(user.id, EMAIL_VERIFY_PURPOSE)
    verify_url = f"{settings.frontend_base_url}/verify-email?token={token}"
    # In local/dev (email disabled) log the link so it can be tested without a
    # mailbox. Never log the token when real sending is on (it would leak in prod).
    if not settings.email_enabled:
        logger.info("[DEV] Verification link for %s: %s", user.email, verify_url)
    try:
        await email_service.send_verification_email(
            to=user.email, verify_url=verify_url
        )
    except Exception:  # noqa: BLE001 - email failures must not break the flow
        logger.exception("Failed to send verification email to user %s", user.id)


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
        if not existing_user.email_verified:
            # Anti-squat : le compte existe mais son adresse n'a jamais été
            # prouvée. On ne dit pas « déjà utilisé » et on ne modifie RIEN
            # (surtout pas le mot de passe — seule la boîte mail fait autorité) :
            # on renvoie simplement le lien de vérification. Le titulaire réel
            # récupère le compte via vérification puis « mot de passe oublié ».
            await _send_verification_email(existing_user)
            return existing_user
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

    # Send the email-verification link (best-effort; no-op when email is disabled).
    await _send_verification_email(new_user)

    return new_user


@router.post("/verify-email", response_model=UserResponse)
async def verify_email(payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """
    Confirm an email address from a verification token.

    Idempotent: verifying an already-verified account succeeds. Invalid, expired or
    wrong-purpose tokens → 400.
    """
    user_id = decode_email_token(payload.token, EMAIL_VERIFY_PURPOSE)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )

    if not user.email_verified:
        user.email_verified = True
        await db.commit()
        await db.refresh(user)
        # First successful verification → welcome email (best-effort).
        try:
            await email_service.send_welcome_email(
                to=user.email,
                dashboard_url=f"{settings.frontend_base_url}/dashboard",
            )
        except Exception:  # noqa: BLE001 - email failures must not break the flow
            logger.exception("Failed to send welcome email to user %s", user.id)

    return user


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(EMAIL_RATE_LIMIT)
async def resend_verification(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    """Resend the verification email to the authenticated user (no-op if already verified)."""
    if not current_user.email_verified:
        await _send_verification_email(current_user)


@router.post("/verify-email/resend", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(EMAIL_RATE_LIMIT)
async def resend_verification_public(
    request: Request,
    payload: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Public resend (login screen: the user can't authenticate while unverified).

    Constant 204 whether or not the account exists (anti-enumeration); the email
    is actually sent only for an existing, unverified account. Rate-limited.
    """
    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if user is not None and not user.email_verified:
        await _send_verification_email(user)


@router.post("/password/forgot", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(EMAIL_RATE_LIMIT)
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Request a password-reset link.

    Always returns 204 regardless of whether the email exists — this prevents
    account enumeration. A reset email is sent only when the account exists.
    """
    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()

    if user is not None:
        raw = await reset_service.issue_reset_token(db, user.id)
        reset_url = f"{settings.frontend_base_url}/reset-password?token={raw}"
        if not settings.email_enabled:
            logger.info("[DEV] Password reset link for %s: %s", user.email, reset_url)
        try:
            await email_service.send_password_reset_email(
                to=user.email, reset_url=reset_url
            )
        except Exception:  # noqa: BLE001 - email failures must not leak existence
            logger.exception("Failed to send reset email to user %s", user.id)


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """
    Set a new password from a valid reset token.

    The token is single-use (consumed here). On success every existing session is
    revoked so a compromised session cannot survive a password reset. Invalid,
    expired or already-used tokens → 400.
    """
    try:
        user = await reset_service.consume_reset_token(db, payload.token)
    except reset_service.InvalidResetToken:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )

    user.hashed_password = hash_password(payload.new_password)
    await refresh_service.revoke_all_user_tokens(db, user.id)
    await db.commit()

    # Security notice (best-effort): the password changed and sessions were revoked.
    try:
        await email_service.send_password_changed_email(to=user.email)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to send password-changed email to user %s", user.id)


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

    # La connexion exige une adresse vérifiée : un compte créé avec l'adresse
    # d'autrui est inutilisable tant que la boîte mail n'a pas confirmé.
    # (Après le contrôle du mot de passe : un mauvais mdp reste 401 — le 403 ne
    # fuite l'état de vérification qu'à qui possède déjà les identifiants.)
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Adresse email non vérifiée. Consultez votre boîte mail ou "
                "renvoyez l'email de confirmation."
            ),
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
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get current authenticated user information.

    - Requires valid JWT token in Authorization header
    - Returns user info incl. display_name (profile first name) for the navbar
    """
    return await _user_response(db, current_user)


@router.post("/password/change", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Change the password of the authenticated user.

    Requires the CURRENT password (re-auth: a stolen session can't silently take
    over the account). All refresh sessions are revoked and a security notice is
    emailed.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mot de passe actuel incorrect",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    await refresh_service.revoke_all_user_tokens(db, current_user.id)
    await db.commit()

    try:
        await email_service.send_password_changed_email(to=current_user.email)
    except Exception:  # noqa: BLE001 - le changement est déjà effectif
        logger.exception(
            "Failed to send password-changed email to user %s", current_user.id
        )


@router.post("/email/change", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(EMAIL_RATE_LIMIT)
async def request_email_change(
    request: Request,
    payload: ChangeEmailRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Request an email change: a confirmation link is sent to the NEW address.

    The account keeps its current address until the new mailbox proves ownership
    (same authority principle as registration). Requires the current password.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mot de passe actuel incorrect",
        )

    if payload.new_email == current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nouvelle adresse est identique à l'actuelle",
        )

    taken = (
        await db.execute(select(User).where(User.email == payload.new_email))
    ).scalar_one_or_none()
    if taken is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette adresse est déjà utilisée par un autre compte",
        )

    token = create_email_token(
        current_user.id, EMAIL_CHANGE_PURPOSE, extra={"new_email": payload.new_email}
    )
    confirm_url = f"{settings.frontend_base_url}/confirm-email-change?token={token}"
    if not settings.email_enabled:
        logger.info(
            "[DEV] Email-change link for %s: %s", payload.new_email, confirm_url
        )
    await email_service.send_email_change_email(
        to=payload.new_email, confirm_url=confirm_url
    )


@router.post("/email/confirm", response_model=UserResponse)
async def confirm_email_change(
    payload: ConfirmEmailChangeRequest, db: AsyncSession = Depends(get_db)
):
    """
    Apply an email change from the token received on the NEW mailbox (public).

    Re-checks the collision at confirmation time (the address may have been
    registered meanwhile). The OLD address receives a security notice.
    """
    token_payload = decode_email_token_payload(payload.token, EMAIL_CHANGE_PURPOSE)
    new_email = (token_payload or {}).get("new_email")
    if not token_payload or not new_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lien de confirmation invalide ou expiré",
        )

    user = (
        await db.execute(select(User).where(User.id == token_payload.get("sub")))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lien de confirmation invalide ou expiré",
        )

    taken = (
        await db.execute(select(User).where(User.email == new_email))
    ).scalar_one_or_none()
    if taken is not None and taken.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette adresse n'est plus disponible",
        )

    old_email = user.email
    user.email = new_email
    user.email_verified = True  # la nouvelle boîte vient de prouver sa possession
    await db.commit()
    await db.refresh(user)

    try:
        await email_service.send_email_changed_notice(to=old_email, new_email=new_email)
    except Exception:  # noqa: BLE001 - le changement est déjà effectif
        logger.exception("Failed to send email-change notice to user %s", user.id)

    return await _user_response(db, user)
