from app.modules.registry import ModuleManifest


def _router():
    from app.modules.practice.api import router

    return router


MANIFEST = ModuleManifest(
    id="practice",
    name="Practice",
    description="Clients, suppliers, products, quotes, invoices, and project files with a dated paper trail.",
    version="0.1.0",
    models_import="app.modules.practice.models",
    get_router=_router,
    nav_href="/practice",
    tags=("clients", "suppliers", "quotes", "invoices", "projects"),
)
