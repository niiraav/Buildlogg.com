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
    const stripeResp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
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

// api/feedback-notify.js
var TYPE_LABELS = {
  bug: "Bug report",
  feature_request: "Feature request",
  general: "General feedback"
};
async function onRequestPost2(context) {
  const url = new URL(context.request.url);
  try {
    const body = await context.request.json();
    const { type, message, userEmail, userName } = body;
    if (!message || typeof message !== "string") {
      return json2({ error: "message is required" }, 400);
    }
    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[feedback-notify] Missing RESEND_API_KEY env var");
      return json2({ error: "server not configured" }, 500);
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
      return json2({ error: "email send failed" }, 502);
    }
    return json2({ status: "sent" }, 200);
  } catch (err) {
    console.error("[feedback-notify] Error:", err);
    return json2({ error: "internal error" }, 500);
  }
}
__name(onRequestPost2, "onRequestPost");
function json2(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json2, "json");

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
async function onRequestPost3(context) {
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
__name(onRequestPost3, "onRequestPost");
async function onRequestGet(context) {
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
__name(onRequestGet, "onRequestGet");

// api/stripe-webhook.js
async function supabaseQuery2(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  if (method === "PATCH") headers["Prefer"] = "return=minimal";
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") return resp.json();
  return resp;
}
__name(supabaseQuery2, "supabaseQuery");
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
async function onRequestPost4(context) {
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
    const sessionId = session.id;
    const metadata = session.metadata || {};
    const merchantId = metadata.merchant_id;
    const jobId = metadata.job_id || null;
    const type = metadata.type || "deposit";
    const amountPaid = session.amount_total ? session.amount_total / 100 : 0;
    try {
      const sessions = await supabaseQuery2(
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
        const jobs = await supabaseQuery2(
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
        await supabaseQuery2(
          SUPABASE_URL,
          SUPABASE_KEY,
          "jobs",
          `?id=eq.${jobId}`,
          "PATCH",
          jobPatch
        );
        await supabaseQuery2(SUPABASE_URL, SUPABASE_KEY, "payments", "", "POST", {
          job_id: jobId,
          type: type === "deposit" ? "deposit" : "full",
          method: "card",
          amount: amountPaid,
          recorded_at: now,
          created_at: now
        });
      }
      await supabaseQuery2(
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
  return new Response("OK", { status: 200 });
}
__name(onRequestPost4, "onRequestPost");

// book/payment-cancelled.js
function onRequestGet2() {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment cancelled</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;color:#111827}h1{font-size:24px;margin-bottom:8px}p{color:#6b7280;margin-bottom:24px}a{color:#111827;font-weight:600}</style></head><body><h1>Payment cancelled</h1><p>Your payment was not completed. You can try again later.</p></body></html>`, { headers: { "Content-Type": "text/html" } });
}
__name(onRequestGet2, "onRequestGet");

// book/payment-success.js
function onRequestGet3() {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment successful</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;background:#f9fafb;color:#111827}h1{font-size:24px;margin-bottom:8px}.check{width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}p{color:#6b7280;margin-bottom:24px}a{color:#111827;font-weight:600}</style></head><body><div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div><h1>Payment successful</h1><p>Your payment has been received. The merchant will be in touch shortly.</p></body></html>`, { headers: { "Content-Type": "text/html" } });
}
__name(onRequestGet3, "onRequestGet");

// book/[[slug]].js
var UK_PHONE_REGEX = /^(\+44|0)[0-9]{10}$/;
function json3(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
__name(json3, "json");
function html(content, status = 200) {
  return new Response(content, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
__name(html, "html");
function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeHtml, "escapeHtml");
async function supabaseQuery3(url, key, table, query, method = "GET", body = null) {
  const headers = { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === "GET") return resp.json();
  return resp;
}
__name(supabaseQuery3, "supabaseQuery");
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
function computeAvailableSlots(bookedSlots, serviceDurationMin, bufferHours, daysAhead, workingDays, hoursStart, hoursEnd, blockedDates) {
  workingDays = workingDays || [1, 2, 3, 4, 5];
  hoursStart = hoursStart || "09:00";
  hoursEnd = hoursEnd || "17:00";
  blockedDates = blockedDates || [];
  const startH = parseInt(hoursStart.split(":")[0]);
  const startM = parseInt(hoursStart.split(":")[1]);
  const endH = parseInt(hoursEnd.split(":")[0]);
  const endM = parseInt(hoursEnd.split(":")[1]);
  const endMinutes = endH * 60 + endM;
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
    const daySlots = [];
    for (let h = startH; h <= endH; h++) {
      for (let m = h === startH ? startM : 0; m < 60; m += serviceDurationMin) {
        const slotEndMinutes = h * 60 + m + serviceDurationMin;
        if (slotEndMinutes > endMinutes) break;
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
  const sh = services.length > 0 ? services.map((s, i) => {
    const p = s.amount > 0 ? `\xA3${s.amount.toFixed(0)}` : "Price on enquiry";
    const d = s.duration_minutes && s.duration_minutes !== 60 ? `${s.duration_minutes} min` : "1 hour";
    return `<div class="service" data-idx="${i}" data-desc="${escapeHtml(s.description)}" data-amount="${s.amount}" data-duration="${s.duration_minutes || 60}"><div class="service-name">${escapeHtml(s.description)}</div><div class="service-meta">${p} \xB7 ${d}</div>${s.detail ? `<div class="service-detail">${escapeHtml(s.detail)}</div>` : ""}</div>`;
  }).join("") : `<div class="no-services"><p>${escapeHtml(bn)} hasn't set up their services yet.</p>${ph ? `<p>Contact them directly:</p>${ph}` : ""}</div>`;
  const dj = JSON.stringify(availableSlots);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${escapeHtml(bn)} \u2014 Book online | Buildlogg</title><meta name="description" content="Book ${escapeHtml(tl)} services with ${escapeHtml(bn)}. Available times this week."><meta property="og:title" content="Book ${escapeHtml(bn)}"><meta property="og:description" content="${escapeHtml(tl)} services. Book online with Buildlogg."><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;color:#111827;line-height:1.5}.container{max-width:480px;margin:0 auto;padding:20px 16px 40px}.header{text-align:center;margin-bottom:24px;padding:24px 0}.header h1{font-size:24px;font-weight:700;margin-bottom:4px}.header .trade{font-size:14px;color:#6b7280}.phone{display:inline-block;margin-top:8px;font-size:16px;color:#111827;text-decoration:none;font-weight:600}.section{margin-bottom:24px}.label{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}.service{padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:8px;cursor:pointer;transition:border-color .15s}.service.selected{border-color:#111827;border-width:2px}.service-name{font-size:16px;font-weight:600}.service-meta{font-size:14px;color:#6b7280;margin-top:2px}.service-detail{font-size:13px;color:#9ca3af;margin-top:4px}.no-services{text-align:center;padding:32px;color:#6b7280}select,input,textarea{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:16px;font-family:inherit;margin-bottom:8px}select:disabled,input:disabled,textarea:disabled{background:#f3f4f6;color:#9ca3af}.btn{width:100%;padding:14px;background:#111827;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer}.btn:disabled{background:#d1d5db;cursor:not-allowed}.hidden{display:none!important}.success{text-align:center;padding:48px 16px}.success h2{font-size:20px;margin-bottom:8px}.success p{color:#6b7280}.error-msg{color:#ef4444;font-size:14px;margin-top:8px}.slot-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.slot{padding:10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-align:center;cursor:pointer;font-size:14px;font-weight:500}.slot.selected{background:#111827;color:#fff;border-color:#111827}</style></head><body><div class="container" id="app"><div class="header"><h1>${escapeHtml(bn)}</h1>${tl ? `<div class="trade">${escapeHtml(tl)}${merchant.specialty ? " \xB7 " + escapeHtml(merchant.specialty) : ""}</div>` : ""}${ph}</div>${services.length === 0 ? sh : `<form id="bookingForm" onsubmit="return submitBooking(event)"><input type="hidden" id="selectedDesc" value=""><input type="hidden" id="selectedAmount" value=""><input type="hidden" id="selectedDuration" value="60"><div class="section"><div class="label">Choose a service</div>${sh}</div><div class="section hidden" id="dateSection"><div class="label">Pick a date</div><select id="dateSelect" onchange="updateSlots()"></select></div><div class="section hidden" id="timeSection"><div class="label">Pick a time</div><div class="slot-grid" id="slotGrid"></div><input type="hidden" id="selectedTime" value=""></div><div class="section hidden" id="detailsSection"><div class="label">Your details</div><input type="text" id="clientName" placeholder="Your name" required><input type="tel" id="clientPhone" placeholder="Mobile number" required><input type="email" id="clientEmail" placeholder="Email (optional)"><textarea id="notes" placeholder="Tell us about the job (optional)" rows="3"></textarea><div class="label" style="margin-top:16px">How did you hear about ${escapeHtml(bn)}?</div><select id="referralSource"><option value="">\u2014 Optional \u2014</option><option value="google">Google / Search</option><option value="instagram">Instagram / Facebook</option><option value="recommended">Recommended by someone</option><option value="saw_work">Saw their work</option><option value="other">Other</option></select><input type="text" id="referralDetail" placeholder="Who recommended you?" class="hidden"><button type="submit" class="btn" id="submitBtn" disabled>Request booking</button><div id="errorMsg" class="error-msg"></div></div></form>`}<div class="success hidden" id="successPage"><h2>Booking request sent! \u2705</h2><p>${escapeHtml(bn)} will be in touch to confirm.</p><br><a href="" onclick="window.location.reload();return false" style="color:#111827;font-weight:600">Book another time</a></div></div><script>const SLOTS=${dj};document.querySelectorAll('.service').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('.service').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');document.getElementById('selectedDesc').value=el.dataset.desc;document.getElementById('selectedAmount').value=el.dataset.amount;document.getElementById('selectedDuration').value=el.dataset.duration;const ds=document.getElementById('dateSelect');const dur=el.dataset.duration||60;const curSlots=SLOTS[dur]||SLOTS[Object.keys(SLOTS)[0]];ds.innerHTML=curSlots.map(s=>{const d=new Date(s.date+'T00:00:00');return'<option value="'+s.date+'">'+d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+' ('+s.times.length+' slots)</option>'}).join('');document.getElementById('dateSection').classList.remove('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');updateSlots()})});function updateSlots(){const d=document.getElementById('dateSelect').value;const dur=document.getElementById('selectedDuration').value||60;const curSlots=SLOTS[dur]||SLOTS[Object.keys(SLOTS)[0]];const sd=curSlots.find(s=>s.date===d);const g=document.getElementById('slotGrid');if(!sd){g.innerHTML='';return}g.innerHTML=sd.times.map(t=>{const h=parseInt(t.split(':')[0]),m=t.split(':')[1];const l=h>12?(h-12)+':'+m+'pm':h+':'+m+'am';return'<div class="slot" data-time="'+t+'" onclick="selectSlot(this)">'+l+'</div>'}).join('');document.getElementById('timeSection').classList.remove('hidden');document.getElementById('selectedTime').value='';document.getElementById('detailsSection').classList.add('hidden')}function selectSlot(el){document.querySelectorAll('.slot').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');document.getElementById('selectedTime').value=el.dataset.time;document.getElementById('detailsSection').classList.remove('hidden');document.getElementById('submitBtn').disabled=false}document.getElementById('referralSource').addEventListener('change',e=>{const d=document.getElementById('referralDetail');if(e.target.value==='recommended')d.classList.remove('hidden');else d.classList.add('hidden')});async function submitBooking(e){e.preventDefault();const b=document.getElementById('submitBtn'),err=document.getElementById('errorMsg');err.textContent='';b.disabled=true;b.textContent='Sending...';const body={serviceDescription:document.getElementById('selectedDesc').value,serviceAmount:parseFloat(document.getElementById('selectedAmount').value),serviceDuration:parseInt(document.getElementById('selectedDuration').value),clientName:document.getElementById('clientName').value.trim(),clientPhone:document.getElementById('clientPhone').value.trim(),clientEmail:document.getElementById('clientEmail').value.trim()||undefined,requestedDate:document.getElementById('dateSelect').value,requestedTime:document.getElementById('selectedTime').value,notes:document.getElementById('notes').value.trim()||undefined,referralSource:document.getElementById('referralSource').value||undefined,referralDetail:document.getElementById('referralDetail').value.trim()||undefined};try{const r=await fetch(window.location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const res=await r.json();if(r.ok){document.getElementById('app').innerHTML=document.getElementById('successPage').innerHTML}else{err.textContent=res.error||'Something went wrong';b.disabled=false;b.textContent='Request booking'}}catch(ex){err.textContent='Network error';b.disabled=false;b.textContent='Request booking'}return false}<\/script></body></html>`;
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
      const profiles = await supabaseQuery3(SU, SK, "profiles", `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=*`);
      if (!profiles || profiles.length === 0) return render404();
      const merchant = profiles[0];
      const services = await supabaseQuery3(SU, SK, "custom_items", `?user_id=eq.${merchant.id}&is_public=eq.true&order=sort_order&select=*`);
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const bookedJobs = await supabaseQuery3(SU, SK, "jobs", `?user_id=eq.${merchant.id}&status=in.(booked,in_progress)&scheduled_start=gte.${now}&select=scheduled_start,scheduled_end`);
      const bookedSlots = (bookedJobs || []).filter((j) => j.scheduled_start).map((j) => ({ start: j.scheduled_start, end: j.scheduled_end || j.scheduled_start }));
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1e3).toISOString();
      const pendingRequests = await supabaseQuery3(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time,service_amount`);
      for (const r of pendingRequests || []) {
        if (!r.requested_date || !r.requested_time) continue;
        const start = londonToUtc(r.requested_date, r.requested_time).toISOString();
        const end = new Date(new Date(start).getTime() + 60 * 60 * 1e3).toISOString();
        bookedSlots.push({ start, end });
      }
      const exp = new Date(Date.now() - 72 * 60 * 60 * 1e3).toISOString();
      await supabaseQuery3(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=lt.${exp}`, "PATCH", { status: "expired" });
      const bh = merchant.booking_buffer_hours || 24;
      const durations = [...new Set((services || []).map((s) => s.duration_minutes || 60))];
      if (durations.length === 0) durations.push(60);
      const slotsByDuration = {};
      let anySlots = false;
      for (const dur of durations) {
        const s = computeAvailableSlots(bookedSlots, dur, bh, 14, merchant.booking_working_days, merchant.booking_hours_start, merchant.booking_hours_end, merchant.booking_blocked_dates);
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
      const req = ["serviceDescription", "clientName", "clientPhone", "requestedDate", "requestedTime"];
      for (const f of req) {
        if (!body[f] || String(body[f]).trim() === "") return json3({ error: `${f} is required` }, 400);
      }
      const phone = body.clientPhone.replace(/[\s-]/g, "");
      if (!UK_PHONE_REGEX.test(phone)) return json3({ error: "Please enter a valid UK mobile number" }, 400);
      const profiles = await supabaseQuery3(SU, SK, "profiles", `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=id,booking_buffer_hours,booking_working_days,booking_hours_start,booking_hours_end,booking_blocked_dates`);
      if (!profiles || profiles.length === 0) return json3({ error: "Booking page not found" }, 404);
      const merchant = profiles[0];
      const oneHrAgo = new Date(Date.now() - 60 * 60 * 1e3).toISOString();
      const recent = await supabaseQuery3(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&client_phone=eq.${encodeURIComponent(phone)}&status=eq.pending&created_at=gte.${oneHrAgo}&select=id`);
      if (recent && recent.length >= 3) return json3({ error: "You've already sent a request. They'll be in touch soon." }, 429);
      const requestedDate = body.requestedDate;
      const requestedTime = body.requestedTime;
      const slotStart = londonToUtc(requestedDate, requestedTime);
      const now = /* @__PURE__ */ new Date();
      const maxDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1e3);
      const requestedDateObj = /* @__PURE__ */ new Date(requestedDate + "T00:00:00.000Z");
      if (requestedDateObj > maxDate) return json3({ error: "Requested date must be within the next 14 days" }, 400);
      if (slotStart <= now) return json3({ error: "Requested time must be in the future" }, 400);
      const bJobs = await supabaseQuery3(SU, SK, "jobs", `?user_id=eq.${merchant.id}&status=in.(booked,in_progress)&scheduled_start=gte.${now.toISOString()}&select=scheduled_start,scheduled_end`);
      const sE = new Date(slotStart.getTime() + (body.serviceDuration || 60) * 60 * 1e3);
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1e3).toISOString();
      const pendingRequests = await supabaseQuery3(SU, SK, "booking_requests", `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time`);
      const isBooked = (bJobs || []).some((j) => {
        if (!j.scheduled_start) return false;
        const bS = new Date(j.scheduled_start), bE = new Date(j.scheduled_end || j.scheduled_start);
        return slotStart < bE && sE > bS;
      }) || (pendingRequests || []).some((r) => {
        if (!r.requested_date || !r.requested_time) return false;
        const pS = londonToUtc(r.requested_date, r.requested_time);
        const pE = new Date(pS.getTime() + 60 * 60 * 1e3);
        return slotStart < pE && sE > pS;
      });
      if (isBooked) return json3({ error: "That time was just booked. Please pick another time." }, 409);
      const wDays = merchant.booking_working_days || [1, 2, 3, 4, 5];
      const reqDayOfWeek = (/* @__PURE__ */ new Date(requestedDate + "T00:00:00.000Z")).getUTCDay();
      if (!wDays.includes(reqDayOfWeek)) return json3({ error: "That day is not available. Please pick another day." }, 409);
      const wBlocked = merchant.booking_blocked_dates || [];
      if (wBlocked.includes(requestedDate)) return json3({ error: "That day is not available. Please pick another day." }, 409);
      if (UK_BANK_HOLIDAYS.includes(requestedDate)) return json3({ error: "That day is not available. Please pick another day." }, 409);
      const result = await supabaseQuery3(SU, SK, "booking_requests", "", "POST", {
        merchant_id: merchant.id,
        service_description: body.serviceDescription,
        service_amount: body.serviceAmount || 0,
        client_name: body.clientName.trim(),
        client_phone: phone,
        client_email: body.clientEmail || null,
        requested_date: body.requestedDate,
        requested_time: body.requestedTime,
        notes: body.notes || null,
        referral_source: body.referralSource || null,
        referral_detail: body.referralDetail || null
      });
      if (result.error) {
        console.error("[booking] insert:", result.error);
        return json3({ error: "Could not submit booking" }, 500);
      }
      return json3({ success: true }, 200);
    } catch (err) {
      console.error("[booking] POST:", err);
      return json3({ error: "Something went wrong" }, 500);
    }
  }
  return json3({ error: "Method not allowed" }, 405);
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
async function onRequestGet4(context) {
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
__name(onRequestGet4, "onRequestGet");
async function onRequestPost5(context) {
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
__name(onRequestPost5, "onRequestPost");

// _middleware.js
async function onRequest2(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;
  if (path.startsWith("/assets/") || path.startsWith("/icons/") || path.startsWith("/manifest")) {
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

// ../.wrangler/tmp/pages-wVPtIR/functionsRoutes-0.0791090603895801.mjs
var routes = [
  {
    routePath: "/api/create-checkout-session",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/feedback-notify",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/resend-webhook",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/resend-webhook",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/stripe-webhook",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/book/payment-cancelled",
    mountPath: "/book",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/book/payment-success",
    mountPath: "/book",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
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
    modules: [onRequestGet4]
  },
  {
    routePath: "/unsubscribe",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest2],
    modules: []
  }
];

// ../../../../.npm/_npx/d77349f55c2be1c0/node_modules/path-to-regexp/dist.es2015/index.js
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

// ../../../../.npm/_npx/d77349f55c2be1c0/node_modules/wrangler/templates/pages-template-worker.ts
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
