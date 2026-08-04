"""Local on-device storage paths — transparency for privacy / POPIA confidence."""

from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import (
    DATA_DIR,
    DB_PATH,
    LOGOS_DIR,
    UPLOADS_DIR,
    default_user_data_dir,
    ensure_data_dirs,
)
from app.schemas import LocalDataOpenBody, LocalDataOpenResult, LocalDataOut

router = APIRouter(tags=["local-data"])

_ALLOWED_TARGETS = frozenset({"data_dir", "database", "uploads_dir", "logos_dir"})


def _file_size(path: Path) -> int | None:
    try:
        if path.is_file():
            return path.stat().st_size
    except OSError:
        return None
    return None


def _build_local_data() -> LocalDataOut:
    ensure_data_dirs()
    db = DB_PATH.resolve()
    default_dir = default_user_data_dir().resolve()
    return LocalDataOut(
        data_dir=str(DATA_DIR.resolve()),
        database_path=str(db),
        uploads_dir=str(UPLOADS_DIR.resolve()),
        logos_dir=str(LOGOS_DIR.resolve()),
        database_exists=db.is_file(),
        database_size_bytes=_file_size(db),
        storage_mode="local_only",
        is_custom_location=bool(os.environ.get("LEDGERFLOW_DATA")),
        default_data_dir=str(default_dir),
    )


def _open_path_in_file_manager(path: Path) -> None:
    """Open the folder (or select the file) in the OS file manager."""
    path = path.resolve()
    system = platform.system()

    if system == "Windows":
        if path.is_file():
            # Select the file in Explorer
            subprocess.Popen(["explorer", "/select,", str(path)])
        else:
            path.mkdir(parents=True, exist_ok=True)
            subprocess.Popen(["explorer", str(path)])
        return

    if system == "Darwin":
        if path.is_file():
            subprocess.Popen(["open", "-R", str(path)])
        else:
            path.mkdir(parents=True, exist_ok=True)
            subprocess.Popen(["open", str(path)])
        return

    # Linux / other
    folder = path if path.is_dir() else (path.parent if path.exists() else path)
    if not folder.is_dir():
        folder.mkdir(parents=True, exist_ok=True)
    opener = "xdg-open"
    subprocess.Popen([opener, str(folder)])


@router.get("/local-data", response_model=LocalDataOut)
def get_local_data() -> LocalDataOut:
    """Return absolute paths of on-device data files (SQLite, uploads, logos)."""
    return _build_local_data()


@router.post("/local-data/open", response_model=LocalDataOpenResult)
def open_local_data(body: LocalDataOpenBody) -> LocalDataOpenResult:
    """Open the data folder (or select the database file) in the system file manager.

    Runs on the same machine as the API (local-first app). Does not transfer any data.
    """
    ensure_data_dirs()
    target = (body.target or "data_dir").strip().lower()
    if target not in _ALLOWED_TARGETS:
        raise HTTPException(
            400,
            f"Invalid target '{body.target}'. Use one of: {', '.join(sorted(_ALLOWED_TARGETS))}",
        )

    mapping: dict[str, Path] = {
        "data_dir": DATA_DIR,
        "database": DB_PATH,
        "uploads_dir": UPLOADS_DIR,
        "logos_dir": LOGOS_DIR,
    }
    path = mapping[target]

    try:
        _open_path_in_file_manager(path)
    except Exception as exc:  # pragma: no cover - OS-specific
        raise HTTPException(
            500,
            f"Could not open file location ({sys.platform}): {exc}",
        ) from exc

    opened = str(path.resolve())
    label = {
        "data_dir": "data folder",
        "database": "database file",
        "uploads_dir": "uploads folder",
        "logos_dir": "logos folder",
    }[target]
    return LocalDataOpenResult(
        opened=opened,
        message=f"Opened {label} in your file manager: {opened}",
    )
