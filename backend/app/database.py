"""SQLite database engine and session management."""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import get_settings, ensure_data_dirs

ensure_data_dirs()
settings = get_settings()

# check_same_thread=False required for SQLite with FastAPI multi-threaded access
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:
    """Enable foreign keys and better concurrency for local SQLite."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables, migrate schema, seed starter data."""
    # Import models so metadata is populated
    from app import models  # noqa: F401
    from app.modules.registry import import_module_models, migrate_modules
    from app.migrate_schema import migrate_schema
    from app.seed import seed_if_empty

    import_module_models()

    Base.metadata.create_all(bind=engine)
    migrate_schema(engine)
    migrate_modules(engine)
    db = SessionLocal()
    try:
        seed_if_empty(db)
    finally:
        db.close()
