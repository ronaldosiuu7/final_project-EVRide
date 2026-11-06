"""Chuẩn hóa response theo contract: {data, meta}."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any


def make_response(data: Any, status_code: int = 200) -> dict:
    """Bọc data trong envelope chuẩn."""
    return {
        "data": data,
        "meta": {
            "request_id": f"req_{uuid.uuid4().hex[:12]}",
            "server_time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }


def make_list_response(
    data: list, *, page: int, page_size: int, total: int
) -> dict:
    """Bọc danh sách trong envelope có phân trang."""
    return {
        "data": data,
        "meta": {
            "request_id": f"req_{uuid.uuid4().hex[:12]}",
            "server_time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "page": page,
            "page_size": page_size,
            "total": total,
        },
    }