var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/create-checkout-session.js
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json, "json");
async function supabaseQuery(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") return resp.json();
  return resp;
}
__name(supabaseQuery, "supabaseQuery");
async function onRequestPost(context) {
  const { request, env } = context;
  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!STRIPE_KEY) return json({ error: "Stripe not configured" }, 500);
  if (!SUPABASE_URL || !SUPABASE_KEY) return json({ error: "Server not configured" }, 500);
  try {
    const body = await request.json();
    const { merchantId, jobId, amount, description, type } = body;
    if (!merchantId || !amount || amount <= 0) {
      return json({ error: "merchantId and positive amount are required" }, 400);
    }
    const profiles = await supabaseQuery(
      SUPABASE_URL,
      SUPABASE_KEY,
      "profiles",
      `?id=eq.${merchantId}&select=stripe_account_id,stripe_connected,business_name,full_name`
    );
    if (!profiles || profiles.length === 0) {
      return json({ error: "Merchant not found" }, 404);
    }
    const merchant = profiles[0];
    if (merchant.stripe_connected === false && !STRIPE_KEY) {
      return json({ error: "Stripe not configured" }, 500);
    }
    const merchantName = merchant.business_name || merchant.full_name || "Buildlogg merchant";
    const sessionBody = new URLSearchParams({
      "mode": "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][product_data][name]": description || `${type === "deposit" ? "Deposit" : "Payment"} for ${merchantName}`,
      "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
      "success_url": `${new URL(request.url).origin}/book/payment-success`,
      "cancel_url": `${new URL(request.url).origin}/book/payment-cancelled`,
      "metadata[merchant_id]": merchantId,
      "metadata[job_id]": jobId || "",
      "metadata[type]": type || "deposit"
    });
    const connectAccountId = merchant.stripe_account_id && merchant.stripe_account_id !== "buildlogg-shared" ? merchant.stripe_account_id : null;
    const stripeHeaders = {
      "Authorization": `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (connectAccountId) stripeHeaders["Stripe-Account"] = connectAccountId;
    const stripeResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: stripeHeaders,
      body: sessionBody.toString()
    });
    const session = await stripeResp.json();
    if (!stripeResp.ok) {
      console.error("[stripe] Checkout session creation failed:", session);
      return json({ error: "Could not create payment link" }, 500);
    }
    await supabaseQuery(SUPABASE_URL, SUPABASE_KEY, "checkout_sessions", "", "POST", {
      merchant_id: merchantId,
      job_id: jobId || null,
      stripe_session_id: session.id,
      stripe_url: session.url,
      amount,
      description: description || "",
      type: type || "deposit",
      status: "pending"
    });
    return json({ url: session.url, id: session.id }, 200);
  } catch (err) {
    console.error("[stripe] create-checkout-session error:", err);
    return json({ error: "Something went wrong" }, 500);
  }
}
__name(onRequestPost, "onRequestPost");

// api/create-subscription-session.js
function json2(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json2, "json");
async function supabaseQuery2(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") return resp.json();
  return resp;
}
__name(supabaseQuery2, "supabaseQuery");
async function onRequestPost2(context) {
  const { request, env } = context;
  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  const PRICE_ID = env.STRIPE_PRO_PRICE_ID;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!STRIPE_KEY) return json2({ error: "Stripe not configured" }, 500);
  if (!PRICE_ID) return json2({ error: "Pro subscription not configured. Add STRIPE_PRO_PRICE_ID to env vars." }, 500);
  if (!SUPABASE_URL || !SUPABASE_KEY) return json2({ error: "Server not configured" }, 500);
  try {
    const body = await request.json();
    const { userId } = body;
    if (!userId) {
      return json2({ error: "userId is required" }, 400);
    }
    const profiles = await supabaseQuery2(
      SUPABASE_URL,
      SUPABASE_KEY,
      "profiles",
      `?id=eq.${userId}&select=full_name,business_name,stripe_customer_id`
    );
    if (!profiles || profiles.length === 0) {
      return json2({ error: "User not found" }, 404);
    }
    const profile = profiles[0];
    const merchantName = profile.business_name || profile.full_name || "Buildlogg user";
    const origin = new URL(request.url).origin;
    const params = new URLSearchParams({
      "mode": "subscription",
      "line_items[0][price]": PRICE_ID,
      "line_items[0][quantity]": "1",
      "success_url": `${origin}/app/settings?subscription=success`,
      "cancel_url": `${origin}/app/settings?subscription=cancelled`,
      "metadata[user_id]": userId,
      "subscription_data[metadata][user_id]": userId,
      "client_reference_id": userId
    });
    if (profile.stripe_customer_id) {
      params.append("customer", profile.stripe_customer_id);
    }
    const stripeResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });
    const session = await stripeResp.json();
    if (!stripeResp.ok) {
      console.error("[stripe] Subscription session creation failed:", session);
      return json2({ error: "Could not create checkout session" }, 500);
    }
    return json2({ url: session.url, id: session.id }, 200);
  } catch (err) {
    console.error("[stripe] create-subscription-session error:", err);
    return json2({ error: "Something went wrong" }, 500);
  }
}
__name(onRequestPost2, "onRequestPost");

// _lib/webpush.js
function base64UrlEncode(bytes) {
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(str) {
  const padding = "=".repeat((4 - str.length % 4) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
__name(base64UrlDecode, "base64UrlDecode");
async function hkdf(salt, ikm, info, length) {
  const keyMaterial = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info
    },
    keyMaterial,
    length * 8
  );
  return new Uint8Array(derivedBits);
}
__name(hkdf, "hkdf");
async function createVapidJWT(vapidPrivateKey, audience) {
  const enc = new TextEncoder();
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1e3) + 12 * 3600,
    sub: "mailto:noreply@buildlogg.com"
  };
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const keyData = base64UrlDecode(vapidPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    enc.encode(signingInput)
  );
  const rawSignature = derToRaw(new Uint8Array(signature));
  const signatureB64 = base64UrlEncode(rawSignature);
  return `${signingInput}.${signatureB64}`;
}
__name(createVapidJWT, "createVapidJWT");
function derToRaw(signature) {
  const raw = new Uint8Array(64);
  const offset = {
    r: 4,
    // skip sequence + integer tag + length
    s: 0
  };
  if (signature[0] !== 48) throw new Error("Invalid DER signature");
  const rLen = signature[3];
  const rStart = 4;
  const rBytes = signature.slice(rStart, rStart + rLen);
  const sLen = signature[rStart + rLen + 1];
  const sStart = rStart + rLen + 2;
  const sBytes = signature.slice(sStart, sStart + sLen);
  raw.set(rBytes.slice(-32), 32 - rBytes.length > 0 ? 32 - Math.min(rBytes.length, 32) : 0);
  raw.set(sBytes.slice(-32), 32 - sBytes.length > 0 ? 32 - Math.min(sBytes.length, 32) : 0);
  return raw;
}
__name(derToRaw, "derToRaw");
async function encryptPayload(plaintext, p256dh, auth, vapidPrivateKey) {
  const enc = new TextEncoder();
  const subscriberPublicKey = base64UrlDecode(p256dh);
  const subscriberPubKeyCrypto = await crypto.subtle.importKey(
    "raw",
    subscriberPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const serverKeyData = base64UrlDecode(vapidPrivateKey);
  const serverPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    serverKeyData,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"]
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberPubKeyCrypto },
      serverPrivateKey,
      256
      // 32 bytes
    )
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = base64UrlDecode(auth);
  const serverKeyPair = await crypto.subtle.importKey(
    "pkcs8",
    serverKeyData,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );
  const serverEcdhKey = await crypto.subtle.importKey(
    "pkcs8",
    serverKeyData,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const serverPubKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverEcdhKey)
  );
  const webPushInfo = new Uint8Array(
    15 + // "WebPush: info\0"
    65 + // subscriber public key (uncompressed P-256: 0x04 + 32 + 32)
    65
    // server public key
  );
  webPushInfo.set(enc.encode("WebPush: info"), 0);
  webPushInfo[14] = 0;
  webPushInfo.set(subscriberPublicKey, 15);
  webPushInfo.set(serverPubKeyRaw, 80);
  const ikm = await hkdf(authSecret, sharedSecret, webPushInfo, 32);
  const cekInfo = enc.encode("Content-Encoding: aes128gcm");
  const cekInfoWithNull = new Uint8Array(cekInfo.length + 1);
  cekInfoWithNull.set(cekInfo, 0);
  cekInfoWithNull[cekInfo.length] = 0;
  const contentEncryptionKey = await hkdf(salt, ikm, cekInfoWithNull, 16);
  const nonceInfo = enc.encode("Content-Encoding: nonce");
  const nonceInfoWithNull = new Uint8Array(nonceInfo.length + 1);
  nonceInfoWithNull.set(nonceInfo, 0);
  nonceInfoWithNull[nonceInfo.length] = 0;
  const nonce = await hkdf(salt, ikm, nonceInfoWithNull, 12);
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext, 0);
  padded[plaintext.length] = 2;
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      aesKey,
      padded
    )
  );
  const recordSize = 16 + 4 + 4 + encrypted.length;
  const header = new Uint8Array(16 + 4 + 4);
  header.set(salt, 0);
  const dv = new DataView(header.buffer);
  dv.setUint32(16, recordSize, false);
  dv.setUint32(20, 0, false);
  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header, 0);
  result.set(encrypted, header.length);
  return result;
}
__name(encryptPayload, "encryptPayload");
async function sendWebPush(env, endpoint, keys, notification) {
  if (!endpoint || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { ok: false, status: 0, error: "missing config" };
  }
  if (!keys || !keys.p256dh || !keys.auth) {
    return { ok: false, status: 0, error: "missing subscription keys" };
  }
  try {
    const audience = new URL(endpoint).origin;
    const jwt = await createVapidJWT(env.VAPID_PRIVATE_KEY, audience);
    const payload = JSON.stringify({
      notification: {
        title: notification.title || "Buildlogg",
        body: notification.body || "",
        data: { url: notification.url || "/app/" }
      }
    });
    const plaintext = new TextEncoder().encode(payload);
    const encrypted = await encryptPayload(
      plaintext,
      keys.p256dh,
      keys.auth,
      env.VAPID_PRIVATE_KEY
    );
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Authorization": `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        "TTL": "86400"
      },
      body: encrypted
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[sendWebPush] ${response.status} from ${endpoint}: ${errText}`);
      return { ok: false, status: response.status, error: errText };
    }
    return { ok: true, status: 200 };
  } catch (err) {
    console.error("[sendWebPush] Error:", err.message);
    return { ok: false, status: 0, error: err.message };
  }
}
__name(sendWebPush, "sendWebPush");

// api/cron-payment-chases.js
async function onRequestGet(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return json3({ error: "unauthorized" }, 401);
  }
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json3({ error: "server not configured" }, 500);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const results = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    const dueChases = await supabaseFetch(supabaseUrl, supabaseKey, `
      SELECT pc.*, j.title as job_title, j.status as job_status, j.actual_end,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             p.full_name, p.business_name,
             p.logo_data_url, p.subscription_status, p.default_reminder_mode,
             p.push_subscription_endpoint, p.push_subscription_keys,
             (SELECT COALESCE(SUM(amount), 0) FROM line_items WHERE job_id = j.id) as job_total,
             (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE job_id = j.id) as paid_amount
      FROM payment_chases pc
      LEFT JOIN jobs j ON pc.job_id = j.id
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN profiles p ON pc.user_id = p.id
      WHERE pc.status = 'pending'
        AND pc.due_at <= $1
        AND pc.stage != 'small_claims'
      ORDER BY pc.due_at ASC
      LIMIT 50
    `, [now]);
    if (!dueChases || dueChases.length === 0) {
      return json3({ ...results, message: "no due chases" });
    }
    for (const chase of dueChases) {
      results.processed++;
      if (chase.job_status !== "awaiting_payment") {
        await supabaseUpdate(supabaseUrl, supabaseKey, "payment_chases", chase.id, {
          status: "resolved",
          updated_at: now
        });
        results.skipped++;
        continue;
      }
      const mode = chase.default_reminder_mode || "remind_me";
      const hasEmail = chase.customer_email && chase.customer_email.trim();
      const outstanding = parseFloat(chase.job_total) - parseFloat(chase.paid_amount);
      const daysOverdue = chase.actual_end ? Math.floor((Date.now() - new Date(chase.actual_end).getTime()) / (24 * 60 * 60 * 1e3)) : 0;
      let sendResult = { channel: "push", status: "skipped" };
      if ((mode === "remind_client" || mode === "both") && hasEmail) {
        sendResult = await sendChaseEmail(env, chase, outstanding, daysOverdue);
      } else if (mode === "remind_client" || mode === "both") {
        if (chase.push_subscription_endpoint) {
          await sendWebPush(env, chase.push_subscription_endpoint, chase.push_subscription_keys, {
            title: `Payment chase \u2014 ${chase.customer_name || "Customer"}`,
            body: `No email for ${chase.job_title}. Send WhatsApp manually.`,
            url: "/app/"
          });
        }
        sendResult = { channel: "push", status: "sent" };
      } else if (chase.push_subscription_endpoint) {
        await sendWebPush(env, chase.push_subscription_endpoint, chase.push_subscription_keys, {
          title: `Payment chase \u2014 ${chase.customer_name || "Customer"}`,
          body: `${chase.job_title} is ${daysOverdue}d overdue. Tap to chase.`,
          url: "/app/"
        });
        sendResult = { channel: "push", status: "sent" };
      }
      await supabaseUpdate(supabaseUrl, supabaseKey, "payment_chases", chase.id, {
        status: "sent",
        sent_at: now,
        message_method: sendResult.channel === "email" ? "email" : "push",
        updated_at: now
      });
      await supabaseInsert(supabaseUrl, supabaseKey, "work_log", {
        id: crypto.randomUUID(),
        job_id: chase.job_id,
        type: "payment_chase_sent",
        description: `[Auto chase ${sendResult.channel} ${sendResult.status} \u2014 ${chase.stage} \u2014 ${chase.job_title}]`,
        created_at: now
      });
      if (sendResult.status === "sent") results.sent++;
      else if (sendResult.status === "failed") results.failed++;
      else results.skipped++;
    }
    return json3(results);
  } catch (err) {
    console.error("[cron-payment-chases] Error:", err);
    return json3({ ...results, error: err.message }, 500);
  }
}
__name(onRequestGet, "onRequestGet");
function json3(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json3, "json");
async function supabaseFetch(url, key, query, params) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, params })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[supabaseFetch] Error:", text);
    return [];
  }
  const data = await res.json();
  return data || [];
}
__name(supabaseFetch, "supabaseFetch");
async function supabaseUpdate(url, key, table, id, updates) {
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(updates)
  });
}
__name(supabaseUpdate, "supabaseUpdate");
async function supabaseInsert(url, key, table, record) {
  await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify(record)
  });
}
__name(supabaseInsert, "supabaseInsert");
async function sendChaseEmail(env, chase, outstanding, daysOverdue) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { channel: "email", status: "failed", error: "no RESEND_API_KEY" };
  const firstName = (chase.customer_name || "there").split(" ")[0];
  const businessName = chase.business_name || chase.full_name || "Your business";
  const total = `\xA3${outstanding.toFixed(2)}`;
  let body, subject;
  if (chase.stage === "gentle") {
    body = `Hi ${firstName}, just a friendly reminder about the ${total} for the ${chase.job_title}. Let me know if you need to talk about payment timing. \u2014 ${businessName}`;
    subject = `Payment reminder from ${businessName}`;
  } else if (chase.stage === "firm") {
    body = `Hi ${firstName}, the balance of ${total} is now ${daysOverdue} days overdue. Happy to set up a payment plan if that helps. \u2014 ${businessName}`;
    subject = `Overdue payment \u2014 ${total}`;
  } else {
    body = `Hi ${firstName}, the balance of ${total} for the ${chase.job_title} is now ${daysOverdue} days overdue. Please arrange payment at your earliest convenience. \u2014 ${businessName}`;
    subject = `Final notice \u2014 ${total} overdue`;
  }
  const isPro = !chase.subscription_status || chase.subscription_status === "active" || chase.subscription_status === "trialing";
  const hasLogo = isPro && chase.logo_data_url;
  const emailBody = hasLogo ? JSON.stringify({
    from: "Buildlogg <noreply@mail.buildlogg.com>",
    to: [chase.customer_email],
    subject,
    text: body,
    html: `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tr><td style="text-align:center;padding:24px 0 16px"><img src="${chase.logo_data_url}" alt="${businessName}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/></td></tr><tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;color:#111827">${body}</td></tr><tr><td style="padding:0 24px 24px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px">Sent via Buildlogg</td></tr></table>`
  }) : JSON.stringify({
    from: "Buildlogg <noreply@mail.buildlogg.com>",
    to: [chase.customer_email],
    subject,
    text: body
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: emailBody
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[sendChaseEmail] Resend error:", errText);
      if (res.status === 429) return { channel: "email", status: "failed", error: "rate_limited" };
      return { channel: "email", status: "failed", error: errText };
    }
    const data = await res.json();
    return { channel: "email", status: "sent", preview: body.substring(0, 100), provider_id: data.id };
  } catch (err) {
    return { channel: "email", status: "failed", error: err.message };
  }
}
__name(sendChaseEmail, "sendChaseEmail");

// api/cron-quote-follow-ups.js
async function onRequestGet2(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return json4({ error: "unauthorized" }, 401);
  }
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json4({ error: "server not configured" }, 500);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const results = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  try {
    const dueFollowUps = await supabaseFetch2(supabaseUrl, supabaseKey, `
      SELECT qu.*, j.title as job_title, j.status as job_status,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone,
             p.full_name, p.business_name, p.booking_slug, p.booking_enabled,
             p.logo_data_url, p.subscription_status, p.default_reminder_mode,
             p.push_subscription_endpoint, p.push_subscription_keys
      FROM quote_follow_ups qu
      LEFT JOIN jobs j ON qu.job_id = j.id
      LEFT JOIN customers c ON j.customer_id = c.id
      LEFT JOIN profiles p ON qu.user_id = p.id
      WHERE (qu.status = 'pending' OR (qu.status = 'snoozed' AND qu.snooze_until <= $1))
        AND qu.first_nudge_at <= $1
        AND qu.nudge_count < 3
      ORDER BY qu.first_nudge_at ASC
      LIMIT 50
    `, [now]);
    if (!dueFollowUps || dueFollowUps.length === 0) {
      return json4({ ...results, message: "no due follow-ups" });
    }
    for (const fu of dueFollowUps) {
      results.processed++;
      if (fu.job_status !== "quoted") {
        await supabaseUpdate2(supabaseUrl, supabaseKey, "quote_follow_ups", fu.id, {
          status: "responded",
          updated_at: now
        });
        results.skipped++;
        continue;
      }
      const mode = fu.default_reminder_mode || "remind_me";
      const hasEmail = fu.customer_email && fu.customer_email.trim();
      let sendResult = { channel: "push", status: "skipped" };
      if ((mode === "remind_client" || mode === "both") && hasEmail) {
        sendResult = await sendFollowUpEmail(env, fu);
      } else if (mode === "remind_client" || mode === "both") {
        if (fu.push_subscription_endpoint) {
          await sendWebPush(env, fu.push_subscription_endpoint, fu.push_subscription_keys, {
            title: `Quote follow-up \u2014 ${fu.customer_name || "Customer"}`,
            body: `No email on file for ${fu.job_title}. Send WhatsApp manually.`,
            url: "/app/"
          });
        }
        sendResult = { channel: "push", status: "sent" };
      } else if (fu.push_subscription_endpoint) {
        await sendWebPush(env, fu.push_subscription_endpoint, fu.push_subscription_keys, {
          title: `Quote follow-up \u2014 ${fu.customer_name || "Customer"}`,
          body: `${fu.job_title} quote is going cold. Tap to follow up.`,
          url: "/app/"
        });
        sendResult = { channel: "push", status: "sent" };
      }
      const newCount = (fu.nudge_count || 0) + 1;
      const updates = {
        nudge_count: newCount,
        last_nudge_at: now,
        status: newCount >= 3 ? "dismissed" : fu.status === "snoozed" ? "pending" : fu.status,
        updated_at: now
      };
      await supabaseUpdate2(supabaseUrl, supabaseKey, "quote_follow_ups", fu.id, updates);
      await supabaseInsert2(supabaseUrl, supabaseKey, "work_log", {
        id: crypto.randomUUID(),
        job_id: fu.job_id,
        type: "quote_follow_up_sent",
        description: `[Auto follow-up ${sendResult.channel} ${sendResult.status} \u2014 ${fu.job_title}]`,
        created_at: now
      });
      if (sendResult.status === "sent") results.sent++;
      else if (sendResult.status === "failed") results.failed++;
      else results.skipped++;
    }
    return json4(results);
  } catch (err) {
    console.error("[cron-quote-follow-ups] Error:", err);
    return json4({ ...results, error: err.message }, 500);
  }
}
__name(onRequestGet2, "onRequestGet");
function json4(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json4, "json");
async function supabaseFetch2(url, key, query, params) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, params })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[supabaseFetch] Error:", text);
    return [];
  }
  const data = await res.json();
  return data || [];
}
__name(supabaseFetch2, "supabaseFetch");
async function supabaseUpdate2(url, key, table, id, updates) {
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(updates)
  });
}
__name(supabaseUpdate2, "supabaseUpdate");
async function supabaseInsert2(url, key, table, record) {
  await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(record)
  });
}
__name(supabaseInsert2, "supabaseInsert");
async function sendFollowUpEmail(env, fu) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { channel: "email", status: "failed", error: "no RESEND_API_KEY" };
  const firstName = (fu.customer_name || "there").split(" ")[0];
  const businessName = fu.business_name || fu.full_name || "Your business";
  const body = `Hi ${firstName}, just following up on the quote I sent for the ${fu.job_title}. Happy to answer any questions. \u2014 ${businessName}`;
  const subject = `Following up on your quote from ${businessName}`;
  const isPro = !fu.subscription_status || fu.subscription_status === "active" || fu.subscription_status === "trialing";
  const hasLogo = isPro && fu.logo_data_url;
  const emailBody = hasLogo ? JSON.stringify({
    from: "Buildlogg <noreply@mail.buildlogg.com>",
    to: [fu.customer_email],
    subject,
    text: body,
    html: `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tr><td style="text-align:center;padding:24px 0 16px"><img src="${fu.logo_data_url}" alt="${businessName}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/></td></tr><tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;color:#111827">${body}</td></tr><tr><td style="padding:0 24px 24px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px">Sent via Buildlogg</td></tr></table>`
  }) : JSON.stringify({
    from: "Buildlogg <noreply@mail.buildlogg.com>",
    to: [fu.customer_email],
    subject,
    text: body
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: emailBody
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[sendFollowUpEmail] Resend error:", errText);
      if (res.status === 429) return { channel: "email", status: "failed", error: "rate_limited" };
      return { channel: "email", status: "failed", error: errText };
    }
    const data = await res.json();
    return { channel: "email", status: "sent", preview: body.substring(0, 100), provider_id: data.id };
  } catch (err) {
    return { channel: "email", status: "failed", error: err.message };
  }
}
__name(sendFollowUpEmail, "sendFollowUpEmail");

// api/cron-recurring-reminders.js
async function onRequestGet3(context) {
  const { request, env } = context;
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return json5({ error: "unauthorized" }, 401);
  }
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return json5({ error: "server not configured" }, 500);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const results = { processed: 0, sent: 0, failed: 0, dormant: 0, skipped: 0 };
  try {
    const dueJobs = await supabaseFetch3(supabaseUrl, supabaseKey, `
      SELECT rj.*, p.full_name, p.business_name, p.booking_slug, p.booking_enabled,
             p.push_subscription_endpoint, p.push_subscription_keys,
             p.logo_data_url, p.subscription_status,
             c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM recurring_jobs rj
      LEFT JOIN profiles p ON rj.user_id = p.id
      LEFT JOIN customers c ON rj.customer_id = c.id
      WHERE rj.status = 'active'
        AND (rj.reminder_mode = 'remind_client' OR rj.reminder_mode = 'both' OR rj.reminder_mode = 'remind_me' OR rj.reminder_mode IS NULL)
        AND (
          (rj.next_due_at::date - COALESCE(rj.reminder_lead_days, 14))::timestamp <= $1::timestamp
        )
        AND (
          rj.last_reminder_sent_at IS NULL
          OR rj.last_reminder_sent_at < (rj.next_due_at::date - COALESCE(rj.reminder_lead_days, 14))::timestamp
        )
      ORDER BY rj.next_due_at ASC
      LIMIT 50
    `, [now]);
    if (!dueJobs || dueJobs.length === 0) {
      return json5({ ...results, message: "no due jobs" });
    }
    const byMerchant = {};
    for (const job of dueJobs) {
      if (!byMerchant[job.user_id]) byMerchant[job.user_id] = [];
      byMerchant[job.user_id].push(job);
    }
    for (const [merchantId, jobs] of Object.entries(byMerchant)) {
      const merchantJobs = jobs;
      const isBatch = merchantJobs.length >= 3;
      const mode = merchantJobs[0].reminder_mode || "remind_me";
      if (isBatch && (mode === "remind_me" || mode === "both")) {
        const merchant = merchantJobs[0];
        if (merchant.push_subscription_endpoint) {
          await sendWebPush(env, merchant.push_subscription_endpoint, merchant.push_subscription_keys, {
            title: `Buildlogg \u2014 ${merchantJobs.length} recurring jobs due`,
            body: "Tap to review and contact clients",
            url: "/app/?tab=tasks"
          });
        }
      }
      for (const job of merchantJobs) {
        results.processed++;
        const effectiveMode = job.reminder_mode || "remind_me";
        let sendResult = { channel: "push", status: "skipped" };
        if ((effectiveMode === "remind_client" || effectiveMode === "both") && job.customer_email && job.last_reminder_status !== "bounced") {
          sendResult = await sendReminderEmail(env, job);
        } else if (effectiveMode === "remind_client" || effectiveMode === "both") {
          if (!isBatch && job.push_subscription_endpoint) {
            await sendWebPush(env, job.push_subscription_endpoint, job.push_subscription_keys, {
              title: `${job.customer_name || "Client"} \u2014 ${job.title} due`,
              body: job.customer_email ? "Last email bounced \u2014 send WhatsApp manually" : "No email on file \u2014 send WhatsApp manually",
              url: "/app/?recurring=" + job.id
            });
          }
          sendResult = { channel: "push", status: "sent" };
        } else if (!isBatch && (effectiveMode === "remind_me" || effectiveMode === "both") && job.push_subscription_endpoint) {
          await sendWebPush(env, job.push_subscription_endpoint, job.push_subscription_keys, {
            title: `${job.customer_name || "Client"} \u2014 ${job.title} due`,
            body: `Recurring job due soon. Tap to contact client.`,
            url: "/app/"
          });
          sendResult = { channel: "push", status: "sent" };
        }
        const newCount = (job.reminder_count || 0) + 1;
        const updates = {
          last_reminder_sent_at: now,
          last_reminder_status: sendResult.status,
          reminder_count: newCount,
          updated_at: now
        };
        if (newCount >= 3) {
          updates.status = "dormant";
          results.dormant++;
        }
        await supabaseUpdate3(supabaseUrl, supabaseKey, "recurring_jobs", job.id, updates);
        await supabaseInsert3(supabaseUrl, supabaseKey, "reminder_log", {
          id: crypto.randomUUID(),
          recurring_job_id: job.id,
          user_id: job.user_id,
          channel: sendResult.channel,
          recipient: job.customer_email || job.push_subscription_endpoint || "",
          status: sendResult.status,
          message_preview: sendResult.preview || "",
          error_message: sendResult.error || null,
          sent_at: now
        });
        await supabaseInsert3(supabaseUrl, supabaseKey, "work_log", {
          id: crypto.randomUUID(),
          job_id: job.original_job_id,
          type: sendResult.status === "sent" ? "auto_reminder_sent" : "auto_reminder_failed",
          description: `[Auto-reminder ${sendResult.channel} ${sendResult.status} \u2014 ${job.title}]`,
          created_at: now
        });
        if (sendResult.status === "sent") results.sent++;
        else if (sendResult.status === "failed") results.failed++;
        else results.skipped++;
      }
    }
    return json5(results);
  } catch (err) {
    console.error("[cron-recurring-reminders] Error:", err);
    return json5({ ...results, error: err.message }, 500);
  }
}
__name(onRequestGet3, "onRequestGet");
function json5(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json5, "json");
async function supabaseFetch3(url, key, query, params) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, params })
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[supabaseFetch] Error:", text);
    return [];
  }
  const data = await res.json();
  return data || [];
}
__name(supabaseFetch3, "supabaseFetch");
async function supabaseUpdate3(url, key, table, id, updates) {
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(updates)
  });
}
__name(supabaseUpdate3, "supabaseUpdate");
async function supabaseInsert3(url, key, table, record) {
  await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(record)
  });
}
__name(supabaseInsert3, "supabaseInsert");
async function sendReminderEmail(env, job) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { channel: "email", status: "failed", error: "no RESEND_API_KEY" };
  const firstName = (job.customer_name || "there").split(" ")[0];
  const businessName = job.business_name || job.full_name || "Your business";
  const bookingLink = job.booking_slug && job.booking_enabled ? `https://buildlogg.com/book/${job.booking_slug}` : "";
  let body;
  if (job.custom_reminder_message && job.custom_reminder_message.trim()) {
    body = job.custom_reminder_message.trim();
  } else {
    body = `Hi ${firstName}, your ${job.title} is due soon.`;
    if (bookingLink) body += ` Book your next appointment: ${bookingLink}`;
    body += ` \u2014 ${businessName}`;
  }
  const subject = `${job.title} reminder from ${businessName}`;
  const isPro = !job.subscription_status || job.subscription_status === "active" || job.subscription_status === "trialing";
  const hasLogo = isPro && job.logo_data_url;
  const emailBody = hasLogo ? JSON.stringify({
    from: "Buildlogg <noreply@mail.buildlogg.com>",
    to: [job.customer_email],
    subject,
    text: body,
    html: `<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><tr><td style="text-align:center;padding:24px 0 16px"><img src="${job.logo_data_url}" alt="${businessName}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"/></td></tr><tr><td style="padding:0 24px 24px;font-size:16px;line-height:1.6;color:#111827">${body.replace(/\n/g, "<br>")}</td></tr><tr><td style="padding:0 24px 24px;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:16px">Sent via Buildlogg</td></tr></table>`
  }) : JSON.stringify({
    from: "Buildlogg <noreply@mail.buildlogg.com>",
    to: [job.customer_email],
    subject,
    text: body
  });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: emailBody
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("[sendReminderEmail] Resend error:", errText);
      if (res.status === 429) return { channel: "email", status: "failed", error: "rate_limited" };
      return { channel: "email", status: "failed", error: errText };
    }
    const data = await res.json();
    return { channel: "email", status: "sent", preview: body.substring(0, 100), provider_id: data.id };
  } catch (err) {
    return { channel: "email", status: "failed", error: err.message };
  }
}
__name(sendReminderEmail, "sendReminderEmail");

// api/feedback-notify.js
var TYPE_LABELS = {
  bug: "Bug report",
  feature_request: "Feature request",
  general: "General feedback"
};
async function onRequestPost3(context) {
  const url = new URL(context.request.url);
  try {
    const body = await context.request.json();
    const { type, message, userEmail, userName } = body;
    if (!message || typeof message !== "string") {
      return json6({ error: "message is required" }, 400);
    }
    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[feedback-notify] Missing RESEND_API_KEY env var");
      return json6({ error: "server not configured" }, 500);
    }
    const typeLabel = TYPE_LABELS[type] || "General feedback";
    const displayName = userName || "Unknown user";
    const displayEmail = userEmail || "No email on file";
    const replyTo = userEmail || void 0;
    const subject = `[Feedback] ${typeLabel} from ${displayEmail}`;
    const textBody = [
      `New feedback from Buildlogg app:`,
      ``,
      `Type: ${typeLabel}`,
      `From: ${displayName} <${displayEmail}>`,
      `Submitted: ${(/* @__PURE__ */ new Date()).toISOString()}`,
      ``,
      `Message:`,
      message
    ].join("\n");
    const emailPayload = {
      from: "Buildlogg Feedback <noreply@mail.buildlogg.com>",
      to: ["team@mail.buildlogg.com"],
      subject,
      text: textBody,
      tags: [
        { name: "type", value: "feedback-notification" }
      ]
    };
    if (replyTo) {
      emailPayload.reply_to = replyTo;
    }
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailPayload)
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error("[feedback-notify] Resend error:", resp.status, errBody);
      return json6({ error: "email send failed" }, 502);
    }
    return json6({ status: "sent" }, 200);
  } catch (err) {
    console.error("[feedback-notify] Error:", err);
    return json6({ error: "internal error" }, 500);
  }
}
__name(onRequestPost3, "onRequestPost");
function json6(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json6, "json");

// api/resend-webhook.js
async function insertEvent(event, SUPABASE_URL, SUPABASE_KEY) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { error: "Supabase not configured" };
  }
  const emailId = event.data?.email_id || event.data?.id || "";
  const leadEmail = event.data?.to?.[0] || event.data?.to || "";
  const eventType = (event.type || "").replace("email.", "") || "unknown";
  const url = event.data?.click?.url || null;
  const userAgent = event.data?.user_agent || null;
  const ipAddress = event.data?.ip_address || event.data?.sender_ip || null;
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/email_events`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      email_id: emailId,
      lead_email: typeof leadEmail === "string" ? leadEmail.toLowerCase() : "",
      event_type: eventType,
      url,
      user_agent: userAgent,
      ip_address: ipAddress,
      raw_payload: event
    })
  });
  if (!resp.ok) {
    const text = await resp.text();
    return { error: `Supabase insert failed: ${resp.status} ${text}` };
  }
  return { success: true };
}
__name(insertEvent, "insertEvent");
async function updateLeadState(leadEmail, eventType, SUPABASE_URL, SUPABASE_KEY) {
  if (!leadEmail) return;
  const email = leadEmail.toLowerCase();
  let newStatus = null;
  if (eventType === "bounced") newStatus = "bounced";
  else if (eventType === "complained") newStatus = "unsubscribed";
  if (!newStatus) return;
  await fetch(`${SUPABASE_URL}/rest/v1/cold_email_state?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ status: newStatus, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
  if (eventType === "complained") {
    await fetch(`${SUPABASE_URL}/rest/v1/email_suppressions`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        email,
        reason: "complained (spam report)"
      })
    });
  }
}
__name(updateLeadState, "updateLeadState");
async function onRequestPost4(context) {
  const { request } = context;
  const SUPABASE_URL = context.env.OUTREACH_SUPABASE_URL || "";
  const SUPABASE_KEY = context.env.OUTREACH_SUPABASE_KEY || "";
  const WEBHOOK_SECRET = context.env.RESEND_WEBHOOK_SECRET || "";
  try {
    if (WEBHOOK_SECRET) {
      const signature = request.headers.get("svix-signature") || "";
      if (!signature) {
        return new Response(JSON.stringify({ error: "Missing signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    const body = await request.text();
    const events = JSON.parse(body);
    const eventList = Array.isArray(events) ? events : [events];
    const results = [];
    for (const event of eventList) {
      const leadEmail = event.data?.to?.[0] || event.data?.to || "";
      const eventType = (event.type || "").replace("email.", "") || "unknown";
      const result = await insertEvent(event, SUPABASE_URL, SUPABASE_KEY);
      results.push({ event: eventType, email: leadEmail, ...result });
      if (eventType === "bounced" || eventType === "complained") {
        await updateLeadState(leadEmail, eventType, SUPABASE_URL, SUPABASE_KEY);
      }
    }
    return new Response(JSON.stringify({ received: results.length, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestPost4, "onRequestPost");
async function onRequestGet4(context) {
  const SUPABASE_URL = context.env.OUTREACH_SUPABASE_URL || "";
  const SUPABASE_KEY = context.env.OUTREACH_SUPABASE_KEY || "";
  return new Response(JSON.stringify({
    status: "ok",
    endpoint: "resend-webhook",
    configured: !!(SUPABASE_URL && SUPABASE_KEY)
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequestGet4, "onRequestGet");

// api/stripe-connect-onboard.js
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json7, "json");
async function supabaseQuery3(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  if (method === "PATCH") headers["Prefer"] = "return=minimal";
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") {
    const data = await resp.json();
    if (!resp.ok) {
      console.error(`[supabaseQuery] ${table} GET failed: ${resp.status}`, data);
      return null;
    }
    return data;
  }
  return resp;
}
__name(supabaseQuery3, "supabaseQuery");
async function onRequestPost5(context) {
  const { request, env } = context;
  const STRIPE_KEY = env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!STRIPE_KEY) return json7({ error: "Stripe not configured" }, 500);
  if (!SUPABASE_URL || !SUPABASE_KEY) return json7({ error: "Server not configured" }, 500);
  try {
    const body = await request.json();
    const { userId } = body;
    if (!userId) return json7({ error: "userId is required" }, 400);
    const profiles = await supabaseQuery3(
      SUPABASE_URL,
      SUPABASE_KEY,
      "profiles",
      `?id=eq.${userId}&select=stripe_account_id,business_name,full_name`
    );
    if (!profiles || profiles.length === 0) return json7({ error: "User not found" }, 404);
    const profile = profiles[0];
    const origin = new URL(request.url).origin;
    let accountId = profile.stripe_account_id;
    if (!accountId || accountId === "buildlogg-shared") {
      const accountParams = new URLSearchParams({
        "type": "express",
        "country": "GB",
        "metadata[user_id]": userId
      });
      const accountResp = await fetch("https://api.stripe.com/v1/accounts", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: accountParams.toString()
      });
      const account = await accountResp.json();
      if (!accountResp.ok) {
        console.error("[stripe-connect] Account creation failed:", account);
        const errMsg = account.error?.message || "Could not create Stripe account";
        return json7({ error: errMsg }, 500);
      }
      accountId = account.id;
      await supabaseQuery3(
        SUPABASE_URL,
        SUPABASE_KEY,
        "profiles",
        `?id=eq.${userId}`,
        "PATCH",
        { stripe_account_id: accountId }
      );
    }
    const linkParams = new URLSearchParams({
      "account": accountId,
      "type": "account_onboarding",
      "return_url": `${origin}/app/settings?stripe=return`,
      "refresh_url": `${origin}/app/settings?stripe=refresh`
    });
    const linkResp = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: linkParams.toString()
    });
    const link = await linkResp.json();
    if (!linkResp.ok) {
      console.error("[stripe-connect] Account link creation failed:", link);
      return json7({ error: "Could not create onboarding link" }, 500);
    }
    return json7({ url: link.url, accountId }, 200);
  } catch (err) {
    console.error("[stripe-connect] Error:", err.message, err.stack);
    return json7({ error: err.message || "Something went wrong" }, 500);
  }
}
__name(onRequestPost5, "onRequestPost");

// api/stripe-webhook.js
async function supabaseQuery4(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  if (method === "PATCH") headers["Prefer"] = "return=minimal";
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") return resp.json();
  return resp;
}
__name(supabaseQuery4, "supabaseQuery");
async function verifySignature(payload, signatureHeader, secret) {
  const parts = signatureHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.split("=")[1];
  const v1Signature = parts.find((p) => p.startsWith("v1="))?.split("=")[1];
  if (!timestamp || !v1Signature) return false;
  const age = Math.floor(Date.now() / 1e3) - parseInt(timestamp);
  if (age > 300) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const computedSignature = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computedSignature === v1Signature;
}
__name(verifySignature, "verifySignature");
async function onRequestPost6(context) {
  const { request, env } = context;
  const WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    return new Response("Server not configured", { status: 500 });
  }
  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature");
  if (!signature) {
    return new Response("Missing signature", { status: 400 });
  }
  const isValid = await verifySignature(payload, signature, WEBHOOK_SECRET);
  if (!isValid) {
    return new Response("Invalid signature", { status: 400 });
  }
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode === "subscription") {
      const userId = session.metadata?.user_id || session.client_reference_id;
      if (userId) {
        try {
          await supabaseQuery4(
            SUPABASE_URL,
            SUPABASE_KEY,
            "profiles",
            `?id=eq.${userId}`,
            "PATCH",
            { subscription_status: "active", stripe_customer_id: session.customer }
          );
          console.log("[stripe-webhook] Subscription activated for user:", userId);
        } catch (err) {
          console.error("[stripe-webhook] Subscription profile update failed:", err);
        }
      }
      return new Response("OK", { status: 200 });
    }
    const sessionId = session.id;
    const metadata = session.metadata || {};
    const merchantId = metadata.merchant_id;
    const jobId = metadata.job_id || null;
    const type = metadata.type || "deposit";
    const amountPaid = session.amount_total ? session.amount_total / 100 : 0;
    try {
      const sessions = await supabaseQuery4(
        SUPABASE_URL,
        SUPABASE_KEY,
        "checkout_sessions",
        `?stripe_session_id=eq.${sessionId}&select=*`
      );
      if (!sessions || sessions.length === 0) {
        console.warn("[stripe-webhook] No checkout_sessions record for session:", sessionId);
        return new Response("OK", { status: 200 });
      }
      const checkoutRecord = sessions[0];
      if (checkoutRecord.status === "paid") {
        return new Response("OK (already processed)", { status: 200 });
      }
      if (jobId) {
        const jobs = await supabaseQuery4(
          SUPABASE_URL,
          SUPABASE_KEY,
          "jobs",
          `?id=eq.${jobId}&select=status`
        );
        const currentStatus = jobs && jobs.length > 0 ? jobs[0].status : null;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const jobPatch = { deposit_status: "paid", deposit_paid_at: now, updated_at: now };
        if (type === "deposit" && currentStatus === "quoted") {
          jobPatch.status = "booked";
        } else if (type === "full") {
          jobPatch.status = "paid";
          jobPatch.actual_end = now;
        }
        await supabaseQuery4(
          SUPABASE_URL,
          SUPABASE_KEY,
          "jobs",
          `?id=eq.${jobId}`,
          "PATCH",
          jobPatch
        );
        await supabaseQuery4(SUPABASE_URL, SUPABASE_KEY, "payments", "", "POST", {
          job_id: jobId,
          type: type === "deposit" ? "deposit" : "full",
          method: "card",
          amount: amountPaid,
          recorded_at: now,
          created_at: now
        });
      }
      if (!jobId && checkoutRecord.booking_request_id) {
        await supabaseQuery4(
          SUPABASE_URL,
          SUPABASE_KEY,
          "booking_requests",
          `?id=eq.${checkoutRecord.booking_request_id}`,
          "PATCH",
          { status: "deposit_paid", deposit_amount: amountPaid }
        );
      }
      await supabaseQuery4(
        SUPABASE_URL,
        SUPABASE_KEY,
        "checkout_sessions",
        `?id=eq.${checkoutRecord.id}`,
        "PATCH",
        { status: "paid", paid_at: (/* @__PURE__ */ new Date()).toISOString() }
      );
      console.log("[stripe-webhook] Payment processed:", sessionId, "amount:", amountPaid);
      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("[stripe-webhook] Processing error:", err);
      return new Response("OK (error logged)", { status: 200 });
    }
  }
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const userId = sub.metadata?.user_id;
    if (userId) {
      try {
        const status = sub.status;
        const endsAt = sub.current_period_end ? new Date(sub.current_period_end * 1e3).toISOString() : null;
        const patch = {};
        if (status === "active" || status === "trialing") {
          patch.subscription_status = status;
        } else if (status === "canceled") {
          patch.subscription_status = "canceled";
        } else if (status === "unpaid" || status === "past_due") {
          patch.subscription_status = "expired";
        }
        if (endsAt) patch.subscription_ends_at = endsAt;
        if (Object.keys(patch).length > 0) {
          await supabaseQuery4(
            SUPABASE_URL,
            SUPABASE_KEY,
            "profiles",
            `?id=eq.${userId}`,
            "PATCH",
            patch
          );
          console.log("[stripe-webhook] Subscription updated:", userId, status);
        }
      } catch (err) {
        console.error("[stripe-webhook] Subscription update failed:", err);
      }
    }
    return new Response("OK", { status: 200 });
  }
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const userId = sub.metadata?.user_id;
    if (userId) {
      try {
        await supabaseQuery4(
          SUPABASE_URL,
          SUPABASE_KEY,
          "profiles",
          `?id=eq.${userId}`,
          "PATCH",
          { subscription_status: "canceled" }
        );
        console.log("[stripe-webhook] Subscription canceled:", userId);
      } catch (err) {
        console.error("[stripe-webhook] Subscription cancel failed:", err);
      }
    }
    return new Response("OK", { status: 200 });
  }
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object;
    console.error("[stripe-webhook] Dispute created:", dispute.id, "amount:", dispute.amount, "reason:", dispute.reason);
    return new Response("OK", { status: 200 });
  }
  if (event.type === "account.updated") {
    const acct = event.data.object;
    const userId = acct.metadata?.user_id;
    if (!userId) return new Response("OK", { status: 200 });
    try {
      const connected = acct.details_submitted && acct.payouts_enabled;
      await supabaseQuery4(
        SUPABASE_URL,
        SUPABASE_KEY,
        "profiles",
        `?id=eq.${userId}`,
        "PATCH",
        { stripe_connected: connected }
      );
      console.log("[stripe-webhook] Account updated:", userId, "connected:", connected);
    } catch (err) {
      console.error("[stripe-webhook] Account update failed:", err);
    }
    return new Response("OK", { status: 200 });
  }
  return new Response("OK", { status: 200 });
}
__name(onRequestPost6, "onRequestPost");

// book/payment-cancelled.js
function onRequestGet5() {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment cancelled</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;color:#111827}h1{font-size:24px;margin-bottom:8px}p{color:#6b7280;margin-bottom:24px}a{color:#111827;font-weight:600}</style></head><body><h1>Payment cancelled</h1><p>Your payment was not completed. You can try again later.</p></body></html>`, { headers: { "Content-Type": "text/html" } });
}
__name(onRequestGet5, "onRequestGet");

// book/payment-success.js
function onRequestGet6() {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment successful</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;color:#111827}h1{font-size:24px;margin-bottom:8px}.check{width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}p{color:#6b7280;margin-bottom:24px}a{color:#111827;font-weight:600}</style></head><body><div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div><h1>Payment successful</h1><p>Your payment has been received. The merchant will be in touch shortly.</p></body></html>`, { headers: { "Content-Type": "text/html" } });
}
__name(onRequestGet6, "onRequestGet");

// book/[[slug]].js
function isValidPhone(phone) {
  if (/^\+\d{7,15}$/.test(phone)) return true;
  if (/^0\d{10}$/.test(phone)) return true;
  if (/^44\d{10}$/.test(phone)) return true;
  if (/^00\d{7,15}$/.test(phone)) return true;
  return false;
}
__name(isValidPhone, "isValidPhone");
function normalizePhoneForServer(phone) {
  const cleaned = phone.replace(/[\s-()]/g, "");
  if (/^0\d{10}$/.test(cleaned)) return "+44" + cleaned.slice(1);
  if (/^44\d{10}$/.test(cleaned)) return "+" + cleaned;
  if (/^00\d{7,15}$/.test(cleaned)) return "+" + cleaned.slice(2);
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  return cleaned;
}
__name(normalizePhoneForServer, "normalizePhoneForServer");
function json8(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json8, "json");
function html(content, status = 200) {
  return new Response(content, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(html, "html");
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeHtml, "escapeHtml");
async function supabaseQuery5(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") return resp.json();
  return resp;
}
__name(supabaseQuery5, "supabaseQuery");
function getLondonOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const get = /* @__PURE__ */ __name((t) => parseInt(parts.find((p) => p.type === t).value), "get");
  const hr = get("hour") === 24 ? 0 : get("hour");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hr, get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 6e4);
}
__name(getLondonOffsetMinutes, "getLondonOffsetMinutes");
function londonToUtc(dateStr, timeStr) {
  const tentative = /* @__PURE__ */ new Date(dateStr + "T" + timeStr + ":00.000Z");
  const offsetMin = getLondonOffsetMinutes(tentative);
  return new Date(tentative.getTime() - offsetMin * 6e4);
}
__name(londonToUtc, "londonToUtc");
function londonDateStr(date) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = dtf.formatToParts(date);
  const get = /* @__PURE__ */ __name((t) => parts.find((p) => p.type === t).value, "get");
  return `${get("year")}-${get("month")}-${get("day")}`;
}
__name(londonDateStr, "londonDateStr");
var UK_BANK_HOLIDAYS = ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-26"];
function computeAvailableSlots(bookedSlots, serviceDurationMin, bufferHours, daysAhead, workingDays, hoursStart, hoursEnd, blockedDates, breakStart, breakEnd, hoursPerDayRaw) {
  workingDays = workingDays || [1, 2, 3, 4, 5];
  hoursStart = hoursStart || "09:00";
  hoursEnd = hoursEnd || "17:00";
  blockedDates = blockedDates || [];
  const hoursPerDay = hoursPerDayRaw ? typeof hoursPerDayRaw === "string" ? JSON.parse(hoursPerDayRaw) : hoursPerDayRaw : null;
  const breakStartMin = breakStart ? parseInt(breakStart.split(":")[0]) * 60 + parseInt(breakStart.split(":")[1]) : null;
  const breakEndMin = breakEnd ? parseInt(breakEnd.split(":")[0]) * 60 + parseInt(breakEnd.split(":")[1]) : null;
  const hasBreak = breakStartMin !== null && breakEndMin !== null && breakStartMin < breakEndMin;
  const slots = [];
  const now = /* @__PURE__ */ new Date();
  const bufferMs = bufferHours * 60 * 60 * 1e3;
  const earliest = new Date(now.getTime() + bufferMs);
  for (let d = 0; d < daysAhead; d++) {
    const dayDate = new Date(now.getTime() + d * 864e5);
    const dayOfWeek = dayDate.getDay();
    const dateStr = londonDateStr(dayDate);
    if (!workingDays.includes(dayOfWeek)) continue;
    if (blockedDates.includes(dateStr)) continue;
    if (UK_BANK_HOLIDAYS.includes(dateStr)) continue;
    const dayKey = String(dayOfWeek);
    const dayOverride = hoursPerDay?.[dayKey];
    const effStart = dayOverride?.start || hoursStart;
    const effEnd = dayOverride?.end || hoursEnd;
    const startH = parseInt(effStart.split(":")[0]);
    const startM = parseInt(effStart.split(":")[1]);
    const endH = parseInt(effEnd.split(":")[0]);
    const endM = parseInt(effEnd.split(":")[1]);
    const endMinutes = endH * 60 + endM;
    const daySlots = [];
    for (let h = startH; h <= endH; h++) {
      for (let m = h === startH ? startM : 0; m < 60; m += serviceDurationMin) {
        const slotStartMin = h * 60 + m;
        const slotEndMinutes = slotStartMin + serviceDurationMin;
        if (slotEndMinutes > endMinutes) break;
        if (hasBreak && slotStartMin < breakEndMin && slotEndMinutes > breakStartMin) continue;
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const slotStart = londonToUtc(dateStr, timeStr);
        const slotEnd = new Date(slotStart.getTime() + serviceDurationMin * 60 * 1e3);
        if (slotStart < earliest) continue;
        const isBooked = bookedSlots.some((b) => {
          const bS = new Date(b.start), bE = new Date(b.end);
          return slotStart < bE && slotEnd > bS;
        });
        if (!isBooked) {
          daySlots.push(timeStr);
        }
      }
    }
    if (daySlots.length > 0) slots.push({ date: dateStr, times: daySlots });
  }
  return slots;
}
__name(computeAvailableSlots, "computeAvailableSlots");
function renderBookingPage(merchant, services, availableSlots) {
  const bn = merchant.business_name || merchant.full_name;
  const tl = merchant.trade === "other" ? merchant.trade_other || "" : merchant.trade || "";
  const sp = merchant.booking_show_phone !== false;
  const ph = sp && merchant.phone ? `<a href="tel:${merchant.phone}" class="phone">\u{1F4DE} ${merchant.phone}</a>` : "";
  const logo = merchant.logo_data_url ? '<img src="' + merchant.logo_data_url + '" alt="' + escapeHtml(bn) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block"/>' : "";
  const sh = services.length > 0 ? services.map((s, i) => {
    const p = s.amount > 0 ? `\xA3${s.amount.toFixed(0)}` : "Price on enquiry";
    const d = s.duration_minutes && s.duration_minutes !== 60 ? `${s.duration_minutes} min` : "1 hour";
    return `<div class="service" data-idx="${i}" data-desc="${escapeHtml(s.description)}" data-amount="${s.amount}" data-duration="${s.duration_minutes || 60}"><div class="service-name">${escapeHtml(s.description)}</div><div class="service-meta">${p} \xB7 ${d}</div>${s.detail ? `<div class="service-detail">${escapeHtml(s.detail)}</div>` : ""}</div>`;
  }).join("") : `<div class="no-services"><p>${escapeHtml(bn)} hasn't set up their services yet.</p>${ph ? `<p>Contact them directly:</p>${ph}` : ""}</div>`;
  const dj = JSON.stringify(availableSlots);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${escapeHtml(bn)} \u2014 Book online | Buildlogg</title><meta name="description" content="Book ${escapeHtml(tl)} services with ${escapeHtml(bn)}. Available times this week."><meta property="og:title" content="Book ${escapeHtml(bn)}"><meta property="og:description" content="${escapeHtml(tl)} services. Book online with Buildlogg."><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;color:#111827;line-height:1.5}.container{max-width:480px;margin:0 auto;padding:20px 16px 40px}.header{text-align:center;margin-bottom:24px;padding:24px 0}.header h1{font-size:24px;font-weight:700;margin-bottom:4px}.header .trade{font-size:14px;color:#6b7280}.phone{display:inline-block;margin-top:8px;font-size:16px;color:#111827;text-decoration:none;font-weight:600}.section{margin-bottom:24px}.label{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}.service{padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:8px;cursor:pointer;transition:border-color .15s,background .15s}.service.selected{border-color:#111827;border-width:2px;background:#f9fafb}.service-name{font-size:16px;font-weight:600}.service-meta{font-size:14px;color:#6b7280;margin-top:2px}.service-detail{font-size:13px;color:#9ca3af;margin-top:4px}.no-services{text-align:center;padding:32px;color:#6b7280}.summary{display:none;padding:12px 16px;background:#111827;color:#fff;border-radius:12px;margin-bottom:16px;font-size:14px;font-weight:600}.summary.show{display:block}select,input,textarea{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:16px;font-family:inherit;margin-bottom:8px}select:disabled,input:disabled,textarea:disabled{background:#f3f4f6;color:#9ca3af}.btn{width:100%;padding:14px;background:#111827;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer}.btn:disabled{background:#d1d5db;cursor:not-allowed}.hidden{display:none}.slot-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.slot{padding:10px 8px;text-align:center;background:#fff;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500}.slot.selected{background:#111827;color:#fff;border-color:#111827}.error{color:#ef4444;font-size:14px;margin-bottom:8px}.success{text-align:center;padding:32px}.success h2{font-size:20px;margin-bottom:8px}.success p{color:#6b7280}</style></head><body><div class="container"><div class="header">${logo}<h1>${escapeHtml(bn)}</h1><div class="trade">${escapeHtml(tl)}</div>${ph}</div><form id="bookingForm" onsubmit="return submitBooking(event)"><div id="errorMsg" class="error"></div><div class="section"><div class="label">Choose a service</div>${sh}</div><div id="summaryBar" class="summary"></div><div id="dateSection" class="section hidden"><div class="label">Pick a date</div><a href="#" onclick="changeService();return false" style="font-size:13px;color:#6b7280;margin-bottom:8px;display:block">Change service</a><select id="dateSelect" onchange="updateSlots()"></select></div><div id="timeSection" class="section hidden"><div class="label">Pick a time</div><a href="#" onclick="changeDate();return false" style="font-size:13px;color:#6b7280;margin-bottom:8px;display:block">Change date</a><div id="slotGrid" class="slot-grid"></div></div><div id="detailsSection" class="section hidden"><div class="label">Your details</div><input id="clientName" placeholder="Your name" required><input id="clientPhone" type="tel" placeholder="Mobile number (e.g. +44 7700 900123)" required><input id="clientEmail" type="email" placeholder="Email (for confirmation)" required><textarea id="notes" placeholder="Notes (optional)" rows="2"></textarea><div class="label" style="margin-top:12px">How did you hear about us?</div><select id="referralSource"><option value="">Select...</option><option value="google">Google search</option><option value="instagram">Instagram/Facebook</option><option value="recommended">Recommended by someone</option><option value="saw_work">Saw your work</option><option value="other">Other</option></select><input id="referralDetail" class="hidden" placeholder="Who recommended you?"></div><button id="submitBtn" class="btn" disabled>Request booking</button></form><div id="successPage" class="hidden"><div class="success"><div style="font-size:48px;margin-bottom:16px">\u2705</div><h2>Booking request sent!</h2><p>${escapeHtml(bn)} will be in touch soon to confirm.</p></div></div></div><script>const SLOTS=${dj};function changeService(){document.querySelectorAll('.service').forEach(s=>s.classList.remove('selected'));updateSummary();document.getElementById('dateSection').classList.add('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');document.getElementById('summaryBar').classList.remove('show');document.getElementById('submitBtn').disabled=true;window.scrollTo({top:0,behavior:'smooth'})}function changeDate(){document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');document.getElementById('submitBtn').disabled=true;document.getElementById('dateSection').scrollIntoView({behavior:'smooth'})}function changeTime(){document.getElementById('detailsSection').classList.add('hidden');document.getElementById('submitBtn').disabled=true;document.getElementById('timeSection').scrollIntoView({behavior:'smooth'})}function updateSummary(){const sel=document.querySelectorAll('.service.selected');const bar=document.getElementById('summaryBar');if(sel.length===0){bar.classList.remove('show');return}let total=0,maxDur=0;sel.forEach(s=>{total+=parseFloat(s.dataset.amount||0);maxDur=Math.max(maxDur,parseInt(s.dataset.duration||60))});const hrs=Math.round(maxDur/60*10)/10;const hrLabel=hrs===1?'~1 hour':'~'+hrs+' hours';const priceLabel=total>0?'\xA3'+total.toFixed(0):'Price on enquiry';bar.textContent=sel.length+' service'+(sel.length>1?'s':'')+' \xB7 '+priceLabel+' \xB7 '+hrLabel;bar.classList.add('show')}document.querySelectorAll('.service').forEach(el=>{el.addEventListener('click',()=>{el.classList.toggle('selected');updateSummary();const sel=document.querySelectorAll('.service.selected');if(sel.length===0){document.getElementById('dateSection').classList.add('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');document.getElementById('submitBtn').disabled=true;return}let maxDur=0;sel.forEach(s=>{maxDur=Math.max(maxDur,parseInt(s.dataset.duration||60))});const ds=document.getElementById('dateSelect');let curSlots=SLOTS[maxDur];if(!curSlots){const keys=Object.keys(SLOTS).map(Number).sort((a,b)=>a-b);for(const k of keys){if(k>=maxDur){curSlots=SLOTS[k];break}}if(!curSlots)curSlots=SLOTS[keys[0]]}ds.innerHTML=curSlots.map(s=>{const d=new Date(s.date+'T00:00:00');return'<option value="'+s.date+'">'+d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+' ('+s.times.length+' slots)</option>'}).join('');document.getElementById('dateSection').classList.remove('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');updateSlots()})});function updateSlots(){const d=document.getElementById('dateSelect').value;const sel=document.querySelectorAll('.service.selected');let maxDur=0;sel.forEach(s=>{maxDur=Math.max(maxDur,parseInt(s.dataset.duration||60))});let curSlots=SLOTS[maxDur];if(!curSlots){const keys=Object.keys(SLOTS).map(Number).sort((a,b)=>a-b);for(const k of keys){if(k>=maxDur){curSlots=SLOTS[k];break}}if(!curSlots)curSlots=SLOTS[Object.keys(SLOTS)[0]]}const sd=curSlots.find(s=>s.date===d);const g=document.getElementById('slotGrid');if(!sd){g.innerHTML='<p style="color:#6b7280;padding:16px">No slots available for this duration on this day.</p>';return}g.innerHTML=sd.times.map(t=>{const h=parseInt(t.split(':')[0]),m=t.split(':')[1];const l=h>12?(h-12)+':'+m+'pm':h+':'+m+'am';return'<div class="slot" data-time="'+t+'" onclick="selectSlot(this)">'+l+'</div>'}).join('');document.getElementById('timeSection').classList.remove('hidden');document.getElementById('selectedTime').value='';document.getElementById('detailsSection').classList.add('hidden')}function selectSlot(el){document.querySelectorAll('.slot').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');document.getElementById('detailsSection').classList.remove('hidden');document.getElementById('submitBtn').disabled=false}document.getElementById('referralSource').addEventListener('change',e=>{const d=document.getElementById('referralDetail');if(e.target.value==='recommended')d.classList.remove('hidden');else d.classList.add('hidden')});async function submitBooking(e){e.preventDefault();const b=document.getElementById('submitBtn'),err=document.getElementById('errorMsg');err.textContent='';b.disabled=true;b.textContent='Sending...';const sel=document.querySelectorAll('.service.selected');const services=Array.from(sel).map(s=>({description:s.dataset.desc,amount:parseFloat(s.dataset.amount||0),duration:parseInt(s.dataset.duration||60)}));const body={services:services,clientName:document.getElementById('clientName').value.trim(),clientPhone:document.getElementById('clientPhone').value.trim(),clientEmail:document.getElementById('clientEmail').value.trim()||undefined,requestedDate:document.getElementById('dateSelect').value,requestedTime:document.querySelector('.slot.selected')?document.querySelector('.slot.selected').dataset.time:'',notes:document.getElementById('notes').value.trim()||undefined,referralSource:document.getElementById('referralSource').value||undefined,referralDetail:document.getElementById('referralDetail').value.trim()||undefined};try{const r=await fetch(window.location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const res=await r.json();if(r.ok){if(res.redirectUrl){window.location.href=res.redirectUrl;return false}document.getElementById('bookingForm').classList.add('hidden');document.getElementById('successPage').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'})}else{err.textContent=res.error||'Something went wrong';b.disabled=false;b.textContent='Request booking'}}catch(ex){err.textContent='Network error';b.disabled=false;b.textContent='Request booking'}return false}<\/script></body></html>`;
}
__name(renderBookingPage, "renderBookingPage");
function render404() {
  return html(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#6b7280}h1{color:#111827;font-size:20px}</style></head><body><h1>Booking page not found</h1><p>This booking page doesn't exist or has been disabled.</p></body></html>`, 404);
}
__name(render404, "render404");
function renderNoSlots(m) {
  const bn = m.business_name || m.full_name;
  const ph = m.booking_show_phone !== false && m.phone ? `<p>Contact: <a href="tel:${m.phone}">${m.phone}</a></p>` : "";
  return html(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(bn)} \u2014 Fully booked</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#6b7280}h1{color:#111827;font-size:20px}</style></head><body><h1>${escapeHtml(bn)} is fully booked</h1><p>No available slots for the next 2 weeks.</p>${ph}</body></html>`);
}
__name(renderNoSlots, "renderNoSlots");
async function onRequest(context) {
  const { request, env, params } = context;
  const slug = params.slug ? params.slug[0] : "";
  if (!slug) return render404();
  const SU = env.SUPABASE_URL, SK = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SU || !SK) return html("<!DOCTYPE html><html><body><h1>Booking temporarily unavailable</h1></body></html>", 500);
  if (request.method === "GET") {
    try {
      const profiles = await supabaseQuery5(SU, SK, "profiles", `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=*`);
      if (!profiles || profiles.length === 0) return render404();
      const merchant = profiles[0];
      const services = await supabaseQuery5(SU, SK, "custom_items", `?user_id=eq.${merchant.id}&is_public=eq.true&order=sort_order&select=*`);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const bookedJobs = await supabaseQuery5(SU, SK, "jobs", `?user_id=eq.${merchant.id}&status=in.(booked,in_progress)&scheduled_start=gte.${now}&select=scheduled_start,scheduled_end`);
      const bookedSlots = (bookedJobs || []).filter((j) => j.scheduled_start).map((j) => ({ start: j.scheduled_start, end: j.scheduled_end || j.scheduled_start }));
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1e3).toISOString();
      const pendingRequests = await supabaseQuery5(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time,service_amount`);
      for (const r of pendingRequests || []) {
        if (!r.requested_date || !r.requested_time) continue;
        const start = londonToUtc(r.requested_date, r.requested_time).toISOString();
        const dur = r.total_duration || r.service_amount && 60 || 60;
        const end = new Date(new Date(start).getTime() + dur * 60 * 1e3).toISOString();
        bookedSlots.push({ start, end });
      }
      const exp = new Date(Date.now() - 72 * 60 * 60 * 1e3).toISOString();
      await supabaseQuery5(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=lt.${exp}`, "PATCH", { status: "expired" });
      const bh = merchant.booking_buffer_hours || 24;
      const durations = [...new Set((services || []).map((s) => s.duration_minutes || 60))];
      if (durations.length === 0) durations.push(60);
      const slotsByDuration = {};
      let anySlots = false;
      for (const dur of durations) {
        const s = computeAvailableSlots(bookedSlots, dur, bh, 14, merchant.booking_working_days, merchant.booking_hours_start, merchant.booking_hours_end, merchant.booking_blocked_dates, merchant.booking_break_start, merchant.booking_break_end, merchant.booking_hours_per_day);
        slotsByDuration[dur] = s;
        if (s.length > 0) anySlots = true;
      }
      if (!anySlots) return renderNoSlots(merchant);
      return html(renderBookingPage(merchant, services || [], slotsByDuration));
    } catch (err) {
      console.error("[booking] GET:", err);
      return html("<!DOCTYPE html><html><body><h1>Error</h1></body></html>", 500);
    }
  }
  if (request.method === "POST") {
    try {
      const body = await request.json();
      let services;
      if (body.services && Array.isArray(body.services) && body.services.length > 0) {
        services = body.services;
      } else {
        services = [{
          description: body.serviceDescription,
          amount: body.serviceAmount || 0,
          duration: body.serviceDuration || 60
        }];
      }
      for (const s of services) {
        if (!s.description || String(s.description).trim() === "") {
          return json8({ error: "Service description is required" }, 400);
        }
      }
      const totalAmount = services.reduce((sum, s) => sum + (s.amount || 0), 0);
      const totalDuration = services.reduce((sum, s) => sum + (s.duration || 60), 0);
      const slotDuration = Math.max(...services.map((s) => s.duration || 60));
      const combinedDescription = services.map((s) => s.description).join(" + ");
      const req = ["clientName", "clientPhone", "requestedDate", "requestedTime"];
      for (const f of req) {
        if (!body[f] || String(body[f]).trim() === "") return json8({ error: `${f} is required` }, 400);
      }
      const phone = body.clientPhone.replace(/[\s-]/g, "");
      if (!body.clientEmail || String(body.clientEmail).trim() === "") return json8({ error: "Please enter your email so we can send you a booking confirmation" }, 400);
      if (!isValidPhone(phone)) return json8({ error: "Please enter a valid phone number with country code (e.g. +44 7700 900123)" }, 400);
      const normalizedPhone = normalizePhoneForServer(phone);
      const profiles = await supabaseQuery5(SU, SK, "profiles", `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=id,booking_buffer_hours,booking_working_days,booking_hours_start,booking_hours_end,booking_blocked_dates,booking_break_start,booking_break_end,booking_hours_per_day,payment_terms,stripe_connected,stripe_account_id`);
      if (!profiles || profiles.length === 0) return json8({ error: "Booking page not found" }, 404);
      const merchant = profiles[0];
      const oneHrAgo = new Date(Date.now() - 60 * 60 * 1e3).toISOString();
      const recent = await supabaseQuery5(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&client_phone=eq.${encodeURIComponent(normalizedPhone)}&status=eq.pending&created_at=gte.${oneHrAgo}&select=id`);
      if (recent && recent.length >= 3) return json8({ error: "You've already sent a request. They'll be in touch soon." }, 429);
      const requestedDate = body.requestedDate;
      const requestedTime = body.requestedTime;
      const slotStart = londonToUtc(requestedDate, requestedTime);
      const now = /* @__PURE__ */ new Date();
      const maxDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1e3);
      const requestedDateObj = /* @__PURE__ */ new Date(requestedDate + "T00:00:00.000Z");
      if (requestedDateObj > maxDate) return json8({ error: "Requested date must be within the next 14 days" }, 400);
      if (slotStart <= now) return json8({ error: "Requested time must be in the future" }, 400);
      const bJobs = await supabaseQuery5(SU, SK, "jobs", `?user_id=eq.${merchant.id}&status=in.(booked,in_progress)&scheduled_start=gte.${now.toISOString()}&select=scheduled_start,scheduled_end`);
      const sE = new Date(slotStart.getTime() + slotDuration * 60 * 1e3);
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1e3).toISOString();
      const pendingRequests = await supabaseQuery5(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time`);
      const isBooked = (bJobs || []).some((j) => {
        if (!j.scheduled_start) return false;
        const bS = new Date(j.scheduled_start), bE = new Date(j.scheduled_end || j.scheduled_start);
        return slotStart < bE && sE > bS;
      }) || (pendingRequests || []).some((r) => {
        if (!r.requested_date || !r.requested_time) return false;
        const pS = londonToUtc(r.requested_date, r.requested_time);
        const pDur = r.total_duration || 60;
        const pE = new Date(pS.getTime() + pDur * 60 * 1e3);
        return slotStart < pE && sE > pS;
      });
      if (isBooked) return json8({ error: "That time was just booked. Please pick another time." }, 409);
      const wDays = merchant.booking_working_days || [1, 2, 3, 4, 5];
      const reqDayOfWeek = (/* @__PURE__ */ new Date(requestedDate + "T00:00:00.000Z")).getUTCDay();
      if (!wDays.includes(reqDayOfWeek)) return json8({ error: "That day is not available. Please pick another day." }, 409);
      const wBlocked = merchant.booking_blocked_dates || [];
      if (wBlocked.includes(requestedDate)) return json8({ error: "That day is not available. Please pick another day." }, 409);
      if (UK_BANK_HOLIDAYS.includes(requestedDate)) return json8({ error: "That day is not available. Please pick another day." }, 409);
      const dayKey = String(reqDayOfWeek);
      const hoursPerDayParsed = merchant.booking_hours_per_day ? typeof merchant.booking_hours_per_day === "string" ? JSON.parse(merchant.booking_hours_per_day) : merchant.booking_hours_per_day : null;
      const dayOverride = hoursPerDayParsed?.[dayKey];
      const effStart = dayOverride?.start || merchant.booking_hours_start || "09:00";
      const effEnd = dayOverride?.end || merchant.booking_hours_end || "17:00";
      const reqMinutes = parseInt(requestedTime.split(":")[0]) * 60 + parseInt(requestedTime.split(":")[1]);
      const startMin = parseInt(effStart.split(":")[0]) * 60 + parseInt(effStart.split(":")[1]);
      const endMin = parseInt(effEnd.split(":")[0]) * 60 + parseInt(effEnd.split(":")[1]);
      if (reqMinutes < startMin || reqMinutes + slotDuration > endMin) return json8({ error: "That time is outside working hours" }, 409);
      if (merchant.booking_break_start && merchant.booking_break_end) {
        const bStart = parseInt(merchant.booking_break_start.split(":")[0]) * 60 + parseInt(merchant.booking_break_start.split(":")[1]);
        const bEnd = parseInt(merchant.booking_break_end.split(":")[0]) * 60 + parseInt(merchant.booking_break_end.split(":")[1]);
        if (reqMinutes < bEnd && reqMinutes + slotDuration > bStart) return json8({ error: "That time is during a break period" }, 409);
      }
      const insertBody = {
        merchant_id: merchant.id,
        service_description: combinedDescription,
        service_amount: totalAmount,
        client_name: body.clientName.trim(),
        client_phone: normalizedPhone,
        client_email: body.clientEmail || null,
        requested_date: body.requestedDate,
        requested_time: body.requestedTime,
        notes: body.notes || null,
        referral_source: body.referralSource || null,
        referral_detail: body.referralDetail || null
      };
      let insertResp = await supabaseQuery5(SU, SK, "booking_requests", "", "POST", {
        ...insertBody,
        service_items: JSON.stringify(services),
        total_duration: totalDuration
      });
      if (!insertResp || !insertResp.ok) {
        console.warn("[booking] Multi-service insert failed, falling back to single-service");
        insertResp = await supabaseQuery5(SU, SK, "booking_requests", "", "POST", insertBody);
      }
      if (!insertResp || !insertResp.ok) {
        console.error("[booking] insert failed:", insertResp?.status);
        return json8({ error: "Could not submit booking" }, 500);
      }
      let bookingRequestId = "";
      try {
        const respText = await insertResp.text();
        if (respText) {
          const respData = JSON.parse(respText);
          const row = Array.isArray(respData) ? respData[0] : respData;
          bookingRequestId = row?.id || "";
        }
      } catch {
      }
      if (merchant.payment_terms === "deposit" && merchant.stripe_connected && merchant.deposit_pct > 0 && totalAmount > 0) {
        const depositAmount = totalAmount * (merchant.deposit_pct / 100);
        if (depositAmount >= 0.5) {
          const STRIPE_KEY = env.STRIPE_SECRET_KEY;
          if (STRIPE_KEY) {
            try {
              const merchantName = merchant.business_name || merchant.full_name || "Buildlogg merchant";
              const sessionBody = new URLSearchParams({
                "mode": "payment",
                "line_items[0][quantity]": "1",
                "line_items[0][price_data][currency]": "gbp",
                "line_items[0][price_data][product_data][name]": `Deposit for ${merchantName}`,
                "line_items[0][price_data][unit_amount]": String(Math.round(depositAmount * 100)),
                "success_url": `${new URL(request.url).origin}/book/payment-success`,
                "cancel_url": `${new URL(request.url).origin}/book/payment-cancelled`,
                "metadata[merchant_id]": merchant.id,
                "metadata[booking_request_id]": bookingRequestId || "",
                "metadata[type]": "deposit"
              });
              const connectAcct = merchant.stripe_account_id && merchant.stripe_account_id !== "buildlogg-shared" ? merchant.stripe_account_id : null;
              const bookingStripeHeaders = { "Authorization": `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" };
              if (connectAcct) bookingStripeHeaders["Stripe-Account"] = connectAcct;
              const stripeResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
                method: "POST",
                headers: bookingStripeHeaders,
                body: sessionBody.toString()
              });
              const session = await stripeResp.json();
              if (stripeResp.ok && session.url) {
                await supabaseQuery5(SU, SK, "checkout_sessions", "", "POST", {
                  merchant_id: merchant.id,
                  booking_request_id: bookingRequestId,
                  stripe_session_id: session.id,
                  stripe_url: session.url,
                  amount: depositAmount,
                  type: "deposit",
                  status: "pending"
                });
                await supabaseQuery5(SU, SK, "booking_requests", `?id=eq.${bookingRequestId}`, "PATCH", {
                  stripe_checkout_session_id: session.id,
                  deposit_amount: depositAmount
                });
                return json8({ success: true, redirectUrl: session.url }, 200);
              }
            } catch (stripeErr) {
              console.error("[booking] Stripe session creation failed:", stripeErr);
            }
          }
        }
      }
      return json8({ success: true }, 200);
    } catch (err) {
      console.error("[booking] POST:", err);
      return json8({ error: "Something went wrong" }, 500);
    }
  }
  return json8({ error: "Method not allowed" }, 405);
}
__name(onRequest, "onRequest");

// unsubscribe.js
function decodeEmail(encoded) {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "==".slice(0, (4 - b64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes).toLowerCase().trim();
  } catch {
    return null;
  }
}
__name(decodeEmail, "decodeEmail");
function isValidEmail(email) {
  if (!email || email.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
__name(isValidEmail, "isValidEmail");
function htmlPage(title, message, success) {
  const bg = success ? "#F9FAFB" : "#FEF2F2";
  const accent = success ? "#111827" : "#DC2626";
  return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: ${bg}; color: #111827;
    display: flex; align-items: center; justify-content: center;
    min-height: 100dvh; padding: 24px;
  }
  .card {
    background: #fff; border: 1px solid #E5E7EB; border-radius: 12px;
    padding: 32px; max-width: 420px; width: 100%; text-align: center;
  }
  .logo { width: 36px; height: 36px; margin: 0 auto 20px; display: block; }
  h1 { font-size: 20px; font-weight: 700; color: ${accent}; margin-bottom: 8px; letter-spacing: -0.3px; }
  p { font-size: 15px; line-height: 1.55; color: #6B7280; }
  .email { font-weight: 600; color: #374151; word-break: break-all; }
</style>
</head>
<body>
  <div class="card">
    <img src="/assets/icon-black-square.png" alt="Buildlogg" class="logo" />
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}
__name(htmlPage, "htmlPage");
async function onRequestGet7(context) {
  const url = new URL(context.request.url);
  const encoded = url.searchParams.get("e");
  if (!encoded) {
    return htmlPage("Unsubscribe", 'This link is invalid. If you want to stop receiving emails from Buildlogg, reply to any email with "unsubscribe".', false);
  }
  const email = decodeEmail(encoded);
  if (!email || !isValidEmail(email)) {
    return htmlPage("Unsubscribe", "This link is invalid or has expired.", false);
  }
  const sbUrl = context.env.OUTREACH_SUPABASE_URL;
  const sbKey = context.env.OUTREACH_SUPABASE_KEY;
  if (sbUrl && sbKey) {
    try {
      await fetch(`${sbUrl}/rest/v1/email_suppressions?on_conflict=email`, {
        method: "POST",
        headers: {
          "apikey": sbKey,
          "Authorization": `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          email,
          reason: "unsubscribe_link",
          suppressed_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
    } catch (err) {
      console.error("[unsubscribe] Supabase insert failed:", err);
    }
  } else {
    console.error("[unsubscribe] Missing OUTREACH_SUPABASE_URL or OUTREACH_SUPABASE_KEY env var");
  }
  return htmlPage(
    "You're unsubscribed",
    `You won't receive any more emails from Buildlogg about <span class="email">` + email + "</span>.<br><br>If this was a mistake, you can sign up again anytime at buildlogg.com.",
    true
  );
}
__name(onRequestGet7, "onRequestGet");
async function onRequestPost7(context) {
  const url = new URL(context.request.url);
  const encoded = url.searchParams.get("e");
  let email = null;
  if (encoded) {
    email = decodeEmail(encoded);
  }
  if (!email || !isValidEmail(email)) {
    return new Response(JSON.stringify({ status: "error", message: "invalid email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
  const sbUrl = context.env.OUTREACH_SUPABASE_URL;
  const sbKey = context.env.OUTREACH_SUPABASE_KEY;
  if (sbUrl && sbKey) {
    try {
      await fetch(`${sbUrl}/rest/v1/email_suppressions?on_conflict=email`, {
        method: "POST",
        headers: {
          "apikey": sbKey,
          "Authorization": `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          email,
          reason: "one_click_unsubscribe",
          suppressed_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
    } catch (err) {
      console.error("[unsubscribe] Supabase insert failed:", err);
    }
  }
  return new Response(JSON.stringify({ status: "unsubscribed" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequestPost7, "onRequestPost");

// _middleware.js
async function onRequest2(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;
  if (path.startsWith("/assets/") || path.startsWith("/icons/") || path.startsWith("/manifest") || path === "/version.json" || path === "/sw.js") {
    return context.next();
  }
  if (path === "/app" || path.startsWith("/app/")) {
    url.pathname = "/pwa/index.html";
    return context.env.ASSETS.fetch(url);
  }
  if (path.startsWith("/api/") || path.startsWith("/book")) {
    return context.next();
  }
  if (path === "/" || path === "/index.html") {
    return context.next();
  }
  try {
    const resp = await context.env.ASSETS.fetch(context.request);
    if (resp.status !== 404) return resp;
  } catch {
  }
  url.pathname = "/index.html";
  return context.env.ASSETS.fetch(url);
}
__name(onRequest2, "onRequest");

// ../.wrangler/tmp/pages-e4Gi6s/functionsRoutes-0.3087543973317308.mjs
var routes = [
  {
    routePath: "/api/create-checkout-session",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/create-subscription-session",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/cron-payment-chases",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/cron-quote-follow-ups",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/cron-recurring-reminders",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/feedback-notify",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/resend-webhook",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/resend-webhook",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/stripe-connect-onboard",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/stripe-webhook",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/book/payment-cancelled",
    mountPath: "/book",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/book/payment-success",
    mountPath: "/book",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/book/:slug*",
    mountPath: "/book",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/unsubscribe",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/unsubscribe",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest2],
    modules: []
  }
];

// ../../../../.npm/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
