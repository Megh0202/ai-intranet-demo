from __future__ import annotations

from collections import Counter, defaultdict
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

from backend.db import get_database, utcnow


def _normalize_question(text: str) -> str:
    # Normalize unicode, drop punctuation/symbols, collapse whitespace.
    normalized = unicodedata.normalize("NFKD", text.lower())
    kept = []
    for ch in normalized:
        cat = unicodedata.category(ch)
        if cat.startswith("P") or cat.startswith("S"):
            continue
        kept.append(ch)
    cleaned = "".join(kept)
    return " ".join(cleaned.strip().split())


def _date_range(start: date, end: date) -> list[date]:
    days = (end - start).days
    return [start + timedelta(days=offset) for offset in range(days + 1)]


def _top_topic(topic_counts: Counter) -> str | None:
    if not topic_counts:
        return None
    return topic_counts.most_common(1)[0][0]


async def compute_analytics(*, days: int = 30, limit: int = 10) -> dict[str, Any]:
    days = max(1, min(int(days or 30), 365))
    limit = max(1, min(int(limit or 10), 50))

    db = get_database()
    now = utcnow()
    start = now - timedelta(days=days)

    total_conversations = await db.conversations.count_documents({"updated_at": {"$gte": start}})
    total_messages = await db.messages.count_documents({"created_at": {"$gte": start}})
    total_questions = await db.messages.count_documents({"created_at": {"$gte": start}, "role": "user"})

    question_counts: Counter[str] = Counter()
    question_last: dict[str, datetime] = {}
    question_text: dict[str, str] = {}
    question_topics: dict[str, Counter[str]] = defaultdict(Counter)

    user_counts: Counter[str] = Counter()
    user_topics: dict[str, Counter[str]] = defaultdict(Counter)

    topic_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()

    feedback_counts: Counter[str] = Counter()
    confidence_points: list[dict[str, Any]] = []
    error_count = 0
    assistant_count = 0

    daily_counts: dict[str, int] = defaultdict(int)

    cursor = db.messages.find({"created_at": {"$gte": start}}).sort(
        [("conversation_id", 1), ("created_at", 1)]
    )

    current_conv = None
    pending_user: dict[str, Any] | None = None

    async for doc in cursor:
        role = doc.get("role")
        created_at: datetime | None = doc.get("created_at")
        conv_id = doc.get("conversation_id")

        if conv_id != current_conv:
            current_conv = conv_id
            pending_user = None

        if role == "user":
            content = (doc.get("content") or "").strip()
            if not content:
                continue
            norm = _normalize_question(content)
            question_counts[norm] += 1
            question_text.setdefault(norm, content)
            if created_at:
                prev = question_last.get(norm)
                if not prev or created_at > prev:
                    question_last[norm] = created_at
                daily_counts[created_at.date().isoformat()] += 1
            client_id = (doc.get("client_id") or "").strip() or None
            if client_id:
                user_counts[client_id] += 1
            pending_user = {"norm": norm, "client_id": client_id}
            continue

        if role != "assistant":
            continue

        assistant_count += 1
        if doc.get("error"):
            error_count += 1
        else:
            conf = doc.get("confidence")
            if isinstance(conf, (int, float)):
                confidence_points.append({
                    "index": len(confidence_points) + 1,
                    "confidence": float(conf),
                    "response_id": str(doc.get("_id")) if doc.get("_id") else None,
                })

        feedback = doc.get("feedback")
        if feedback in ("up", "down"):
            feedback_counts[feedback] += 1

        topic = (doc.get("department") or "GENERAL").strip() or "GENERAL"
        topic_counts[topic] += 1

        for src in doc.get("sources") or []:
            if isinstance(src, str) and src.strip():
                source_counts[src.strip()] += 1

        if pending_user:
            norm = pending_user["norm"]
            question_topics[norm][topic] += 1
            client_id = pending_user.get("client_id")
            if client_id:
                user_topics[client_id][topic] += 1
            pending_user = None

    total_users = len(user_counts)
    avg_questions_per_user = (total_questions / total_users) if total_users else 0.0
    assistant_error_rate = (error_count / assistant_count) if assistant_count else 0.0

    top_questions = []
    for norm, count in question_counts.most_common(limit):
        topics = question_topics.get(norm, Counter())
        top_questions.append(
            {
                "question": question_text.get(norm, norm),
                "count": int(count),
                "last_asked_at": question_last.get(norm),
                "top_topic": _top_topic(topics),
                "topics": [{"topic": t, "count": int(c)} for t, c in topics.most_common(3)],
            }
        )

    top_users = []
    profiles_by_client: dict[str, str | None] = {}
    if user_counts:
        cursor = db.profiles.find({"client_id": {"$in": list(user_counts.keys())}})
        async for doc in cursor:
            client_id = doc.get("client_id")
            profiles_by_client[client_id] = doc.get("display_name")

    for client_id, count in user_counts.most_common(limit):
        topics = user_topics.get(client_id, Counter())
        top_users.append(
            {
                "client_id": client_id,
                "display_name": profiles_by_client.get(client_id),
                "question_count": int(count),
                "top_topic": _top_topic(topics),
                "topics": [{"topic": t, "count": int(c)} for t, c in topics.most_common(3)],
            }
        )

    top_topics = []
    for topic, count in topic_counts.most_common():
        share = (count / assistant_count) if assistant_count else 0.0
        top_topics.append({"topic": topic, "count": int(count), "share": float(share)})

    top_sources = [
        {"source": src, "count": int(count)}
        for src, count in source_counts.most_common(limit)
    ]

    daily_questions = []
    for day in _date_range(start.date(), now.date()):
        key = day.isoformat()
        daily_questions.append({"date": key, "questions": int(daily_counts.get(key, 0))})

    feedback_up = int(feedback_counts.get("up", 0))
    feedback_down = int(feedback_counts.get("down", 0))

    last_7_start = now.date() - timedelta(days=6)
    prev_7_start = now.date() - timedelta(days=13)
    prev_7_end = now.date() - timedelta(days=7)

    last_7 = sum(
        daily_counts.get(day.isoformat(), 0)
        for day in _date_range(last_7_start, now.date())
    )
    prev_7 = sum(
        daily_counts.get(day.isoformat(), 0)
        for day in _date_range(prev_7_start, prev_7_end)
    )
    question_trend_pct = None
    if prev_7 > 0:
        question_trend_pct = ((last_7 - prev_7) / prev_7) * 100.0

    recommendations = []
    if assistant_count and assistant_error_rate >= 0.1:
        recommendations.append(
            {
                "title": "Reduce error rate",
                "detail": "Several assistant replies failed. Check the vector DB, ingestion status, and Ollama availability.",
                "priority": "high",
            }
        )

    if total_questions and top_questions:
        top_q = top_questions[0]
        if top_q["count"] / total_questions >= 0.2:
            recommendations.append(
                {
                    "title": "Create a saved answer",
                    "detail": f'"{top_q["question"]}" appears frequently. Consider a canned response or a highlighted doc section.',
                    "priority": "medium",
                }
            )

    if top_topics:
        lead_topic = top_topics[0]
        if lead_topic["share"] >= 0.5 and lead_topic["topic"] != "GENERAL":
            recommendations.append(
                {
                    "title": f"Focus docs for {lead_topic['topic']}",
                    "detail": "Most questions are concentrated here. Refresh the underlying policy docs and add examples.",
                    "priority": "medium",
                }
            )

    feedback_total = feedback_up + feedback_down
    if feedback_total >= 5 and feedback_down / feedback_total >= 0.3:
        recommendations.append(
            {
                "title": "Review low-rated answers",
                "detail": "A higher share of downvotes suggests gaps in sources or routing. Review top sources and queries.",
                "priority": "high",
            }
        )

    return {
        "summary": {
            "from_date": start,
            "to_date": now,
            "total_conversations": int(total_conversations),
            "total_messages": int(total_messages),
            "total_questions": int(total_questions),
            "total_users": int(total_users),
            "avg_questions_per_user": float(avg_questions_per_user),
            "assistant_error_rate": float(assistant_error_rate),
            "feedback_up": feedback_up,
            "feedback_down": feedback_down,
            "question_trend_pct": None if question_trend_pct is None else float(question_trend_pct),
        },
        "top_questions": top_questions,
        "top_users": top_users,
        "top_topics": top_topics,
        "top_sources": top_sources,
        "daily_questions": daily_questions,
        "confidence_points": confidence_points,
        "recommendations": recommendations,
    }
