// Buildlogg — Client-Facing Booking Page (Cloudflare Pages Function)
// GET  /book/:slug  → render booking page HTML
// POST /book/:slug  → process booking request
//
// REFERRAL SOURCES — drift guard: these <option value="..."> keys MUST match
// the REFERRAL_SOURCES array in src/lib/referral.ts so in-app, online, and
// dashboard all aggregate against the same source keys.
// Current keys: google, instagram, recommended, saw_work, other
// When adding/removing a source, update BOTH this file and src/lib/referral.ts.
const UK_PHONE_REGEX = /^(\+44|0)[0-9]{10}$/;

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

function computeAvailableSlots(bookedSlots, serviceDurationMin, bufferHours, daysAhead = 14) {
  const slots = [];
  const now = new Date();
  const bufferMs = bufferHours * 60 * 60 * 1000;
  const earliest = new Date(now.getTime() + bufferMs);
  for (let d = 0; d < daysAhead; d++) {
    const dayDate = new Date(now.getTime() + d * 86400000);
    const dateStr = londonDateStr(dayDate);
    const daySlots = [];
    for (let h = 9; h < 17; h++) {
      for (let m = 0; m < 60; m += serviceDurationMin) {
        if (h === 17 && m > 0) break;
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
  const sh = services.length > 0 ? services.map((s,i) => {
    const p = s.amount > 0 ? `£${s.amount.toFixed(0)}` : 'Price on enquiry';
    const d = s.duration_minutes && s.duration_minutes !== 60 ? `${s.duration_minutes} min` : '1 hour';
    return `<div class="service" data-idx="${i}" data-desc="${escapeHtml(s.description)}" data-amount="${s.amount}" data-duration="${s.duration_minutes||60}"><div class="service-name">${escapeHtml(s.description)}</div><div class="service-meta">${p} · ${d}</div>${s.detail?`<div class="service-detail">${escapeHtml(s.detail)}</div>`:''}</div>`;
  }).join('') : `<div class="no-services"><p>${escapeHtml(bn)} hasn't set up their services yet.</p>${ph?`<p>Contact them directly:</p>${ph}`:''}</div>`;
  const dj = JSON.stringify(availableSlots);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>${escapeHtml(bn)} — Book online | Buildlogg</title><meta name="description" content="Book ${escapeHtml(tl)} services with ${escapeHtml(bn)}. Available times this week."><meta property="og:title" content="Book ${escapeHtml(bn)}"><meta property="og:description" content="${escapeHtml(tl)} services. Book online with Buildlogg."><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;color:#111827;line-height:1.5}.container{max-width:480px;margin:0 auto;padding:20px 16px 40px}.header{text-align:center;margin-bottom:24px;padding:24px 0}.header h1{font-size:24px;font-weight:700;margin-bottom:4px}.header .trade{font-size:14px;color:#6b7280}.phone{display:inline-block;margin-top:8px;font-size:16px;color:#111827;text-decoration:none;font-weight:600}.section{margin-bottom:24px}.label{font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px}.service{padding:16px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:8px;cursor:pointer;transition:border-color .15s}.service.selected{border-color:#111827;border-width:2px}.service-name{font-size:16px;font-weight:600}.service-meta{font-size:14px;color:#6b7280;margin-top:2px}.service-detail{font-size:13px;color:#9ca3af;margin-top:4px}.no-services{text-align:center;padding:32px;color:#6b7280}select,input,textarea{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:8px;font-size:16px;font-family:inherit;margin-bottom:8px}select:disabled,input:disabled,textarea:disabled{background:#f3f4f6;color:#9ca3af}.btn{width:100%;padding:14px;background:#111827;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer}.btn:disabled{background:#d1d5db;cursor:not-allowed}.hidden{display:none}.success{text-align:center;padding:48px 16px}.success h2{font-size:20px;margin-bottom:8px}.success p{color:#6b7280}.error-msg{color:#ef4444;font-size:14px;margin-top:8px}.slot-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.slot{padding:10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;text-align:center;cursor:pointer;font-size:14px;font-weight:500}.slot.selected{background:#111827;color:#fff;border-color:#111827}</style></head><body><div class="container" id="app"><div class="header"><h1>${escapeHtml(bn)}</h1>${tl?`<div class="trade">${escapeHtml(tl)}${merchant.specialty?' · '+escapeHtml(merchant.specialty):''}</div>`:''}${ph}</div>${services.length===0?sh:`<form id="bookingForm" onsubmit="return submitBooking(event)"><input type="hidden" id="selectedDesc" value=""><input type="hidden" id="selectedAmount" value=""><input type="hidden" id="selectedDuration" value="60"><div class="section"><div class="label">Choose a service</div>${sh}</div><div class="section hidden" id="dateSection"><div class="label">Pick a date</div><select id="dateSelect" onchange="updateSlots()"></select></div><div class="section hidden" id="timeSection"><div class="label">Pick a time</div><div class="slot-grid" id="slotGrid"></div><input type="hidden" id="selectedTime" value=""></div><div class="section hidden" id="detailsSection"><div class="label">Your details</div><input type="text" id="clientName" placeholder="Your name" required><input type="tel" id="clientPhone" placeholder="Mobile number" required><input type="email" id="clientEmail" placeholder="Email (optional)"><textarea id="notes" placeholder="Tell us about the job (optional)" rows="3"></textarea><div class="label" style="margin-top:16px">How did you hear about ${escapeHtml(bn)}?</div><select id="referralSource"><option value="">— Optional —</option><option value="google">Google / Search</option><option value="instagram">Instagram / Facebook</option><option value="recommended">Recommended by someone</option><option value="saw_work">Saw their work</option><option value="other">Other</option></select><input type="text" id="referralDetail" placeholder="Who recommended you?" class="hidden"><button type="submit" class="btn" id="submitBtn" disabled>Request booking</button><div id="errorMsg" class="error-msg"></div></div></form>`}<div class="success hidden" id="successPage"><h2>Booking request sent! ✅</h2><p>${escapeHtml(bn)} will be in touch to confirm.</p><br><a href="" onclick="window.location.reload();return false" style="color:#111827;font-weight:600">Book another time</a></div></div><script>const SLOTS=${dj};document.querySelectorAll('.service').forEach(el=>{el.addEventListener('click',()=>{document.querySelectorAll('.service').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');document.getElementById('selectedDesc').value=el.dataset.desc;document.getElementById('selectedAmount').value=el.dataset.amount;document.getElementById('selectedDuration').value=el.dataset.duration;const ds=document.getElementById('dateSelect');const dur=el.dataset.duration||60;const curSlots=SLOTS[dur]||SLOTS[Object.keys(SLOTS)[0]];ds.innerHTML=curSlots.map(s=>{const d=new Date(s.date+'T00:00:00');return'<option value="'+s.date+'">'+d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+' ('+s.times.length+' slots)</option>'}).join('');document.getElementById('dateSection').classList.remove('hidden');document.getElementById('timeSection').classList.add('hidden');document.getElementById('detailsSection').classList.add('hidden');updateSlots()})});function updateSlots(){const d=document.getElementById('dateSelect').value;const dur=document.getElementById('selectedDuration').value||60;const curSlots=SLOTS[dur]||SLOTS[Object.keys(SLOTS)[0]];const sd=curSlots.find(s=>s.date===d);const g=document.getElementById('slotGrid');if(!sd){g.innerHTML='';return}g.innerHTML=sd.times.map(t=>{const h=parseInt(t.split(':')[0]),m=t.split(':')[1];const l=h>12?(h-12)+':'+m+'pm':h+':'+m+'am';return'<div class="slot" data-time="'+t+'" onclick="selectSlot(this)">'+l+'</div>'}).join('');document.getElementById('timeSection').classList.remove('hidden');document.getElementById('selectedTime').value='';document.getElementById('detailsSection').classList.add('hidden')}function selectSlot(el){document.querySelectorAll('.slot').forEach(s=>s.classList.remove('selected'));el.classList.add('selected');document.getElementById('selectedTime').value=el.dataset.time;document.getElementById('detailsSection').classList.remove('hidden');document.getElementById('submitBtn').disabled=false}document.getElementById('referralSource').addEventListener('change',e=>{const d=document.getElementById('referralDetail');if(e.target.value==='recommended')d.classList.remove('hidden');else d.classList.add('hidden')});async function submitBooking(e){e.preventDefault();const b=document.getElementById('submitBtn'),err=document.getElementById('errorMsg');err.textContent='';b.disabled=true;b.textContent='Sending...';const body={serviceDescription:document.getElementById('selectedDesc').value,serviceAmount:parseFloat(document.getElementById('selectedAmount').value),serviceDuration:parseInt(document.getElementById('selectedDuration').value),clientName:document.getElementById('clientName').value.trim(),clientPhone:document.getElementById('clientPhone').value.trim(),clientEmail:document.getElementById('clientEmail').value.trim()||undefined,requestedDate:document.getElementById('dateSelect').value,requestedTime:document.getElementById('selectedTime').value,notes:document.getElementById('notes').value.trim()||undefined,referralSource:document.getElementById('referralSource').value||undefined,referralDetail:document.getElementById('referralDetail').value.trim()||undefined};try{const r=await fetch(window.location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const res=await r.json();if(r.ok){document.getElementById('app').innerHTML=document.getElementById('successPage').innerHTML}else{err.textContent=res.error||'Something went wrong';b.disabled=false;b.textContent='Request booking'}}catch(ex){err.textContent='Network error';b.disabled=false;b.textContent='Request booking'}return false}</script></body></html>`;
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
      const slotsByDuration = {};
      let anySlots = false;
      for (const dur of durations) {
        const s = computeAvailableSlots(bookedSlots, dur, bh);
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
      const req = ['serviceDescription','clientName','clientPhone','requestedDate','requestedTime'];
      for (const f of req) { if (!body[f]||String(body[f]).trim()==='') return json({error:`${f} is required`},400); }
      const phone = body.clientPhone.replace(/[\s-]/g,'');
      if (!UK_PHONE_REGEX.test(phone)) return json({error:'Please enter a valid UK mobile number'},400);
      const profiles = await supabaseQuery(SU, SK, 'profiles', `?booking_slug=eq.${encodeURIComponent(slug)}&booking_enabled=eq.true&select=id,booking_buffer_hours`);
      if (!profiles||profiles.length===0) return json({error:'Booking page not found'},404);
      const merchant = profiles[0];
      const oneHrAgo = new Date(Date.now()-60*60*1000).toISOString();
      const recent = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&client_phone=eq.${encodeURIComponent(phone)}&status=eq.pending&created_at=gte.${oneHrAgo}&select=id`);
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
      const sE = new Date(slotStart.getTime()+(body.serviceDuration||60)*60*1000);
      const fourHoursAgo = new Date(Date.now()-4*60*60*1000).toISOString();
      const pendingRequests = await supabaseQuery(SU, SK, 'booking_requests', `?merchant_id=eq.${merchant.id}&status=eq.pending&created_at=gte.${fourHoursAgo}&select=requested_date,requested_time`);
      const isBooked = (bJobs||[]).some(j=>{if(!j.scheduled_start)return false;const bS=new Date(j.scheduled_start),bE=new Date(j.scheduled_end||j.scheduled_start);return slotStart<bE&&sE>bS}) || (pendingRequests||[]).some(r=>{
        if (!r.requested_date || !r.requested_time) return false;
        const pS = londonToUtc(r.requested_date, r.requested_time);
        const pE = new Date(pS.getTime()+60*60*1000);
        return slotStart<pE && sE>pS;
      });
      if (isBooked) return json({error:'That time was just booked. Please pick another time.'},409);
      const result = await supabaseQuery(SU, SK, 'booking_requests', '', 'POST', {
        merchant_id: merchant.id, service_description: body.serviceDescription, service_amount: body.serviceAmount||0,
        client_name: body.clientName.trim(), client_phone: phone, client_email: body.clientEmail||null,
        requested_date: body.requestedDate, requested_time: body.requestedTime, notes: body.notes||null,
        referral_source: body.referralSource||null, referral_detail: body.referralDetail||null,
      });
      if (result.error) { console.error('[booking] insert:', result.error); return json({error:'Could not submit booking'},500); }
      return json({success:true},200);
    } catch (err) { console.error('[booking] POST:', err); return json({error:'Something went wrong'},500); }
  }
  return json({error:'Method not allowed'},405);
}
