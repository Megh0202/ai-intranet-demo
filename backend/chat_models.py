from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Role = Literal["user", "assistant", "system"]


class ConversationCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class ConversationResponse(BaseModel):
    id: str
    title: str | None
    created_at: datetime
    updated_at: datetime


class TicketInfo(BaseModel):
    id: str
    title: str
    description: str
    created_at: datetime | None = None


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: Role
    content: str
    created_at: datetime
    department: str | None = None
    confidence: float | None = None
    sources: list[str] | None = None
    error: bool = False
    feedback: str | None = None
    feedback_comment: str | None = None
    ticket: TicketInfo | None = None


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=5000)
    return_chunks: bool = False


class SendMessageResponse(BaseModel):
    conversation: ConversationResponse
    user_message: MessageResponse
    assistant_message: MessageResponse
