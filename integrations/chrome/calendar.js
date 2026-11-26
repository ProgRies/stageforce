// Google Calendar: an event pop-up shows whether the meeting is in an organisation's timeline and can log it, and event boxes in
// the grid get a small StageForce mark when they are. Only what the page shows is read (title, date, time, links, guest addresses);
// nothing is sent until the CRM connection is set up, and the grid check gets only yes/no back.
(() => {
'use strict';
if (window.__stageforceCalendar) return;
window.__stageforceCalendar = true;
const LOGO = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M6 13l2 9M13 8l3 13" stroke-width="5" stroke-linecap="round" fill="none" stroke="#9060d0"/><path d="M21 7l2 10" stroke-width="5" stroke-linecap="round" stroke="#e44eb5"/></svg>';
const OURS = 'data-stageforce-calendar';
const text = e => e ? (e.innerText || e.textContent || '').trim() : '';
const visible = e => !!(e && e.getClientRects().length);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const isOurs = n => n?.nodeType === 1 && (n.hasAttribute(OURS) || !!n.closest?.('[' + OURS + ']'));
// What goes into Calendar's own containers uses a tag name Calendar never renders. Calendar patches a container by reusing
// the existing child with the same tag in that position; a plain <div> of ours in its place was taken over as the next
// section (the Google Meet join link) and that section's content ended up inside our element, where nobody can see it.
const host = (tag, kind) => { const el = document.createElement(tag); el.setAttribute(OURS, kind); el.attachShadow({ mode: 'open' }); return el; };
// Should Calendar still put anything into one of our elements, it goes back right after it, where it is visible.
function evict(el) { if (el?.firstChild && el.isConnected) el.after(...el.childNodes); }

async function send(message) {
 try { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw Object.assign(new Error(r?.error || 'Extension unavailable. Refresh Google Calendar.'), { code: r?.code || 'request_failed' }); return r.data; }
 catch (error) { if (/Extension context invalidated|Receiving end does not exist|Extension unavailable/.test(error.message)) throw Object.assign(new Error('The extension was reloaded. Refresh Google Calendar.'), { code: 'reload_required' }); throw error; }
}
const api = payload => send({ type: 'api', payload });
const problem = e => e?.code === 'connection_required' || /Connect Stage Force|Connect your extension/.test(e?.message || '') ? 'disconnected' : /unavailable|Failed to fetch|timeout|timed out|aborted/i.test(e?.message || '') ? 'offline' : 'error';
function account() { const a = document.querySelector('a[aria-label*="Google Account"],a[aria-label*="Google-Konto"]'); return ((a?.getAttribute('aria-label') || '').match(/[^\s()<>]+@[^\s()<>]+\.[a-z]{2,}/i) || [''])[0].toLowerCase(); }
// The pop-up and card follow Calendar's own light or dark look.
function dark() { const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g); if (!m) return matchMedia('(prefers-color-scheme: dark)').matches; const [r, g, b] = m.map(Number); return (0.299 * r + 0.587 * g + 0.114 * b) < 110; }

// ---- What the page shows about an event ----
// data-eventid holds base64 of "<event id> <calendar address>"; a repeating event's instance carries its start in the id.
function eventId(raw) {
 raw = String(raw || '').trim(); if (!raw) return '';
 try { const b = raw.replace(/-/g, '+').replace(/_/g, '/'); const plain = atob(b + '='.repeat((4 - b.length % 4) % 4)).split(/\s+/)[0]; if (/^[\w.:@-]{4,200}$/.test(plain)) return plain; } catch {}
 return raw.replace(/[^\w.:@-]/g, '_').slice(0, 200);
}
const MONTHS = { jan: 1, januar: 1, january: 1, jän: 1, jänner: 1, feb: 2, februar: 2, february: 2, mär: 3, märz: 3, mrz: 3, mar: 3, march: 3, apr: 4, april: 4, mai: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, dez: 12, dezember: 12, dec: 12, december: 12 };
const MONTH = '(jan(?:uar|uary)?|jän(?:ner)?|feb(?:ruar|ruary)?|märz?|mrz|mar(?:ch)?|apr(?:il)?|mai|may|jun[ei]?|jul[iy]?|aug(?:ust)?|sept?(?:ember)?|okt(?:ober)?|oct(?:ober)?|nov(?:ember)?|dez(?:ember)?|dec(?:ember)?)\\.?';
const month = s => MONTHS[s.toLowerCase().replace(/\.$/, '')] ?? MONTHS[s.toLowerCase().slice(0, 3)];
const valid = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
// The day the calendar is showing (from the address), so a date written without a year gets the right one.
function shownDay() { const m = location.pathname.match(/\/r\/\w+\/(\d{4})\/(\d{1,2})\/(\d{1,2})/); return m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(); }
function nearestYear(m, d, around) { let best = null; for (const y of [around.getFullYear() - 1, around.getFullYear(), around.getFullYear() + 1]) { if (!valid(y, m, d)) continue; const diff = Math.abs(new Date(y, m - 1, d) - around); if (!best || diff < best.diff) best = { y, diff }; } return best?.y; }
// Times as Calendar writes them: "11:00 bis 11:30", "11:00 – 11:30am", "11am – 12pm", "14 Uhr".
function times(s) {
 const out = []; for (const m of s.matchAll(/(?<![\d.:])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|uhr)?(?![\d.])/gi)) { if (!m[2] && !m[3]) continue; const h = +m[1], min = +(m[2] || 0); if (h > 24 || min > 59) continue; out.push({ h, min, suffix: (m[3] || '').toLowerCase().replace(/\./g, '') }); }
 const as24 = (t, suffix) => { let h = t.h; if (suffix === 'pm' && h < 12) h += 12; if (suffix === 'am' && h === 12) h = 0; return h * 60 + t.min; };
 if (!out.length) return '';
 const [start, end] = out; let mins = as24(start, start.suffix);
 if (!start.suffix && end && /am|pm/.test(end.suffix)) { const same = as24(start, end.suffix); mins = same <= as24(end, end.suffix) ? same : as24(start, end.suffix === 'pm' ? 'am' : 'pm'); }
 return mins >= 24 * 60 ? '' : pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
}
// "Montag, 30. November · 11:00 bis 11:30" or "Monday, November 30 ⋅ 11:00 – 11:30am" → date and start time.
function parseWhen(line, around = shownDay()) {
 const s = String(line || ''); let y, m, d, r;
 if ((r = new RegExp('(\\d{1,2})\\.?\\s+' + MONTH + '(?:\\s+(\\d{4}))?', 'i').exec(s))) { d = +r[1]; m = month(r[2]); y = r[3] ? +r[3] : 0; }
 else if ((r = new RegExp(MONTH + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\d:])', 'i').exec(s))) { m = month(r[1]); d = +r[2]; y = r[3] ? +r[3] : 0; }
 else if ((r = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s))) { d = +r[1]; m = +r[2]; y = +r[3]; }
 if (!r || !m) return null; y ||= nearestYear(m, d, around); if (!y || !valid(y, m, d)) return null;
 return { date: y + '-' + pad(m) + '-' + pad(d), time: times(s.slice(r.index + r[0].length)) };
}
// Day columns carry data-datekey: (year-1970)<<9 | month<<5 | day. Used when a box itself names no date.
function datekey(el) { const k = +el?.closest?.('[data-datekey]')?.getAttribute('data-datekey'); if (!k) return ''; const y = 1970 + (k >> 9), m = (k >> 5) & 15, d = k & 31; return y > 2000 && y < 2200 && valid(y, m, d) ? y + '-' + pad(m) + '-' + pad(d) : ''; }
function links(root) { const out = new Set(); for (const a of root.querySelectorAll('a[href^="http"]')) { let href = a.getAttribute('href'); try { const u = new URL(href); if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === '/url' && u.searchParams.get('q')) href = u.searchParams.get('q'); } catch { continue; } if (href.length <= 4000) out.add(href); if (out.size >= 50) break; } return [...out]; }
function guests(root) {
 const seen = new Map();
 for (const el of root.querySelectorAll('[data-email],[data-hovercard-id*="@"]')) {
  if (isOurs(el)) continue; const address = (el.getAttribute('data-email') || el.getAttribute('data-hovercard-id') || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(address) || seen.has(address)) continue;
  const first = text(el).split('\n').map(s => s.trim()).find(s => s && !s.includes('@')) || '';
  seen.set(address, { email: address, name: first.slice(0, 200) });
  if (seen.size >= 200) break;
 }
 return [...seen.values()];
}

// ---- The event pop-up ----
let lastChip = null, lastChipAt = 0;
const chipOf = t => { const c = t?.closest?.('[data-eventid]'); return c && !c.closest('[role="dialog"]') ? c : null; };
document.addEventListener('click', e => { const c = chipOf(e.target); if (c) { lastChip = c; lastChipAt = Date.now(); } }, true);
document.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const c = chipOf(e.target); if (c) { lastChip = c; lastChipAt = Date.now(); } } }, true);
function eventDialogs() {
 return [...document.querySelectorAll('[role="dialog"]')].filter(d => visible(d) && !isOurs(d) && d.querySelector('[role="heading"],h1,h2') && !d.querySelector('input[type="text"]:not([hidden])') && (d.matches('[data-eventid]') || d.querySelector('[data-eventid]') || Date.now() - lastChipAt < 8000 || d.sfEvent));
}
function readDialog(d) {
 const heading = [...d.querySelectorAll('[role="heading"],h1,h2')].find(h => !isOurs(h) && text(h));
 const title = text(heading).split('\n')[0].slice(0, 300);
 const own = d.matches('[data-eventid]') ? d : d.querySelector('[data-eventid]');
 const id = eventId(own?.getAttribute('data-eventid') || (Date.now() - lastChipAt < 8000 ? lastChip?.getAttribute('data-eventid') : '') || d.sfEvent?.id);
 let when = null, whenEl = null;
 // The date line is the smallest element that reads as date and time (or date alone, if no element has a time), not a
 // container that happens to hold it: the StageForce row goes right after it.
 let best = Infinity;
 for (const el of d.querySelectorAll('div,span')) { if (isOurs(el) || el.children.length > 3 || heading?.contains(el)) continue; const t = text(el); if (!t || t.length > 160 || t === title) continue; const w = parseWhen(t); if (!w) continue; const score = (w.time ? 0 : 1000) + t.length; if (score < best) { when = w; whenEl = el; best = score; } }
 if (!when) { const fromChip = Date.now() - lastChipAt < 8000 && lastChip ? { date: datekey(lastChip), time: times(text(lastChip)) } : null; when = fromChip?.date ? fromChip : d.sfEvent?.when || { date: '', time: '' }; }
 return { id, title, date: when.date, time: when.time, links: links(d), guests: guests(d), heading, whenEl, when };
}
function anchor(d, info) {
 // Right under the title and date line: after the smallest block that holds both.
 const a = info.heading, b = info.whenEl || info.heading; if (!a) return null; let c = a;
 while (c && c !== d && !c.contains(b)) c = c.parentElement;
 if (!c || c === d) { c = b; while (c.parentElement && c.parentElement !== d && !c.parentElement.querySelector('a[href],[data-email]')) c = c.parentElement; }
 return c;
}

const CSS = `
:host{all:initial;display:block;margin:6px 16px 8px;font:13px/1.4 "Google Sans",Roboto,system-ui,sans-serif;--line:#d8d2ef;--bg:#f7f5ff;--text:#29334b;--muted:#5e6880;--ok:#16814d;--okbg:#e8f9ef;--warn:#8a5a10;--primary:#6046b0}
:host(.dark){--line:#463f6b;--bg:#252238;--text:#e6e3f5;--muted:#a7a3c0;--ok:#5fd39a;--okbg:#173527;--warn:#f0c070;--primary:#b4a3ff}
.row{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;border:1px solid var(--line);background:var(--bg);color:var(--text);border-radius:16px;padding:10px 12px;animation:in .18s ease both}
.row.ok{border-color:#34b97980;background:var(--okbg)}.row.quiet{background:none;border-style:dashed}
.logo{width:30px;height:30px;border-radius:9px;background:#fff;display:grid;place-items:center;box-shadow:0 0 0 1px #0001}.logo svg{width:20px;height:20px}
.l{font-weight:600}.ok .l{color:var(--ok)}.warn{color:var(--warn)}.m{font-size:12px;color:var(--muted);margin-top:1px;overflow-wrap:anywhere}
.actions{display:flex;gap:6px}
button{all:unset;cursor:pointer;border-radius:18px;padding:7px 13px;font:600 12px/1.3 system-ui,sans-serif;color:#fff;background:linear-gradient(115deg,#6546b3,#3f58a8);white-space:nowrap}
button.ghost{background:none;color:var(--primary);border:1px solid var(--line);padding:6px 12px}
button:focus-visible{outline:3px solid #aa8bed;outline-offset:2px}
@keyframes in{from{opacity:0;transform:translateY(-3px)}}
@media(prefers-reduced-motion:reduce){.row{animation:none}}`;
const rows = new WeakMap();
function row(d, info) {
 // The same row for the pop-up's lifetime: when Calendar re-renders and drops it, it goes back in as it was, with no new check.
 let el = rows.get(d); if (!el) { el = host('stageforce-row', 'row'); rows.set(d, el); }
 evict(el);
 const at = anchor(d, info); if (at && el.previousElementSibling !== at) at.after(el); else if (!at && !el.isConnected) d.append(el);
 el.classList.toggle('dark', dark()); return el;
}
function paint(host, html, cls = '') { host.shadowRoot.innerHTML = `<style>${CSS}</style><div class="row ${cls}"><span class="logo">${LOGO}</span>${html}</div>`; return host.shadowRoot; }
const shortDay = s => s ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' : '';
function renderRow(host, info, state) {
 const { kind, r, error } = state; let root;
 if (kind === 'checking') root = paint(host, '<div><div class="l">StageForce</div><div class="m">Checking the timeline…</div></div><span></span>', 'quiet');
 else if (kind === 'disconnected') { root = paint(host, '<div><div class="l warn">StageForce not connected</div><div class="m">Connect the extension to check this meeting.</div></div><div class="actions"><button class="ghost" data-act="connect">Connect</button></div>', 'quiet'); }
 else if (kind === 'error') { root = paint(host, `<div><div class="l warn">StageForce · ${problem(error) === 'offline' ? 'Offline' : 'Check'}</div><div class="m">${esc(error?.message || 'Could not check this meeting.')}</div></div><div class="actions"><button class="ghost" data-act="retry">Retry</button></div>`, 'quiet'); }
 else if (r.logged) {
  const l = r.logged, moved = info.date && l.date && info.date !== l.date;
  const meta = [l.organisation.name, 'Meeting ' + shortDay(l.date) + (l.time ? ' ' + l.time : ''), l.contacts.length ? 'with ' + l.contacts.join(', ') : ''].filter(Boolean).join(' · ');
  root = paint(host, `<div><div class="l ${moved ? 'warn' : ''}">${moved ? 'Logged for ' + shortDay(l.date) + ' · calendar says ' + shortDay(info.date) : l.cancelled ? '✓ Logged in StageForce · cancelled' : '✓ Logged in StageForce' + (state.fresh ? ' · just now' : '')}</div><div class="m">${esc(meta)}</div></div><div class="actions">${moved ? '<button data-act="log">Update</button>' : ''}<button class="ghost" data-act="open">Open ↗</button></div>`, moved ? '' : 'ok');
 }
 else if (r.candidates.length) {
  const what = r.organisation ? `${esc(r.candidates.find(c => c.id === r.organisation.id)?.guests[0] || 'A guest')} is a contact of <b>${esc(r.organisation.name)}</b>` : 'Guests belong to ' + r.candidates.slice(0, 3).map(c => '<b>' + esc(c.name) + '</b>').join(', ');
  root = paint(host, `<div><div class="l warn">Not logged yet</div><div class="m">${what}</div></div><div class="actions"><button data-act="log">Log meeting</button></div>`);
 }
 else root = paint(host, `<div><div class="l">No client among the guests</div><div class="m">${r.participants.some(p => !p.internal) ? 'No guest is saved in StageForce' : 'Only you and your team'}</div></div><div class="actions"><button class="ghost" data-act="log">Log anyway</button></div>`, 'quiet');
 root.querySelector('[data-act="connect"]')?.addEventListener('click', () => send({ type: 'options' }).catch(() => {}));
 root.querySelector('[data-act="retry"]')?.addEventListener('click', () => { host.sfKey = ''; schedule(); });
 root.querySelector('[data-act="open"]')?.addEventListener('click', () => send({ type: 'open', organisationId: r.logged.organisation.id }).catch(() => {}));
 root.querySelector('[data-act="log"]')?.addEventListener('click', () => openCard(info, r, result => { setMark(info.id, true); host.sfState = { kind: 'done', r: { ...r, logged: result.logged }, fresh: true }; renderRow(host, info, host.sfState); }));
}
const keyOf = i => [i.id, i.title, i.date, i.time, i.guests.map(g => g.email).join(',')].join('|');
async function checkDialogs() {
 for (const d of eventDialogs()) {
  const info = readDialog(d); if (!info.title) continue;
  d.sfEvent = { id: info.id, when: info.when };
  const host = row(d, info), key = keyOf(info);
  if (host.sfKey === key) continue; host.sfKey = key;
  renderRow(host, info, { kind: 'checking' });
  try {
   const r = await api({ action: 'calendarCheck', mailbox: account(), eventId: info.id, title: info.title, date: info.date, time: info.time, links: info.links, guests: info.guests });
   if (host.sfKey !== key) continue; if (info.id) setMark(info.id, !!r.logged);
   host.sfState = { kind: 'done', r }; renderRow(host, info, host.sfState);
  } catch (error) { if (host.sfKey === key) renderRow(host, info, { kind: problem(error) === 'disconnected' ? 'disconnected' : 'error', error }); }
 }
}

// ---- The logging card ----
const CARD_CSS = `
:host{all:initial;--line:#d8d2ef;--text:#29334b;--muted:#5e6880;--ok:#16814d;--input:#fff;--modal:linear-gradient(160deg,#fbfaff,#f0ecfb);--surface:#f7f5ff;--veil:#2a2f3f55}
:host(.dark){--line:#463f6b;--text:#e6e3f5;--muted:#a7a3c0;--ok:#5fd39a;--input:#16151f;--modal:linear-gradient(160deg,#211f30,#1a1827);--surface:#252238;--veil:#000a}
*{box-sizing:border-box}.veil{position:fixed;inset:0;z-index:2147483000;background:var(--veil);backdrop-filter:blur(2px);display:grid;place-items:center;padding:16px;font:14px/1.4 Inter,system-ui,sans-serif;color:var(--text);animation:fade .15s ease both}
.modal{width:min(880px,100%);max-height:calc(100vh - 32px);overflow:auto;border-radius:26px;background:var(--modal);box-shadow:0 30px 80px #0005;padding:22px 24px 18px;animation:rise .2s ease both}
header{display:flex;align-items:center;gap:10px;margin-bottom:16px}header svg{width:28px;height:28px}h1{font-size:18px;margin:0;flex:1}
.x{all:unset;cursor:pointer;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);display:grid;place-items:center;background:var(--input)}
.grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px}@media(max-width:720px){.grid{grid-template-columns:1fr}}
input{width:100%;border:1px solid var(--line);background:var(--input);color:var(--text);border-radius:12px;padding:11px 13px;font:inherit;color-scheme:light}:host(.dark) input{color-scheme:dark}
input:focus{outline:none;border-color:#7d62d6;box-shadow:0 0 0 3px #7d62d633}#org{font-size:18px;font-weight:700}
.picker{position:relative}.options{position:absolute;left:0;right:0;top:100%;z-index:2;background:var(--input);border:1px solid var(--line);border-radius:12px;margin-top:4px;overflow:hidden;box-shadow:0 10px 30px #0003}.options:empty{display:none}
.opt{padding:9px 13px;cursor:pointer}.opt:hover,.opt.on{background:var(--surface)}
.hint{font-size:12px;color:var(--muted);margin:5px 2px 12px}.hint.ok{color:var(--ok)}
.when{display:grid;grid-template-columns:minmax(0,1fr) 150px 110px;gap:8px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 0}.chip{font-size:12px;border-radius:20px;padding:4px 10px;background:var(--surface);border:1px solid var(--line)}
.contact{border:1px solid var(--line);background:var(--input);border-radius:14px;padding:12px 14px;display:grid;grid-template-columns:22px 1fr;gap:10px;margin-bottom:8px;font-size:13px;cursor:pointer}
.contact input{width:18px;height:18px;margin:2px 0 0;padding:0;accent-color:#7548b2}.contact small{display:block;color:var(--muted);overflow-wrap:anywhere}.contact em{font-style:normal;font-size:12px;font-weight:600;color:var(--ok)}.contact em.n{color:var(--muted);font-weight:500}
.contact.team{cursor:default;opacity:.8}.empty{font-size:13px;color:var(--muted);margin-bottom:8px}
.error{color:#c0392b;font-size:13px;min-height:1em}:host(.dark) .error{color:#ff8a80}
.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
.b{all:unset;cursor:pointer;border-radius:12px;padding:12px 22px;font-weight:600;border:1px solid var(--line);background:var(--input);color:var(--text)}.b.p{background:#6046b0;color:#fff;border-color:#6046b0}.b:disabled,.b[aria-disabled=true]{opacity:.55;cursor:default}
.b:focus-visible,.x:focus-visible{outline:3px solid #aa8bed;outline-offset:2px}
@keyframes fade{from{opacity:0}}@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.97)}}
@media(prefers-reduced-motion:reduce){.veil,.modal{animation:none}.veil{backdrop-filter:none}}`;
let card = null;
function openCard(info, check, onSaved) {
 if (card) return; const lastFocus = document.activeElement;
 card = document.createElement('div'); card.setAttribute(OURS, 'card'); card.classList.toggle('dark', dark());
 const sh = card.attachShadow({ mode: 'open' }), requestId = crypto.randomUUID(); let selected = check.organisation || null, participants = check.participants, busy = false;
 const external = () => participants.filter(p => !p.internal), team = () => participants.filter(p => p.internal);
 const ticked = new Map(external().map(p => [p.email, p.known || !p.elsewhere?.length]));
 sh.innerHTML = `<style>${CARD_CSS}</style><div class="veil"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="t"><header>${LOGO}<h1 id="t">Log meeting in StageForce</h1><button class="x" aria-label="Close">✕</button></header>
 <div class="grid"><div><div class="picker"><input id="org" aria-label="Organization" placeholder="Find or create an organization" autocomplete="off"><div class="options" id="options"></div></div><div class="hint" id="org-hint"></div>
 <div class="when"><input id="title" aria-label="Meeting title"><input id="date" type="date" aria-label="Meeting date"><input id="time" type="time" aria-label="Meeting time, optional"></div>
 <div class="chips" id="chips"></div></div>
 <div><div id="contacts"></div><div class="hint" id="state"></div><div class="error" id="error" role="alert"></div><div class="actions"><button class="b" id="open">Log & Open ↗</button><button class="b p" id="save">Log meeting</button></div></div></div></section></div>`;
 document.body.append(card); const $ = s => sh.querySelector(s);
 $('#title').value = info.title; $('#date').value = info.date; $('#time').value = info.time;
 const m = check.meeting || {}; $('#chips').innerHTML = [m.provider ? m.provider + (m.link ? ' · ' + (m.link.match(/[a-z]{3}-[a-z]{4}-[a-z]{3}|\d{6,}/i)?.[0] || 'link') : '') : '', 'From Google Calendar'].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join('');
 function orgHint() {
  const c = selected && check.candidates.find(c => c.id === selected.id);
  $('#org').value = selected?.name || ''; $('#org-hint').className = 'hint' + (c ? ' ok' : '');
  $('#org-hint').textContent = !selected ? (check.candidates.length > 1 ? 'Guests belong to ' + check.candidates.map(c => c.name).join(', ') + '. Choose one.' : 'Choose the organisation this meeting belongs to.') : selected.id ? (c ? '✓ Matched by guest email ' + c.guests[0] : 'Selected') : 'New organisation · created when you log';
  $('#save').disabled = $('#open').disabled = !selected || busy;
 }
 function renderContacts() {
  const box = $('#contacts'); box.innerHTML = '';
  for (const p of external()) {
   const el = document.createElement('label'); el.className = 'contact';
   const note = p.known ? `<em>✓ Already a contact of ${esc(selected?.name || '')}</em>` : p.elsewhere?.length ? `<em class="n">In CRM · ${esc(p.elsewhere.map(o => o.name).join(', '))}</em>` : '<em class="n">New contact · saved when you log</em>';
   el.innerHTML = `<input type="checkbox"><div><b>${esc(p.name)}</b><small>${esc(p.email)}</small>${note}</div>`;
   const box2 = el.querySelector('input'); box2.checked = !!ticked.get(p.email); box2.onchange = () => ticked.set(p.email, box2.checked); box.append(el);
  }
  for (const p of team()) { const el = document.createElement('div'); el.className = 'contact team'; el.innerHTML = `<input type="checkbox" disabled><div><b>${esc(p.name)}</b><small>${esc(p.email)}</small><em class="n">You or your team · not saved as a contact</em></div>`; box.append(el); }
  if (!participants.length) box.innerHTML = '<div class="empty">No guests on this event.</div>';
 }
 async function refresh() {
  $('#state').textContent = ''; if (!selected?.id) { orgHint(); return; }
  try { const r = await api({ action: 'calendarCheck', mailbox: account(), eventId: info.id, title: $('#title').value, date: $('#date').value, time: $('#time').value, links: info.links, guests: info.guests, organisationId: selected.id }); if (!card) return;
   participants = r.participants; for (const p of external()) if (!ticked.has(p.email)) ticked.set(p.email, p.known || !p.elsewhere?.length);
   if (r.organisation?.id === selected.id) selected = r.organisation;
   $('#state').textContent = r.logged ? (r.logged.organisation.id === selected.id ? 'Already in the timeline on ' + shortDay(r.logged.date) + (r.logged.time ? ' ' + r.logged.time : '') + ' · logging updates it.' : 'Already logged in ' + r.logged.organisation.name + '.') : 'Not in the timeline yet.';
   renderContacts(); orgHint();
  } catch (e) { $('#error').textContent = e.message; }
 }
 // Organisation search, as in the Gmail pop-up: pick a result or create a new organisation with the typed name.
 let searchTimer, searchRun = 0;
 $('#org').addEventListener('input', () => {
  selected = null; orgHint(); clearTimeout(searchTimer); const q = $('#org').value.trim(), run = ++searchRun;
  if (q.length < 2) { $('#options').innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
   let items = []; try { items = (await api({ action: 'search', query: q })).items || []; } catch (e) { $('#error').textContent = e.message; }
   if (run !== searchRun || !card) return; const box = $('#options'); box.innerHTML = '';
   const add = (label, pick) => { const o = document.createElement('div'); o.className = 'opt'; o.textContent = label; o.onmousedown = e => { e.preventDefault(); pick(); box.innerHTML = ''; }; box.append(o); };
   for (const it of items.slice(0, 8)) add(it.name, () => { selected = it; orgHint(); refresh(); });
   if (!items.some(it => it.name.toLowerCase() === q.toLowerCase())) add('Create “' + q + '”', () => { selected = { id: '', name: q }; orgHint(); for (const p of external()) p.known = false; renderContacts(); $('#state').textContent = ''; });
  }, 200);
 });
 $('#org').addEventListener('blur', () => setTimeout(() => { if (card) $('#options').innerHTML = ''; }, 150));
 function close() { card?.remove(); card = null; document.removeEventListener('keydown', keys, true); lastFocus?.focus?.(); }
 function keys(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(false); } }
 document.addEventListener('keydown', keys, true);
 $('.x').onclick = close; $('.veil').addEventListener('mousedown', e => { if (e.target === $('.veil')) close(); });
 async function save(openAfter) {
  if (busy || !selected) return; if (!$('#date').value) { $('#error').textContent = 'Choose the meeting date.'; return; }
  busy = true; orgHint(); $('#error').textContent = ''; $('#save').textContent = 'Logging…';
  try {
   const r = await api({ action: 'calendarLog', confirmed: true, requestId, mailbox: account(), eventId: info.id, title: $('#title').value.trim() || info.title, date: $('#date').value, time: $('#time').value, links: info.links, guests: info.guests, organisationId: selected.id || undefined, version: selected.id ? selected.version : undefined, newOrganisation: selected.id ? undefined : selected.name, contactEmails: external().filter(p => ticked.get(p.email)).map(p => p.email) });
   close(); onSaved(r); toast(r.organisation); if (openAfter) send({ type: 'open', organisationId: r.organisation.id }).catch(() => {});
  } catch (e) { busy = false; orgHint(); $('#save').textContent = 'Log meeting'; $('#error').textContent = e.message; }
 }
 $('#save').onclick = () => save(false); $('#open').onclick = () => save(true);
 orgHint(); renderContacts(); if (selected?.id) refresh(); else $('#org').focus(); if (selected) $('#save').focus();
}
function toast(org) {
 const t = document.createElement('div'); t.setAttribute(OURS, 'toast'); const sh = t.attachShadow({ mode: 'open' });
 sh.innerHTML = `<style>div{all:initial;position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;background:#30303a;color:#fff;border-radius:10px;padding:12px 18px;font:14px/1.4 "Google Sans",Roboto,system-ui,sans-serif;display:flex;gap:16px;box-shadow:0 6px 20px #0004}button{all:unset;cursor:pointer;color:#c7b8ff;font-weight:600}</style><div role="status">Meeting logged in ${esc(org.name)}<button>Open ↗</button></div>`;
 sh.querySelector('button').onclick = () => send({ type: 'open', organisationId: org.id }).catch(() => {});
 document.body.append(t); setTimeout(() => t.remove(), 6000);
}

// ---- Marks on event boxes ----
const status = new Map(); let marksBusy = false, marksAgain = false, marksPausedUntil = 0, marksFailures = 0;
function setMark(id, logged) { if (!id) return; status.set(id, { logged, at: Date.now() }); paintMarks(); }
function boxes() { return [...document.querySelectorAll('[data-eventid]')].filter(c => !c.closest('[role="dialog"]') && !isOurs(c) && !c.parentElement?.closest('[data-eventid]') && visible(c)); }
function boxInfo(c) {
 const id = eventId(c.getAttribute('data-eventid')), lines = text(c).split('\n').map(s => s.trim()).filter(Boolean);
 const title = lines.find(l => !times(l) && !/^\d+\s/.test(l) && l.length > 1) || '';
 return { id, title: title.slice(0, 300), date: datekey(c), time: times(lines.join(' ')) };
}
const MARK_CSS = ':host{all:initial;position:absolute;top:2px;right:2px;z-index:2;pointer-events:none}span{display:grid;place-items:center;width:15px;height:15px;border-radius:5px;background:#fff;box-shadow:0 0 0 1px #0002}svg{width:11px;height:11px}';
function paintMarks() {
 for (const c of boxes()) {
  const s = status.get(eventId(c.getAttribute('data-eventid'))), mark = c.querySelector(':scope > [' + OURS + '="mark"]'), r = c.getBoundingClientRect();
  if (!s?.logged || r.width < 40 || r.height < 14) { mark?.remove(); continue; }
  if (mark) { evict(mark); continue; }
  const m = host('stageforce-mark', 'mark'); m.title = 'Logged in StageForce';
  m.shadowRoot.innerHTML = `<style>${MARK_CSS}</style><span aria-label="Logged in StageForce">${LOGO}</span>`;
  if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
  c.append(m);
 }
}
async function markBoxes() {
 // Marks already known are always put back, also while a check is running or paused; only asking the CRM waits.
 if (document.hidden) return; paintMarks();
 if (marksBusy) { marksAgain = true; return; }
 if (Date.now() < marksPausedUntil) return;
 const now = Date.now(), wanted = new Map();
 for (const c of boxes()) { const b = boxInfo(c); if (!b.id || wanted.has(b.id)) continue; const s = status.get(b.id); if (!s || now - s.at > 60000) wanted.set(b.id, b); }
 if (!wanted.size) return;
 const events = [...wanted.values()].slice(0, 150); marksBusy = true; marksAgain = wanted.size > events.length;
 try { const r = await api({ action: 'calendarStatus', events }); const logged = new Set(Array.isArray(r?.logged) ? r.logged : []); for (const e of events) status.set(e.id, { logged: logged.has(e.id), at: Date.now() }); marksFailures = 0; }
 catch (error) {
  // A refreshed page is needed after the extension was reloaded; anything else is tried again soon, then less often.
  marksAgain = false; if (error?.code === 'reload_required') { marksPausedUntil = Infinity; return; }
  marksFailures++; marksPausedUntil = Date.now() + Math.min(60000, 4000 * 2 ** (marksFailures - 1)); return;
 }
 finally { marksBusy = false; }
 paintMarks(); if (marksAgain) { marksAgain = false; setTimeout(markBoxes, 0); }
}

// ---- Watching the page ----
let pending = false;
function schedule() { if (pending) return; pending = true; setTimeout(() => { pending = false; checkDialogs(); markBoxes(); }, 250); }
new MutationObserver(records => { if (records.every(r => isOurs(r.target) || [...r.addedNodes, ...r.removedNodes].every(n => isOurs(n)) && (r.addedNodes.length || r.removedNodes.length))) return; schedule(); }).observe(document.body, { childList: true, subtree: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) markBoxes(); });
window.addEventListener('focus', () => markBoxes());
// Calendar also shows boxes by changing styles and classes, which the observer above does not see (watching every attribute
// change in Calendar would cost far more). A light pass every few seconds catches those; it asks the CRM only for boxes it
// has not checked in the last minute, and only while the tab is visible.
setInterval(schedule, 3000);
globalThis.stageForceCalendarTest = { eventId, parseWhen, times, datekey, boxInfo, readDialog };
schedule();
})();
