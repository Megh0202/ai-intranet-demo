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


class TopicCount(BaseModel):
    topic: str
    count: int


class TopQuestion(BaseModel):
    question: str
    count: int
    last_asked_at: datetime | None = None
    top_topic: str | None = None
    topics: list[TopicCount] = []


class TopUser(BaseModel):
    client_id: str
    display_name: str | None = None
    question_count: int
    top_topic: str | None = None
    topics: list[TopicCount] = []


class TopicStat(BaseModel):
    topic: str
    count: int
    share: float


class SourceStat(BaseModel):
    source: str
    count: int


class DailyQuestionCount(BaseModel):
    date: str
    questions: int


class ConfidencePoint(BaseModel):
    index: int
    confidence: float
    response_id: str | None = None


class AnalyticsSummary(BaseModel):
    from_date: datetime
    to_date: datetime
    total_conversations: int
    total_messages: int
    total_questions: int
    total_users: int
    avg_questions_per_user: float
    assistant_error_rate: float
    feedback_up: int
    feedback_down: int
    question_trend_pct: float | None = None


class Recommendation(BaseModel):
    title: str
    detail: str
    priority: Literal["low", "medium", "high"] = "medium"


class AnalyticsResponse(BaseModel):
    summary: AnalyticsSummary
    top_questions: list[TopQuestion]
    top_users: list[TopUser]
    top_topics: list[TopicStat]
    top_sources: list[SourceStat]
    daily_questions: list[DailyQuestionCount]
    confidence_points: list[ConfidencePoint]
    recommendations: list[Recommendation]
