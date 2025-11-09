"""
Authentication routes for user registration and login.
"""
from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.schemas.user import UserCreate, UserResponse, Token
from app.schemas.profile import PersonalInfo, ProfileData
from app.services.auth import hash_password, verify_password, create_access_token
from app.services.dependencies import get_current_active_user
from app.config import settings


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user account.
    
    - Validates that email doesn't already exist
    - Hashes the password securely
    - Creates user with default USER role
    - Creates empty profile for the user
    - Returns user information (without password)
    """
    # Check if email already exists
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = hash_password(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        role=UserRole.USER  # Default role
    )
    
    db.add(new_user)
    await db.flush()  # Get the user ID
    
    # Create empty profile for the user with minimal valid structure
    empty_profile_data = ProfileData(
        personal_info=PersonalInfo(
            first_name="",
            last_name="",
            email=user_data.email
        ),
        summary=None,
        experiences=[],
        educations=[],
        skills=[],
        projects=[],
        certifications=[]
    )
    
    new_profile = UserProfile(
        user_id=new_user.id,
        profile_data=empty_profile_data.model_dump(mode='json')
    )
    
    db.add(new_profile)
    await db.commit()
    await db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password to get JWT access token.
    
    - Uses OAuth2PasswordRequestForm (username field contains email)
    - Validates credentials
    - Returns JWT access token
    """
    # Get user by email (OAuth2 uses 'username' field)
    result = await db.execute(
        select(User).where(User.email == form_data.username)
    )
    user = result.scalar_one_or_none()
    
    # Verify user exists and password is correct
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current authenticated user information.
    
    - Requires valid JWT token in Authorization header
    - Returns user profile without sensitive data
    """
    return current_user
