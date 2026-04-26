# SocialFlow AI Dashboard — Issue Tracker

> 40 detailed engineering issues derived from a full codebase audit (March 2026).
> Each issue includes context, current behaviour, expected behaviour, and suggested implementation steps.

---

## Issue #1 — Secret template contains placeholder credentials that could be applied as-is

**Area:** `k8s/base/secret.yaml`  
**Priority:** Critical  
**Labels:** security, kubernetes

**Description:**  
`k8s/base/secret.yaml` ships with `stringData` values such as `"change-me-min-32-chars"` for `JWT_SECRET` and `JWT_REFRESH_SECRET`, and a literal `postgresql://USER:PASS@HOST:5432/socialflow` for `DATABASE_URL`. A developer running `kubectl apply -k k8s/overlays/dev` without replacing these values will deploy a cluster with known-weak secrets.

**Current behaviour:** The file is committed with placeholder values and no admission-level guard prevents applying it verbatim.

**Expected behaviour:** The base secret should either be an empty skeleton (all values `""`) with a pre-apply validation hook, or be replaced entirely by an External Secrets Operator `ExternalSecret` manifest that pulls values from AWS Secrets Manager / Vault at deploy time.

**Steps:**
1. Replace `k8s/base/secret.yaml` with an `ExternalSecret` CRD pointing to the chosen secrets backend.
2. Add a `kubectl diff` step in CI that fails if any secret value matches a known placeholder pattern.
3. Document the secrets bootstrap process in `k8s/README.md`.

---

## Issue #2 — Deployment missing `startupProbe`; slow-starting pods can be killed before they are ready

**Area:** `k8s/base/deployment.yaml`  
**Priority:** High  
**Labels:** reliability, kubernetes

**Description:**  
The deployment defines `readinessProbe` (delay 10 s) and `livenessProbe` (delay 20 s) but no `startupProbe`. On a cold start the server bootstraps workers, connects to Redis, runs Prisma migrations check, and starts multiple BullMQ queues (see `backend/src/server.ts`). If this takes longer than 20 s the liveness probe fires and Kubernetes restarts the pod in a loop.

**Current behaviour:** Pods that take >20 s to start are killed and restarted repeatedly.

**Expected behaviour:** A `startupProbe` with a generous `failureThreshold` (e.g. 30 × 5 s = 150 s window) should gate the liveness probe until the application signals readiness.

**Steps:**
1. Add `startupProbe` to `k8s/base/deployment.yaml` using the existing `/health` endpoint.
2. Set `failureThreshold: 30` and `periodSeconds: 5` to allow up to 150 s startup.
3. Reduce `livenessProbe.initialDelaySeconds` to `0` once `startupProbe` is in place.

---

## Issue #3 — HPA scales on CPU/memory only; queue depth is not considered

**Area:** `k8s/base/hpa.yaml`  
**Priority:** High  
**Labels:** scalability, kubernetes

**Description:**  
The `HorizontalPodAutoscaler` triggers on CPU ≥ 70 % and memory ≥ 80 %. The application runs BullMQ workers for email, payout, TikTok video, Twitter webhooks, YouTube sync, and notifications. Under a burst of queued jobs the workers are CPU-light but queue depth grows unboundedly because no external metric drives scale-out.

**Current behaviour:** Queue depth can grow to thousands of jobs while CPU stays below the threshold.

**Expected behaviour:** Add a `type: External` metric sourced from the Prometheus `bullmq_queue_waiting` gauge (already scraped via `/metrics`) so the HPA scales on queue depth.

**Steps:**
1. Expose per-queue waiting-job counts as a Prometheus gauge in `backend/src/lib/metrics.ts`.
2. Install the Prometheus Adapter and configure a custom metric mapping.
3. Add an `External` metric block to `k8s/base/hpa.yaml` targeting `bullmq_queue_waiting > 50`.

---

## Issue #4 — Ingress lacks TLS in the base layer; dev overlay sends credentials in plaintext

**Area:** `k8s/base/ingress.yaml`, `k8s/overlays/dev/kustomization.yaml`  
**Priority:** High  
**Labels:** security, kubernetes

**Description:**  
The base `Ingress` has no TLS block. The prod overlay adds TLS via cert-manager, but the dev overlay does not. Auth tokens, JWT refresh tokens, and social API credentials are transmitted over plain HTTP in the dev cluster.

**Current behaviour:** Dev traffic is unencrypted end-to-end.

**Expected behaviour:** Even in dev, TLS should be terminated at the ingress using a self-signed cert or a `letsencrypt-staging` issuer.

**Steps:**
1. Add a `tls` block to the dev overlay ingress patch using `cert-manager.io/cluster-issuer: letsencrypt-staging`.
2. Document the cert-manager installation prerequisite in `k8s/README.md`.
3. Add a CI lint step (`kubectl kustomize | conftest verify`) that rejects any ingress without a TLS block.

---

## Issue #5 — `authenticate` middleware reads `JWT_SECRET` from `process.env` directly, bypassing validated config

**Area:** `backend/src/middleware/authenticate.ts`  
**Priority:** High  
**Labels:** security, backend

**Description:**  
`authenticate.ts` defines `const JWT_SECRET = () => process.env.JWT_SECRET ?? 'change-me-in-production'`. This bypasses the Zod-validated `config` singleton in `src/config/config.ts`. If `JWT_SECRET` is absent from the environment the middleware silently falls back to the hardcoded string `'change-me-in-production'`, accepting tokens signed with that known value.

**Current behaviour:** Missing `JWT_SECRET` does not crash the process; it silently weakens authentication.

**Expected behaviour:** Import `config.JWT_SECRET` from the validated config so a missing secret causes a startup failure rather than a silent fallback.

**Steps:**
1. Replace the inline `process.env` read with `import { config } from '../config/config'`.
2. Use `config.JWT_SECRET` directly in the `jwt.verify` call.
3. Remove the `?? 'change-me-in-production'` fallback entirely.
4. Add a unit test asserting that the middleware rejects tokens when the secret is wrong.

---

## Issue #6 — Rate limiters use in-memory store in development; distributed deployments share no state

**Area:** `backend/src/middleware/rateLimit.ts`  
**Priority:** Medium  
**Labels:** security, backend

**Description:**  
`buildStore()` returns `undefined` (memory store) when `NODE_ENV !== 'production'`. The dev overlay runs a single replica so this is harmless there, but staging environments that run multiple replicas (or any environment where `NODE_ENV` is not exactly `'production'`) will have per-pod rate limit counters, making the limits trivially bypassable.

**Current behaviour:** Rate limits are per-pod in non-production environments.

**Expected behaviour:** Use the Redis store whenever Redis is reachable, regardless of `NODE_ENV`. Gate on a dedicated `RATE_LIMIT_REDIS` env flag or simply always attempt Redis and fall back gracefully.

**Steps:**
1. Change the condition in `buildStore()` from `NODE_ENV !== 'production'` to attempt Redis unconditionally.
2. Keep the graceful fallback to memory store if the Redis import fails.
3. Add `RATE_LIMIT_STORE=redis|memory` to `.env.example` and the config schema.

---

## Issue #7 — `openapi.yaml` is empty; no machine-readable API contract exists

**Area:** `backend/openapi.yaml`  
**Priority:** Medium  
**Labels:** documentation, dx

**Description:**  
`backend/openapi.yaml` is a 0-byte file. The backend exposes ~25 route files covering auth, billing, social platforms, analytics, webhooks, AI, TTS, video, and more. Without an OpenAPI spec, client SDK generation, contract testing, and API documentation are impossible.

**Current behaviour:** No API contract; frontend and third-party integrators must read source code.

**Expected behaviour:** A complete OpenAPI 3.1 spec covering all `/api/v1` routes, request/response schemas, and security definitions.

**Steps:**
1. Install `swagger-jsdoc` or `tsoa` and annotate route handlers.
2. Generate `openapi.yaml` as part of the build step.
3. Serve the spec at `/api/v1/openapi.json` and add Swagger UI at `/api/v1/docs`.
4. Add a CI step that fails if the generated spec diverges from the committed file.

---

## Issue #8 — `src/components/WebhookManager.tsx` is an empty file

**Area:** `src/components/WebhookManager.tsx`  
**Priority:** Medium  
**Labels:** frontend, incomplete

**Description:**  
`WebhookManager.tsx` is 0 bytes. The backend has a full webhook module (`backend/src/modules/webhook/`), webhook routes, a `WebhookDispatcher` service, and Zod schemas. The frontend has no UI for managing webhooks.

**Current behaviour:** Users cannot create, list, test, or delete webhooks from the dashboard.

**Expected behaviour:** A `WebhookManager` component that lists registered webhooks, allows creation with endpoint URL + event type selection, shows delivery logs, and supports manual retrigger.

**Steps:**
1. Implement `WebhookManager.tsx` using the existing `src/api/services/WebhooksService.ts` client.
2. Add event-type checkboxes sourced from `src/schemas/webhooks.ts`.
3. Display last-delivery status and HTTP response code per webhook.
4. Wire the component into the dashboard layout.

---

## Issue #9 — `backend/src/routes/predictive.ts` is empty; predictive reach API is unreachable

**Area:** `backend/src/routes/predictive.ts`  
**Priority:** Medium  
**Labels:** backend, incomplete

**Description:**  
`backend/src/routes/predictive.ts` is 0 bytes. `backend/src/services/PredictiveService.ts` (17 KB) implements full predictive reach logic, and the frontend has `src/services/PredictiveService.ts`, `src/hooks/usePredictiveReach.ts`, and `src/components/dashboard/PredictiveReachDashboard.tsx`. The route file that would wire the service to HTTP is missing.

**Current behaviour:** All predictive reach API calls return 404.

**Expected behaviour:** REST endpoints for `POST /api/v1/predictive/reach` and `GET /api/v1/predictive/history/:postId` backed by `PredictiveService`.

**Steps:**
1. Implement `backend/src/routes/predictive.ts` with the two endpoints above.
2. Apply `authenticate` and `generalLimiter` middleware.
3. Register the router in `backend/src/routes/v1/index.ts`.
4. Add integration tests covering the happy path and validation errors.

---

## Issue #10 — Prisma schema has no `AuditLog` model despite `AuditLogger` service writing audit records

**Area:** `backend/prisma/schema.prisma`, `backend/src/services/AuditLogger.ts`  
**Priority:** High  
**Labels:** backend, data-integrity

**Description:**  
`backend/src/services/AuditLogger.ts` and `backend/src/models/AuditLog.ts` exist and are used throughout the codebase, but the Prisma schema contains no `AuditLog` model. Audit writes either fail silently or use a raw query that is not type-safe.

**Current behaviour:** Audit log writes are not persisted to the database via Prisma's type-safe client.

**Expected behaviour:** An `AuditLog` model in `schema.prisma` with fields for `id`, `userId`, `action`, `resource`, `resourceId`, `metadata` (JSON), `ipAddress`, `userAgent`, and `createdAt`, plus appropriate indexes.

**Steps:**
1. Add the `AuditLog` model to `backend/prisma/schema.prisma`.
2. Run `prisma migrate dev --name add_audit_log`.
3. Update `AuditLogger.ts` to use `prisma.auditLog.create`.
4. Add a composite index on `(userId, createdAt)` and `(resource, resourceId)`.

---

## Issue #11 — No `PodDisruptionBudget` defined; rolling updates can take all replicas offline simultaneously

**Area:** `k8s/base/`  
**Priority:** High  
**Labels:** reliability, kubernetes

**Description:**  
There is no `PodDisruptionBudget` (PDB) manifest in `k8s/base/` or either overlay. During a `kubectl rollout` or a node drain, Kubernetes may terminate all running pods simultaneously if the deployment controller and the cluster autoscaler act concurrently, causing a complete service outage.

**Current behaviour:** No minimum availability guarantee during voluntary disruptions.

**Expected behaviour:** A PDB with `minAvailable: 1` (base/dev) and `minAvailable: 2` (prod overlay) ensures at least one pod is always serving traffic.

**Steps:**
1. Create `k8s/base/pdb.yaml` with `minAvailable: 1`.
2. Add a prod overlay patch raising it to `minAvailable: 2`.
3. Add `pdb.yaml` to `k8s/base/kustomization.yaml`.

---

## Issue #12 — No `NetworkPolicy` defined; any pod in the cluster can reach the backend directly

**Area:** `k8s/base/`  
**Priority:** High  
**Labels:** security, kubernetes

**Description:**  
No `NetworkPolicy` manifests exist. By default Kubernetes allows all pod-to-pod traffic. Any compromised workload in the cluster can reach the backend's port 3001, the Redis port, and the PostgreSQL port without restriction.

**Current behaviour:** Unrestricted east-west traffic within the cluster.

**Expected behaviour:** A `NetworkPolicy` that allows ingress to the backend only from the ingress controller namespace, and egress only to Redis and PostgreSQL CIDRs/selectors.

**Steps:**
1. Create `k8s/base/networkpolicy.yaml` with ingress rules scoped to the ingress-nginx namespace label.
2. Add egress rules permitting DNS (UDP 53), Redis (TCP 6379), and PostgreSQL (TCP 5432).
3. Deny all other ingress and egress by default.
4. Add the manifest to `kustomization.yaml`.

---

## Issue #13 — CI/CD pipeline deploys to Vercel but the project is a Node.js/Express backend

**Area:** `.github/workflows/ci-cd.yaml`  
**Priority:** High  
**Labels:** ci-cd, infrastructure

**Description:**  
The `ci-cd.yaml` workflow deploys via `vercel deploy`. Vercel is a frontend/serverless platform. The backend is a long-running Express server with BullMQ workers, Socket.io, Prisma, and Redis connections — none of which are compatible with Vercel's serverless execution model. The AWS App Runner and Heroku options are commented out.

**Current behaviour:** The deployment target is incompatible with the application architecture.

**Expected behaviour:** The pipeline should build a Docker image, push it to a container registry, and deploy to the Kubernetes cluster using `kubectl apply -k k8s/overlays/prod` (or equivalent GitOps tooling like Argo CD).

**Steps:**
1. Replace the Vercel deploy step with: Docker build → push to GHCR → `kubectl set image` or Argo CD sync.
2. Add `KUBECONFIG` as a GitHub Actions secret.
3. Add a smoke-test step that polls `/health` after deployment.
4. Remove the commented-out Vercel/Heroku/App Runner alternatives to reduce confusion.

---

## Issue #14 — `redisClient` in `queueManager.ts` reads `process.env` directly, duplicating config logic

**Area:** `backend/src/queues/queueManager.ts`  
**Priority:** Medium  
**Labels:** backend, code-quality

**Description:**  
`queueManager.ts` exports a `redisClient` instance built from raw `process.env.REDIS_HOST`, `process.env.REDIS_PORT`, and `process.env.REDIS_PASSWORD` reads, bypassing the validated `config` singleton. This creates a second, unvalidated Redis connection path that can silently use wrong values.

**Current behaviour:** Two separate Redis connection code paths exist; one validated, one not.

**Expected behaviour:** All Redis connections should be created through a single factory that reads from `config`, ensuring validation at startup.

**Steps:**
1. Create `backend/src/lib/redis.ts` exporting a singleton `ioredis` client built from `config`.
2. Replace the inline `new Redis(process.env.*)` in `queueManager.ts` with the shared client.
3. Update `backend/src/config/runtime.ts` (`getRedisConnection`) to also use `config`.

---

## Issue #15 — `CircuitBreakerService` uses `console.warn/error/info` instead of the structured logger

**Area:** `backend/src/services/CircuitBreakerService.ts`  
**Priority:** Low  
**Labels:** observability, backend

**Description:**  
All event listeners in `CircuitBreakerService.setupEventListeners` use `console.warn`, `console.error`, `console.info`, and `console.debug`. The rest of the application uses the Winston-based structured logger from `backend/src/lib/logger.ts`, which emits JSON with request IDs, trace IDs, and log levels compatible with the ELK stack.

**Current behaviour:** Circuit breaker events are not captured by the log aggregation pipeline.

**Expected behaviour:** Replace all `console.*` calls with `createLogger('circuit-breaker')` calls so events appear in Kibana with full context.

**Steps:**
1. Import `createLogger` from `../lib/logger` in `CircuitBreakerService.ts`.
2. Replace every `console.*` call with the appropriate logger method.
3. Apply the same fix to `queueManager.ts` which also uses `console.log/error/warn`.

---

## Issue #16 — No `readinessProbe` timeout configured; slow `/health` responses are not detected

**Area:** `k8s/base/deployment.yaml`  
**Priority:** Medium  
**Labels:** reliability, kubernetes

**Description:**  
The `readinessProbe` and `livenessProbe` blocks do not set `timeoutSeconds`. The Kubernetes default is 1 second. The `/health` endpoint in `app.ts` is a simple JSON response, but under database connection saturation or GC pauses it can take several seconds to respond, causing the probe to time out and the pod to be marked unready or killed.

**Current behaviour:** Probes time out after 1 s by default; transient slowness causes unnecessary pod restarts.

**Expected behaviour:** Set `timeoutSeconds: 5` on both probes to tolerate brief latency spikes without triggering restarts.

**Steps:**
1. Add `timeoutSeconds: 5` to both `readinessProbe` and `livenessProbe` in `k8s/base/deployment.yaml`.
2. Consider a dedicated `/healthz/live` (lightweight) vs `/healthz/ready` (checks DB + Redis) split.

---

## Issue #17 — `Listing` model has no `organizationId`; listings are user-scoped but org-scoped posts exist

**Area:** `backend/prisma/schema.prisma`  
**Priority:** Medium  
**Labels:** backend, data-model

**Description:**  
`Post` and `AnalyticsEntry` are scoped to an `Organization`, but `Listing` is scoped only to a `User` (via `mentorId`). The org-scoping Prisma middleware in `backend/src/lib/prisma.ts` does not cover `Listing`. If the platform supports multi-user organisations, listings created by one member are visible to all users regardless of org membership.

**Current behaviour:** Listings are not isolated per organisation.

**Expected behaviour:** Add `organizationId` to `Listing`, add it to `ORG_SCOPED_MODELS` in `prisma.ts`, and migrate existing data.

**Steps:**
1. Add `organizationId String?` and the `Organization` relation to the `Listing` model.
2. Create a migration that backfills `organizationId` from the listing owner's primary org.
3. Add `'Listing'` to `ORG_SCOPED_MODELS` in `backend/src/lib/prisma.ts`.
4. Update `ListingService` and `ListingController` to pass `__orgId`.

---

## Issue #18 — `DATA_PRUNING_ENABLED` env var transform inverts the expected boolean

**Area:** `backend/src/config/config.ts`  
**Priority:** High  
**Labels:** backend, bug

**Description:**  
The schema defines:
```ts
DATA_PRUNING_ENABLED: z.string().optional().transform((v) => v !== 'false'),
```
When `DATA_PRUNING_ENABLED` is **not set** (undefined), `v` is `undefined`, and `undefined !== 'false'` evaluates to `true`. This means pruning is enabled by default even when the variable is absent, which is the intended behaviour. However, setting `DATA_PRUNING_ENABLED=0` or `DATA_PRUNING_ENABLED=no` will also enable pruning because neither equals the string `'false'`. Only the exact string `'false'` disables it, which is undocumented and surprising.

**Current behaviour:** Any value other than the exact string `'false'` enables pruning, including `'0'`, `'no'`, `'off'`.

**Expected behaviour:** Use a standard boolean coercion: `z.coerce.boolean().default(true)` or explicitly accept `'true'|'false'|'1'|'0'`.

**Steps:**
1. Replace the transform with `z.enum(['true','false','1','0']).optional().transform(v => v !== 'false' && v !== '0').default(true)`.
2. Update `.env.example` to document accepted values.
3. Add a config unit test covering `'0'`, `'false'`, `'no'`, and undefined.

---

## Issue #19 — No `imagePullPolicy: Always` or image digest pinning in production overlay

**Area:** `k8s/overlays/prod/kustomization.yaml`  
**Priority:** Medium  
**Labels:** kubernetes, reliability

**Description:**  
The base deployment uses `imagePullPolicy: IfNotPresent` and the image tag `socialflow-backend:latest`. The prod overlay does not override either. In production, `IfNotPresent` with `latest` means a node that already has a cached `latest` image will never pull the updated image after a new push, silently running stale code.

**Current behaviour:** Production pods may run outdated images after a new release.

**Expected behaviour:** Production should pin images to a specific digest or tag (e.g. `ghcr.io/org/socialflow-backend:v1.2.3@sha256:...`) and use `imagePullPolicy: Always` or digest-based pinning.

**Steps:**
1. Add an `images:` block to the prod overlay kustomization that sets the image to a CI-injected tag.
2. Override `imagePullPolicy: Always` in the prod deployment patch.
3. Document the `kustomize edit set image` command in the CI pipeline.

---

## Issue #20 — `gracefulShutdown` does not close the `redisClient` exported from `queueManager.ts`

**Area:** `backend/src/server.ts`, `backend/src/queues/queueManager.ts`  
**Priority:** Medium  
**Labels:** backend, reliability

**Description:**  
`server.ts` calls `queueManager.closeAll()` during shutdown, which closes BullMQ queues and workers. However, the standalone `redisClient` exported from `queueManager.ts` (used for direct Redis operations) is never explicitly closed. This leaves an open TCP connection to Redis after the process signals readiness to exit, potentially delaying pod termination and causing Kubernetes to send SIGKILL after the grace period.

**Current behaviour:** Redis client connection leaks on graceful shutdown.

**Expected behaviour:** `redisClient.quit()` should be called during the shutdown sequence.

**Steps:**
1. Export a `closeRedisClient()` function from `queueManager.ts` that calls `redisClient.quit()`.
2. Call it in `gracefulShutdown` after `queueManager.closeAll()`.
3. Add a test that verifies no open handles remain after shutdown.

---

## Issue #21 — No `terminationGracePeriodSeconds` set; Kubernetes default (30 s) may be too short

**Area:** `k8s/base/deployment.yaml`  
**Priority:** Medium  
**Labels:** reliability, kubernetes

**Description:**  
`server.ts` sets a 30-second force-exit timeout inside the application. Kubernetes also has a default `terminationGracePeriodSeconds` of 30 s. If the application's internal timeout and Kubernetes's pod termination deadline are identical, there is no buffer — Kubernetes sends SIGKILL at exactly the same moment the app tries to log "Shutdown complete", potentially corrupting in-flight BullMQ jobs.

**Current behaviour:** Race condition between app-level and cluster-level shutdown timeouts.

**Expected behaviour:** Set `terminationGracePeriodSeconds: 60` in the deployment spec so Kubernetes waits longer than the app's internal 30-second timeout, giving the app time to finish cleanly before SIGKILL.

**Steps:**
1. Add `terminationGracePeriodSeconds: 60` to the pod spec in `k8s/base/deployment.yaml`.
2. Optionally increase the prod overlay to 90 s to account for longer queue drain times.

---

## Issue #22 — `configmap.yaml` missing `REDIS_HOST` and `OTEL_EXPORTER_OTLP_ENDPOINT`; pods rely on secret for Redis host

**Area:** `k8s/base/configmap.yaml`, `k8s/base/secret.yaml`  
**Priority:** Medium  
**Labels:** kubernetes, configuration

**Description:**  
`REDIS_HOST` is placed in `secret.yaml` (`stringData`) rather than `configmap.yaml`. Redis hostnames are not sensitive — only `REDIS_PASSWORD` is. Mixing non-sensitive config into the secret makes it harder to rotate secrets independently and prevents GitOps tools from diffing config changes. Similarly, `OTEL_EXPORTER_OTLP_ENDPOINT` is absent from both files, so the default `http://localhost:4318/v1/traces` is used, which is wrong in a cluster.

**Current behaviour:** Non-sensitive `REDIS_HOST` is stored as a secret; OTLP endpoint is not configurable via manifests.

**Expected behaviour:** Move `REDIS_HOST` to `configmap.yaml`. Add `OTEL_EXPORTER_OTLP_ENDPOINT` pointing to the in-cluster collector. Keep only `REDIS_PASSWORD` in the secret.

**Steps:**
1. Move `REDIS_HOST` from `secret.yaml` to `configmap.yaml`.
2. Add `OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel-collector.monitoring:4318/v1/traces"` to `configmap.yaml`.
3. Update the prod overlay to override the OTLP endpoint if the collector lives in a different namespace.

---

## Issue #23 — `authMiddleware.ts` and `authenticate.ts` are two separate auth middlewares with overlapping logic

**Area:** `backend/src/middleware/authMiddleware.ts`, `backend/src/middleware/authenticate.ts`  
**Priority:** Medium  
**Labels:** backend, code-quality

**Description:**  
Two files implement JWT authentication: `authMiddleware.ts` and `authenticate.ts`. Both verify a Bearer token and attach `req.user`. `authenticate.ts` additionally checks the token blacklist via `AuthBlacklistService`. Routes may accidentally use the weaker `authMiddleware.ts` (without blacklist check), allowing revoked tokens to authenticate.

**Current behaviour:** Two auth middlewares exist; the weaker one may be used on sensitive routes.

**Expected behaviour:** Consolidate into a single `authenticate` middleware that always checks the blacklist. Remove `authMiddleware.ts`.

**Steps:**
1. Audit all route files to identify which middleware they import.
2. Replace all `authMiddleware` imports with `authenticate`.
3. Delete `authMiddleware.ts`.
4. Add a lint rule (or barrel export) that prevents importing the deleted file.

---

## Issue #24 — No `preStop` lifecycle hook; in-flight requests are dropped during rolling updates

**Area:** `k8s/base/deployment.yaml`  
**Priority:** Medium  
**Labels:** reliability, kubernetes

**Description:**  
During a rolling update Kubernetes removes the pod from the Service endpoints and then sends SIGTERM. There is a race: the load balancer may still route requests to the pod for a few seconds after SIGTERM is received. Without a `preStop` sleep, those requests are dropped with a connection reset.

**Current behaviour:** In-flight requests during rolling updates may receive connection resets.

**Expected behaviour:** Add a `preStop: exec: command: ["sleep", "5"]` hook to give the load balancer time to drain connections before SIGTERM is sent.

**Steps:**
1. Add a `lifecycle.preStop` hook with a 5-second sleep to the container spec in `k8s/base/deployment.yaml`.
2. Ensure `terminationGracePeriodSeconds` (Issue #21) accounts for the extra 5 s.

---

## Issue #25 — `package.json` at root and `backend/package.json` both exist; monorepo tooling is not configured

**Area:** `/workspaces/socialflow-ai-dashboard/package.json`, `backend/package.json`  
**Priority:** Medium  
**Labels:** dx, infrastructure

**Description:**  
The repository has two `package.json` files and two `node_modules` trees but no workspace configuration (no `workspaces` field, no `pnpm-workspace.yaml`, no Turborepo config). The root `jest.config.js` and `backend/jest.config.json` are separate. CI runs `npm ci` at the root but the backend has its own lockfile. This leads to inconsistent dependency versions and confusing `npm run` commands.

**Current behaviour:** Two independent npm projects in the same repo with no shared tooling.

**Expected behaviour:** Configure npm workspaces (or migrate to pnpm/Turborepo) so `npm ci` at the root installs all dependencies and `npm test` runs all test suites.

**Steps:**
1. Add `"workspaces": ["backend", "services", "src"]` to the root `package.json`.
2. Consolidate `jest.config.js` files using Jest projects.
3. Update CI to run a single `npm ci` and `npm test` from the root.

---

## Issue #26 — `backend/src/routes/v1/` directory exists but its contents are not visible; route registration may be incomplete

**Area:** `backend/src/routes/v1/`  
**Priority:** Medium  
**Labels:** backend, routing

**Description:**  
The `v1` subdirectory under routes is referenced in `app.ts` (`import v1Router from './routes/v1'`) but the directory listing shows it as a leaf with no visible files beyond the directory itself. Several route files (`predictive.ts`, `organizations.ts`, `posts.ts`) are stubs or empty. It is unclear which routes are actually registered under `/api/v1`.

**Current behaviour:** Route registration is opaque; some endpoints may be silently missing.

**Expected behaviour:** A clear `index.ts` in `routes/v1/` that explicitly registers every sub-router, with a comment for each one indicating its mount path and auth requirements.

**Steps:**
1. Audit `backend/src/routes/v1/index.ts` and list all registered routers.
2. For each empty/stub route file, either implement it or remove it and document the gap.
3. Add an integration test that asserts the expected set of routes returns non-404 responses.

---

## Issue #27 — `Dockerfile` at root and `backend/Dockerfile` may be out of sync

**Area:** `Dockerfile`, `backend/Dockerfile`  
**Priority:** Low  
**Labels:** infrastructure, dx

**Description:**  
Two Dockerfiles exist: one at the repo root and one in `backend/`. The k8s deployment references `socialflow-backend:latest` without specifying which Dockerfile builds it. If CI builds the root `Dockerfile` but the backend `Dockerfile` has different build steps (e.g. different Node version, different `COPY` paths), the deployed image may not match what developers test locally.

**Current behaviour:** Ambiguity about which Dockerfile is canonical for the backend image.

**Expected behaviour:** A single canonical `Dockerfile` for the backend, referenced explicitly in CI and in `k8s/README.md`.

**Steps:**
1. Compare both Dockerfiles and merge into `backend/Dockerfile`.
2. Remove or repurpose the root `Dockerfile` (e.g. for a future frontend image).
3. Update CI and `k8s/README.md` to reference `backend/Dockerfile` explicitly.

---

## Issue #28 — No `ResourceQuota` or `LimitRange` in namespaces; a runaway pod can starve the cluster

**Area:** `k8s/overlays/dev/`, `k8s/overlays/prod/`  
**Priority:** Medium  
**Labels:** kubernetes, reliability

**Description:**  
Neither overlay defines a `ResourceQuota` or `LimitRange` for its namespace. If a bug causes a pod to consume unbounded memory (e.g. a memory leak in the BullMQ worker or a large video transcoding job), it can OOM-kill other workloads in the same cluster.

**Current behaviour:** No namespace-level resource caps.

**Expected behaviour:** A `LimitRange` that sets default requests/limits for containers that omit them, and a `ResourceQuota` capping total CPU and memory per namespace.

**Steps:**
1. Create `k8s/overlays/dev/limitrange.yaml` and `k8s/overlays/prod/limitrange.yaml`.
2. Create matching `resourcequota.yaml` files.
3. Add them to the respective `kustomization.yaml` files.

---

## Issue #29 — `TranslationService` (backend) and `TranslationService` (frontend) are separate implementations with no shared types

**Area:** `backend/src/services/TranslationService.ts`, `src/services/TranslationService.ts`  
**Priority:** Medium  
**Labels:** code-quality, dx

**Description:**  
Both the backend (`backend/src/services/TranslationService.ts`, 8 KB) and the frontend (`src/services/TranslationService.ts`, 19 KB) implement translation logic independently. The backend types (`backend/src/types/translation.ts`) and frontend types (`src/types/translation.ts`) are also separate files with overlapping but potentially divergent definitions.

**Current behaviour:** Type drift between frontend and backend translation contracts is possible and not caught at compile time.

**Expected behaviour:** Shared types should live in a `packages/shared` workspace package imported by both. The frontend service should be a thin API client, not a reimplementation.

**Steps:**
1. Create `packages/shared/src/types/translation.ts` with the canonical types.
2. Update both `TranslationService` implementations to import from the shared package.
3. Delete the duplicate type files.

---

## Issue #30 — `PredictiveService` (frontend) duplicates ML scoring logic that belongs in the backend

**Area:** `src/services/PredictiveService.ts` (23 KB)  
**Priority:** Medium  
**Labels:** architecture, security

**Description:**  
The frontend `PredictiveService.ts` (23 KB) contains substantial scoring and ML-related logic. Running prediction logic in the browser exposes the model weights/heuristics to end users, makes it impossible to update the model without a frontend deploy, and produces inconsistent results if the backend `PredictiveService.ts` (17 KB) uses different parameters.

**Current behaviour:** Prediction logic is duplicated across frontend and backend.

**Expected behaviour:** The frontend should call the backend predictive API (once Issue #9 is resolved) and render results. All scoring logic should live exclusively in the backend.

**Steps:**
1. Resolve Issue #9 (implement `backend/src/routes/predictive.ts`).
2. Replace `src/services/PredictiveService.ts` with a thin wrapper around `src/api/services/` calls.
3. Remove the duplicated scoring algorithms from the frontend bundle.

---

## Issue #31 — `prisma/schema.prisma` at root is a minimal stub; backend uses `backend/prisma/schema.prisma`

**Area:** `prisma/schema.prisma`, `backend/prisma/schema.prisma`  
**Priority:** Low  
**Labels:** backend, dx

**Description:**  
The root `prisma/schema.prisma` (685 bytes) defines only `User`, `Listing`, and `PasswordHistory` — a subset of the full schema in `backend/prisma/schema.prisma` (3.3 KB). The root schema has no `datasource url` value set. Running `prisma generate` or `prisma migrate` from the repo root will use the wrong schema, potentially overwriting the backend client or producing confusing errors.

**Current behaviour:** Two Prisma schemas exist; the root one is a stale, incomplete copy.

**Expected behaviour:** Remove the root `prisma/` directory or replace it with a symlink/reference to `backend/prisma/`. All Prisma commands should be run from `backend/`.

**Steps:**
1. Delete `prisma/schema.prisma` and `prisma/seed.ts` from the repo root.
2. Update root `package.json` scripts to delegate Prisma commands to `backend/`.
3. Add a root `.npmrc` or `package.json` `prisma` field pointing to `backend/prisma/schema.prisma` if needed.

---

## Issue #32 — `backend/src/middleware/prismaSoftDelete.ts` does not filter soft-deleted records in `findUnique`

**Area:** `backend/src/middleware/prismaSoftDelete.ts`  
**Priority:** High  
**Labels:** backend, bug

**Description:**  
Soft-delete middleware typically intercepts `findMany` and `findFirst` to add `deletedAt: null` to the `where` clause. `findUnique` is often missed because it requires a unique field in the `where` clause and Prisma does not allow adding arbitrary filters to it. If `findUnique` is not handled, deleted records can be fetched by ID, allowing access to soft-deleted users, listings, or posts.

**Current behaviour:** `findUnique` may return soft-deleted records.

**Expected behaviour:** The middleware should rewrite `findUnique` calls to `findFirst` with the original unique constraint plus `deletedAt: null`.

**Steps:**
1. Read `backend/src/middleware/prismaSoftDelete.ts` and confirm whether `findUnique` is handled.
2. If not, add a case that converts `findUnique` → `findFirst` with `deletedAt: null` appended.
3. Add a unit test (`backend/src/tests/prismaSoftDelete.test.ts` already exists — extend it).

---

## Issue #33 — No `SECURITY.md` or responsible disclosure policy

**Area:** Repository root  
**Priority:** Low  
**Labels:** security, documentation

**Description:**  
The repository has no `SECURITY.md` file. GitHub's security advisory feature and automated vulnerability scanners look for this file to determine how to report vulnerabilities. Given the application handles OAuth tokens, JWT secrets, Stripe billing, and social media credentials, a clear disclosure policy is important.

**Current behaviour:** No security contact or disclosure process documented.

**Expected behaviour:** A `SECURITY.md` at the repo root describing supported versions, how to report a vulnerability (private email or GitHub private advisory), and the expected response timeline.

**Steps:**
1. Create `SECURITY.md` following the GitHub recommended template.
2. Add a link to it from `README.md`.

---

## Issue #34 — `perf-tests/load-test.js` hardcodes `http://localhost:3001`; cannot be run against staging/prod

**Area:** `perf-tests/load-test.js`  
**Priority:** Low  
**Labels:** testing, dx

**Description:**  
The k6 load test script hardcodes `http://localhost:3001` as the target URL. It cannot be pointed at the staging or production cluster without editing the file, making it impossible to run load tests in CI against a deployed environment.

**Current behaviour:** Load tests only work locally.

**Expected behaviour:** The target URL should be read from a `BASE_URL` environment variable with `localhost:3001` as the default.

**Steps:**
1. Replace the hardcoded URL with `` `${__ENV.BASE_URL || 'http://localhost:3001'}` ``.
2. Add a CI job that runs the load test against the staging URL after deployment.
3. Document the `BASE_URL` variable in `perf-tests/README.md`.

---

## Issue #35 — `backend/src/services/UserServiceExample.ts` is an example file committed to production source

**Area:** `backend/src/services/UserServiceExample.ts`  
**Priority:** Low  
**Labels:** code-quality, dx

**Description:**  
`UserServiceExample.ts` (2.7 KB) is an example/demo file that lives alongside production service files. It is likely imported nowhere but adds noise to the codebase, may confuse new contributors, and could accidentally be imported in the future.

**Current behaviour:** Example file lives in the production source tree.

**Expected behaviour:** Move it to `backend/examples/` or delete it if it duplicates existing examples.

**Steps:**
1. Check if `UserServiceExample.ts` is imported anywhere (`grep -r UserServiceExample`).
2. If not imported, move it to `backend/examples/` or delete it.
3. Add an ESLint rule or CI check that prevents files named `*Example.ts` from living in `src/`.

---

## Issue #36 — `backend/src/lib/readReplica.ts` applies read/write splitting but no replica URL is configured in the schema or env

**Area:** `backend/src/lib/readReplica.ts`, `backend/src/config/config.ts`  
**Priority:** Medium  
**Labels:** backend, configuration

**Description:**  
`prisma.ts` calls `applyReadWriteSplitting(client)` from `readReplica.ts` (6 KB). However, `config.ts` has no `DATABASE_REPLICA_URL` or equivalent variable, and `backend/prisma/schema.prisma` defines only a single `datasource db`. Without a replica URL configured, the read/write splitting middleware either silently no-ops or throws at runtime.

**Current behaviour:** Read/write splitting is wired up but has no replica to route reads to.

**Expected behaviour:** Add `DATABASE_REPLICA_URL` as an optional config variable. If absent, `applyReadWriteSplitting` should be a no-op. Document the replica setup in `README.md`.

**Steps:**
1. Add `DATABASE_REPLICA_URL: z.string().url().optional()` to the config schema.
2. Update `readReplica.ts` to check for the variable and skip splitting if absent.
3. Add `DATABASE_REPLICA_URL` to `.env.example` with a comment.

---

## Issue #37 — `backend/src/modules/` and `backend/src/routes/` both contain business logic; architecture is inconsistent

**Area:** `backend/src/modules/`, `backend/src/routes/`  
**Priority:** Medium  
**Labels:** architecture, code-quality

**Description:**  
The codebase has two parallel structures: `src/modules/` (containing `auth`, `billing`, `content`, `social`, `analytics`, `health`, `organization`, `webhook`) and `src/routes/` (containing 25+ individual route files). Some features (e.g. auth, billing) have both a module and a route file; others exist only in routes. This inconsistency makes it hard to know where to add new features.

**Current behaviour:** No clear architectural boundary between modules and routes.

**Expected behaviour:** Adopt a consistent module structure: each feature lives in `src/modules/<feature>/` with its own `router.ts`, `service.ts`, `controller.ts`, and `schema.ts`. Standalone route files in `src/routes/` should be migrated into modules.

**Steps:**
1. Document the target architecture in `backend/docs/architecture.md`.
2. Create a migration plan to move standalone route files into modules incrementally.
3. Add an ESLint rule that prevents new files from being added directly to `src/routes/`.

---

## Issue #38 — `backend/src/services/ModerationService.ts` exists but is not wired to any route or queue

**Area:** `backend/src/services/ModerationService.ts`  
**Priority:** Medium  
**Labels:** backend, incomplete

**Description:**  
`ModerationService.ts` (3.3 KB) implements content moderation logic but there is no route, queue job, or middleware that calls it. Posts created via `PostController.ts` are not moderated before being scheduled or published.

**Current behaviour:** Content moderation is implemented but never invoked.

**Expected behaviour:** Moderation should be called as part of the post creation flow, either synchronously (blocking publish) or asynchronously via a BullMQ job before the post is dispatched to social platforms.

**Steps:**
1. Add a `moderation` job to the appropriate queue (e.g. `socialQueue`).
2. Call `ModerationService.moderate(post)` in the job processor before dispatching.
3. Update `Post` model to include a `moderationStatus` field (`pending | approved | rejected`).
4. Block scheduling of posts with `moderationStatus !== 'approved'`.

---

## Issue #39 — `backend/src/services/FeatureService.ts` uses `DynamicConfig` but there is no admin UI or API to manage feature flags

**Area:** `backend/src/services/FeatureService.ts`, `backend/src/services/DynamicConfigService.ts`  
**Priority:** Low  
**Labels:** backend, incomplete

**Description:**  
`FeatureService.ts` (4.2 KB) reads feature flags from `DynamicConfig` (stored in the database). `DynamicConfigService.ts` (5 KB) provides CRUD for config values. The `config` route (`backend/src/routes/config.ts`) exposes some endpoints, but there is no admin-protected route for managing feature flags, and the `DynamicConfig` model has no access control — any authenticated user who discovers the endpoint can toggle feature flags.

**Current behaviour:** Feature flags are modifiable by any authenticated user.

**Expected behaviour:** Feature flag management endpoints should require an `admin` role check via `checkPermission` middleware.

**Steps:**
1. Apply `checkPermission('admin')` middleware to all write endpoints in `backend/src/routes/config.ts`.
2. Add an audit log entry whenever a feature flag is changed.
3. Add integration tests verifying that non-admin users receive 403.

---

## Issue #40 — No Kubernetes `ServiceAccount` defined; pods run with the default service account

**Area:** `k8s/base/`  
**Priority:** Medium  
**Labels:** security, kubernetes

**Description:**  
No `ServiceAccount` manifest exists in `k8s/base/`. Pods run with the `default` service account, which in many clusters has broad RBAC permissions or is shared with other workloads. If the pod is compromised, an attacker can use the mounted service account token to interact with the Kubernetes API.

**Current behaviour:** Backend pods use the default service account with potentially broad permissions.

**Expected behaviour:** Create a dedicated `ServiceAccount` for the backend with no RBAC bindings (principle of least privilege). Set `automountServiceAccountToken: false` since the backend does not need to call the Kubernetes API.

**Steps:**
1. Create `k8s/base/serviceaccount.yaml` with `automountServiceAccountToken: false`.
2. Reference it in the deployment pod spec via `serviceAccountName: socialflow-backend`.
3. Add `serviceaccount.yaml` to `k8s/base/kustomization.yaml`.
4. Verify no existing code relies on the in-cluster Kubernetes API token.
