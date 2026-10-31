from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Report application liveness without requiring external services."""
    return {"status": "ok"}
