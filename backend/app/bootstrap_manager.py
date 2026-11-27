"""Create the first MANAGER only: python -m app.bootstrap_manager."""
from __future__ import annotations

import argparse
import getpass
import sys
import warnings

from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError

from app.models import User
from app.schemas.user import CreateStaffRequest


class BootstrapError(ValueError):
    """A safe, user-facing bootstrap refusal."""


def validate_details(name: str, email: str, password: str) -> CreateStaffRequest:
    try:
        details = CreateStaffRequest(
            name=name, email=email.strip().lower(), password=password, role="MANAGER"
        )
    except ValidationError:
        # Never print Pydantic input values: they may include the password.
        raise BootstrapError(
            "Tên phải có 1–100 ký tự, email hợp lệ, mật khẩu 12–128 ký tự."
        ) from None
    if len(str(details.email)) > 100:
        raise BootstrapError("Email không được quá 100 ký tự.")
    # The application's bcrypt hashes UTF-8 bytes, with a 72-byte limit.
    if len(password.encode("utf-8")) > 72:
        raise BootstrapError("Mật khẩu không được quá 72 byte UTF-8 (giới hạn bcrypt).")
    return details


def create_initial_manager(factory, details, hash_fn) -> int:
    password_hash = hash_fn(details.password)
    with factory.begin() as db:
        # Brief table lock also serializes against API/seed INSERTs, not only
        # other bootstrap processes. The existence checks run after the lock.
        db.execute(text("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"))
        if db.scalar(select(User.id).where(User.role == "MANAGER").limit(1)) is not None:
            raise BootstrapError(
                "Đã tồn tại MANAGER (kể cả bị khóa). Dừng; dùng tài khoản hiện có "
                "hoặc quy trình khôi phục, không chạy bootstrap để vượt quyền."
            )
        email = str(details.email).lower()
        if db.scalar(select(User.id).where(func.lower(User.email) == email).limit(1)) is not None:
            raise BootstrapError("Email đã được sử dụng. Không sửa hoặc nâng quyền tài khoản cũ.")
        user = User(name=details.name, email=email, password=password_hash,
                    role="MANAGER", status="ACTIVE")
        db.add(user)
        db.flush()
        user_id = user.id
    # Returning only after successful commit prevents false success messages.
    return user_id


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    if not sys.stdin.isatty():
        print("Cần terminal tương tác. Với Docker dùng exec -it hoặc compose exec, không dùng -T.", file=sys.stderr)
        return 1
    try:
        # Loads backend/.env; existing environment variables take precedence.
        from app.database import SessionLocal, database_url
        from app.core.security import hash_password

        print(f"Database đích: host={database_url.host}, port={database_url.port}, "
              f"database={database_url.database}, user={database_url.username}")
        print("Chỉ tạo 1 MANAGER ACTIVE; không tạo dữ liệu demo hoặc ví.")
        name = input("Họ và tên: ")
        email = input("Email: ")
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            password = getpass.getpass("Mật khẩu (tối thiểu 12 ký tự, tối đa 72 byte UTF-8): ")
            confirmation = getpass.getpass("Nhập lại mật khẩu: ")
        if password != confirmation:
            raise BootstrapError("Hai mật khẩu không khớp.")
        details = validate_details(name, email, password)
        if input("Nhập CREATE MANAGER để xác nhận database đích và tạo tài khoản: ").strip() != "CREATE MANAGER":
            print("Đã hủy. Không thay đổi dữ liệu.")
            return 1
        user_id = create_initial_manager(SessionLocal, details, hash_password)
        print(f"Đã tạo MANAGER ACTIVE: ID={user_id}, email={str(details.email).lower()}")
        print("Đăng nhập website bằng email và mật khẩu vừa nhập.")
        return 0
    except BootstrapError as exc:
        print(str(exc), file=sys.stderr)
    except (KeyboardInterrupt, EOFError):
        print("\nĐã hủy.", file=sys.stderr)
    except getpass.GetPassWarning:
        print("Terminal không hỗ trợ nhập mật khẩu ẩn. Hãy dùng terminal SSH tương tác.", file=sys.stderr)
    except SQLAlchemyError:
        print("Lỗi database; chưa xác nhận tạo thành công. Kiểm tra kết nối, migration và tài khoản trước khi thử lại. "
              "Không in chi tiết SQL để tránh lộ thông tin đăng nhập.", file=sys.stderr)
    except (RuntimeError, ValueError, ImportError):
        print("Không thể khởi tạo. Kiểm tra dependencies và cấu hình DB/auth của backend.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
