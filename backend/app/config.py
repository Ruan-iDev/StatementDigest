"""Application configuration. All paths are local – no cloud services."""

from __future__ import annotations

import logging
import os
import shutil
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Project root: backend/app/config.py -> backend/ -> project root
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Older installs kept SQLite next to the repo. Used only for one-time migration.
LEGACY_DATA_DIR = PROJECT_ROOT / "data"


def default_user_data_dir() -> Path:
    """Per-user default: ~/Documents/LedgerFlow/Data (Windows / macOS / Linux).

    On Windows this is typically:
      C:\\Users\\<name>\\Documents\\LedgerFlow\\Data
    (or the OneDrive Documents folder if Windows redirects Documents there).
    """
    return Path.home() / "Documents" / "LedgerFlow" / "Data"


def resolve_data_dir() -> Path:
    """Resolve where on-device data lives.

    Priority:
      1. LEDGERFLOW_DATA env (Docker / advanced override)
      2. User Documents/LedgerFlow/Data (default for all desktop users)
    """
    data_env = os.environ.get("LEDGERFLOW_DATA")
    if data_env and data_env.strip():
        return Path(data_env.strip()).expanduser()
    return default_user_data_dir()


DATA_DIR = resolve_data_dir()
UPLOADS_DIR = DATA_DIR / "uploads"
LOGOS_DIR = DATA_DIR / "logos"
DB_PATH = DATA_DIR / "ledgerflow.db"


class Settings(BaseSettings):
    app_name: str = "LedgerFlow"
    debug: bool = True
    database_url: str = f"sqlite:///{DB_PATH.as_posix()}"
    # South Africa financial year typically starts March
    default_fy_start_month: int = 3
    default_currency: str = "ZAR"
    cors_origins: list[str] = [
        "http://localhost:3470",
        "http://127.0.0.1:3470",
    ]
    max_upload_mb: int = 25

    class Config:
        env_prefix = "LEDGERFLOW_"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _copy_tree_missing(src: Path, dest: Path) -> None:
    """Copy files/dirs from src into dest without overwriting existing dest files."""
    dest.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dest / item.name
        if item.is_dir():
            if not target.exists():
                shutil.copytree(item, target)
            else:
                _copy_tree_missing(item, target)
        else:
            if not target.exists():
                shutil.copy2(item, target)


def maybe_migrate_legacy_data() -> bool:
    """If the new user data dir has no DB but the old project data/ does, copy it once.

    Only runs when using the default Documents location (not when LEDGERFLOW_DATA is set).
    Returns True if a migration was performed.
    """
    if os.environ.get("LEDGERFLOW_DATA"):
        return False

    new_db = DATA_DIR / "ledgerflow.db"
    old_db = LEGACY_DATA_DIR / "ledgerflow.db"
    if new_db.is_file():
        return False
    if not old_db.is_file():
        return False

    try:
        logger.info(
            "Migrating local data from legacy %s -> %s",
            LEGACY_DATA_DIR,
            DATA_DIR,
        )
        _copy_tree_missing(LEGACY_DATA_DIR, DATA_DIR)
        return new_db.is_file()
    except OSError as exc:
        logger.warning("Legacy data migration failed: %s", exc)
        return False


def ensure_data_dirs() -> None:
    """Create local data directories if missing (on-device only — no cloud)."""
    maybe_migrate_legacy_data()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    LOGOS_DIR.mkdir(parents=True, exist_ok=True)
