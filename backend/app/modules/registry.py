"""Module registry — discover, import models, mount routers.

Adding a module:
  1. Create ``app/modules/<id>/`` with ``manifest.py`` exporting ``MANIFEST``.
  2. Add the id to ``ENABLED_MODULE_IDS`` below.
  3. Do not put module tables in ``app.models`` or module routes in ``app.api``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from importlib import import_module
from typing import Any, Callable

from fastapi import APIRouter, FastAPI


@dataclass(frozen=True)
class ModuleManifest:
    id: str
    name: str
    description: str
    version: str
    # Dotted path imported so SQLAlchemy metadata sees module tables.
    models_import: str
    # Callable returning the FastAPI router (prefix without /api).
    get_router: Callable[[], APIRouter]
    nav_href: str
    enabled: bool = True
    tags: tuple[str, ...] = field(default_factory=tuple)


# Only ids listed here are loaded. Comment one out to disable without deleting it.
ENABLED_MODULE_IDS: tuple[str, ...] = ("practice", "cabinet")


def _load_manifest(module_id: str) -> ModuleManifest:
    pkg = import_module(f"app.modules.{module_id}.manifest")
    manifest = getattr(pkg, "MANIFEST", None)
    if not isinstance(manifest, ModuleManifest):
        raise RuntimeError(f"Module {module_id!r} must export MANIFEST: ModuleManifest")
    if manifest.id != module_id:
        raise RuntimeError(f"Module id mismatch: folder {module_id!r} vs manifest {manifest.id!r}")
    return manifest


def discover_modules() -> list[ModuleManifest]:
    found: list[ModuleManifest] = []
    for module_id in ENABLED_MODULE_IDS:
        found.append(_load_manifest(module_id))
    return [m for m in found if m.enabled]


def import_module_models() -> None:
    """Import every enabled module's models so ``Base.metadata.create_all`` sees them."""
    for manifest in discover_modules():
        import_module(manifest.models_import)


def migrate_modules(engine) -> None:
    """Run optional ``migrate(engine)`` in each enabled module."""
    for manifest in discover_modules():
        try:
            pkg = import_module(f"app.modules.{manifest.id}.migrate")
        except ModuleNotFoundError:
            continue
        fn = getattr(pkg, "migrate", None)
        if callable(fn):
            fn(engine)


def mount_modules(app: FastAPI) -> None:
    for manifest in discover_modules():
        app.include_router(manifest.get_router(), prefix="/api")


def modules_public_payload() -> list[dict[str, Any]]:
    return [
        {
            "id": m.id,
            "name": m.name,
            "description": m.description,
            "version": m.version,
            "nav_href": m.nav_href,
            "tags": list(m.tags),
        }
        for m in discover_modules()
    ]
