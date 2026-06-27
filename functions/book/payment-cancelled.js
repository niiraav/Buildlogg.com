export function onRequestGet() {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment cancelled</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;color:#111827}h1{font-size:24px;margin-bottom:8px}p{color:#6b7280;margin-bottom:24px}a{color:#111827;font-weight:600}</style></head><body><h1>Payment cancelled</h1><p>Your payment was not completed. You can try again later.</p></body></html>`, { headers: { 'Content-Type': 'text/html' } });
}
