from fastapi import APIRouter, Depends

from models import User
from dependencies import (
    get_current_active_user,
    require_customer,
    require_agent,
    require_admin
)


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


@router.get("/me")
def get_my_profile(
    current_user: User = Depends(
        get_current_active_user
    )
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role
    }


@router.get("/customer-area")
def customer_area(
    current_user: User = Depends(
        require_customer
    )
):
    return {
        "message": "Welcome to the customer area",
        "user": current_user.name,
        "role": current_user.role
    }


@router.get("/agent-area")
def agent_area(
    current_user: User = Depends(
        require_agent
    )
):
    return {
        "message": "Welcome to the agent area",
        "user": current_user.name,
        "role": current_user.role
    }


@router.get("/admin-area")
def admin_area(
    current_user: User = Depends(
        require_admin
    )
):
    return {
        "message": "Welcome to the admin area",
        "user": current_user.name,
        "role": current_user.role
    }