#!/usr/bin/env bash
set -e
npm run build
npx pm2 start ecosystem.config.cjs
npx pm2 save
echo "auto-commit is running. Use 'npm run pm2:logs' to tail logs."
