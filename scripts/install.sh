#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Zoom
if [ ! -f .env ]; then cp .env.example .env; fi
npm ci --no-audit --no-fund
npm run db:generate
# Processes and Docker volume contents must be checked again on every new runtime.
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run lint
npm run typecheck
npm test
npm run build
