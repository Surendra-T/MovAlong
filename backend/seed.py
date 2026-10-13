import argparse
import os
import sys
from datetime import datetime, timezone
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# Load root .env first, then backend .env
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(REPO_ROOT, ".env"))
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/movalong")
MONGODB_DB = os.getenv("MONGODB_DB", "movalong")

SAMPLE_RFCS = [
    {
        "slug": "session-data-postgres-to-redis",
        "title": "RFC: Migrating Session State from a Shared Postgres Table to Redis Cluster",
        "mock_audio": {
            "duration_s": 54.2,
            "mime": "audio/webm;codecs=opus",
            "size_bytes": 234120,
            "whisper_model": "base",
            "llm_model": "gemma2:9b"
        },
        "raw_transcript": (
            "We're seeing heavy contention on our primary Postgres instance due to session read-writes "
            "on every single authenticated HTTP request. Over 35% of all write IOPS are just updating "
            "the session last_active_at timestamp. We need to decouple session state into a dedicated "
            "in-memory Redis cluster with dual-write replication during migration and fallback logic."
        ),
        "rfc_markdown": """# RFC: Migrating Session State from a Shared Postgres Table to Redis Cluster

## Summary
This proposal details the architectural shift of ephemeral HTTP user sessions from the primary monolithic PostgreSQL database to an in-memory Redis 7.x Cluster. This will eliminate over 35% of database write IOPS, resolve transaction log lock contention on high-frequency requests, and reduce 99th-percentile session validation latency to sub-2 milliseconds.

## Context & Problem Statement
Currently, each inbound request triggers an update to `sessions.last_active_at` in Postgres to maintain sliding-window session expiration. Under peak traffic (>45,000 req/sec), connection pools are saturated with trivial session updates, triggering aggressive WAL generation, autovacuum thrashing, and elevated p99 latency across core business transactions.

Key Constraints:
- Zero forced logouts during the migration window.
- Active sessions (~3.8M active daily tokens) must preserve sliding expiry.
- Must support horizontal failover and cross-zone replication without data loss.

## Proposal
1. Deploy a multi-node Redis Cluster (3 shards, 1 replica each) running in the same VPC as the API servers.
2. Introduce a three-phase dark-launch migration strategy:
   - **Phase 1 (Dual Write):** Writes go to Postgres and asynchronously mirror to Redis. Reads continue from Postgres.
   - **Phase 2 (Dual Write, Redis Primary Read):** Reads attempt Redis first; on cache miss, fall back to Postgres and backfill Redis.
   - **Phase 3 (Cutover):** Deprecate the Postgres sessions table and run exclusively on Redis with TTL eviction.

## Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Gateway as API Gateway
    participant Redis as Redis Cluster (Primary)
    participant PG as PostgreSQL (Legacy DB)

    Client->>Gateway: Request with Bearer Session Token
    Gateway->>Redis: GET session:{token_hash}
    alt Cache Hit (Primary Path)
        Redis-->>Gateway: Session payload + TTL renewed
        Gateway-->>Client: Processed Response (Latency < 2ms)
    else Cache Miss (Migration Fallback)
        Redis-->>Gateway: Nil
        Gateway->>PG: SELECT * FROM sessions WHERE token = hash
        PG-->>Gateway: Session Record
        Gateway->>Redis: SETEX session:{token_hash} 86400 payload
        Gateway-->>Client: Processed Response (Backfilled)
    end
```

### Redis Key Schema & TTL Policy
- Key format: `session:{sha256_token}`
- Value: Serialized JSON with permissions, user ID, and tenant ID.
- TTL: 24-hour sliding window renewed via `EXPIRE` pipeline upon read.

## Trade-offs & Alternatives
- **Redis Cluster vs Dragonfly / Memcached:** Redis Cluster is chosen for mature client ecosystem, Sentinel failover reliability, and active clustering. Memcached lacks native atomic multi-field mutations.
- **Data Durability:** Redis will use `appendonly yes` with `appendfsync everysec`. In the worst-case master failure, at most 1 second of renewed timestamps may revert, which is completely acceptable for session heartbeats.

## Open Questions
1. Should session revocation upon password resets propagate via Redis Pub/Sub channels or explicit key deletion?
2. Memory sizing: with 4M concurrent sessions averaging 1.2KB payload, estimated memory footprint is ~6GB (inclusive of hash overhead). Will 3x AWS `cache.r6g.large` instances provide sufficient headroom during burst traffic?"""
    },
    {
        "slug": "event-sourced-billing-ledger",
        "title": "RFC: Event-Sourced Billing Ledger with Idempotent Projections",
        "mock_audio": {
            "duration_s": 68.7,
            "mime": "audio/webm;codecs=opus",
            "size_bytes": 312800,
            "whisper_model": "base",
            "llm_model": "gemma2:9b"
        },
        "raw_transcript": (
            "Our subscription billing calculation currently modifies customer balances in place, "
            "making historical financial auditing and credit tracking prone to race conditions and "
            "missing ledger records. We should adopt an append-only event-sourced billing log backed "
            "by Kafka and idempotent projections with double-entry accounting invariants."
        ),
        "rfc_markdown": r"""# RFC: Event-Sourced Billing Ledger with Idempotent Projections

## Summary
This RFC proposes replacing mutable balance columns in our billing service with an immutable, append-only double-entry event log. By decoupling billing events from materialised account balances via asynchronous projectors, the system achieves provable auditability, zero rounding drift, and idempotent retry guarantees for Stripe webhooks and invoice settlements.

## Context & Problem Statement
The current billing schema mutates `accounts.current_balance_cents` in place using relational row locks (`SELECT FOR UPDATE`). During simultaneous webhook retries, prorated plan upgrades, and usage metering emissions:
- Race conditions occasionally cause duplicate charge attempts.
- Financial reconciliation requires slow, expensive database diffing against Stripe transaction logs.
- Audit compliance (SOC2 / SOX ready) mandates an immutable record of every debit and credit with origin tracing.

## Proposal
- Model every financial state transition as an immutable ledger transaction consisting of paired debit and credit entries (`sum(amount) == 0`).
- Publish all events to an ordered Kafka topic (`billing-ledger-events`) partitioned by `account_id`.
- Implement an idempotent projection consumer that materializes current balances, customer invoices, and audit checkpoints in PostgreSQL read models.

## Architecture

```mermaid
flowchart LR
    subgraph Ingestion ["Ingestion & External Triggers"]
        WH["Stripe Webhooks"] --> ING["Billing API"]
        USE["Usage Metering Cron"] --> ING
    end

    subgraph EventStream ["Immutable Ledger Stream"]
        ING -->|"Append Transaction"| KF[("Kafka: billing-ledger-events<br/>(Partition: account_id)")]
    end

    subgraph ProjectionEngine ["Idempotent Projector"]
        KF -->|"Ordered Consume"| PROJ["Ledger Projector Service"]
        PROJ -->|"Idempotency Check"| IDEMP{"Deduplication<br/>Key Seen?"}
        IDEMP --"No"--> ACCT["Double Entry Invariant Validation"]
        ACCT -->|"Atomic Batch Write"| PG[("PostgreSQL Read Models<br/>- account_balances<br/>- invoice_line_items")]
        IDEMP --"Yes"--> ACK["Ack & Skip"]
    end

    subgraph Audit ["Reconciliation"]
        PG --> AUD["Daily Audit & Balance Invariant Checker"]
    end
```

### Double Entry Invariant Formula
Every ledger entry must satisfy:
$$\sum_{i=1}^{n} \text{Debit}_i - \sum_{j=1}^{m} \text{Credit}_j = 0$$

## Trade-offs & Alternatives
- **Eventual Consistency:** Account balances become eventually consistent with a sub-second lag. Critical operations (e.g. card charge threshold) will read directly from the latest uncommitted projection offset or perform inline verification.
- **Storage Growth:** Append-only ledgers grow monotonically. Mitigated by periodic snapshotting (monthly ledger rollups) after books are closed.

## Open Questions
1. Handling currency exchange rate fluctuations: Should conversion rates be fixed at event creation timestamp or settlement timestamp?
2. Projection replay performance: What is the target SLA for replaying a 5-year event log for an account experiencing an audit dispute?"""
    },
    {
        "slug": "edge-cache-invalidation-pubsub",
        "title": "RFC: Edge Cache Invalidation via Regional Pub/Sub Fan-out",
        "mock_audio": {
            "duration_s": 47.1,
            "mime": "audio/webm;codecs=opus",
            "size_bytes": 204550,
            "whisper_model": "base",
            "llm_model": "gemma2:9b"
        },
        "raw_transcript": (
            "Right now, CMS updates take up to fifteen minutes to propagate to regional edge points of "
            "presence because we rely strictly on passive TTL expiry. We want to publish explicit cache "
            "purge events through a global pub/sub fan-out bus so that edge nodes evict stale assets "
            "in under 500 milliseconds worldwide."
        ),
        "rfc_markdown": """# RFC: Edge Cache Invalidation via Regional Pub/Sub Fan-out

## Summary
This document specifies a global active cache invalidation topology using regional pub/sub message brokers. When origin content changes (e.g., editorial publishing, inventory updates), an invalidation event is broadcast across regional message brokers, triggering immediate local purge commands across edge PoPs within 500 milliseconds globally, while retaining passive TTLs as a defensive fallback.

## Context & Problem Statement
Currently, edge nodes cache API responses and server-rendered HTML for a fixed 15-minute TTL. Stale inventory figures and urgent editorial retractions remain visible to global users for the full TTL window unless engineers manually trigger a blanket CDN wipe, which thrashes origin infrastructure with cache stampedes.

Objectives:
- Invalidate specific cache keys / surrogate tags across all 28 PoPs within 500ms.
- Protect origin databases from stampedes using cache locking (stale-while-revalidate during purges).
- Ensure resilient operation if edge connectivity to the message bus drops temporarily.

## Proposal
- When mutations occur, Origin CMS publishes an `InvalidateMessage(tags, urls, timestamp)` to a central Pub/Sub topic.
- Regional edge clusters subscribe via persistent HTTP/2 SSE or MQTT bridges.
- Edge workers execute localized atomic cache evictions matching the tag pattern.
- If an invalidation message is dropped or broker is disconnected, the 10-minute fallback TTL prevents indefinite staleness.

## Architecture

```mermaid
flowchart TD
    subgraph Origin ["Origin Tier"]
        CMS["CMS / Mutation Service"] -->|"Publish Purge Tag"| G_TOPIC[("Global Pub/Sub Topic")]
    end

    subgraph Fanout ["Regional Distribution"]
        G_TOPIC --> REG_US["US Regional Broker (Virginia)"]
        G_TOPIC --> REG_EU["EU Regional Broker (Frankfurt)"]
        G_TOPIC --> REG_AP["APAC Regional Broker (Singapore)"]
    end

    subgraph EdgeNodes ["Edge PoPs (Local Cache Eviction)"]
        REG_US --> POP_NYC["PoP New York (Local Cache Purge)"]
        REG_US --> POP_SFO["PoP San Francisco (Local Cache Purge)"]
        REG_EU --> POP_LON["PoP London (Local Cache Purge)"]
        REG_EU --> POP_FRA["PoP Frankfurt (Local Cache Purge)"]
        REG_AP --> POP_TYO["PoP Tokyo (Local Cache Purge)"]
        REG_AP --> POP_SYD["PoP Sydney (Local Cache Purge)"]
    end

    subgraph Fallback ["Defense in Depth"]
        POP_NYC -.->|"TTL Expiry (10m Fallback)"| EXPIRE["Passive Eviction"]
    end
```

## Trade-offs & Alternatives
- **Point-to-point Purge API calls:** Calling individual edge nodes via REST requires O(N) connections and struggles with transient network partitions. Pub/Sub fanout scales with zero origin connection overhead.
- **Surrogate-Key granularity:** Tag-based invalidation allows purging by entity (e.g. `product:4921`) rather than brute-force URI globbing.

## Open Questions
1. Should edge brokers maintain a 5-minute replay log for PoP nodes reconnecting after a transit outage?
2. What rate limiting threshold should be enforced to prevent denial-of-service from massive bulk purge events?"""
    }
]

def setup_indexes(db):
    print("Setting up database indexes...")
    # Users index
    db["users"].create_index("email", unique=True)

    # RFCs indexes
    db["rfcs"].create_index([("owner_id", 1), ("created_at", -1)])
    try:
        db["rfcs"].drop_index("owner_id_1_client_id_1")
    except Exception:
        pass
    db["rfcs"].create_index(
        [("owner_id", 1), ("client_id", 1)],
        unique=True,
        partialFilterExpression={"client_id": {"$type": "string"}}
    )

    # Sample RFCs index
    db["sample_rfcs"].create_index("slug", unique=True)
    print("Database indexes successfully configured.")

def seed_sample_rfcs(db):
    print("Seeding sample_rfcs collection (idempotent upsert)...")
    now = datetime.now(timezone.utc)
    operations = []

    for sample in SAMPLE_RFCS:
        doc = {
            "slug": sample["slug"],
            "title": sample["title"],
            "rfc_markdown": sample["rfc_markdown"],
            "raw_transcript": sample["raw_transcript"],
            "mock_audio": sample["mock_audio"],
            "sample": True,
            "status": "ready",
            "updated_at": now
        }
        operations.append(
            UpdateOne(
                {"slug": sample["slug"]},
                {"$set": doc, "$setOnInsert": {"created_at": now}},
                upsert=True
            )
        )

    if operations:
        result = db["sample_rfcs"].bulk_write(operations)
        print(f"Upserted {result.upserted_count} new, modified {result.modified_count} existing sample RFC templates.")

def backfill_user_samples(db, email: str):
    email_clean = email.strip().lower()
    user = db["users"].find_one({"email": email_clean})
    if not user:
        print(f"Error: No account found with email '{email_clean}'.")
        sys.exit(1)

    user_id = str(user["_id"])
    print(f"Backfilling sample RFCs into workspace for user '{email_clean}' ({user_id})...")

    samples = list(db["sample_rfcs"].find({}))
    now = datetime.now(timezone.utc)
    copied = 0

    for sample in samples:
        existing = db["rfcs"].find_one({
            "owner_id": user_id,
            "slug": sample["slug"]
        })
        if not existing:
            new_rfc = {
                "owner_id": user_id,
                "title": sample["title"],
                "slug": sample["slug"],
                "rfc_markdown": sample["rfc_markdown"],
                "raw_transcript": sample.get("raw_transcript", ""),
                "status": "ready",
                "sample": True,
                "mock_audio": sample.get("mock_audio", {}),
                "created_at": now,
                "updated_at": now
            }
            db["rfcs"].insert_one(new_rfc)
            copied += 1
            print(f"  + Cloned '{sample['title']}'")
        else:
            print(f"  - '{sample['title']}' already exists in workspace")

    print(f"Finished: {copied} sample RFC(s) added to user workspace.")

def main():
    parser = argparse.ArgumentParser(description="MovAlong database seeder and sample backfiller.")
    parser.add_argument("--email", type=str, help="Add the 3 sample RFCs to an existing user account")
    args = parser.parse_args()

    print(f"Connecting to MongoDB at {MONGODB_URI} (db: {MONGODB_DB})...")
    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
        client.admin.command('ping')
        db = client[MONGODB_DB]
    except Exception as e:
        print(f"Failed to connect to MongoDB ({e}). Please check your connection and MONGODB_URI.")
        sys.exit(1)

    setup_indexes(db)
    seed_sample_rfcs(db)

    if args.email:
        backfill_user_samples(db, args.email)

    print("Seed process completed successfully.")

if __name__ == "__main__":
    main()
