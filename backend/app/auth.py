"""
JWT authentication helpers and FastAPI dependencies.
"""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.config import settings

ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT containing *data* with an expiration claim."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str | None) -> str | None:
    """Return the username if *token* is a valid JWT for the configured user, else None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
    username = payload.get("sub")
    if not username or username.lower() != settings.APP_USERNAME.lower():
        return None
    return username


async def get_current_user(
    header_token: str | None = Depends(oauth2_scheme),
    query_token: str | None = Query(None, alias="token"),
) -> str:
    """Validate the JWT and return the username.
    Accepts token either from Authorization header or ?token= query parameter.

    Raises 401 if the token is missing, expired, or otherwise invalid.
    """
    token = header_token or query_token
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    # For single-user mode the username in the token must match config
    if username.lower() != settings.APP_USERNAME.lower():
        raise credentials_exception
    return username
