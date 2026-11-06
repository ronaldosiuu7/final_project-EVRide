"""Nộp và duyệt giấy tờ."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.core.responses import make_list_response, make_response
from app.database import get_db
from app.models import FileAttachment, StoredFile, User, UserDocument
from app.schemas.document import (
    CreateDocumentRequest,
    DocumentOut,
    VerifyDocumentRequest,
)

router = APIRouter(tags=["Documents"])


# ── Khách xem giấy tờ của mình ───────────────────────────
@router.get("/users/me/documents")
def list_my_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Xem danh sách giấy tờ của chính mình."""
    base = select(UserDocument).where(UserDocument.user_id == current_user.id)
    total = (
        db.scalar(
            select(func.count())
            .select_from(UserDocument)
            .where(UserDocument.user_id == current_user.id)
        )
        or 0
    )

    docs = db.scalars(
        base.order_by(UserDocument.created_at.desc(), UserDocument.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return make_list_response(
        [DocumentOut.from_model(d).model_dump() for d in docs],
        page=page,
        page_size=page_size,
        total=total,
    )


# ── Nộp giấy tờ mới kèm ảnh mặt trước / mặt sau ───────────
@router.post("/users/me/documents", status_code=status.HTTP_201_CREATED)
def create_document(
    body: CreateDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Nộp giấy tờ mới — luôn tạo bản PENDING mới.
    - front_file_id và back_file_id phải trỏ tới file READY do luồng upload cấp.
    - Gắn file với giấy tờ bằng FileAttachment (USER_DOCUMENT_FRONT, USER_DOCUMENT_BACK)
      trong cùng một transaction.
    """
    # 1. Kiểm tra file ảnh mặt trước (bắt buộc)
    front_file = db.get(StoredFile, body.front_file_id)
    if front_file is None or front_file.status != "READY":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "Ảnh mặt trước (front_file_id) không hợp lệ hoặc chưa sẵn sàng.",
            },
        )

    # 2. Kiểm tra file ảnh mặt sau (bắt buộc)
    back_file = db.get(StoredFile, body.back_file_id)
    if back_file is None or back_file.status != "READY":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "VALIDATION_ERROR",
                "message": "Ảnh mặt sau (back_file_id) không hợp lệ hoặc chưa sẵn sàng.",
            },
        )

    # 3. Tạo UserDocument PENDING
    doc = UserDocument(
        user_id=current_user.id,
        document_type=body.document_type,
        document_number=body.document_number,
        birth_date=body.birth_date,
        expires_on=body.expires_on,
        verified_status="PENDING",
    )
    db.add(doc)
    db.flush()  # Lấy doc.id

    # 4. Tạo FileAttachment cho mặt trước
    front_att = FileAttachment(
        file_id=front_file.id,
        user_document_id=doc.id,
        purpose="USER_DOCUMENT_FRONT",
        attached_by=current_user.id,
    )
    db.add(front_att)

    # 5. Tạo FileAttachment cho mặt sau
    back_att = FileAttachment(
        file_id=back_file.id,
        user_document_id=doc.id,
        purpose="USER_DOCUMENT_BACK",
        attached_by=current_user.id,
    )
    db.add(back_att)

    db.commit()
    db.refresh(doc)
    return make_response(DocumentOut.from_model(doc).model_dump())


# ── Duyệt / Từ chối giấy tờ (S/M) ───────────────────────
@router.patch("/user-documents/{doc_id}/verification")
def verify_document(
    doc_id: int,
    body: VerifyDocumentRequest,
    current_user: User = Depends(require_role("STAFF", "MANAGER")),
    db: Session = Depends(get_db),
):
    """
    STAFF/MANAGER duyệt hoặc từ chối giấy tờ.
    - Không được tự duyệt giấy tờ của chính mình.
    - Khi duyệt CCCD: bắt buộc có verified_birth_date và expires_on.
    """
    doc = db.get(UserDocument, doc_id)
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Giấy tờ không tồn tại."},
        )

    # Chỉ duyệt/từ chối giấy tờ đang PENDING
    if doc.verified_status != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_STATE_TRANSITION",
                "message": f"Giấy tờ đang ở trạng thái {doc.verified_status}, không thể duyệt lại.",
            },
        )

    # Không tự duyệt của mình
    if doc.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Không được tự duyệt giấy tờ của chính mình.",
            },
        )

    now = datetime.now(timezone.utc)

    if body.verified_status == "VERIFIED":
        # Duyệt CCCD phải có ngày sinh và hạn
        if doc.document_type == "CCCD":
            if body.verified_birth_date is None or body.expires_on is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "VALIDATION_ERROR",
                        "message": "Duyệt CCCD cần có verified_birth_date và expires_on.",
                    },
                )
            doc.verified_birth_date = body.verified_birth_date
            doc.expires_on = body.expires_on

        doc.verified_status = "VERIFIED"
        doc.verified_by = current_user.id
        doc.verified_at = now
    else:
        doc.verified_status = "REJECTED"
        doc.verified_by = current_user.id
        doc.verified_at = now

    db.commit()
    db.refresh(doc)
    return make_response(DocumentOut.from_model(doc).model_dump())


# ── Xem số giấy tờ đầy đủ & link tải ảnh (Owner/S/M) ────
@router.get("/user-documents/{doc_id}/sensitive")
def get_sensitive_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Xem số giấy tờ đầy đủ (không bị che) và link tải ảnh mặt trước/mặt sau.
    Chỉ chủ sở hữu, STAFF hoặc MANAGER được xem.
    """
    doc = db.get(UserDocument, doc_id)
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Giấy tờ không tồn tại."},
        )

    # Kiểm tra quyền: chủ sở hữu hoặc S/M
    is_owner = doc.user_id == current_user.id
    is_staff_or_manager = current_user.role in ("STAFF", "MANAGER")

    if not is_owner and not is_staff_or_manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NOT_FOUND", "message": "Giấy tờ không tồn tại."},
        )

    # Lấy các file đính kèm mặt trước/mặt sau
    attachments = db.scalars(
        select(FileAttachment).where(FileAttachment.user_document_id == doc.id)
    ).all()

    front_download_url = None
    back_download_url = None

    for att in attachments:
        if att.purpose == "USER_DOCUMENT_FRONT":
            front_download_url = f"/api/v1/files/{att.file_id}/download"
        elif att.purpose == "USER_DOCUMENT_BACK":
            back_download_url = f"/api/v1/files/{att.file_id}/download"

    return make_response({
        "id": str(doc.id),
        "document_number": doc.document_number,
        "document_type": doc.document_type,
        "front_download_url": front_download_url,
        "back_download_url": back_download_url,
    })
