from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.db import clean_mongo_id, get_database, utcnow


async def get_or_create_profile(*, client_id: str) -> dict[str, Any]:
    if not client_id.strip():
        raise HTTPException(status_code=400, detail="Missing client id")

    db = get_database()
    now = utcnow()

    existing = await db.profiles.find_one({"client_id": client_id})
    if existing:
        return clean_mongo_id(existing)

    doc = {
        "client_id": client_id,
        "display_name": None,
        "created_at": now,
        "updated_at": now,
    }

    try:
        await db.profiles.insert_one(doc)
    except Exception:
        # In case of race with unique index.
        existing = await db.profiles.find_one({"client_id": client_id})
        if existing:
            return clean_mongo_id(existing)
        raise

    created = await db.profiles.find_one({"client_id": client_id})
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create profile")

    return clean_mongo_id(created)


async def update_profile(*, client_id: str, display_name: str | None) -> dict[str, Any]:
    db = get_database()
    now = utcnow()

    await db.profiles.update_one(
        {"client_id": client_id},
        {"$set": {"display_name": display_name, "updated_at": now}},
        upsert=True,
    )

    updated = await db.profiles.find_one({"client_id": client_id})
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update profile")

    return clean_mongo_id(updated)
