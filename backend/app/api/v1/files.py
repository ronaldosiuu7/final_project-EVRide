"""Upload và tải file nhị phân (ảnh giấy tờ, bảo trì, sự cố)."""

from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.responses import make_response
from app.database import get_db
from app.models import FileAttachment, StoredFile, User, UserDocument

router = APIRouter(tags=["Files"])

BACKEND_DIR = Path(__file__).resolve().parents[3]
UPLOAD_DIR = BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MiB (theo contract mục 2 và CHECK constraint)


@router.post("/files/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tải file ảnh lên hệ thống (CCCD, ảnh xe, hóa đơn...).
    - Kiểm tra định dạng (JPEG, PNG, WebP).
    - Giới hạn tối đa 10 MiB.
    - Tính sha256 và lưu vào kho lưu trữ nội bộ.
    - Tạo bản ghi StoredFile trạng thái READY.
    """
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "UNSUPPORTED_MEDIA_TYPE",
                "message": "Chỉ chấp nhận file ảnh định dạng JPEG, PNG hoặc WebP.",
            },
        )

    content = await file.read()
    size = len(content)

    if size < 1 or size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": "Kích thước file phải từ 1 byte đến tối đa 10 MiB.",
            },
        )

    sha256_hash = hashlib.sha256(content).hexdigest()

    # Sinh tên file duy nhất tránh trùng lặp
    ext = Path(file.filename or "").suffix.lower()
    if not ext or ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg" if file.content_type == "image/jpeg" else f".{file.content_type.split('/')[-1]}"

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / unique_filename

    # Lưu ra đĩa
    with open(file_path, "wb") as f:
        f.write(content)

    # Lưu metadata vào DB
    stored_file = StoredFile(
        object_key=f"uploads/{unique_filename}",
        original_filename=file.filename or unique_filename,
        content_type=file.content_type,
        size_bytes=size,
        sha256=sha256_hash,
        status="READY",
        uploaded_by=current_user.id,
        verified_at=datetime.now(timezone.utc),
    )
    db.add(stored_file)
    db.commit()
    db.refresh(stored_file)

    return make_response(
        {
            "file_id": str(stored_file.id),
            "original_filename": stored_file.original_filename,
            "content_type": stored_file.content_type,
            "size_bytes": stored_file.size_bytes,
            "sha256": stored_file.sha256,
            "status": stored_file.status,
        },
        status_code=status.HTTP_201_CREATED,
    )


@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tải file riêng tư.
    Chỉ người tải lên, chủ sở hữu giấy tờ được gắn file, hoặc STAFF/MANAGER mới được xem.
    """
    stored_file = db.get(StoredFile, file_id)
    if stored_file is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "File không tồn tại."},
        )

    # Kiểm tra phân quyền bảo mật:
    # 1. STAFF hoặc MANAGER được xem
    is_staff_or_manager = current_user.role in ("STAFF", "MANAGER")
    # 2. Người upload trực tiếp
    is_uploader = stored_file.uploaded_by == current_user.id
    # 3. Chủ sở hữu tài liệu được đính kèm file
    is_document_owner = False
    attachment = db.scalars(
        select(FileAttachment).where(FileAttachment.file_id == stored_file.id)
    ).first()
    if attachment and attachment.user_document_id:
        doc = db.get(UserDocument, attachment.user_document_id)
        if doc and doc.user_id == current_user.id:
            is_document_owner = True

    if not (is_staff_or_manager or is_uploader or is_document_owner):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "File không tồn tại."},
        )

    # Đọc file từ đĩa
    file_path = BACKEND_DIR / stored_file.object_key
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "File vật lý không tìm thấy trên hệ thống lưu trữ."},
        )

    return FileResponse(
        path=file_path,
        media_type=stored_file.content_type,
        filename=stored_file.original_filename,
    )

