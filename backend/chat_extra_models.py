from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


FeedbackValue = Literal["up", "down", "none"]


class ConversationUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class DeleteConversationResponse(BaseModel):
    ok: bool
    deleted_conversation: bool
    deleted_messages_count: int


class MessageFeedbackRequest(BaseModel):
    feedback: FeedbackValue = "none"
    comment: str | None = Field(default=None, max_length=1000)


class MessageFeedbackResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    created_at: datetime
    feedback: FeedbackValue = "none"
    feedback_comment: str | None = None


class TicketCreateResponse(BaseModel):
    ok: bool = True
    title: str
    description: str
    ticket: dict[str, Any]


class TicketCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    details: str | None = Field(default=None, max_length=2000)
