import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from app.core.config import settings
from app.db.mongodb import connect_to_mongo, close_mongo_connection
from app.services.whisper_service import warm_whisper
from app.api.routes import router as api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("movalong")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing MovAlong backend...")
    await connect_to_mongo()
    # Warm up Whisper on background thread so it doesn't block startup
    warm_whisper()
    yield
    logger.info("Shutting down MovAlong backend...")
    await close_mongo_connection()

app = FastAPI(
    title="MovAlong API",
    version="3.0.0",
    description="Voice-to-RFC generation engine with local Whisper and Gemma 2.",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes at /api
app.include_router(api_router, prefix="/api")

@app.get("/")
async def root():
    return {
        "app": "MovAlong",
        "version": "3.0.0",
        "tagline": "Spoken architecture thoughts to production RFCs.",
        "docs_url": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
