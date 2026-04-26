# JWT Secret Rotation Runbook

This runbook rotates JWT signing secrets with minimal user impact and a rollback path.

## Scope

- Access token secret: `JWT_SECRET`
- Refresh token secret: `JWT_REFRESH_SECRET`
- Redis-backed token blacklist/revocation entries

## Prerequisites

- Access to secret manager and deployment pipeline
- Access to Redis used by the backend
- Ability to monitor auth error rate (`401`/`403`) and login success rate
- Current secret values stored in a secure break-glass location for rollback

## Important Notes

- Rotating both access and refresh secrets at once invalidates all existing tokens.
- To avoid locking out all users, rotate in stages:
  1. Rotate access secret first.
  2. Allow clients to refresh normally.
  3. Rotate refresh secret during a controlled window.
- Flush the Redis blacklist only as part of the cutover and cleanup step.

## Staged Rotation Procedure

1. Prepare new secrets.

- Generate high-entropy values of at least 32 bytes.
- Store them in the secret manager as temporary next values.
- Do not deploy them yet.

2. Confirm baseline health.

- Verify login success rate is normal.
- Verify `401` and `403` rates are at baseline.
- Confirm Redis is reachable from the backend.

3. Rotate the access-token secret first.

- Promote the new value to `JWT_SECRET`.
- Keep `JWT_REFRESH_SECRET` unchanged.
- Deploy in stages: canary, then 25%, 50%, and 100%.

4. Watch the rollout.

- Expect some expired access tokens to fail once and recover through refresh.
- Stop if refresh failures rise or sign-ins start failing persistently.

5. Rotate the refresh-token secret.

- Promote the new value to `JWT_REFRESH_SECRET`.
- Deploy the same staged rollout.
- Expect users with old refresh tokens to sign in again.

6. Flush Redis blacklist and revocation entries.

- If JWT revocation data lives in its own Redis DB, flush the DB:

```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" -a "$REDIS_PASSWORD" FLUSHDB
```

- If Redis is shared, delete only the JWT blacklist keys:

```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --scan --pattern "jwt:blacklist:*" | xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" DEL
```

7. Verify the cutover.

- Confirm new sign-ins work.
- Confirm new refresh tokens work.
- Confirm auth error rates return to baseline.
- Remove the temporary next-secret entries from the secret manager.

## Rollback Procedure

1. Restore the previous `JWT_SECRET` and `JWT_REFRESH_SECRET` values.
2. Redeploy the backend using the same staged rollout.
3. Flush Redis blacklist or revocation entries again to remove mixed-state token data.

```bash
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" -a "$REDIS_PASSWORD" FLUSHDB
```

4. Confirm authentication metrics return to normal.
5. Record the failure details before attempting another rotation.

## Checklist

- [ ] New secrets generated and stored securely
- [ ] Access-token secret rotated first
- [ ] Refresh-token secret rotated second
- [ ] Redis blacklist and revocation entries flushed
- [ ] Auth metrics returned to baseline
- [ ] Temporary secret-manager entries removed
