"""Lightweight alters for Cabinet Flow tables already created by create_all."""

from __future__ import annotations

from sqlalchemy import text


def _columns(conn, table: str) -> set[str]:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return {row[1] for row in rows}


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table},
    ).fetchone()
    return row is not None


def migrate(engine) -> None:
    with engine.begin() as conn:
        if not _table_exists(conn, "cabinet_job_lines"):
            return
        cols = _columns(conn, "cabinet_job_lines")
        if "source_product_id" not in cols:
            conn.execute(text("ALTER TABLE cabinet_job_lines ADD COLUMN source_product_id INTEGER"))
        if "detail" not in cols:
            conn.execute(text("ALTER TABLE cabinet_job_lines ADD COLUMN detail VARCHAR(200)"))
        if "bundle_path" not in cols:
            conn.execute(text("ALTER TABLE cabinet_job_lines ADD COLUMN bundle_path JSON"))
