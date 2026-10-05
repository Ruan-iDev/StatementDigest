from app.modules.registry import ModuleManifest


def _router():
    from app.modules.cabinet.api import router

    return router


MANIFEST = ModuleManifest(
    id="cabinet",
    name="Cabinet Flow",
    description="Production jobcards. Clients, projects, and products stay in Work Flow.",
    version="0.1.0",
    models_import="app.modules.cabinet.models",
    get_router=_router,
    nav_href="/cabinet",
    tags=("jobcards", "cabinets"),
)
