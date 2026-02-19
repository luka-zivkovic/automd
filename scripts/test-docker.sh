#!/usr/bin/env bash
set -euo pipefail

# AutoMD Docker Smoke Test
# Builds the image, runs a container, tests endpoints, and cleans up.

IMAGE="automd:smoke-test"
CONTAINER="automd-smoke-test"
PORT=4801  # Use non-default port to avoid conflicts
VOLUME="automd_smoke_test_data"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass=0
fail=0

log()  { echo -e "${YELLOW}[test]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓ $*${NC}"; ((pass++)); }
fail() { echo -e "${RED}  ✗ $*${NC}"; ((fail++)); }

cleanup() {
  log "Cleaning up..."
  docker rm -f "$CONTAINER" 2>/dev/null || true
  docker volume rm "$VOLUME" 2>/dev/null || true
}
trap cleanup EXIT

# ── Build ──
log "Building Docker image..."
docker build -t "$IMAGE" "$(dirname "$0")/.." 2>&1 | tail -5
ok "Docker image built"

# ── Run ──
log "Starting container on port $PORT..."
docker run -d \
  -p "$PORT:4800" \
  -v "$VOLUME:/data" \
  --name "$CONTAINER" \
  "$IMAGE" >/dev/null

# Wait for server to be ready
log "Waiting for server..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    fail "Server failed to start within 30s"
    docker logs "$CONTAINER"
    exit 1
  fi
  sleep 1
done
ok "Server is running"

# ── Health check ──
log "Testing /api/health..."
HEALTH=$(curl -sf "http://localhost:$PORT/api/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "/api/health returns ok"
else
  fail "/api/health unexpected response: $HEALTH"
fi

# ── Version endpoint ──
log "Testing /api/version..."
VERSION=$(curl -sf "http://localhost:$PORT/api/version")
if echo "$VERSION" | grep -q '"current"'; then
  ok "/api/version returns version info"
else
  fail "/api/version unexpected response: $VERSION"
fi

# ── List files (empty) ──
log "Testing GET /api/files (empty)..."
FILES=$(curl -sf "http://localhost:$PORT/api/files")
if [ "$FILES" = "[]" ]; then
  ok "GET /api/files returns empty array"
else
  fail "GET /api/files unexpected: $FILES"
fi

# ── Create a board ──
log "Testing POST /api/files..."
CREATE=$(curl -sf -X POST "http://localhost:$PORT/api/files" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Board"}')
BOARD_ID=$(echo "$CREATE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$BOARD_ID" ]; then
  ok "POST /api/files created board: $BOARD_ID"
else
  fail "POST /api/files failed: $CREATE"
fi

# ── Get the board ──
if [ -n "$BOARD_ID" ]; then
  log "Testing GET /api/files/$BOARD_ID..."
  BOARD=$(curl -sf "http://localhost:$PORT/api/files/$BOARD_ID")
  if echo "$BOARD" | grep -q '"markdown"'; then
    ok "GET /api/files/:id returns board with markdown"
  else
    fail "GET /api/files/:id unexpected: $BOARD"
  fi
fi

# ── Update the board ──
if [ -n "$BOARD_ID" ]; then
  log "Testing PUT /api/files/$BOARD_ID..."
  UPDATE=$(curl -sf -X PUT "http://localhost:$PORT/api/files/$BOARD_ID" \
    -H "Content-Type: application/json" \
    -d '{"markdown":"# Todo\n\n- [ ] First task\n\n# Done\n"}')
  if echo "$UPDATE" | grep -q '"markdown"'; then
    ok "PUT /api/files/:id updated successfully"
  else
    fail "PUT /api/files/:id failed: $UPDATE"
  fi
fi

# ── Frontend serving ──
log "Testing frontend (GET /)..."
HTML=$(curl -sf "http://localhost:$PORT/")
if echo "$HTML" | grep -q '<div id="root"'; then
  ok "Frontend HTML served correctly"
else
  fail "Frontend not serving correctly"
fi

# ── Persistence test ──
log "Testing data persistence across restart..."
docker restart "$CONTAINER" >/dev/null
for i in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
FILES_AFTER=$(curl -sf "http://localhost:$PORT/api/files")
if echo "$FILES_AFTER" | grep -q "$BOARD_ID"; then
  ok "Data persisted after restart"
else
  fail "Data lost after restart: $FILES_AFTER"
fi

# ── Delete the board ──
if [ -n "$BOARD_ID" ]; then
  log "Testing DELETE /api/files/$BOARD_ID..."
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" -X DELETE "http://localhost:$PORT/api/files/$BOARD_ID")
  if [ "$HTTP_CODE" = "204" ]; then
    ok "DELETE /api/files/:id returned 204"
  else
    fail "DELETE /api/files/:id returned $HTTP_CODE"
  fi
fi

# ── Summary ──
echo ""
log "Results: ${GREEN}$pass passed${NC}, ${RED}$fail failed${NC}"
if [ "$fail" -gt 0 ]; then
  exit 1
fi
