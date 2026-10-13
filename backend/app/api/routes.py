import os
import shutil
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from pydantic import BaseModel, EmailStr
import httpx

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    status
)

from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)
from app.db.mongodb import get_database, is_db_alive
from app.services.whisper_service import transcribe_audio, DEVICE
from app.services.llm_service import generate_rfc

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Pydantic Schemas
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = ""

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def format_rfc_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return {}
    res = dict(doc)
    res["id"] = str(res.pop("_id"))
    if "created_at" in res and isinstance(res["created_at"], datetime):
        res["created_at"] = res["created_at"].isoformat()
    if "updated_at" in res and isinstance(res["updated_at"], datetime):
        res["updated_at"] = res["updated_at"].isoformat()
    return res

async def clone_samples_for_user(db, user_id: str):
    """
    Clones RFC templates from sample_rfcs collection to user's personal rfcs collection
    with sample=True and user's owner_id.
    """
    cursor = db["sample_rfcs"].find({})
    samples = await cursor.to_list(length=100)
    now = datetime.now(timezone.utc)

    for sample in samples:
        existing = await db["rfcs"].find_one({
            "owner_id": user_id,
            "slug": sample.get("slug")
        })
        if not existing:
            doc = {
                "owner_id": user_id,
                "title": sample.get("title", "Sample RFC"),
                "slug": sample.get("slug"),
                "rfc_markdown": sample.get("rfc_markdown", ""),
                "raw_transcript": sample.get("raw_transcript", ""),
                "status": "ready",
                "sample": True,
                "mock_audio": sample.get("mock_audio", {}),
                "created_at": now,
                "updated_at": now
            }
            await db["rfcs"].insert_one(doc)

# ----------------- Auth Routes -----------------

@router.post("/auth/register")
async def register(req: RegisterRequest, db = Depends(get_database)):
    email_clean = req.email.strip().lower()
    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    existing = await db["users"].find_one({"email": email_clean})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered."
        )

    hashed = hash_password(req.password)
    user_doc = {
        "email": email_clean,
        "password_hash": hashed,
        "name": (req.name or email_clean.split("@")[0]).strip(),
        "created_at": datetime.now(timezone.utc)
    }
    result = await db["users"].insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Clone the 3 sample RFCs into user's workspace
    await clone_samples_for_user(db, user_id)

    token = create_access_token(user_id, email_clean)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": email_clean,
            "name": user_doc["name"]
        }
    }

@router.post("/auth/login")
async def login(req: LoginRequest, db = Depends(get_database)):
    email_clean = req.email.strip().lower()
    user = await db["users"].find_one({"email": email_clean})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    user_id = str(user["_id"])
    token = create_access_token(user_id, email_clean)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": email_clean,
            "name": user.get("name", "")
        }
    }

@router.get("/auth/me")
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": current_user}

# ----------------- RFC Routes -----------------

@router.get("/rfcs")
async def list_rfcs(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db = Depends(get_database)
):
    cursor = db["rfcs"].find(
        {"owner_id": current_user["id"]},
        {
            "_id": 1,
            "title": 1,
            "status": 1,
            "sample": 1,
            "created_at": 1,
            "updated_at": 1,
            "mock_audio": 1,
            "client_id": 1
        }
    ).sort("created_at", -1)

    rfcs = await cursor.to_list(length=500)
    return [format_rfc_doc(r) for r in rfcs]

@router.get("/rfcs/{rfc_id}")
async def get_rfc(
    rfc_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db = Depends(get_database)
):
    try:
        obj_id = ObjectId(rfc_id)
        doc = await db["rfcs"].find_one({"_id": obj_id, "owner_id": current_user["id"]})
    except Exception:
        doc = await db["rfcs"].find_one({"_id": rfc_id, "owner_id": current_user["id"]})

    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFC not found")

    return format_rfc_doc(doc)

@router.delete("/rfcs/{rfc_id}")
async def delete_rfc(
    rfc_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db = Depends(get_database)
):
    try:
        obj_id = ObjectId(rfc_id)
        res = await db["rfcs"].delete_one({"_id": obj_id, "owner_id": current_user["id"]})
    except Exception:
        res = await db["rfcs"].delete_one({"_id": rfc_id, "owner_id": current_user["id"]})

    if res.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RFC not found")

    return {"success": True, "id": rfc_id}

# Background worker for Whisper + Gemma pipeline
async def process_audio_pipeline(rfc_id: str, temp_path: str):
    from app.db.mongodb import db
    if db.db is None:
        logger.error("DB unavailable during audio processing.")
        return

    col = db.db["rfcs"]
    oid = ObjectId(rfc_id)

    try:
        loop = asyncio.get_running_loop()
        # 1. Whisper speech-to-text
        transcript = await loop.run_in_executor(None, transcribe_audio, temp_path)
        transcript = transcript.strip()

        if not transcript:
            await col.update_one(
                {"_id": oid},
                {
                    "$set": {
                        "status": "failed",
                        "error": "No speech detected in audio.",
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            return

        # 2. Update status to structuring with raw transcript
        await col.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": "structuring",
                    "raw_transcript": transcript,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )

        # 3. LLM generation with Gemma 2
        result = await generate_rfc(transcript)

        # 4. Mark ready with final markdown and title
        await col.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": "ready",
                    "title": result["title"],
                    "rfc_markdown": result["rfc_markdown"],
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        logger.info(f"Successfully processed RFC {rfc_id}: '{result['title']}'")

    except Exception as e:
        logger.exception(f"Audio processing failed for RFC {rfc_id}: {e}")
        await col.update_one(
            {"_id": oid},
            {
                "$set": {
                    "status": "failed",
                    "error": str(e),
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

@router.post("/rfcs/upload-audio")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    client_id: Optional[str] = Form(None),
    recorded_at: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db = Depends(get_database)
):
    # Idempotency check with client_id
    if client_id:
        existing = await db["rfcs"].find_one({
            "owner_id": current_user["id"],
            "client_id": client_id
        })
        if existing:
            return format_rfc_doc(existing)

    temp_filename = f"{ObjectId()}_{file.filename}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    now = datetime.now(timezone.utc)
    new_doc = {
        "owner_id": current_user["id"],
        "client_id": client_id,
        "title": "Processing audio RFC...",
        "status": "transcribing",
        "raw_transcript": "",
        "rfc_markdown": "",
        "sample": False,
        "created_at": now,
        "updated_at": now
    }

    insert_result = await db["rfcs"].insert_one(new_doc)
    doc_id = str(insert_result.inserted_id)
    new_doc["_id"] = insert_result.inserted_id

    # Queue background processing
    background_tasks.add_task(process_audio_pipeline, doc_id, temp_path)

    return format_rfc_doc(new_doc)

@router.get("/health")
async def health_check():
    db_alive = await is_db_alive()
    ollama_alive = False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL.rstrip('/v1')}/api/tags")
            ollama_alive = (resp.status_code == 200)
    except Exception:
        ollama_alive = False

    return {
        "db": db_alive,
        "whisper_device": DEVICE,
        "ollama": ollama_alive
    }
