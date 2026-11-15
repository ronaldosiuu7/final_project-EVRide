from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.documents import router as documents_router
from app.api.v1.files import router as files_router
from app.api.v1.fleet import router as fleet_router
from app.api.v1.health import router as health_router
from app.api.v1.rentals import router as rentals_router
from app.api.v1.users import router as users_router
from app.api.v1.wallets import router as wallets_router
from app.api.v1.operations import router as operations_router
from app.api.v1.rental_check_ins import router as rental_check_ins_router
from app.api.v1.incidents import router as incidents_router
from app.api.v1.incident_recovery import router as incident_recovery_router
from app.api.v1.incident_finance import router as incident_finance_router
from app.api.v1.incident_completion import router as incident_completion_router
from app.api.v1.analytics import router as analytics_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(documents_router)
api_router.include_router(files_router)
api_router.include_router(fleet_router)
api_router.include_router(wallets_router)
api_router.include_router(rentals_router)
api_router.include_router(operations_router)
api_router.include_router(rental_check_ins_router)
api_router.include_router(incidents_router)
api_router.include_router(incident_recovery_router)
api_router.include_router(incident_finance_router)
api_router.include_router(incident_completion_router)
api_router.include_router(analytics_router)




