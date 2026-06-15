#!/bin/bash
set -euo pipefail

# Buildlogg — Cloudflare Pages Deploy Script
# Usage: ./scripts/deploy-cloudflare.sh

cd "$(dirname "$0")/.."

echo "🚀 Buildlogg → Cloudflare Pages"

# 1. Build with production env
echo "🔧 Building..."
if [ -f .env ]; then
  set -a
  # shellcheck source=/dev/null
  source .env
  set +a
fi

npm run build

# 2. Ensure SPA headers are in dist
if [ -f public/_redirects ]; then cp public/_redirects dist/_redirects; fi
if [ -f public/_headers ]; then cp public/_headers dist/_headers; fi

# 3. Deploy via Wrangler (uses npx so no global install needed)
echo "📡 Deploying to Cloudflare Pages..."
npx --yes wrangler@latest pages deploy dist --project-name="tradepad" "$@"

echo "✅ Done."
