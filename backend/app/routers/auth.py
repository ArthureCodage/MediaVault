"""
Auth router — login and current-user endpoints.
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import create_access_token, get_current_user
from app.config import settings
from app.schemas import LoginRequest, TokenResponse, UserInfo

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest) -> TokenResponse:
    """Authenticate with username + password and receive a JWT."""
    username_match = secrets.compare_digest(
        body.username.strip().lower().encode(), settings.APP_USERNAME.strip().lower().encode()
    )
    password_match = secrets.compare_digest(body.password.encode(), settings.APP_PASSWORD.encode())
    if not (username_match and password_match):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(data={"sub": settings.APP_USERNAME})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserInfo)
async def me(username: str = Depends(get_current_user)) -> UserInfo:
    """Return info about the currently authenticated user."""
    return UserInfo(username=username)
