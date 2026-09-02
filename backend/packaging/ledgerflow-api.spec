# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for LedgerFlow API sidecar (desktop package).
# Build from repo root or backend/: see scripts/build-desktop.ps1

import sys
from pathlib import Path

block_cipher = None

from PyInstaller.utils.hooks import collect_submodules

# SPECPATH = directory containing this .spec (backend/packaging)
SPECDIR = Path(SPECPATH).resolve()
BACKEND = SPECDIR.parent  # backend/
sys.path.insert(0, str(BACKEND))


a = Analysis(
    [str(BACKEND / "run.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "anyio._backends._asyncio",
        "app.main",
        "app.api.auth",
        "app.api.bank_profiles",
        "app.api.disclaimers",
        "app.api.imports",
        "app.api.ledgers",
        "app.api.license",
        "app.api.local_data",
        "app.api.profiles",
        "app.api.reports",
        "app.api.rules",
        "app.api.settings",
        "app.api.transactions",
        "app.license",
        "app.modules.registry",
        "app.services.parsers.base",
        "app.services.parsers.detect",
        "app.services.parsers.discovery_pdf",
        "app.services.parsers.fnb_pdf",
        "app.services.parsers.capitec_pdf",
        "app.services.parsers.nedbank_pdf",
        "app.services.parsers.bank_zero_pdf",
        "pdfplumber",
        "pdfminer",
        "pypdfium2",
        "PIL",
        "reportlab",
        "reportlab.pdfbase",
        "reportlab.pdfgen",
        "sqlalchemy.dialects.sqlite",
        "aiosqlite",
        "multipart",
        "email.mime.multipart",
        "email.mime.text",
    ]
    + collect_submodules("app.modules"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy.tests"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ledgerflow-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # no black console window for testers
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ledgerflow-api",
)
