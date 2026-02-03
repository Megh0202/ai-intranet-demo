from __future__ import annotations

from datetime import datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from backend.settings import get_settings


_client: AsyncIOMotorClient | None = None


def get_mongo_client() -> AsyncIOMotorClient:
    global _client

    if _client is not None:
        return _client

    settings = get_settings()
    _client = AsyncIOMotorClient(settings.mongodb_uri)
    return _client


def close_mongo_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_database() -> AsyncIOMotorDatabase:
    settings = get_settings()
    client = get_mongo_client()
    return client[settings.mongodb_db_name]


async def ensure_indexes() -> None:
    db = get_database()

    await db.conversations.create_index([("updated_at", -1)])
    await db.conversations.create_index([("client_id", 1)])
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.messages.create_index([("created_at", -1)])
    await db.messages.create_index([("role", 1), ("created_at", -1)])
    await db.messages.create_index([("client_id", 1), ("created_at", -1)])
    await db.messages.create_index([("department", 1), ("created_at", -1)])
    await db.messages.create_index([("feedback", 1)])
    await db.profiles.create_index([("client_id", 1)], unique=True)


def utcnow() -> datetime:
    return datetime.utcnow()


def clean_mongo_id(document: dict[str, Any]) -> dict[str, Any]:
    """Convert MongoDB _id ObjectId to a string id field."""
    if "_id" in document:
        document["id"] = str(document.pop("_id"))
    return document
