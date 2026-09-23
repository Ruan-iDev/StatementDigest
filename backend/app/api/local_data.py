"""Local on-device storage paths — transparency for privacy / POPIA confidence."""

from __future__ import annotations

import json
import os
import platform
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.config import (
    DATA_DIR,
    DB_PATH,
    LOGOS_DIR,
    UPLOADS_DIR,
    default_user_data_dir,
    ensure_data_dirs,
)
from app.schemas import LocalDataOpenBody, LocalDataOpenResult, LocalDataOut, LocalDataRestoreResult

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


_BACKUP_KIND = "data-backup"
_SKIP_NAMES = {"ledgerflow.db-wal", "ledgerflow.db-shm"}


def _app_version() -> str:
    return (os.environ.get("LEDGERFLOW_APP_VERSION") or "2.1.3").strip() or "2.1.3"


def _unlink(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


def _checkpoint_db() -> None:
    if not DB_PATH.is_file():
        return
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.commit()
    finally:
        conn.close()


def _write_backup_zip() -> Path:
    ensure_data_dirs()
    _checkpoint_db()
    fd, zip_path = tempfile.mkstemp(prefix="ledgerflow-backup-", suffix=".zip")
    os.close(fd)
    db_fd, tmp_db_s = tempfile.mkstemp(prefix="ledgerflow-bak-", suffix=".db")
    os.close(db_fd)
    tmp_db = Path(tmp_db_s)
    try:
        if DB_PATH.is_file():
            src = sqlite3.connect(str(DB_PATH))
            dst = sqlite3.connect(str(tmp_db))
            try:
                src.backup(dst)
            finally:
                dst.close()
                src.close()
        manifest = {
            "app": "LedgerFlow",
            "kind": _BACKUP_KIND,
            "version": _app_version(),
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            if tmp_db.is_file() and tmp_db.stat().st_size > 0:
                zf.write(tmp_db, "ledgerflow.db")
            if DATA_DIR.is_dir():
                for path in DATA_DIR.rglob("*"):
                    if not path.is_file():
                        continue
                    if path.name in _SKIP_NAMES or path.name == "ledgerflow.db":
                        continue
                    arc = path.relative_to(DATA_DIR).as_posix()
                    zf.write(path, arc)
    except Exception:
        _unlink(zip_path)
        raise
    finally:
        _unlink(str(tmp_db))
    return Path(zip_path)


@router.get("/local-data/backup")
def download_backup():
    """Download a zip of the on-device database plus uploads and logos."""
    path = _write_backup_zip()
    filename = f"LedgerFlow-backup-{date.today().isoformat()}.zip"
    return FileResponse(
        path,
        media_type="application/zip",
        filename=filename,
        background=BackgroundTask(_unlink, str(path)),
    )


@router.post("/local-data/restore", response_model=LocalDataRestoreResult)
async def restore_backup(file: UploadFile = File(...)):
    """Replace this PC's data from a LedgerFlow backup zip (device migrate)."""
    name = (file.filename or "").lower()
    if not name.endswith(".zip"):
        raise HTTPException(400, "Upload a LedgerFlow backup .zip file")
    ensure_data_dirs()
    raw = await file.read()
    if len(raw) < 64:
        raise HTTPException(400, "That file is empty or not a backup")
    tmp_dir = Path(tempfile.mkdtemp(prefix="ledgerflow-restore-"))
    zip_path = tmp_dir / "backup.zip"
    try:
        zip_path.write_bytes(raw)
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmp_dir / "unpack")
        except zipfile.BadZipFile as exc:
            raise HTTPException(400, "That file is not a valid zip backup") from exc
        unpack = tmp_dir / "unpack"
        manifest_path = unpack / "manifest.json"
        db_file = unpack / "ledgerflow.db"
        if not db_file.is_file():
            nested = list(unpack.rglob("ledgerflow.db"))
            db_file = nested[0] if nested else db_file
            if nested:
                unpack = db_file.parent
                manifest_path = unpack / "manifest.json"
        if manifest_path.is_file():
            try:
                meta = json.loads(manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise HTTPException(400, "Backup manifest is unreadable") from exc
            if meta.get("kind") != _BACKUP_KIND or meta.get("app") != "LedgerFlow":
                raise HTTPException(400, "That zip is not a LedgerFlow data backup")
        if not db_file.is_file():
            raise HTTPException(400, "Backup is missing ledgerflow.db")

        from app.database import engine, init_db

        engine.dispose()
        _checkpoint_db()
        live = sqlite3.connect(str(DB_PATH))
        src = sqlite3.connect(str(db_file))
        try:
            src.backup(live)
            live.commit()
        finally:
            src.close()
            live.close()
        engine.dispose()

        for folder in ("uploads", "logos"):
            src_dir = unpack / folder
            dest_dir = DATA_DIR / folder
            if src_dir.is_dir():
                if dest_dir.exists():
                    shutil.rmtree(dest_dir)
                shutil.copytree(src_dir, dest_dir)
        init_db()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return LocalDataRestoreResult(
        message="Backup restored. Refresh the app — Work Flow and Ledger Flow data are on this PC.",
        database_path=str(DB_PATH.resolve()),
    )
