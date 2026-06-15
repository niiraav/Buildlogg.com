#!/bin/bash
set -euo pipefail

# Buildlogg — Cloudflare Tunnel Setup (for local iPhone testing)
# Usage: ./scripts/setup-tunnel.sh

echo "🚧 Setting up Cloudflare Tunnel for Buildlogg local dev..."

# 1. Check cloudflared
if ! command -v cloudflared &>/dev/null; then
  echo "❌ cloudflared not found. Install it first:"
  echo "   brew install cloudflared"
  exit 1
fi

# 2. Ensure authenticated
if ! cloudflared tunnel list &>/dev/null; then
  echo "🔐 You need to authenticate cloudflared first."
  echo "   cloudflared tunnel login"
  echo "↙️  This will open a browser. After that, re-run this script."
  exit 1
fi

# 3. Create tunnel (idempotent — safe to re-run)
TUNNEL_NAME="tradepad-dev"
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
  echo "💾 Tunnel '$TUNNEL_NAME' already exists."
else
  echo "💾 Creating tunnel '$TUNNEL_NAME'..."
  cloudflared tunnel create "$TUNNEL_NAME"
fi

# 4. Extract tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
echo "📌 Tunnel ID: $TUNNEL_ID"

# 5. Write config
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ~/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: dev-tradepad.pages.dev
    service: http://localhost:5173
  - hostname: dev-tradepad.trycloudflare.com
    service: http://localhost:5173
  - service: http_status:404
EOF

# 6. Route DNS (optional — only works if you own the domain in Cloudflare)
# If you don't have a custom domain yet, skip this.
# cloudflared tunnel route dns "$TUNNEL_NAME" dev-tradepad.pages.dev

echo ""
echo "✅ Tunnel config written to ~/.cloudflared/config.yml"
echo ""
echo "🚀 To start the tunnel:"
echo "   cloudflared tunnel run tradepad-dev"
echo ""
echo "📱 Your app will be available at a random *.trycloudflare.com URL."
echo "   (run the command above to see the exact URL)"
