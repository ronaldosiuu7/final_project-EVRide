import os

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.responses import make_response

from app.services.errors import ServiceError

app = FastAPI(title=os.getenv("APP_NAME", "EVRide"), version="0.1.0")

# ── CORS: cho phép Frontend gọi từ port khác ──
from app.core.auth_config import ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ORIGINS),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-EVRide-CSRF", "X-Session-ID", "Idempotency-Key"],
    expose_headers=["Retry-After"],
)

# ── Error handler: lỗi validation trả đúng format contract ──
@app.exception_handler(ServiceError)
async def service_error_handler(request: Request, exc: ServiceError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
            },
            "meta": make_response(None)["meta"],
        },
        headers={"Cache-Control": "no-store"},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    fields = []
    for err in exc.errors():
        loc = err.get("loc", ())
        field_name = str(loc[-1]) if loc else "unknown"
        fields.append({"field": field_name, "message": err.get("msg", "")})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Dữ liệu không hợp lệ.",
                "details": {"fields": fields},
            },
            "meta": make_response(None)["meta"],
        },
    )
from starlette.exceptions import HTTPException as StarletteHTTPException


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {
        "code": "HTTP_ERROR", "message": str(exc.detail)
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": detail, "meta": make_response(None)["meta"]},
        headers={**(exc.headers or {}), "Cache-Control": "no-store", "Pragma": "no-cache"},
    )


@app.middleware("http")
async def prevent_auth_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/v1/auth/") or request.url.path == "/api/v1/users/me/change-password":
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response
app.include_router(api_router)

@app.get("/")
def read_root():
    return {"message": "EVRide API is running"}