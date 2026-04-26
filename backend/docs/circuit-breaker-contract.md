# Circuit Breaker — Client Behaviour Contract

The backend wraps every external API call with [opossum](https://nodeshift.dev/opossum/) circuit breakers. This document defines what clients receive in each breaker state, how to handle it, and what the state transitions look like.

---

## States

| State | Meaning | Requests allowed? |
|-------|---------|-------------------|
| `closed` | Service is healthy. All calls pass through. | Yes |
| `open` | Failure threshold exceeded. Calls are rejected immediately without hitting the upstream. | No — fallback or error returned instantly |
| `half-open` | Cooldown elapsed. One probe request is allowed through to test recovery. | One at a time |

---

## HALF_OPEN state — probe request behaviour

When the cooldown (`resetTimeout`) elapses after a breaker opens, opossum transitions the breaker to **HALF_OPEN** and allows a single probe request through to the upstream service.

### Probe count and success threshold

| Parameter | opossum default | How to override |
|-----------|----------------|-----------------|
| Probe requests allowed | **1** (one at a time) | Not configurable — opossum always uses exactly one probe per half-open window |
| Successes required to close | **1** (the single probe must succeed) | Not configurable in opossum v8; the breaker closes on the first successful probe |
| Probe timeout | Same as `timeout` option | Set a lower `timeout` value in the service config if you want faster probe resolution |

opossum does not expose a `halfOpenRequests` option — the single-probe behaviour is hard-coded in the library. If you need multi-probe confirmation before closing, you must implement a custom wrapper that keeps the breaker open until N consecutive successes are observed.

### Overriding the cooldown (resetTimeout)

Each service config in `backend/src/config/circuitBreaker.config.ts` sets `resetTimeout` (milliseconds before entering HALF_OPEN):

```ts
// Example: shorten the half-open window for twitter to 15 s
const customConfig: Partial<CircuitBreakerConfig> = { resetTimeout: 15000 };
circuitBreakerService.getBreaker('twitter', customConfig);
```

### What happens during HALF_OPEN

1. The breaker allows **exactly one** request through.
2. All other concurrent requests are **rejected immediately** (same as OPEN) until the probe resolves.
3. If the probe **succeeds** → breaker transitions to **CLOSED**, normal traffic resumes.
4. If the probe **fails** → breaker transitions back to **OPEN**, `resetTimeout` resets and the cooldown starts again.

### Per-service resetTimeout reference

| Service | resetTimeout |
|---------|-------------|
| AI (Gemini) | 60 s |
| Translation | 45 s |
| Twitter / X | 30 s |
| Facebook | 60 s |
| Instagram | 60 s |
| YouTube | 60 s |
| TikTok | 60 s |
| LinkedIn | 60 s |
| IPFS | 40 s |
| Price | 60 s |
| Blockchain | 20 s |

---

## Per-service configuration and degraded response contract

Each breaker has its own thresholds and fallback strategy. The table below documents what a client receives when the breaker is **open**.

| Service | Circuit name | Timeout | Opens at | Cooldown | Fallback strategy | Degraded response |
|---------|-------------|---------|----------|----------|-------------------|-------------------|
| AI (Gemini) | `ai-service` | 30 s | 60 % errors / 3 req min | 60 s | Soft — returns caller-supplied fallback string, or throws `CircuitBreakerError` | Caller-provided fallback text, or `500` with `CircuitBreakerError` message |
| Translation | `translation-service` | 15 s | 50 % errors / 5 req min | 45 s | Soft — throws with message `"Translation service unavailable. Returning original text."` | `500` with that message; client should display original untranslated text |
| Twitter / X | `twitter-service` | 10 s | 40 % errors / 5 req min | 30 s | Hard — throws `"Social media API unavailable."` | Timeline / search → empty `[]`; user lookup → `null`; post → `500` |
| Facebook | `facebook-service` | 15 s | 50 % errors / 3 req min | 60 s | Hard — throws `"Facebook API temporarily unavailable."` | Page / comments / insights → empty `[]` or `{ data: [] }`; post → `500` |
| Instagram | `instagram-service` | 20 s | 50 % errors / 3 req min | 60 s | Hard — throws `"Instagram API temporarily unavailable."` | Account lookup / publish → `500` |
| YouTube | `youtube-service` | 15 s | 50 % errors / 3 req min | 60 s | Soft — returns empty collections | Channel info skipped; video stats / list → `[]` |
| TikTok | `tiktok-service` | 60 s | 50 % errors / 3 req min | 60 s | Hard — throws `"TikTok API temporarily unavailable."` | User info / upload / status → `500` |
| LinkedIn | `linkedin-service` | 15 s | 50 % errors / 3 req min | 60 s | Hard — throws `"LinkedIn API temporarily unavailable."` | Profile / post → `500` |
| IPFS | `ipfs-service` | 20 s | 50 % errors / 5 req min | 40 s | Soft — falls back to local storage | Local storage path returned instead of IPFS CID |
| Price | `price-service` | 12 s | 60 % errors / 5 req min | 60 s | Soft — returns cached prices | Stale cached value; client should show "prices may be outdated" |
| Blockchain | `blockchain-service` | 8 s | 30 % errors / 3 req min | 20 s | Hard — throws `"Blockchain network unavailable."` | Transaction rejected; `500` |

"Opens at" means: once the rolling window contains at least the minimum request volume, if the error percentage exceeds the threshold the breaker trips open.

---

## Error response shape

When a breaker is open and no soft fallback is available, the global error handler returns a standard JSON body:

```json
{
  "success": false,
  "code": "INTERNAL_SERVER_ERROR",
  "message": "<service> API temporarily unavailable",
  "requestId": "req_abc123",
  "timestamp": "2026-03-28T12:00:00.000Z"
}
```

For services that use `ServiceUnavailableError` explicitly, the HTTP status is `503` and a `Retry-After` header is included:

```
HTTP/1.1 503 Service Unavailable
Retry-After: 60
Content-Type: application/json

{
  "success": false,
  "code": "SERVICE_UNAVAILABLE",
  "message": "Service unavailable",
  "retryAfter": 60,
  "requestId": "req_abc123",
  "timestamp": "2026-03-28T12:00:00.000Z"
}
```

---

## State transition examples

### Closed → Open

```
t=0   POST /api/v1/posts/twitter  → 200  (success, circuit closed)
t=1   POST /api/v1/posts/twitter  → 500  (Twitter upstream error, failure #1)
t=2   POST /api/v1/posts/twitter  → 500  (failure #2)
t=3   POST /api/v1/posts/twitter  → 500  (failure #3 — 3/3 = 100% > 40% threshold)
      ⚡ Circuit OPENS for twitter-service
t=4   POST /api/v1/posts/twitter  → 500  (rejected instantly, no upstream call)
t=5   GET  /api/v1/twitter/timeline → []  (open, soft fallback: empty array)
```

### Open → Half-open → Closed

```
t=0   Circuit is open (cooldown: 30 s)
      ...30 seconds pass...
t=30  Circuit enters HALF-OPEN
t=31  POST /api/v1/posts/twitter  → upstream called (probe request)
        ↳ upstream returns 200
      ✅ Circuit CLOSES — normal operation resumes
```

### Open → Half-open → Open (probe fails)

```
t=30  Circuit enters HALF-OPEN
t=31  POST /api/v1/posts/twitter  → upstream called (probe request)
        ↳ upstream returns 500
      ⚡ Circuit re-OPENS — cooldown resets to 30 s
t=32  POST /api/v1/posts/twitter  → 500 (rejected instantly again)
```

---

## Client retry guidance

| Scenario | Recommended client behaviour |
|----------|------------------------------|
| Received `503` with `Retry-After` header | Wait exactly `Retry-After` seconds before retrying. Do not retry sooner. |
| Received `500` with message containing "temporarily unavailable" | Apply exponential backoff starting at the service's cooldown period (see table above). |
| Read endpoint returns empty `[]` or `null` | Show a "data temporarily unavailable" UI state. Do not treat as a permanent empty result. Cache the last known good value if available. |
| AI endpoint returns fallback text | Indicate to the user that the response is a default/cached suggestion, not a live AI result. |
| Write endpoint (post, publish, upload) returns `500` | Do not auto-retry writes — the operation may have partially succeeded upstream. Surface the error to the user and let them retry manually. |

### Backoff formula

```
delay = min(cooldown_ms × 2^attempt, max_delay_ms)
```

Recommended `max_delay_ms`: 5 minutes. Add ±10 % jitter to avoid thundering herd when multiple clients recover simultaneously.

---

## Monitoring endpoints

These routes are IP-whitelisted (internal only).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/v1/circuit-breaker/status` | GET | Stats for all breakers (state, failures, latency percentiles) |
| `GET /api/v1/circuit-breaker/status/:service` | GET | Stats for one breaker |
| `GET /api/v1/circuit-breaker/health` | GET | Open/closed health summary for `ai`, `twitter`, `translation` — returns `503` if any circuit is open |
| `POST /api/v1/circuit-breaker/reset` | POST | Reset all breakers to closed (use after upstream recovery is confirmed) |
| `POST /api/v1/circuit-breaker/:service/open` | POST | Manually open a breaker (use for planned maintenance) |
| `POST /api/v1/circuit-breaker/:service/close` | POST | Manually close a breaker |

Example stats response:

```json
{
  "success": true,
  "circuitBreakers": [
    {
      "name": "twitter-service",
      "state": "open",
      "failures": 7,
      "successes": 12,
      "rejects": 3,
      "fires": 22,
      "fallbacks": 3,
      "latency": { "mean": 4200, "median": 3800, "p95": 9100, "p99": 9800 }
    }
  ],
  "timestamp": "2026-03-28T12:00:00.000Z"
}
```

---

## UX checklist for degraded mode

- [ ] Read endpoints that return `[]` or `null` show a non-destructive "unavailable" state, not an empty list that looks like real data.
- [ ] Write endpoints surface the error message to the user with a manual retry option — no silent auto-retry.
- [ ] AI-generated content marked as fallback is visually distinguished from live AI output.
- [ ] `Retry-After` values from `503` responses are respected; retry buttons are disabled until the window expires.
- [ ] The `/api/v1/circuit-breaker/health` endpoint is polled by the ops dashboard to surface open circuits before users report them.
