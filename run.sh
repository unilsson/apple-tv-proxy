#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [[ ! -x ".venv/bin/uvicorn" ]]; then
  echo "Fel: .venv/bin/uvicorn saknas."
  echo "Installera först med:"
  echo "  python3 -m venv .venv"
  echo "  .venv/bin/python -m pip install --upgrade pip"
  echo "  .venv/bin/pip install -r requirements.txt"
  exit 1
fi

exec "uvicorn" app:app --host 127.0.0.1 --port 21966
