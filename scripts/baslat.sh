#!/bin/bash
# Masaüstü simgesinin çalıştırdığı betik: sunucu kapalıysa arka planda başlatır, sonra tarayıcıda açar.
cd "$(dirname "$0")/.." || exit 1

# Simgeden açılınca kabuk profili yüklenmez: nvm'deki node ve baw'ı PATH'e ekle
for d in "$HOME"/.nvm/versions/node/*/bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

PORT=$(grep -E '^\s*PORT\s*=' .env 2>/dev/null | tail -1 | sed -E 's/.*=\s*//; s/["'\'']//g')
PORT=${PORT:-8787}
URL="http://127.0.0.1:$PORT"

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  mkdir -p data
  echo "--- $(date '+%Y-%m-%d %H:%M:%S') başlatıldı ---" >> data/sunucu.log
  nohup node src/server.js >> data/sunucu.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "$URL" && break
    sleep 0.5
  done
fi
open "$URL"
