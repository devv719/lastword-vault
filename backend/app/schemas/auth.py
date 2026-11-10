from typing import Any, Optional
from pydantic import BaseModel, EmailStr, Field, model_validator

from app.schemas.user import UserResponse


class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    display_name: Optional[str] = Field(None, min_length=2, max_length=255)
    name: Optional[str] = Field(None, min_length=2, max_length=255)

    @model_validator(mode="before")
    @classmethod
    def resolve_display_name(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("display_name") and data.get("name"):
                data["display_name"] = data["name"]
            elif not data.get("name") and data.get("display_name"):
                data["name"] = data["display_name"]
        return data



class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class LogoutResponse(BaseModel):
    message: str = "Successfully logged out"

