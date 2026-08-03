#!/usr/bin/env bash
# Smoke test: run with cloud-backend already running (npm start) and MongoDB up.
# Usage: ./scripts/smoke-test.sh [BASE_URL]
# Example: ./scripts/smoke-test.sh http://localhost:3001

set -e
BASE="${1:-http://localhost:3001}"
echo "Smoke testing cloud-backend at $BASE"

# Public endpoints (no auth)
echo "--- GET /status (public)"
curl -sS -o /dev/null -w "%{http_code}" "$BASE/status" | grep -q 200 && echo " OK" || (echo " FAIL"; exit 1)

# Protected: should get 401 without token
echo "--- GET /api/events (no token → 401)"
code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/events")
if [ "$code" = "401" ]; then echo " OK (401)"; else echo " FAIL (got $code, expected 401)"; exit 1; fi

echo "--- GET /api/auth/me (no token → 401)"
code=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/auth/me")
if [ "$code" = "401" ]; then echo " OK (401)"; else echo " FAIL (got $code, expected 401)"; exit 1; fi

# Optional: if you have a valid token, test authenticated requests
# TOKEN="your-token-from-oauth-callback"
# echo "--- GET /api/events (with token)"
# curl -sS -H "Authorization: Bearer $TOKEN" "$BASE/api/events"

echo "--- Smoke test passed."
