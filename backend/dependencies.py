from fastapi import Depends, HTTPException, status

from sqlalchemy.orm import Session

from database import get_db
from models import User
from routers.auth import get_current_user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
):
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return current_user


def require_customer(
    current_user: User = Depends(
        get_current_active_user
    )
):
    if current_user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer access required"
        )

    return current_user


def require_agent(
    current_user: User = Depends(
        get_current_active_user
    )
):
    if current_user.role != "agent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent access required"
        )

    return current_user


def require_admin(
    current_user: User = Depends(
        get_current_active_user
    )
):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    return current_user