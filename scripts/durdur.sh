#!/bin/bash
# Arka planda çalışan Blockhound sunucusunu durdurur.
cd "$(dirname "$0")/.." || exit 1
PORT=$(grep -E '^\s*PORT\s*=' .env 2>/dev/null | tail -1 | sed -E 's/.*=\s*//; s/["'\'']//g')
PIDS=$(lsof -nP -tiTCP:"${PORT:-8787}" -sTCP:LISTEN)
if [ -z "$PIDS" ]; then echo "Blockhound zaten kapalı."; exit 0; fi
kill $PIDS && echo "Blockhound durduruldu."
