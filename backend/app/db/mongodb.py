import logging
from typing import Optional
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import settings

logger = logging.getLogger(__name__)

class DatabaseState:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None
    online: bool = False

db = DatabaseState()

async def ensure_indexes():
    if db.db is None:
        return
    try:
        users_col = db.db["users"]
        await users_col.create_index("email", unique=True)

        rfcs_col = db.db["rfcs"]
        # Drop legacy index if exists without partialFilterExpression
        try:
            await rfcs_col.drop_index("owner_id_1_client_id_1")
        except Exception:
            pass
        await rfcs_col.create_index(
            [("owner_id", 1), ("client_id", 1)],
            unique=True,
            partialFilterExpression={"client_id": {"$type": "string"}}
        )

        sample_col = db.db["sample_rfcs"]
        await sample_col.create_index("slug", unique=True)
        logger.info("MongoDB indexes verified.")
    except Exception as e:
        logger.warning(f"Error creating indexes: {e}")

async def connect_to_mongo():
    try:
        logger.info(f"Connecting to MongoDB at {settings.MONGODB_URI}...")
        client = AsyncIOMotorClient(settings.MONGODB_URI, serverSelectionTimeoutMS=4000)
        # Test connection
        await client.admin.command('ping')
        db.client = client
        db.db = client[settings.MONGODB_DB]
        db.online = True
        logger.info(f"Connected successfully to MongoDB database '{settings.MONGODB_DB}'.")
        await ensure_indexes()
    except Exception as e:
        db.online = False
        db.client = None
        db.db = None
        logger.warning(f"MongoDB connection failed: {e}")

async def close_mongo_connection():
    if db.client:
        db.client.close()
        db.online = False
        logger.info("Closed MongoDB connection.")

async def is_db_alive() -> bool:
    if not db.online or db.client is None:
        return False
    try:
        await db.client.admin.command('ping')
        return True
    except Exception:
        db.online = False
        return False

def get_database() -> AsyncIOMotorDatabase:
    if not db.online or db.db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="database_unavailable"
        )
    return db.db
