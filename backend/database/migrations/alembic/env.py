import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# 1. Thêm đường dẫn thư mục gốc của dự án vào sys.path
# Giả sử cấu trúc: root/alembic/env.py -> parents[1] là thư mục root (hoặc backend)
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

# Thêm 2 dòng này để debug:
print("--> BASE_DIR dang tro toi:", BASE_DIR)
print("--> Co thu muc 'app' o day khong?:", (BASE_DIR / "app").exists())

# 2. Import database_url và Base từ dự án của bạn
# (Thay 'app.database' và 'app.models' theo đúng tên file/thư mục trong dự án của bạn)
from app.database import database_url
from app.models import Base  

# This is the Alembic Config object
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name:
    fileConfig(config.config_file_name)

# 3. Ghi đè url trong config bằng database_url đã nạp từ file .env
config.set_main_option(
    "sqlalchemy.url", 
    database_url.render_as_string(hide_password=False)
)

# 4. Gán target_metadata để Alembic tự động phát hiện các thay đổi của Models (autogenerate)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()