from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ProfileResponse(BaseModel):
    id: str
    client_id: str
    display_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
