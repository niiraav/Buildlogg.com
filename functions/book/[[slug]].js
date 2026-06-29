// Buildlogg — Client-Facing Booking Page (Cloudflare Pages Function)
// GET  /book/:slug  → render booking page HTML
// POST /book/:slug  → process booking request
//
// REFERRAL SOURCES — drift guard: these <option value="..."> keys MUST match
// the REFERRAL_SOURCES array in src/lib/referral.ts so in-app, online, and
// dashboard all aggregate against the same source keys.
// Current keys: google, instagram, recommended, saw_work, other
// When adding/removing a source, update BOTH this file and src/lib/referral.ts.
function isValidPhone(phone) {
  if (/^\+\d{7,15}$/.test(phone)) return true;       // E.164
  if (/^0\d{10}$/.test(phone)) return true;           // UK local
  if (/^44\d{10}$/.test(phone)) return true;          // UK with 44
  if (/^00\d{7,15}$/.test(phone)) return true;        // International 00 prefix
  return false;
}

function normalizePhoneForServer(phone) {
  const cleaned = phone.replace(/[\s-()]/g, '');
  if (/^0\d{10}$/.test(cleaned)) return '+44' + cleaned.slice(1);
  if (/^44\d{10}$/.test(cleaned)) return '+' + cleaned;
  if (/^00\d{7,15}$/.test(cleaned)) return '+' + cleaned.slice(2);
  if (/^\+\d{7,15}$/.test(cleaned)) return cleaned;
  return cleaned;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
function html(content, status = 200) {
  return new Response(content, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function supabaseQuery(url, key, table, query, method = 'GET', body = null) {
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
  const fullUrl = `${url}/rest/v1/${table}${query}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const resp = await fetch(fullUrl, options);
  if (method === 'GET') return resp.json();
  return resp;
}

// UK timezone helpers — Cloudflare Workers run in UTC, but booking times
// must be in Europe/London (GMT/BST) to match what merchant and client expect.
function getLondonOffsetMinutes(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = dtf.formatToParts(date);
  const get = (t) => parseInt(parts.find(p => p.type === t).value);
  const hr = get('hour') === 24 ? 0 : get('hour');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hr, get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60000);
}

// Convert a London-local date+time to a UTC Date for comparison with booked slots.
function londonToUtc(dateStr, timeStr) {
  const tentative = new Date(dateStr + 'T' + timeStr + ':00.000Z');
  const offsetMin = getLondonOffsetMinutes(tentative);
  return new Date(tentative.getTime() - offsetMin * 60000);
}

// Format a Date as a London-local YYYY-MM-DD string.
function londonDateStr(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = dtf.formatToParts(date);
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const UK_BANK_HOLIDAYS = ['2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-26'];

function computeAvailableSlots(bookedSlots, serviceDurationMin, bufferHours, daysAhead, workingDays, hoursStart, hoursEnd, blockedDates, breakStart, breakEnd, hoursPerDayRaw) {
  workingDays = workingDays || [1,2,3,4,5];
  hoursStart = hoursStart || '09:00';
  hoursEnd = hoursEnd || '17:00';
  blockedDates = blockedDates || [];
  const hoursPerDay = hoursPerDayRaw ? (typeof hoursPerDayRaw === 'string' ? JSON.parse(hoursPerDayRaw) : hoursPerDayRaw) : null;
  const breakStartMin = breakStart ? parseInt(breakStart.split(':')[0]) * 60 + parseInt(breakStart.split(':')[1]) : null;
  const breakEndMin = breakEnd ? parseInt(breakEnd.split(':')[0]) * 60 + parseInt(breakEnd.split(':')[1]) : null;
  const hasBreak = breakStartMin !== null && breakEndMin !== null && breakStartMin < breakEndMin;
  const slots = [];
  const now = new Date();
  const bufferMs = bufferHours * 60 * 60 * 1000;
  const earliest = new Date(now.getTime() + bufferMs);
  for (let d = 0; d < daysAhead; d++) {
    const dayDate = new Date(now.getTime() + d * 86400000);
    const dayOfWeek = dayDate.getDay();
    const dateStr = londonDateStr(dayDate);
    if (!workingDays.includes(dayOfWeek)) continue;
    if (blockedDates.includes(dateStr)) continue;
    if (UK_BANK_HOLIDAYS.includes(dateStr)) continue;
    // Per-day hours override
    const dayKey = String(dayOfWeek);
    const dayOverride = hoursPerDay?.[dayKey];
    const effStart = dayOverride?.start || hoursStart;
    const effEnd = dayOverride?.end || hoursEnd;
    const startH = parseInt(effStart.split(':')[0]);
    const startM = parseInt(effStart.split(':')[1]);
    const endH = parseInt(effEnd.split(':')[0]);
    const endM = parseInt(effEnd.split(':')[1]);
    const endMinutes = endH * 60 + endM;
    const daySlots = [];
    for (let h = startH; h <= endH; h++) {
      for (let m = (h === startH ? startM : 0); m < 60; m += serviceDurationMin) {
        const slotStartMin = h * 60 + m;
        const slotEndMinutes = slotStartMin + serviceDurationMin;
        if (slotEndMinutes > endMinutes) break;
        // Skip slots overlapping break
        if (hasBreak && slotStartMin < breakEndMin && slotEndMinutes > breakStartMin) continue;
        const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        const slotStart = londonToUtc(dateStr, timeStr);
        const slotEnd = new Date(slotStart.getTime() + serviceDurationMin * 60 * 1000);
        if (slotStart < earliest) continue;
        const isBooked = bookedSlots.some(b => {
          const bS = new Date(b.start), bE = new Date(b.end);
          return slotStart < bE && slotEnd > bS;
        });
        if (!isBooked) { daySlots.push(timeStr); }
      }
    }
    if (daySlots.length > 0) slots.push({ date: dateStr, times: daySlots });
  }
  return slots;
}

function renderBookingPage(merchant, services, availableSlots) {
  const bn = merchant.business_name || merchant.full_name;
  const tl = merchant.trade === 'other' ? (merchant.trade_other || '') : (merchant.trade || '');
  const sp = merchant.booking_show_phone !== false;
  const ph = sp && merchant.phone ? `<a href="tel:${merchant.phone}" class="phone">📞 ${merchant.phone}</a>` : '';
  const logo = merchant.logo_data_url ? '<img src="' + merchant.logo_data_url + '" alt="' + escapeHtml(bn) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block"/>' : '';
  const sh = services.length > 0 ? services.map((s,i) => {
    const p = s.amount > 0 ? `£${s.amount.toFixed(0)}` : 'Price on enquiry';
    const d = s.duration_minutes && s.duration_minutes !== 60 ? `${s.duration_minutes} min` : '1 hour';
    return `<div class="service" data-idx="${i}" data-desc="${escapeHtml(s.description)}" data-amount="${s.amount}" data-duration="${s.duration_minutes||60}"><div class="service-name">${escapeHtml(s.description)}</div><div class="service-meta">${p} · ${d}</div>${s.detail?`<div class="service-detail">${escapeHtml(s.detail)}</div>`:''}</div>`;
  }).join('') : `<div class="no-services"><p>${escapeHtml(bn)} hasn't set up their services yet.</p>${ph?`<p>Contact them directly:</p>${ph}`:''}</div>`;
  const dj = JSON.stringify(availableSlots);
  const combinedDur = (services||[]).reduce((s,x)=>s+(x.duration_minutes||60),0);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${escapeHtml(bn)} — Book online | Buildlogg</title><meta name="description" content="Book ${escapeHtml(tl)} services with ${escapeHtml(bn)}. Available times this week."><meta property="og:title" content="Book ${escapeHtml(bn)}"><meta property="og:description" content="${escapeHtml(tl)} services. Book online with Buildlogg."><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;color:#111827;line-height:1.5}.container{max-width:480px;margin:0 auto;padding:20px 16px 40px}.header{text-align:center;margin-bottom:24px;padding:24px 0}.header h1{font-size:24px;font-weight:700;margin-bottom:4px}.header .trade{font-size:14px;color:#6b7280}.phone{display:inline-block;margin-top:8px;font-size:16px;color:#111827;text-decoration:none;font-weight:600}.section{margin-bottom:24px}.label{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}.service{padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:8px;cursor:pointer;transition:border-color .15s,background .15s}.service.selected{border-color:#111827;border-width:2px;background:#f9fafb}.service-name{font-size:16px;font-weight:600}.service-meta{font-size:14px;color:#6b7280;margin-top:2px}.service-detail{font-size:13px;color:#9ca3af;margin-top:4px}.no-services{text-align:center;padding:32px;color:#6b7280}.summary{display:none;padding:12px 16px;background:#111827;color:#fff;border-radius:12px;margin-bottom:16px;font-size:14px;font-weight:600}.summary.show{display:block}select,input,textarea{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:16px;font-family:inherit;margin-bottom:8px}select:disabled,input:disabled,textarea:disabled{background:#f3f4f6;color:#9ca3af}.btn{width:100%;padding:14px;background:#111827;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer}.btn:disabled{background:#d1d5db;cursor:not-allowed}.hidden{display:none}.slot-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.slot{padding:10px 8px;text-align:center;background:#fff;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500}.slot.selected{background:#111827;color:#fff;border-color:#111827}.error{color:#ef4444;font-size:14px;margin-bottom:8px}.success{text-align:center;padding:32px}.success h2{font-size:20px;margin-bottom:8px}.success p{color:#6b7280}</style></head><body><div class="container"><div class="header">${logo}<h1>${escapeHtml(bn)}</h1><div class="trade">${escapeHtml(tl)}</div>${ph}</div><form id="bookingForm" onsubmit="return submitBooking(event)"><div id="errorMsg" class="error"></div><div class="section"><div class="label">Choose a service</div>${sh}</div><div id="summaryBar" class="summary"></div><div id="dateSection" class="section hidden"><div class="label">Pick a date</div><a href="#" onclick="changeService();return false" style="font-size:13px;color:#6b7280;margin-bottom:8px;display:block">Change service</a><select id="dateSelect" onchange="updateSlots()"></select></div><div id="timeSection" class="section hidden"><div class="label">Pick a time</div><a href="#" onclick="changeDate();return false" style="font-size:13px;color:#6b7280;margin-bottom:8px;display:block">Change date</a><div id="slotGrid" class="slot-grid"></div></div><div id="detailsSection" class="section hidden"><div class="label">Your details</div><input id="clientName" placeholder="Your name" required><input id="clientPhone" type="tel" placeholder="Mobile number (e.g. +44 7700 900123)" required><input id="clientEmail" type="email" placeholder="Email (for confirmation)" required><textarea id="notes" placeholder="Notes (optional)" rows="2"></textarea><div class="label" style="margin-top:12px">How did you hear about us?</div><select id="referralSource"><option value="">Select...</option><option value="google">Google search</option><option value="instagram">Instagram/Facebook</option><option value="recommended">Recommended by someone</option><option value="saw_work">Saw your work</option><option value="other">Other</option></select><input id="referralDetail" class="hidden" placeholder="Who recommended you?"></div><button id="submitBtn" class="btn" disabled>Request booking</button></form><div id="successPage" class="hidden"><div class="success"><div style="font-size:48px;margin-bottom:16px">✅</div><h2>Booking request sent!</h2><p>${escapeHtml(bn)} will be in touch soon to confirm.</p></div></div></div><script>const SLOTS=${dj};const COMBINED_DUR=${combinedDur};function changeService(){document.querySelectorAll('.service').forEach(s=>s.classList.remove('selected'));updateSummary();document.getElementById('dateSection').classList.add('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');document.getElementById('summaryBar').classList.remove('show');document.getElementById('submitBtn').disabled=true;window.scrollTo({top:0,behavior:'smooth'})}function changeDate(){document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');document.getElementById('submitBtn').disabled=true;document.getElementById('dateSection').scrollIntoView({behavior:'smooth'})}function changeTime(){document.getElementById('detailsSection').classList.add('hidden');document.getElementById('submitBtn').disabled=true;document.getElementById('timeSection').scrollIntoView({behavior:'smooth'})}function updateSummary(){const sel=document.querySelectorAll('.service.selected');const bar=document.getElementById('summaryBar');if(sel.length===0){bar.classList.remove('show');return}let total=0,dur=0;sel.forEach(s=>{total+=parseFloat(s.dataset.amount||0);dur+=parseInt(s.dataset.duration||60)});const hrs=Math.round(dur/60*10)/10;const hrLabel=hrs===1?'1 hour':hrs+' hours';const priceLabel=total>0?'£'+total.toFixed(0):'Price on enquiry';bar.textContent=sel.length+' service'+(sel.length>1?'s':'')+' · '+priceLabel+' · '+hrLabel;bar.classList.add('show')}document.querySelectorAll('.service').forEach(el=>{el.addEventListener('click',()=>{el.classList.toggle('selected');updateSummary();const sel=document.querySelectorAll('.service.selected');if(sel.length===0){document.getElementById('dateSection').classList.add('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');document.getElementById('submitBtn').disabled=true;return}let totalDur=0;sel.forEach(s=>{totalDur+=parseInt(s.dataset.duration||60)});const ds=document.getElementById('dateSelect');let curSlots=SLOTS[totalDur];if(!curSlots){const keys=Object.keys(SLOTS).map(Number).sort((a,b)=>a-b);for(const k of keys){if(k>=totalDur){curSlots=SLOTS[k];break}}if(!curSlots)curSlots=SLOTS[keys[0]]}ds.innerHTML=curSlots.map(s=>{const d=new Date(s.date+'T00:00:00');return'<option value="'+s.date+'">'+d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+' ('+s.times.length+' slots)</option>'}).join('');document.getElementById('dateSection').classList.remove('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');updateSlots()})});function updateSlots(){const d=document.getElementById('dateSelect').value;const sel=document.querySelectorAll('.service.selected');let totalDur=0;sel.forEach(s=>{totalDur+=parseInt(s.dataset.duration||60)});let curSlots=SLOTS[totalDur];if(!curSlots){const keys=Object.keys(SLOTS).map(Number).sort((a,b)=>a-b);for(const k of keys){if(k>=totalDur){curSlots=SLOTS[k];break}}if(!curSlots)curSlots=SLOTS[Object.keys(SLOTS)[0]]}const sd=curSlots.find(s=>s.date===d);const g=document.getElementById('slotGrid');if(!sd){g.innerHTML='<p style="color:#6b7280;padding:16px">No slots available for this duration on this day.</p>';return}g.innerHTML=sd.times.map(t=>{const h=parseInt(t.split(':')[0]),m=t.split(':')[1];const l=h>12?(h-12)+':'+m+'pm':h+':'+m+'am';return'<div class="slot" data-time="'+t+'" onclick="selectSlot(this)">'+l+'</div>'}).join('');document.getElementById('timeSection').classList.remove('hidden');document.getElementById('selectedTime').value='';document.getElementById('detailsSection').classList.add('hidden')}function selectSlot(el){document.querySelectorAll('.slot').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');document.getElementById('detailsSection').classList.remove('hidden');document.getElementById('submitBtn').disabled=false}document.getElementById('referralSource').addEventListener('change',e=>{const d=document.getElementById('referralDetail');if(e.target.value==='recommended')d.classList.remove('hidden');else d.classList.add('hidden')});async function submitBooking(e){e.preventDefault();const b=document.getElementById('submitBtn'),err=document.getElementById('errorMsg');err.textContent='';b.disabled=true;b.textContent='Sending...';const sel=document.querySelectorAll('.service.selected');const services=Array.from(sel).map(s=>({description:s.dataset.desc,amount:parseFloat(s.dataset.amount||0),duration:parseInt(s.dataset.duration||60)}));const body={services:services,clientName:document.getElementById('clientName').value.trim(),clientPhone:document.getElementById('clientPhone').value.trim(),clientEmail:document.getElementById('clientEmail').value.trim()||undefined,requestedDate:document.getElementById('dateSelect').value,requestedTime:document.querySelector('.slot.selected')?document.querySelector('.slot.selected').dataset.time:'',notes:document.getElementById('notes').value.trim()||undefined,referralSource:document.getElementById('referralSource').value||undefined,referralDetail:document.getElementById('referralDetail').value.trim()||undefined};try{const r=await fetch(window.location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const res=await r.json();if(r.ok){if(res.redirectUrl){window.location.href=res.redirectUrl;return false}document.getElementById('app').innerHTML=document.getElementById('successPage').innerHTML}else{err.textContent=res.error||'Something went wrong';b.disabled=false;b.textContent='Request booking'}}catch(ex){err.textContent='Network error';b.disabled=false;b.textContent='Request booking'}return false}</script></body></html>`;
}

function render404() { return html(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#6b7280}h1{color:#111827;font-size:20px}</style></head><body><h1>Booking page not found</h1><p>This booking page doesn't exist or has been disabled.</p></body></html>`, 404); }
function renderNoSlots(m) { const bn=m.business_name||m.full_name; const ph=m.booking_show_phone!==false&&m.phone?`<p>Contact: <a href="tel:${m.phone}">${m.phone}</a></p>`:''; return html(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(bn)} — Fully booked</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:48px;color:#6b7280}h1{color:#111827;font-size:20px}</style></head><body><h1>${escapeHtml(bn)} is fully booked</h1><p>No available slots for the next 2 weeks.</p>${ph}</body></html>`); }

export async function onRequest(context) {
  const { request, env, params } = context;
  const slug = params.slug ? params.slug[0] : '';
  if (!slug) return render404();
  const SU = env.SUPABASE_URL, SK = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SU || !SK) return html("<!DOCTYPE html><html><body><h1>Booking temporarily unavailable</h1></body></html>", 500);

  if (request.method === 'GET') {
    try {
      const profiles = await supabaseQuery(SU, SK, 'profiles', `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=*`);
      if (!profiles || profiles.length === 0) return render404();
      const merchant = profiles[0];
      const services = await supabaseQuery(SU, SK, 'custom_items', `?user_id=eq.${merchant.id}&is_public=eq.true&order=sort_order&select=*`);
      const now = new Date().toISOString();
      const bookedJobs = await supabaseQuery(SU, SK, 'jobs', `?user_id=eq.${merchant.id}&status=in.(booked,in_progress)&scheduled_start=gte.${now}&select=scheduled_start,scheduled_end`);
      const bookedSlots = (bookedJobs||[]).filter(j=>j.scheduled_start).map(j=>({start:j.scheduled_start,end:j.scheduled_end||j.scheduled_start}));
      const fourHoursAgo = new Date(Date.now()-4*60*60*1000).toISOString();
      const pendingRequests = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time,service_amount`);
      for (const r of pendingRequests||[]) {
        if (!r.requested_date || !r.requested_time) continue;
        const start = londonToUtc(r.requested_date, r.requested_time).toISOString();
        const end = new Date(new Date(start).getTime()+60*60*1000).toISOString();
        bookedSlots.push({start,end});
      }
      const exp = new Date(Date.now()-72*60*60*1000).toISOString();
      await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=lt.${exp}`, 'PATCH', { status: 'expired' });
      const bh = merchant.booking_buffer_hours||24;
      const durations = [...new Set((services||[]).map(s => s.duration_minutes || 60))];
      if (durations.length === 0) durations.push(60);
      // Also compute slots for the combined duration (sum of all services)
      const combinedDuration = (services||[]).reduce((sum, s) => sum + (s.duration_minutes || 60), 0);
      if (combinedDuration > 0 && !durations.includes(combinedDuration)) {
        durations.push(combinedDuration);
      }
      const slotsByDuration = {};
      let anySlots = false;
      for (const dur of durations) {
        const s = computeAvailableSlots(bookedSlots, dur, bh, 14, merchant.booking_working_days, merchant.booking_hours_start, merchant.booking_hours_end, merchant.booking_blocked_dates, merchant.booking_break_start, merchant.booking_break_end, merchant.booking_hours_per_day);
        slotsByDuration[dur] = s;
        if (s.length > 0) anySlots = true;
      }
      if (!anySlots) return renderNoSlots(merchant);
      return html(renderBookingPage(merchant, services||[], slotsByDuration));
    } catch (err) { console.error('[booking] GET:', err); return html('<!DOCTYPE html><html><body><h1>Error</h1></body></html>', 500); }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      
      // Parse services — accept both new multi-service array and old single-service format
      let services;
      if (body.services && Array.isArray(body.services) && body.services.length > 0) {
        services = body.services;
      } else {
        // Backward compat: old single-service format
        services = [{
          description: body.serviceDescription,
          amount: body.serviceAmount || 0,
          duration: body.serviceDuration || 60,
        }];
      }
      
      // Validate each service
      for (const s of services) {
        if (!s.description || String(s.description).trim() === '') {
          return json({error: 'Service description is required'}, 400);
        }
      }
      
      const totalAmount = services.reduce((sum, s) => sum + (s.amount || 0), 0);
      const totalDuration = services.reduce((sum, s) => sum + (s.duration || 60), 0);
      const combinedDescription = services.map(s => s.description).join(' + ');
      
      const req = ['clientName', 'clientPhone', 'requestedDate', 'requestedTime'];
      for (const f of req) { if (!body[f]||String(body[f]).trim()==='') return json({error:`${f} is required`},400); }
      const phone = body.clientPhone.replace(/[\s-]/g,'');
      if (!body.clientEmail || String(body.clientEmail).trim() === '') return json({error:'Please enter your email so we can send you a booking confirmation'},400);
      if (!isValidPhone(phone)) return json({error:'Please enter a valid phone number with country code (e.g. +44 7700 900123)'},400);
      const normalizedPhone = normalizePhoneForServer(phone);
      const profiles = await supabaseQuery(SU, SK, 'profiles', `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=id,booking_buffer_hours,booking_working_days,booking_hours_start,booking_hours_end,booking_blocked_dates,booking_break_start,booking_break_end,booking_hours_per_day,payment_terms,deposit_pct,stripe_connected`);
      if (!profiles||profiles.length===0) return json({error:'Booking page not found'},404);
      const merchant = profiles[0];
      const oneHrAgo = new Date(Date.now()-60*60*1000).toISOString();
      const recent = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&client_phone=eq.${encodeURIComponent(normalizedPhone)}&status=eq.pending&created_at=gte.${oneHrAgo}&select=id`);
      if (recent&&recent.length>=3) return json({error:"You've already sent a request. They'll be in touch soon."},429);
      const requestedDate = body.requestedDate;
      const requestedTime = body.requestedTime;
      const slotStart = londonToUtc(requestedDate, requestedTime);
      const now = new Date();
      const maxDate = new Date(now.getTime()+14*24*60*60*1000);
      const requestedDateObj = new Date(requestedDate+'T00:00:00.000Z');
      if (requestedDateObj > maxDate) return json({error:'Requested date must be within the next 14 days'},400);
      if (slotStart <= now) return json({error:'Requested time must be in the future'},400);
      const bJobs = await supabaseQuery(SU, SK, 'jobs', `?user_id=eq.${merchant.id}&status=in.(booked,in_progress)&scheduled_start=gte.${now.toISOString()}&select=scheduled_start,scheduled_end`);
      const sE = new Date(slotStart.getTime()+totalDuration*60*1000);
      const fourHoursAgo = new Date(Date.now()-4*60*60*1000).toISOString();
      const pendingRequests = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time`);
      const isBooked = (bJobs||[]).some(j=>{if(!j.scheduled_start)return false;const bS=new Date(j.scheduled_start),bE=new Date(j.scheduled_end||j.scheduled_start);return slotStart<bE&&sE>bS}) || (pendingRequests||[]).some(r=>{
        if (!r.requested_date || !r.requested_time) return false;
        const pS = londonToUtc(r.requested_date, r.requested_time);
        const pDur = r.total_duration || 60;
        const pE = new Date(pS.getTime()+pDur*60*1000);
        return slotStart<pE && sE>pS;
      });
      if (isBooked) return json({error:'That time was just booked. Please pick another time.'},409);
      // Re-check working day and hours
      const wDays = merchant.booking_working_days || [1,2,3,4,5];
      const reqDayOfWeek = new Date(requestedDate + 'T00:00:00.000Z').getUTCDay();
      if (!wDays.includes(reqDayOfWeek)) return json({error:'That day is not available. Please pick another day.'},409);
      const wBlocked = merchant.booking_blocked_dates || [];
      if (wBlocked.includes(requestedDate)) return json({error:'That day is not available. Please pick another day.'},409);
      if (UK_BANK_HOLIDAYS.includes(requestedDate)) return json({error:'That day is not available. Please pick another day.'},409);
      // Validate time within working hours (with per-day override)
      const dayKey = String(reqDayOfWeek);
      const hoursPerDayParsed = merchant.booking_hours_per_day ? (typeof merchant.booking_hours_per_day === 'string' ? JSON.parse(merchant.booking_hours_per_day) : merchant.booking_hours_per_day) : null;
      const dayOverride = hoursPerDayParsed?.[dayKey];
      const effStart = dayOverride?.start || merchant.booking_hours_start || '09:00';
      const effEnd = dayOverride?.end || merchant.booking_hours_end || '17:00';
      const reqMinutes = parseInt(requestedTime.split(':')[0]) * 60 + parseInt(requestedTime.split(':')[1]);
      const startMin = parseInt(effStart.split(':')[0]) * 60 + parseInt(effStart.split(':')[1]);
      const endMin = parseInt(effEnd.split(':')[0]) * 60 + parseInt(effEnd.split(':')[1]);
      if (reqMinutes < startMin || reqMinutes + totalDuration > endMin) return json({error:'That time is outside working hours'}, 409);
      // Validate not during break
      if (merchant.booking_break_start && merchant.booking_break_end) {
        const bStart = parseInt(merchant.booking_break_start.split(':')[0]) * 60 + parseInt(merchant.booking_break_start.split(':')[1]);
        const bEnd = parseInt(merchant.booking_break_end.split(':')[0]) * 60 + parseInt(merchant.booking_break_end.split(':')[1]);
        if (reqMinutes < bEnd && reqMinutes + totalDuration > bStart) return json({error:'That time is during a break period'}, 409);
      }
      const insertBody = {
        merchant_id: merchant.id, service_description: combinedDescription, service_amount: totalAmount,
        client_name: body.clientName.trim(), client_phone: normalizedPhone, client_email: body.clientEmail||null,
        requested_date: body.requestedDate, requested_time: body.requestedTime, notes: body.notes||null,
        referral_source: body.referralSource||null, referral_detail: body.referralDetail||null,
      };
      // Try with multi-service columns first; fall back without if migration not yet applied
      let insertResp = await supabaseQuery(SU, SK, 'booking_requests', '', 'POST', {
        ...insertBody, service_items: JSON.stringify(services), total_duration: totalDuration
      });
      // Check if first insert failed
      if (!insertResp || !insertResp.ok) {
        console.warn('[booking] Multi-service insert failed, falling back to single-service');
        insertResp = await supabaseQuery(SU, SK, 'booking_requests', '', 'POST', insertBody);
      }
      if (!insertResp || !insertResp.ok) {
        console.error('[booking] insert failed:', insertResp?.status);
        return json({error:'Could not submit booking'},500);
      }
      // Parse the response to get the booking request ID
      let bookingRequestId = '';
      try {
        const respText = await insertResp.text();
        if (respText) {
          const respData = JSON.parse(respText);
          const row = Array.isArray(respData) ? respData[0] : respData;
          bookingRequestId = row?.id || '';
        }
      } catch {}
      if (merchant.payment_terms === 'deposit' && merchant.stripe_connected && merchant.deposit_pct > 0 && totalAmount > 0) {
        const depositAmount = totalAmount * (merchant.deposit_pct / 100);
        if (depositAmount >= 0.50) { // Stripe minimum charge
          const STRIPE_KEY = env.STRIPE_SECRET_KEY;
          if (STRIPE_KEY) {
            try {
              const merchantName = merchant.business_name || merchant.full_name || 'Buildlogg merchant';
              const sessionBody = new URLSearchParams({
                'mode': 'payment',
                'line_items[0][quantity]': '1',
                'line_items[0][price_data][currency]': 'gbp',
                'line_items[0][price_data][product_data][name]': `Deposit for ${merchantName}`,
                'line_items[0][price_data][unit_amount]': String(Math.round(depositAmount * 100)),
                'success_url': `${new URL(request.url).origin}/book/payment-success`,
                'cancel_url': `${new URL(request.url).origin}/book/payment-cancelled`,
                'metadata[merchant_id]': merchant.id,
                'metadata[booking_request_id]': bookingRequestId || '',
                'metadata[type]': 'deposit',
              });
              const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: sessionBody.toString(),
              });
              const session = await stripeResp.json();
              if (stripeResp.ok && session.url) {
                // Store checkout session
                await supabaseQuery(SU, SK, 'checkout_sessions', '', 'POST', {
                  merchant_id: merchant.id, booking_request_id: bookingRequestId,
                  stripe_session_id: session.id, stripe_url: session.url,
                  amount: depositAmount, type: 'deposit', status: 'pending',
                });
                // Update booking request with deposit info
                await supabaseQuery(SU, SK, 'booking_requests', `?id=eq.${bookingRequestId}`, 'PATCH', {
                  stripe_checkout_session_id: session.id, deposit_amount: depositAmount,
                });
                return json({success:true, redirectUrl: session.url}, 200);
              }
            } catch (stripeErr) {
              console.error('[booking] Stripe session creation failed:', stripeErr);
              // Fall through to success without redirect — booking is still created
            }
          }
        }
      }
      return json({success:true},200);
    } catch (err) { console.error('[booking] POST:', err); return json({error:'Something went wrong'},500); }
  }
  return json({error:'Method not allowed'},405);
}
