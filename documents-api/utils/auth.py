"""Authentication utilities for JWT token verification."""
import os
import logging
from typing import Dict, Any

import jwt
from fastapi import HTTPException

LOGGER = logging.getLogger("documents_api")


def verify_jwt_token(token: str) -> Dict[str, Any]:
    """
    Verify JWT token and return payload.
    Raises HTTPException if token is invalid.
    """
    jwt_secret = os.getenv("JWT_SECRET") or os.getenv("NEXTAUTH_SECRET")
    
    if not jwt_secret:
        LOGGER.error("[Auth] JWT_SECRET or NEXTAUTH_SECRET not configured")
        raise HTTPException(status_code=500, detail="Server configuration error")
    
    try:
        # Convert bytes to string if needed
        if isinstance(jwt_secret, bytes):
            jwt_secret = jwt_secret.decode('utf-8')
        
        # Decode without verification for debugging ONLY in development environment
        if os.getenv("ENV") == "development":
            try:
                unverified = jwt.decode(token, options={"verify_signature": False})
                LOGGER.debug(f"[Auth] Token payload (unverified): userId={unverified.get('userId')}, email={unverified.get('email')}")
            except Exception:
                pass
        
        payload = jwt.decode(token, jwt_secret, algorithms=["HS256"])
        LOGGER.info(f"[Auth] JWT token verified successfully for user: {payload.get('userId') or payload.get('email')}")
        return payload
    except jwt.ExpiredSignatureError:
        LOGGER.warning("[Auth] JWT token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        LOGGER.error(f"[Auth] Invalid JWT token: {e}")
        LOGGER.error(f"[Auth] Token secret length: {len(jwt_secret) if jwt_secret else 0}")
        # Do not log token preview to avoid leaking sensitive information
        raise HTTPException(status_code=401, detail="Invalid token")
