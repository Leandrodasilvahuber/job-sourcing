#!/bin/bash
# Sobe a API (que também serve o frontend buildado) e abre o navegador.
cd "$(dirname "$0")"

npm start &
SERVER_PID=$!

until curl -s -o /dev/null http://localhost:3000/health; do
  sleep 0.5
done

xdg-open http://localhost:3000

wait "$SERVER_PID"
