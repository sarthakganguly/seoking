
from fastapi import APIRouter
from .generators import router as generators_router
from .scanners import router as scanners_router
from .validators import router as validators_router

router = APIRouter(prefix="/api/tools", tags=["standalone-tools"])
router.include_router(generators_router)
router.include_router(scanners_router)
router.include_router(validators_router)
