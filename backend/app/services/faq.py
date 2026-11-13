from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from app.services.errors import ServiceError


PROJECT_ROOT = Path(__file__).resolve().parents[3]

# Allowlist cố định, không cho client truyền đường dẫn tùy ý.
SOURCE_FILES = {
    "decisions": PROJECT_ROOT / "docs" / "v1-decisions.md",
    "contract": PROJECT_ROOT / "docs" / "api-contract.md",
    "overview": PROJECT_ROOT / "README.md",
}


FAQS = [
    {
        "id": "hold",
        "question": "Tôi được giữ xe bao lâu?",
        "aliases": ["giữ xe bao lâu", "giữ chỗ bao lâu", "thời gian giữ xe"],
        "answer": "Bạn có 30 phút để đến nhận xe kể từ khi giữ xe thành công.",
        "source": "decisions",
        "source_title": "EVRide V1 – Cấu hình thời gian giữ xe",
    },
    {
        "id": "advance",
        "question": "Có đặt xe trước nhiều ngày không?",
        "aliases": ["đặt trước nhiều ngày", "đặt xe ngày mai", "đặt trước ngày"],
        "answer": "V1 chỉ hỗ trợ giữ xe đang có sẵn, chưa hỗ trợ đặt trước nhiều ngày.",
        "source": "overview",
        "source_title": "EVRide – Mô hình hoạt động",
    },
    {
        "id": "multiple",
        "question": "Tôi có thể thuê hai xe cùng lúc không?",
        "aliases": ["hai xe", "2 xe", "nhiều xe cùng lúc"],
        "answer": "Mỗi khách chỉ có tối đa một lượt giữ hoặc chuyến chưa giải quyết.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 6: Số chuyến đang hoạt động",
    },
    {
        "id": "battery",
        "question": "Xe cần bao nhiêu pin để thuê?",
        "aliases": ["bao nhiêu pin", "pin tối thiểu", "pin dưới 30"],
        "answer": "Xe cần pin tối thiểu 30% khi đặt và khi bàn giao.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 5: Pin tối thiểu",
    },
    {
        "id": "return_station",
        "question": "Tôi có thể trả xe ở trạm khác không?",
        "aliases": ["trả khác trạm", "trả xe ở trạm khác", "trả tại trạm khác"],
        "answer": "Có. Bạn có thể trả tại trạm đang hoạt động và còn chỗ; nhân viên phải kiểm tra nhận xe.",
        "source": "contract",
        "source_title": "EVRide – Mục 6: Nhận và trả xe",
    },
    {
        "id": "pricing",
        "question": "Giá thuê được tính thế nào?",
        "aliases": ["giá thuê", "tính tiền thuê", "cách tính cước"],
        "answer": "Chuyến dùng giá đã chốt: một mức cho 30 phút đầu, sau đó tính mỗi phút thêm; phần phút lẻ được làm tròn lên.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 1: Tính tiền thuê",
    },
    {
        "id": "snapshot",
        "question": "Giá thay đổi có ảnh hưởng chuyến đã giữ không?",
        "aliases": ["giá thay đổi", "đổi giá", "tăng giá sau khi đặt"],
        "answer": "Chuyến đã giữ thành công dùng giá và tiền cọc được chốt tại thời điểm giữ.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 2: Chốt giá",
    },
    {
        "id": "deposit",
        "question": "Tiền cọc được thu khi nào?",
        "aliases": ["tiền cọc", "thu cọc", "trừ cọc"],
        "answer": "Tiền cọc được thu khi bàn giao xe thành công. Khi giữ xe, hệ thống kiểm tra số dư đủ điều kiện.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 3: Cọc và số dư",
    },
    {
        "id": "cancel",
        "question": "Hủy trước khi nhận có mất phí không?",
        "aliases": ["hủy có mất phí", "phí hủy", "hủy trước khi nhận"],
        "answer": "Hủy hoặc hết hạn trước pickup miễn phí, nhưng có tính vào hạn mức hủy/hết hạn trong ngày theo chính sách.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 3 và 6: Hủy và hạn mức",
    },
    {
        "id": "insufficient",
        "question": "Trả xe mà thiếu tiền có tính thêm cước không?",
        "aliases": ["thiếu tiền", "chờ thanh toán", "không đủ tiền trả"],
        "answer": "Sau khi nhân viên tiếp nhận xe hợp lệ, cước được dừng. Chuyến chờ quyết toán và bạn cần bổ sung số tiền còn thiếu.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 7: Trả xe khi thiếu tiền",
    },
    {
        "id": "demo_money",
        "question": "Ví có dùng tiền thật không?",
        "aliases": ["tiền thật", "tiền mô phỏng", "thanh toán thật"],
        "answer": "V1 dùng tiền mô phỏng. Nạp demo chỉ hoạt động khi tính năng này được bật.",
        "source": "decisions",
        "source_title": "EVRide V1 – Mục 9: Thanh toán",
    },
    {
        "id": "maintenance",
        "question": "Xe đang bảo trì có được thuê không?",
        "aliases": ["xe bảo trì", "đang bảo trì", "xe đang sửa"],
        "answer": "Không. Hoàn tất phiếu vẫn cần quản lý kiểm tra và mở lại trạng thái xe trước khi có thể thuê.",
        "source": "contract",
        "source_title": "EVRide – Mục 9: Bảo trì",
    },
]


def normalize(text):
    text = text.lower().replace("đ", "d")
    text = "".join(
        char
        for char in unicodedata.normalize("NFD", text)
        if unicodedata.category(char) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def read_source(source_id):
    path = SOURCE_FILES.get(source_id)

    if path is None:
        raise ServiceError(404, "NOT_FOUND", "Không có nguồn này.")

    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise ServiceError(
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Tài liệu nguồn chưa sẵn sàng.",
        ) from error


def public_faq(item, source_url):
    # Không trả câu trả lời có link nguồn bị thiếu.
    read_source(item["source"])

    return {
        "id": item["id"],
        "question": item["question"],
        "answer": item["answer"],
        "sources": [
            {
                "title": item["source_title"],
                "url": source_url(item["source"]),
            }
        ],
    }


def answer(message, source_url):
    normalized = normalize(message)

    # Ưu tiên câu hỏi mẫu trùng hoàn toàn.
    exact = [
        item for item in FAQS
        if normalize(item["question"]) == normalized
    ]

    if exact:
        matched = exact
    else:
        padded = f" {normalized} "
        matched = [
            item
            for item in FAQS
            if any(
                f" {normalize(alias)} " in padded
                for alias in item["aliases"]
            )
        ]

    if len(matched) != 1:
        return {
            "reply": (
                "Tôi chưa xác định được một câu hỏi phù hợp. "
                "Bạn hãy hỏi riêng về giữ xe, pin, giá, cọc, "
                "trả xe, thanh toán hoặc bảo trì."
            ),
            "sources": [],
            "mode": "FAQ",
        }

    item = public_faq(matched[0], source_url)

    return {
        "reply": item["answer"],
        "sources": item["sources"],
        "mode": "FAQ",
    }