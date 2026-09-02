"""Bolt-on product modules.

Core LedgerFlow (statements → ledgers → P&L) stays in ``app.api`` / ``app.models``.
Each module lives in its own package, owns its tables and routes, and is mounted
by the registry. Shipping one EXE still updates core + every enabled module.
"""

from app.modules.registry import discover_modules, mount_modules, import_module_models

__all__ = ["discover_modules", "mount_modules", "import_module_models"]
