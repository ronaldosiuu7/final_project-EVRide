"""Atomic idempotency-key claims shared by write APIs."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import IdempotencyRecord
from app.services.errors import ServiceError


def begin_idempotent_request(
    session: Session,
    *,
    actor_id: int,
    method: str,
    path: str,
    key: str | None,
    payload: Any,
) -> tuple[IdempotencyRecord, tuple[int, dict] | None]:
    if key is None or not 16 <= len(key) <= 128:
        raise ServiceError(
            400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key phải dài từ 16 đến 128 ký tự."
        )
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    request_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    values = {
        "actor_id": actor_id,
        "http_method": method.upper(),
        "request_path": path,
        "idempotency_key": key,
        "request_hash": request_hash,
        "state": "PROCESSING",
        "created_at": now,
        "expires_at": now + timedelta(hours=24),
    }
    inserted_id = session.scalar(
        insert(IdempotencyRecord)
        .values(**values)
        .on_conflict_do_nothing(
            index_elements=[
                IdempotencyRecord.actor_id,
                IdempotencyRecord.http_method,
                IdempotencyRecord.request_path,
                IdempotencyRecord.idempotency_key,
            ]
        )
        .returning(IdempotencyRecord.id)
    )
    if inserted_id is not None:
        record = session.get(IdempotencyRecord, inserted_id)
        if record is None:
            raise RuntimeError("The newly inserted idempotency record could not be loaded.")
        return record, None

    record = session.scalar(
        select(IdempotencyRecord)
        .where(
            IdempotencyRecord.actor_id == actor_id,
            IdempotencyRecord.http_method == method.upper(),
            IdempotencyRecord.request_path == path,
            IdempotencyRecord.idempotency_key == key,
        )
        .with_for_update()
    )
    if record is None:
        raise RuntimeError("The conflicting idempotency record could not be loaded.")
    if record.request_hash != request_hash:
        raise ServiceError(
            409, "IDEMPOTENCY_CONFLICT", "Idempotency-Key đã được dùng với request khác."
        )
    if record.state != "COMPLETED" or record.response_body is None:
        raise ServiceError(
            409, "IDEMPOTENCY_IN_PROGRESS", "Request cùng Idempotency-Key đang được xử lý."
        )
    return record, (record.response_status or 200, record.response_body)


def complete_idempotent_request(
    record: IdempotencyRecord, *, status_code: int, response_body: dict
) -> None:
    record.state = "COMPLETED"
    record.response_status = status_code
    record.response_body = response_body
    record.completed_at = datetime.now(timezone.utc)
