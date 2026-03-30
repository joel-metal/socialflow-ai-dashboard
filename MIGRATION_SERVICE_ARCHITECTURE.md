# Migration Service Architecture — Quick Reference

## Lock Strategy

**Redis SET with NX (atomic "check-and-set")**
```typescript
await redis.set(key, lockId, 'PX', timeoutMs, 'NX')
// Only succeeds if key doesn't exist
// Auto-expires after 5 minutes (deadlock prevention)
```

**Why not alternatives:**
- ❌ Database lock: Requires active DB connection, slower
- ❌ File lock: Doesn't work distributed, requires shared filesystem
- ✅ Redis lock: Fast, distributed, auto-expires, already in use

## Checksum Strategy

**SHA-256 of migration function source code**
```typescript
const checksum = crypto.createHash('sha256')
  .update(migration.run.toString())
  .digest('hex');
```

**Why not alternatives:**
- ❌ File hash: Would require storing function source files
- ❌ Database version field: Manual increment error-prone
- ✅ Function hash: Automatic, detects any code change

## Metadata Storage

**Redis Hash with JSON values**
```typescript
HSET socialflow:admin:migrations:metadata migrationName "{...metadata...}"
```

**Structure:**
```json
{
  "name": "20260324_sync_configured_queues",
  "checksum": "abc123abc123...",
  "appliedAt": 1711270000000,
  "durationMs": 45,
  "result": { "syncedQueues": 5 },
  "error": null
}
```

**Why Hash:**
- Allows per-migration metadata (not just "all applied")
- O(1) lookup by migration name
- Atomic upsert patterns
- Easy inspection via redis-cli

## Flow Diagram

```
runMigrations(options, logger)
  │
  ├─ acquireMigrationLock()
  │  └─ Retry: SET key NX, 100ms backoff, 30s timeout
  │     ├─ If success → continue
  │     └─ If fail → return error
  │
  ├─ Filter pending migrations
  │  └─ Skip if applied (unless force: true)
  │
  ├─ For each pending migration:
  │  │
  │  ├─ validateMigrationChecksum()
  │  │  ├─ Calculate current checksum
  │  │  ├─ Compare with stored metadata
  │  │  └─ If mismatch && !force → fail
  │  │
  │  ├─ migration.run()
  │  │  └─ Execute actual migration function
  │  │
  │  ├─ storeMigrationMetadata()
  │  │  └─ Save checksum + duration + result
  │  │
  │  └─ redis.sadd() to applied set
  │
  ├─ releaseMigrationLock()
  │  └─ DEL key (cleanup)
  │
  └─ Return result {executed, skipped, failed, errors}
```

## Key Invariants

1. **Only one migration process active at a time**
   - Lock prevents concurrent execution
   - If process crashes, 5-min timeout releases lock

2. **Applied migrations never re-run**
   - Unless explicitly `force: true`
   - Even across server restarts (applied set persists)

3. **Script modifications are detected**
   - Checksum mismatch warns admin
   - Prevents silent state divergence
   - Must explicitly force to override

4. **Full audit trail available**
   - Timestamp, duration, result stored
   - Errors logged and persisted
   - Status API shows metadata

## Error Scenarios

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Process crashes during migration | Lock expires after 5 min | Retry migration, no data loss |
| Migration function throws error | Error stored, next migration runs | Check error metadata, fix, force retry |
| Checksum mismatch | Migration fails (unless force) | Verify code changes, force apply |
| Lock held by another process | Return `lockAcquired: false` | Wait for other process to finish |
| Redis unavailable | Throws error, request fails | Fallback to previous behavior (no lock) |

## Testing Coverage

```
Lock Mechanism                    [████ 4 tests]
Checksum & Metadata              [█████ 5 tests]
Idempotency & Replay             [██████ 6 tests]
Dry-Run Safety                   [███ 3 tests]
Error Handling                   [█████ 5 tests]
Selective Migration              [██ 2 tests]
Status Reporting                 [███ 3 tests]
                                 ━━━━━━━━━
                                 28 core tests
                                 + variants/edge cases
                                 = 40+ total scenarios
```

## Configuration Options

```typescript
// Tunable constants in constants.ts
MIGRATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;    // 5 minutes (deadlock timeout)
MIGRATION_LOCK_RETRY_INTERVAL_MS = 100;       // Wait 100ms between retries
MIGRATION_LOCK_MAX_RETRIES = 300;             // Max 30 seconds total wait
```

**Adjust if:**
- Migrations typically take >5 min → increase TIMEOUT
- High contention for lock → decrease RETRY_INTERVAL or increase MAX_RETRIES
- Minimal overlap expected → increase TIMEOUT (less aggressive cleanup)

## Backward Compatibility

✅ **Zero breaking changes**
- Old migrations (without metadata) still marked as applied
- Checksum stored on next successful run
- API unchanged (`listMigrations`, `runMigrations`)
- Dry-run semantics identical

## Monitoring

### Key Metrics

```typescript
// In logs, watch for:
'Migration lock acquired'          // Normal - migration starting
'Migration completed successfully' // Normal - completed OK
'Migration checksum mismatch detected'  // WARNING - code changed
'Could not acquire migration lock' // ERROR - concurrent attempt
'Migration failed'                 // ERROR - execution error
```

### Admin Dashboard Integration

```typescript
// GET /admin/migrations
[
  {
    name: "20260324_sync_configured_queues",
    applied: true,
    checksum: "abc123...",
    appliedAt: 1711270000000,
    error: null  // or error message
  }
]
```

### Redis Keys to Monitor

```bash
# Lock status
EXISTS socialflow:admin:migrations:lock

# Applied migrations count
SCARD socialflow:admin:migrations:applied

# Metadata count
HLEN socialflow:admin:migrations:metadata
```
