from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException

from backend.db import clean_mongo_id, get_database, utcnow


def _to_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid id") from exc


async def create_conversation(*, title: str | None = None, client_id: str | None = None) -> dict[str, Any]:
    db = get_database()
    now = utcnow()

    doc = {
        "title": title,
        "client_id": client_id,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.conversations.insert_one(doc)
    created = await db.conversations.find_one({"_id": result.inserted_id})
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create conversation")

    return clean_mongo_id(created)


async def list_conversations(*, client_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    db = get_database()

    q: dict[str, Any] = {}
    if client_id:
        q["client_id"] = client_id

    cursor = db.conversations.find(q).sort("updated_at", -1).limit(limit)
    items: list[dict[str, Any]] = []
    async for doc in cursor:
        items.append(clean_mongo_id(doc))
    return items


async def get_conversation(conversation_id: str) -> dict[str, Any]:
    db = get_database()
    oid = _to_object_id(conversation_id)

    doc = await db.conversations.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return clean_mongo_id(doc)


async def touch_conversation(conversation_id: str) -> None:
    db = get_database()
    oid = _to_object_id(conversation_id)

    await db.conversations.update_one(
        {"_id": oid},
        {"$set": {"updated_at": utcnow()}},
    )


async def list_messages(conversation_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
    db = get_database()
    oid = _to_object_id(conversation_id)

    cursor = (
        db.messages.find({"conversation_id": oid})
        .sort("created_at", 1)
        .limit(limit)
    )

    items: list[dict[str, Any]] = []
    async for doc in cursor:
        doc = clean_mongo_id(doc)
        doc["conversation_id"] = str(doc["conversation_id"])
        items.append(doc)
    return items


async def add_message(
    *,
    conversation_id: str,
    role: str,
    content: str,
    client_id: str | None = None,
    department: str | None = None,
    confidence: float | None = None,
    sources: list[str] | None = None,
    error: bool = False,
) -> dict[str, Any]:
    db = get_database()
    conv_oid = _to_object_id(conversation_id)
    now = utcnow()

    doc = {
        "conversation_id": conv_oid,
        "role": role,
        "client_id": client_id,
        "content": content,
        "created_at": now,
        "department": department,
        "confidence": confidence,
        "sources": sources,
        "error": bool(error),
    }

    result = await db.messages.insert_one(doc)
    created = await db.messages.find_one({"_id": result.inserted_id})
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create message")

    created = clean_mongo_id(created)
    created["conversation_id"] = str(created["conversation_id"])

    await touch_conversation(conversation_id)
    return created


async def update_conversation_title(conversation_id: str, *, title: str | None) -> dict[str, Any]:
    db = get_database()
    oid = _to_object_id(conversation_id)

    await db.conversations.update_one(
        {"_id": oid},
        {"$set": {"title": title, "updated_at": utcnow()}},
    )

    updated = await db.conversations.find_one({"_id": oid})
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return clean_mongo_id(updated)


async def delete_conversation(conversation_id: str) -> dict[str, Any]:
    db = get_database()
    oid = _to_object_id(conversation_id)

    msg_result = await db.messages.delete_many({"conversation_id": oid})
    conv_result = await db.conversations.delete_one({"_id": oid})

    return {
        "ok": True,
        "deleted_conversation": conv_result.deleted_count == 1,
        "deleted_messages_count": int(msg_result.deleted_count),
    }


async def set_message_feedback(
    message_id: str,
    *,
    feedback: str,
    comment: str | None,
) -> dict[str, Any]:
    db = get_database()
    oid = _to_object_id(message_id)

    await db.messages.update_one(
        {"_id": oid},
        {"$set": {"feedback": feedback, "feedback_comment": comment}},
    )

    updated = await db.messages.find_one({"_id": oid})
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found")

    updated = clean_mongo_id(updated)
    updated["conversation_id"] = str(updated["conversation_id"])
    return updated


async def set_message_ticket(
    message_id: str,
    *,
    ticket_id: str,
    title: str,
    description: str,
) -> dict[str, Any]:
    db = get_database()
    oid = _to_object_id(message_id)

    doc = {
        "id": ticket_id,
        "title": title,
        "description": description,
        "created_at": utcnow(),
    }

    await db.messages.update_one(
        {"_id": oid},
        {"$set": {"ticket": doc}},
    )

    updated = await db.messages.find_one({"_id": oid})
    if not updated:
        raise HTTPException(status_code=404, detail="Message not found")

    updated = clean_mongo_id(updated)
    updated["conversation_id"] = str(updated["conversation_id"])
    return updated


async def get_message(message_id: str) -> dict[str, Any]:
    db = get_database()
    oid = _to_object_id(message_id)

    doc = await db.messages.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Message not found")

    doc = clean_mongo_id(doc)
    doc["conversation_id"] = str(doc["conversation_id"])
    return doc


async def get_last_user_message(
    conversation_id: str,
    *,
    before: datetime | None = None,
) -> dict[str, Any] | None:
    db = get_database()
    conv_oid = _to_object_id(conversation_id)

    q: dict[str, Any] = {"conversation_id": conv_oid, "role": "user"}
    if before is not None:
        q["created_at"] = {"$lte": before}

    cursor = db.messages.find(q).sort("created_at", -1).limit(1)
    doc = await cursor.to_list(length=1)
    if not doc:
        return None

    item = clean_mongo_id(doc[0])
    item["conversation_id"] = str(item["conversation_id"])
    return item
