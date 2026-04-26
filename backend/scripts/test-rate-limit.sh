#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# test-rate-limit.sh
# Verifies that rate limiting returns HTTP 429 after the defined threshold.
#
# Usage:
#   ./scripts/test-rate-limit.sh [BASE_URL]
#
# Defaults to http://localhost:3001 if BASE_URL is not provided.
# ---------------------------------------------------------------------------

BASE_URL="${1:-http://localhost:3001}"
PASS=0
FAIL=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo "  ✓ $label (got $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Rate Limit Tests against $BASE_URL ==="
echo ""

# ---------------------------------------------------------------------------
# 1. Auth limiter — threshold: 10 req / 15 min
#    We send 11 POST /api/auth/login requests and expect the last to be 429.
# ---------------------------------------------------------------------------
echo "── Auth limiter (POST /api/auth/login, limit=10) ──"
last_status=0
for i in $(seq 1 11); do
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrongpassword"}')
  last_status=$status
done
check "11th request returns 429" 429 "$last_status"

# ---------------------------------------------------------------------------
# 2. AI limiter — threshold: 30 req / min
#    We send 31 requests to a protected endpoint (will get 401 normally,
#    but 429 once the limiter kicks in — limiter runs before auth).
# ---------------------------------------------------------------------------
echo ""
echo "── AI limiter (POST /api/ai/analyze-image, limit=30) ──"
last_status=0
for i in $(seq 1 31); do
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/api/ai/analyze-image" \
    -H "Content-Type: application/json" \
    -d '{"imageData":"test"}')
  last_status=$status
done
check "31st request returns 429" 429 "$last_status"

# ---------------------------------------------------------------------------
# 3. General limiter — threshold: 100 req / min
# ---------------------------------------------------------------------------
echo ""
echo "── General limiter (GET /api/health, limit=100) ──"
last_status=0
for i in $(seq 1 101); do
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "$BASE_URL/api/health")
  last_status=$status
done
check "101st request returns 429" 429 "$last_status"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
