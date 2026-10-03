#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "   Lab + ToolHub Unified AI Workbench and Skill Execution Engine"
echo "======================================================================"
echo ""

# Check runtime
if command -v bun >/dev/null 2>&1; then
    RUNTIME="bun"
    echo "[OK] Detected Bun runtime."
elif command -v node >/dev/null 2>&1; then
    RUNTIME="node"
    echo "[OK] Detected Node.js runtime."
else
    echo "[ERROR] Neither Bun nor Node.js found in PATH."
    exit 1
fi

# Prompt for port
DEFAULT_PORT=3000
read -r -p "Enter port to run the server [Press ENTER for default 3000]: " USER_PORT
PORT=${USER_PORT:-$DEFAULT_PORT}
export PORT

echo ""
echo "[INFO] Starting Lab + ToolHub Ecosystem on port ${PORT}..."
echo "[INFO] URL: http://localhost:${PORT}"
echo "[INFO] ToolHub Admin: http://localhost:${PORT}/admin/"
echo "[INFO] Swagger Docs: http://localhost:${PORT}/docs"
echo ""

# Check database
if [ ! -f "hub.db" ]; then
    echo "[INFO] Initializing SQLite database (hub.db)..."
    if [ "$RUNTIME" = "bun" ]; then
        bun run db:generate
        bun run db:push
        bun run db:seed -- --lang=en --admin-pass=admin --agent-pass=123
    else
        npx prisma generate
        npx prisma db push
        npx tsx prisma/seed.ts --lang=en --admin-pass=admin --agent-pass=123
    fi
fi

# Launch
if [ "$RUNTIME" = "bun" ]; then
    bun run start
else
    npm run start
fi
