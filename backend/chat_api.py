from __future__ import annotations

import io
import zipfile
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse

from backend.chat_models import (
    ConversationCreateRequest,
    ConversationResponse,
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from backend.chat_extra_models import (
    AnalyticsResponse,
    ConversationUpdateRequest,
    DeleteConversationResponse,
    MessageFeedbackRequest,
    MessageFeedbackResponse,
    TicketCreateRequest,
    TicketCreateResponse,
)
from backend.analytics import compute_analytics
from backend.profile_models import ProfileResponse, ProfileUpdateRequest
from backend.profile_store import get_or_create_profile, update_profile
from backend.chat_store import (
    add_message,
    create_conversation,
    delete_conversation,
    get_conversation,
    get_last_user_message,
    get_message,
    list_conversations,
    list_messages,
    set_message_feedback,
    set_message_ticket,
    update_conversation_title,
)
from backend.service import answer_query
from backend.settings import get_settings
from backend.ticketing import create_ticket_via_api, generate_ticket_title_description


router = APIRouter(prefix="/chat", tags=["chat"])


def _client_id_from_headers(x_client_id: str | None) -> str:
    # Simple client identifier; frontend stores this in localStorage.
    return (x_client_id or "default").strip() or "default"


@router.get("/profile", response_model=ProfileResponse)
async def profile(x_client_id: str | None = Header(default=None, alias="X-Client-Id")) -> ProfileResponse:
    p = await get_or_create_profile(client_id=_client_id_from_headers(x_client_id))
    return ProfileResponse(**p)


@router.put("/profile", response_model=ProfileResponse)
async def update_profile_api(
    req: ProfileUpdateRequest,
    x_client_id: str | None = Header(default=None, alias="X-Client-Id"),
) -> ProfileResponse:
    p = await update_profile(
        client_id=_client_id_from_headers(x_client_id),
        display_name=req.display_name,
    )
    return ProfileResponse(**p)


@router.get("/conversations", response_model=list[ConversationResponse])
async def conversations() -> list[ConversationResponse]:
    items = await list_conversations()
    return [ConversationResponse(**c) for c in items]


@router.post("/conversations", response_model=ConversationResponse)
async def create(
    req: ConversationCreateRequest,
    x_client_id: str | None = Header(default=None, alias="X-Client-Id"),
) -> ConversationResponse:
    created = await create_conversation(
        title=req.title,
        client_id=_client_id_from_headers(x_client_id),
    )
    return ConversationResponse(**created)


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def conversation(conversation_id: str) -> ConversationResponse:
    conv = await get_conversation(conversation_id)
    return ConversationResponse(**conv)


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(conversation_id: str, req: ConversationUpdateRequest) -> ConversationResponse:
    # Ensure conversation exists (nice 404)
    await get_conversation(conversation_id)
    updated = await update_conversation_title(conversation_id, title=req.title)
    return ConversationResponse(**updated)


@router.delete("/conversations/{conversation_id}", response_model=DeleteConversationResponse)
async def remove_conversation(conversation_id: str) -> DeleteConversationResponse:
    # Ensure conversation exists (nice 404)
    await get_conversation(conversation_id)
    result = await delete_conversation(conversation_id)
    return DeleteConversationResponse(**result)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageResponse],
)
async def messages(conversation_id: str) -> list[MessageResponse]:
    # Ensure conversation exists (nice 404)
    await get_conversation(conversation_id)
    items = await list_messages(conversation_id)
    return [MessageResponse(**m) for m in items]


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=SendMessageResponse,
)
async def send_message(
    conversation_id: str,
    req: SendMessageRequest,
    x_client_id: str | None = Header(default=None, alias="X-Client-Id"),
) -> SendMessageResponse:
    s = get_settings()
    client_id = _client_id_from_headers(x_client_id)

    # Ensure conversation exists (nice 404)
    conv = await get_conversation(conversation_id)

    user_msg = await add_message(
        conversation_id=conversation_id,
        role="user",
        content=req.content,
        client_id=client_id,
    )

    assistant_content: str
    assistant_meta: dict

    try:
        if not s.resolved_vector_db_path().exists():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Vector DB not found. Run ingestion first: "
                    "python -m backend.ingest"
                ),
            )

        payload = answer_query(req.content, settings=s, return_chunks=req.return_chunks)
        assistant_content = payload["answer"]
        assistant_meta = {
            "department": payload.get("department"),
            "confidence": float(payload.get("confidence", 0.0)),
            "sources": list(payload.get("sources", [])),
            "error": False,
        }
    except HTTPException as exc:
        assistant_content = f"Error: {exc.detail}"
        assistant_meta = {
            "department": None,
            "confidence": None,
            "sources": None,
            "error": True,
        }
    except Exception as exc:
        assistant_content = f"Error: Failed to generate a response. {exc}"
        assistant_meta = {
            "department": None,
            "confidence": None,
            "sources": None,
            "error": True,
        }

    assistant_msg = await add_message(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_content,
        client_id=client_id,
        department=assistant_meta["department"],
        confidence=assistant_meta["confidence"],
        sources=assistant_meta["sources"],
        error=assistant_meta["error"],
    )

    # Refresh conversation (updated_at will have changed)
    conv = await get_conversation(conversation_id)

    return SendMessageResponse(
        conversation=ConversationResponse(**conv),
        user_message=MessageResponse(**user_msg),
        assistant_message=MessageResponse(**assistant_msg),
    )


@router.post("/messages/{message_id}/feedback", response_model=MessageFeedbackResponse)
async def message_feedback(message_id: str, req: MessageFeedbackRequest) -> MessageFeedbackResponse:
    msg = await get_message(message_id)
    existing = (msg.get("feedback") or "none")
    if existing and existing != "none":
        raise HTTPException(status_code=409, detail="Feedback already submitted for this message")

    updated = await set_message_feedback(message_id, feedback=req.feedback, comment=req.comment)
    return MessageFeedbackResponse(
        id=updated["id"],
        conversation_id=updated["conversation_id"],
        role=updated["role"],
        content=updated["content"],
        created_at=updated["created_at"],
        feedback=updated.get("feedback", "none"),
        feedback_comment=updated.get("feedback_comment"),
    )


@router.get("/messages/{message_id}/sources.zip")
async def download_sources_zip(message_id: str):
    s = get_settings()
    msg = await get_message(message_id)
    if msg.get("role") != "assistant":
        raise HTTPException(status_code=400, detail="Only assistant messages have sources")

    sources = msg.get("sources") or []
    if not sources:
        raise HTTPException(status_code=404, detail="No sources for this message")

    department = msg.get("department")
    docs_root = s.resolved_docs_path()

    def resolve_source(name: str) -> tuple[Path, str] | None:
        if not name or "/" in name or "\\" in name or ".." in name:
            return None
        if not name.lower().endswith(".pdf"):
            return None

        if department:
            p = (docs_root / str(department) / name).resolve()
            if p.exists() and docs_root in p.parents:
                return p, f"{department}/{name}"

        for dept in ("HR", "IT", "Finance"):
            p = (docs_root / dept / name).resolve()
            if p.exists() and docs_root in p.parents:
                return p, f"{dept}/{name}"
        return None

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        added = 0
        for src in sources:
            r = resolve_source(str(src))
            if not r:
                continue
            path, arcname = r
            zf.write(path, arcname=arcname)
            added += 1

    if added == 0:
        raise HTTPException(status_code=404, detail="No resolvable source files found")

    buf.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="sources-{message_id}.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@router.get("/messages/{message_id}/sources/{source_name}")
async def download_source_file(message_id: str, source_name: str):
    s = get_settings()
    msg = await get_message(message_id)
    if msg.get("role") != "assistant":
        raise HTTPException(status_code=400, detail="Only assistant messages have sources")

    sources = [str(x) for x in (msg.get("sources") or [])]
    if not sources:
        raise HTTPException(status_code=404, detail="No sources for this message")

    # Starlette provides decoded path params, but unquote again is harmless and helps with edge cases.
    requested = unquote(source_name)
    if requested not in sources:
        raise HTTPException(status_code=404, detail="Source not found for this message")

    department = msg.get("department")
    docs_root = s.resolved_docs_path()

    def resolve_source(name: str) -> Path | None:
        if not name or "/" in name or "\\" in name or ".." in name:
            return None
        if not name.lower().endswith(".pdf"):
            return None

        if department:
            p = (docs_root / str(department) / name).resolve()
            if p.exists() and docs_root in p.parents:
                return p

        for dept in ("HR", "IT", "Finance"):
            p = (docs_root / dept / name).resolve()
            if p.exists() and docs_root in p.parents:
                return p

        return None

    file_path = resolve_source(requested)
    if not file_path:
        raise HTTPException(status_code=404, detail="Source file is not available on the server")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=file_path.name,
    )


@router.post("/messages/{message_id}/ticket", response_model=TicketCreateResponse)
async def create_ticket(message_id: str, req: TicketCreateRequest | None = None) -> TicketCreateResponse:
    s = get_settings()
    msg = await get_message(message_id)
    if msg.get("role") != "assistant":
        raise HTTPException(status_code=400, detail="Ticket must be created from an assistant response")

    user_msg = await get_last_user_message(
        msg["conversation_id"],
        before=msg.get("created_at"),
    )
    user_text = (user_msg or {}).get("content") or ""
    assistant_text = msg.get("content") or ""

    override_title = (req.title or "").strip() if req else ""
    override_description = (req.description or "").strip() if req else ""
    extra_details = (req.details or "").strip() if req else ""
    if override_title and override_description:
        title, description = override_title, override_description
    else:
        title, description = generate_ticket_title_description(user_text, assistant_text, extra_details=extra_details or None, settings=s)

    ticket = await create_ticket_via_api(title=title, description=description, settings=s)

    # Persist ticket info on the message so the UI can show it later.
    try:
        ticket_id = (((ticket or {}).get("json") or {}).get("ticket") or {}).get("id")
        if isinstance(ticket_id, str) and ticket_id.strip():
            await set_message_ticket(message_id, ticket_id=ticket_id.strip(), title=title, description=description)
    except Exception:
        # Non-fatal: ticket was created (or attempted); message persistence is best-effort.
        pass

    return TicketCreateResponse(ok=True, title=title, description=description, ticket=ticket)


@router.get("/analytics", response_model=AnalyticsResponse)
async def analytics(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=10, ge=1, le=50),
) -> AnalyticsResponse:
    data = await compute_analytics(days=days, limit=limit)
    return AnalyticsResponse(**data)
