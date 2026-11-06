'use strict';
const tg = window.Telegram && Telegram.WebApp;
const mobile = !!tg && ['android', 'ios'].includes(tg.platform);

// phones open the Mini App full screen; Telegram Desktop / Web show it in a phone-shaped column
if (tg) {
  tg.ready();
  tg.expand();
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (_) { /* older Telegram */ }
  try { if (mobile && tg.isVersionAtLeast('8.0') && tg.requestFullscreen) tg.requestFullscreen(); } catch (_) { /* not available */ }
}
// wide window (a tablet, or a browser on Windows): three columns like a desktop chat app: rooms and contacts | chat | webcams and members
// narrower than that it stays the phone layout
const wide = matchMedia('(min-width: 900px)');
function applyLayout() {
  const on = wide.matches;
  document.body.classList.toggle('desk', on);
  document.body.classList.toggle('phone', !on && !mobile);
  document.documentElement.classList.toggle('phone-bg', !on && !mobile);
  const room = document.getElementById('room'); let side = document.getElementById('side');
  if (on && !side) {   // the right column holds the webcams above the member list
    side = document.createElement('div'); side.id = 'side';
    side.append(document.getElementById('cams'), document.getElementById('userlist')); room.append(side);
  } else if (!on && side) {
    document.getElementById('strip').after(document.getElementById('cams')); room.append(document.getElementById('userlist')); side.remove();
  }
  const signedIn = ['login', 'reg'].every((s) => document.getElementById(s).hidden) && ['main', 'room', 'pm', 'profile', 'settings'].some((s) => !document.getElementById(s).hidden);
  if (on && signedIn) document.getElementById('main').hidden = false;   // the window was widened while a chat was open: the list comes back on the left
  if (!on && ['room', 'pm', 'profile', 'settings'].some((s) => !document.getElementById(s).hidden)) document.getElementById('main').hidden = true;   // narrowed again: one screen at a time
}
applyLayout();
wide.addEventListener('change', applyLayout);
// look and feel, kept on this device: text size, join/leave notices and the theme (Auto follows Telegram)
const prefs = { size: 'medium', joinleave: true, mode: 'auto' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('prefs') || '{}')); } catch (_) { /* storage can be blocked */ }
const setTheme = () => {
  const r = document.documentElement, sys = (tg && tg.colorScheme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  r.dataset.theme = prefs.mode === 'auto' ? sys : prefs.mode;
  if (prefs.mode === 'auto') delete r.dataset.mode; else r.dataset.mode = prefs.mode;
  if (tg) {
    try {
      if (prefs.mode === 'auto') { tg.setHeaderColor('bg_color'); tg.setBackgroundColor('bg_color'); }
      else { const bg = getComputedStyle(r).getPropertyValue('--bg').trim(); tg.setHeaderColor(bg); tg.setBackgroundColor(bg); }
    } catch (_) { /* older Telegram */ }
  }
};
setTheme(); if (tg && tg.onEvent) tg.onEvent('themeChanged', setTheme);

const $ = (id) => document.getElementById(id);
const PLAN = ['#1A1A1A', '#1F3FA8', '#2E7D1E', '#6A1FA8', '#D7759C', '#C29A00', '#C45A14'];
const PLAN_NAMES = ['Free', 'Extra', 'Deluxe', 'VIP', 'VIP Plus', 'Gold', 'Majestic'];
const RATINGS = ['General', 'Restricted', 'Adult'];
const STATUS_COLOR = { 1: '#2ea043', 2: '#ff9800', 3: '#ff9800', 4: '#e53935', 5: '#e53935' };
const HELP = '#B3141B', HELP_CAT = 7;
const VERSION = 'tg-1.3.0';
const RATE = 16000; // voice: 16-bit mono PCM at 16 kHz, same as the Windows and Android apps

const st = { me: '', buddies: [], cats: [], rooms: [], cat: 0, sub: 0, room: null, detail: null, users: {}, pms: {}, unread: new Set(), pmTo: '', user: '', pass: '', av: {}, info: {}, privacy: 0, token: '', status: 1, statusText: '', invis: false, ignores: [], myLevel: 0 };
let ws, ping, retry, wantOnline = false, dev = '', tries = 0, lastRx = 0;

const planColor = (p) => PLAN[Math.min(Math.max(p || 0, 0), 6)];
const nameColor = (p) => ((p || 0) > 0 ? planColor(p) : 'var(--fg)');   // a Free user's name is the normal text colour: it was near-black, invisible in dark mode
const show = (id) => {
  const desk = document.body.classList.contains('desk') && id !== 'login' && id !== 'reg';   // wide screens keep the room/contact list on the left
  ['login', 'reg', 'main', 'room', 'pm', 'settings', 'profile', 'game'].forEach((s) => { $(s).hidden = s !== id && !(desk && s === 'main'); });
  $('smilebox').hidden = true; $('menu').hidden = true; $('sheet').hidden = true;
  if (tg && tg.BackButton) (id === 'reg' || id === 'room' || id === 'pm' || id === 'settings' || id === 'profile' ? tg.BackButton.show() : tg.BackButton.hide());
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const alertMsg = (t) => (tg && tg.showAlert ? tg.showAlert(t) : alert(t));
const b64 = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
const clock = (t) => { const d = new Date((t || Date.now() / 1000) * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

// ---------- vector icons (24x24 line icons, drawn with the current text colour)
const PATHS = {
  back: '<polyline points="15 18 9 12 15 6"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>',
  vol: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
  more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.42A2 2 0 0 0 7 17.83V22"/><path d="M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.42A2 2 0 0 0 17 6.17V2"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  adduser: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  reply: '<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  chev: '<polyline points="6 9 12 15 18 9"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
};
function icon(name, fill) {
  const s = el('span', 'ic' + (fill ? ' fill' : ''));
  s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
  return s;
}
const setIcon = (node, name) => { node.querySelector('.ic')?.remove(); node.prepend(icon(name)); };
document.querySelectorAll('[data-ic]').forEach((n) => n.prepend(icon(n.dataset.ic, n.dataset.ic === 'send' || n.dataset.ic === 'star')));

function pill(text, cls, ic, color) { const p = el('span', 'pill ' + cls); if (color) p.style.background = color; if (ic) p.append(icon(ic, ic === 'star')); p.append(text); return p; }

// ---------- profile pictures and member levels (the server sends them with 'userinfo')
function avatar(name, size, status) {
  const a = el('div', 'av'); a.dataset.av = name; a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size * 0.45) + 'px';
  if (status != null && status >= 0) { const d = el('i'); d.style.background = STATUS_COLOR[status] || '#999'; a.append(d); }
  paintAv(a); return a;
}
function paintAv(a) {
  const pic = st.av[a.dataset.av];
  a.style.backgroundImage = pic ? `url("${pic}")` : 'none';
  const t = a.firstChild && a.firstChild.nodeType === 3 ? a.firstChild : null;
  if (pic) { if (t) t.remove(); } else if (!t) a.prepend(document.createTextNode((a.dataset.av[0] || '?').toUpperCase()));
}
function setAvatar(name, data, removed) {
  if (!name) return;
  if (removed) delete st.av[name];
  else if (typeof data === 'string' && data.startsWith('data:image/')) st.av[name] = data;
  else return;
  document.querySelectorAll('.av').forEach((a) => { if (a.dataset.av === name) paintAv(a); });
}
const levelOf = (n) => (st.info[n] && st.info[n].stats && st.info[n].stats.level) || 0;
function levelPill(name, crown) {
  const holder = el('span'); holder.dataset.lvl = name; holder.dataset.crown = crown ? '1' : '';
  paintLvl(holder); return holder;
}
function paintLvl(h) {
  h.textContent = ''; const l = levelOf(h.dataset.lvl);
  if (l > 0) h.append(pill(String(l), h.dataset.crown ? 'gold' : 'blue', h.dataset.crown ? 'crown' : 'star'));
}
const asked = new Set(), queue = []; let pumping = false;
function wantInfo(name) { if (name === st.me || asked.has(name)) return; asked.add(name); queue.push(name); pump(); }
async function pump() {
  if (pumping) return; pumping = true;
  while (queue.length) { send({ t: 'userinfo', name: queue.shift() }); await new Promise((r) => setTimeout(r, 120)); }
  pumping = false;
}

// one id per Telegram account, so a device ban follows the person (same idea as the other clients)
async function deviceId() {
  let who = tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id;
  if (!who) { try { who = localStorage.getItem('rid') || (localStorage.setItem('rid', crypto.randomUUID()), localStorage.getItem('rid')); } catch (_) { who = 'anon'; } }
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('oldchatter-telegram|' + who));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

function connect() {
  clearTimeout(retry);
  $('err').textContent = '';
  try { ws = new WebSocket(window.OLDCHATTER_SERVER); } catch (e) { return fail('Cannot reach the server.'); }
  ws.onopen = () => send({ t: 'login', user: st.user, ...(st.pass ? { pass: st.pass, remember: true } : { token: st.token }), ver: VERSION, dev, vm: false });
  ws.onmessage = (e) => { lastRx = Date.now(); try { handle(JSON.parse(e.data)); } catch (_) { /* ignore a bad frame */ } };
  ws.onerror = () => {};
  ws.onclose = () => {
    clearInterval(ping);
    stopMedia(false);
    if (!wantOnline) return;
    if (!st.me) return fail('Cannot reach the server. Check your connection and try again.');
    $('net').textContent = 'reconnecting…';
    retry = setTimeout(connect, Math.min(2000 + tries++ * 1500, 10000)); // a weak network gets a bit longer each time, up to 10 s
  };
}

function fail(msg) { wantOnline = false; $('login').classList.remove('auto'); $('err').textContent = msg; $('go').disabled = false; show('login'); }

// "stay signed in": the server gives a token at the first sign-in; it is kept on this device until Sign out
function loadSession() { try { return JSON.parse(localStorage.getItem('oc_session') || 'null'); } catch (_) { return null; } }
function saveSession(user, token) { try { localStorage.setItem('oc_session', JSON.stringify({ user, token })); } catch (_) { /* storage can be blocked */ } st.token = token; }
function clearSession() { try { localStorage.removeItem('oc_session'); } catch (_) { /* ignore */ } st.token = ''; }

function handle(m) {
  switch (m.t) {
    case 'loginok':
      st.me = m.name; if (m.token) saveSession(m.name, m.token); $('login').classList.remove('auto'); if (st.token) st.pass = ''; st.buddies = m.buddies || []; st.cats = m.cats || []; st.privacy = m.privacy || 0; st.ignores = m.names || []; st.status = 1; st.statusText = ''; st.invis = false;
      setAvatar(st.me, m.avatar); st.buddies.forEach((b) => setAvatar(b.name, b.avatar));
      $('me').textContent = st.me; $('net').textContent = ''; $('meav').textContent = ''; $('meav').append(avatar(st.me, 34));
      clearInterval(ping); tries = 0; ping = setInterval(() => send({ t: 'ping' }), 20000);
      try { localStorage.setItem('user', st.user); } catch (_) { /* storage can be blocked */ }
      $('go').disabled = false; renderContacts(); renderChips(); reqRooms(); send({ t: 'userinfo', name: st.me });
      if (st.room) send({ t: 'joinroom', room: st.room.id, lockCode: st.room.lock || '' });
      else show('main');
      break;
    case 'loginfail':
      st.me = ''; wantOnline = false; ws.close();
      if (m.err === 'SESSION_EXPIRED') { clearSession(); fail('You were signed out. Please sign in again.'); } else fail(m.err || 'Sign-in failed.');
      break;
    case 'notify':
      if (/another location|administrator|removed|banned|password was changed/.test(m.text || '')) { wantOnline = false; st.me = ''; clearSession(); fail(m.text); } // signed in elsewhere: this device is out, no session kept
      else if (/microphone/i.test(m.text || '')) { media.wait = false; mediaUI(); alertMsg(m.text); }
      else if (m.text) { if (st.room && !$('room').hidden) sysLine($('lines'), m.text); else alertMsg(m.text); }
      break;
    case 'userinfo':
      st.info[m.name] = m; setAvatar(m.name, m.avatar);
      document.querySelectorAll('[data-lvl]').forEach((h) => { if (h.dataset.lvl === m.name) paintLvl(h); });
      if (m.name === st.pmTo) pmHeader();
      if (st.profileOf === m.name && !$('profile').hidden) renderProfile();
      break;
    case 'buddyavatar': setAvatar(m.name, m.avatar); break;
    case 'myavatar': setAvatar(st.me, m.avatar, !m.avatar); break;
    case 'ignorelist': st.ignores = m.names || []; renderBlocked(); break;
    case 'mystatus':
      st.status = m.status || 1; st.statusText = m.text || ''; st.invis = !!m.invis;
      if (!$('settings').hidden) fillSettings();
      break;
    case 'roomlist': st.rooms = m.rooms || []; renderRooms(); break;
    case 'buddyadded':
      if (m.buddies && m.buddies.length) m.buddies.forEach((b) => { upsertBuddy(b); setAvatar(b.name, b.avatar); }); else if (m.name) upsertBuddy({ name: m.name, status: m.status || 0 });
      renderContacts(); break;
    case 'buddyremoved': st.buddies = st.buddies.filter((b) => b.name !== m.name); renderContacts(); break;
    case 'buddystatus': {
      const b = st.buddies.find((x) => x.name === m.name);
      if (b) { b.status = m.status || 0; b.statusText = m.text || ''; renderContacts(); pmHeader(); }
      break;
    }
    case 'joined':
      st.detail = m.info || null; st.myLevel = m.value || 0; setUsers(m.users); renderStrip();
      if (m.welcome) sysLine($('lines'), m.welcome);
      break;
    case 'gmsg': if (st.room) chatRow($('lines'), m.from, m.text, st.users[m.from] || { tag: m.tag }, m.time); break;
    case 'gamestate': onGameState(m); break;   // Ludo / Backgammon, see games.js
    case 'gamenote': if (st.room && m.room === st.room.id) sysLine($('lines'), m.text); break;
    case 'roomuser':
      if (m.dir === 1) {
        if (st.room && st.users[m.name] && m.name !== st.me) joinLeaveLine(`${m.name} has left the room.`, LEFT_COLOR);
        delete st.users[m.name]; media.watching.delete(m.name); media.auto.delete(m.name); dropTile(m.name);
      } else if (m.users && m.users[0]) {
        if (st.room && !st.users[m.name] && m.name !== st.me) joinLeaveLine(`${m.name} has joined the room.`, JOIN_COLOR);
        st.users[m.name] = m.users[0]; wantInfo(m.name); considerCam(m.users[0]);
      }
      renderUsers(); break;
    case 'users': setUsers(m.users); break;
    case 'roomclosed': case 'bounced': leaveRoomUI(m.t === 'bounced' ? 'You were removed from the room.' : 'The room was closed.', true); break;
    case 'whisper': sysLine($('lines'), m.from === st.me ? `(whisper to ${m.to}) ${m.text}` : `(whisper) ${m.from}: ${m.text}`); break;
    case 'invite':
      if (tg && tg.showConfirm) tg.showConfirm(`${m.from} invites you to "${m.name}". Join?`, (ok) => { if (ok) joinRoom({ id: m.room, name: m.name }, m.lockCode || ''); });
      break;
    case 'invitesent': if (st.room) sysLine($('lines'), `Invitation sent to ${m.to}.`); break;
    case 'pm': addPM(m.from, m.from, m.text, m.time); wantInfo(m.from); if (st.pmTo !== m.from) st.unread.add(m.from); renderContacts(); break;
    case 'pmhistory': {
      const rows = m.offline || [];
      if (rows.length) { st.pms[m.name] = rows.map((x) => ({ from: x.from, text: x.text || '', time: x.time })); if (st.pmTo === m.name) renderPM(); }
      break;
    }
    case 'pmnote': (st.pms[m.name] ||= []).push({ from: '', text: m.text, sys: true }); if (st.pmTo === m.name) renderPM(); break;
    case 'offline': (m.offline || []).forEach((o) => { addPM(o.from, o.from, o.text, o.time); st.unread.add(o.from); }); renderContacts(); break;
    // ---- voice and webcam
    case 'mic':
      if (st.users[m.name]) st.users[m.name].mic = !!m.value;
      if (m.name === st.me) { media.wait = false; if (m.value) startRec(); else stopRec(); }
      renderUsers(); break;
    case 'micfree': stopRec(); break;
    case 'hand':
      if (st.users[m.name]) st.users[m.name].hand = !!m.value;
      if (m.name === st.me) { media.hand = !!m.value; mediaUI(); }
      renderUsers(); break;
    case 'voice': if (m.data && st.room && m.room === st.room.id) playVoice(m.data, m.value || RATE); break;
    case 'camframe': showFrame(m.from, m.data); break;
    case 'camstopped': media.watching.delete(m.from); dropTile(m.from); break;
    case 'camviewer': if (m.value) media.viewers.add(m.name); else media.viewers.delete(m.name); mediaUI(); break;
  }
}

function upsertBuddy(b) { const i = st.buddies.findIndex((x) => x.name === b.name); if (i < 0) st.buddies.push(b); else Object.assign(st.buddies[i], b); }

// ---------- contacts
function renderContacts() {
  const box = $('tab-contacts'); box.textContent = '';
  if (!st.buddies.length) { box.append(el('p', 'sub', 'No contacts yet. Add people from the OldChatter Windows or Android app.')); return; }
  const list = [...st.buddies].sort((a, b) => (b.status > 0) - (a.status > 0) || a.name.localeCompare(b.name));
  for (const b of list) {
    const row = el('div', 'row');
    const pic = avatar(b.name, 44, b.status > 0 ? b.status : 0); pic.onclick = (e) => { e.stopPropagation(); openProfile(b.name); }; row.append(pic);
    const col = el('div'); col.style.flex = 1; col.style.minWidth = 0;
    const n = el('b', '', b.name); n.style.color = nameColor(b.plan); col.append(n);
    if (b.statusText) col.append(el('div', 'sub', b.statusText));
    row.append(col);
    if (st.unread.has(b.name)) { const d = el('span'); d.style.cssText = 'width:10px;height:10px;border-radius:50%;background:var(--blue)'; row.append(d); }
    row.onclick = () => openPM(b.name);
    box.append(row);
  }
}

// ---------- text and smileys (the other apps send HTML: <img data-s="N"> is smiley number N)
let smileCodes = [], smileLookup = [];
fetch('smiles.json').then((r) => r.json()).then(async (codes) => {
  smileCodes = codes;
  const alias = await fetch('smiles_alias.json').then((r) => r.json()).catch(() => ({}));
  smileLookup = [...codes.map((c, i) => [c, i]), ...Object.entries(alias)].sort((a, b) => b[0].length - a[0].length);
}).catch(() => { /* without the pack the text still works */ });

const plain = (s) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// text typed here -> the HTML the other apps expect (smiley codes become <img data-s=N>)
function toWire(t) {
  let out = '';
  for (let i = 0; i < t.length;) {
    const hit = smileLookup.find(([k]) => t.startsWith(k, i));
    if (hit) { out += `<img data-s="${hit[1]}">`; i += hit[0].length; continue; }
    const ch = t[i++];
    out += ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch;
  }
  return out;
}

// HTML from the server -> text and smiley images appended to a node (a message of only smileys shows them big)
function rich(node, html) {
  html = html || '';
  const only = !plain(html).trim() && html.includes('data-s=');
  const soloE = EMO.solo(plain(html));   // one emoji and nothing else: three times bigger
  const add = (text) => EMO.nodes(text).forEach((n) => { if (soloE && n.nodeName === 'IMG') n.classList.add('big'); node.append(n); });   // Unicode emoji become the animated pictures
  const re = /<img[^>]*data-s="(\d+)"[^>]*>/g;
  let pos = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > pos) add(plain(html.slice(pos, m.index)));
    const i = +m[1];
    if (i >= 0 && i < smileCodes.length) { const img = el('img', 'sm' + (only ? ' big' : '')); img.src = `smiles/s${i}.webp`; img.alt = smileCodes[i]; node.append(img); }
    pos = re.lastIndex;
  }
  if (pos < html.length) add(plain(html.slice(pos)));
}

// the emoji picker under the message box (the animated Noto emoji, in categories). An emoji that has skin tones asks for one the
// first time it is picked (five tones and the default yellow); the choice is kept and used from then on.
let emoCat = 0;
function insertAtCursor(input, text) {
  const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
  input.value = input.value.slice(0, a) + text + input.value.slice(b);
  input.focus(); input.setSelectionRange(a + text.length, a + text.length);
}
function askTone(box, input, key, then) {
  const ov = el('div', 'etoneask'), row = el('div', 'etonerow');
  ov.append(el('b', '', 'Choose your skin tone'));
  for (let t = 0; t <= 5; t++) {
    const b = el('button'); b.type = 'button'; const im = el('img'); im.src = EMO.url(EMO.toneKey(key, t)); im.alt = ''; b.append(im);
    b.onclick = () => { EMO.setTone(t); drawEmojiPicker(box, input); if (then) then(t); };
    row.append(b);
  }
  ov.append(row); box.append(ov);
}
let emoQuery = '';
function drawEmojiPicker(box, input, keepSearch) {
  box.textContent = ''; box.classList.add('emo');
  if (!EMO.ready) { box.append(el('p', 'sub', 'Loading…')); return; }
  if (emoCat === 0 && !emoQuery && !drawEmojiPicker.started) { drawEmojiPicker.started = true; if (EMO.recent().length) emoCat = -1; }   // recent first, once there is some
  const search = el('input', 'esearch'); search.type = 'search'; search.placeholder = 'Search emoji'; search.value = emoQuery; search.autocomplete = 'off';
  const tabs = el('div', 'etabs');
  const addTab = (icon, title, idx) => { const b = el('button', 'etab' + (!emoQuery && idx === emoCat ? ' on' : ''), icon); b.type = 'button'; b.title = title; b.onclick = () => { emoQuery = ''; emoCat = idx; drawEmojiPicker(box, input); }; tabs.append(b); };
  if (EMO.recent().length) addTab('🕘', 'Recent', -1);
  EMO.cats.forEach((c, i) => addTab(c.icon, c.title, i));
  const tb = el('button', 'etab'); tb.type = 'button'; tb.title = 'Skin tone';
  const ti = el('img'); ti.src = EMO.url(EMO.toneKey('1f44b', Math.max(EMO.tone(), 0))); ti.alt = ''; tb.append(ti);
  tb.onclick = () => askTone(box, input, '1f44b', null); tabs.append(tb);
  const grid = el('div', 'egrid'), tone = Math.max(EMO.tone(), 0);
  const byKey = new Map(EMO.list.map((e) => [e[0], e]));
  const items = emoQuery.trim() ? EMO.search(emoQuery) : emoCat < 0 ? EMO.recent().map((k) => byKey.get(k)).filter(Boolean) : EMO.list.filter((e) => e[1] === emoCat);
  items.forEach((e) => {
    const img = el('img'); img.src = EMO.url(EMO.toneKey(e[0], tone)); img.alt = EMO.charOf(e[0]); img.title = e[2]; img.dataset.key = e[0]; grid.append(img);
  });
  if (!items.length) grid.append(el('p', 'sub enone', emoQuery.trim() ? 'No emoji found' : 'Nothing here yet'));
  const put = (key, t) => { EMO.pushRecent(key); insertAtCursor(input, EMO.charOf(EMO.toneKey(key, t))); };
  grid.onclick = (ev) => {
    const key = ev.target.dataset && ev.target.dataset.key; if (!key) return;
    if (EMO.tonable.has(key) && EMO.tone() < 0) askTone(box, input, key, (t) => put(key, t));
    else put(key, Math.max(EMO.tone(), 0));
  };
  search.oninput = () => { emoQuery = search.value; drawEmojiPicker(box, input, true); };
  box.append(search, tabs, grid);
  if (keepSearch) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
}
function smilePicker(input, form) {
  const box = $('smilebox');
  if (!box.hidden && box.nextElementSibling === form) { box.hidden = true; return; }
  drawEmojiPicker(box, input);
  document.addEventListener('emoji-ready', () => { if (!box.hidden) drawEmojiPicker(box, input); }, { once: true });
  form.before(box); box.hidden = false;
}

// ---------- chat rows, laid out like the Android app
// Freeze: in a busy room the chat stops scrolling so you can scroll up and find a line; unfreezing jumps back to the newest message
let frozen = false;
function setFrozen(on) {
  frozen = on;
  let bar = $('freezebar');
  if (!bar) { bar = el('button', 'freezebar'); bar.id = 'freezebar'; bar.onclick = () => setFrozen(false); document.body.append(bar); }
  bar.textContent = 'Chat frozen – tap to resume';
  bar.hidden = !on;
  if (!on) { const b = $('lines'); b.scrollTop = b.scrollHeight; }
}

// "X has joined / left the room." in the same small amber lines as the Windows app
const JOIN_COLOR = '#FFAA37', LEFT_COLOR = '#BB6B00';
function joinLeaveLine(text, color) {
  if (!prefs.joinleave) return;
  const box = $('lines'), d = el('div', 'sys', text); d.style.cssText = `color:${color};font-size:13px;font-style:normal`;
  const stick = !frozen && box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  box.append(d); if (stick) box.scrollTop = box.scrollHeight;
}

function sysLine(box, text) {
  const d = el('div', 'sys'); rich(d, text);
  const stick = !frozen && box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  box.append(d); if (stick) box.scrollTop = box.scrollHeight;
}

// ---------- replies, like Telegram: the quoted message, in the colour of its sender's service, sits above the answer
const FREE_Q = '#1A1A1A';
const escH = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const quoteColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') && c.toUpperCase() !== FREE_Q ? c : '');   // a Free user's near-black would vanish in dark mode
function quoteBox(name, text, color) {
  const q = el('div', 'rq'), c = quoteColor(color); if (c) q.style.setProperty('--qc', c);
  q.append(el('b', '', name), el('span', '', text));
  q.onclick = (e) => { e.stopPropagation(); jumpToQuote(q, name, text); };
  return q;
}
function jumpToQuote(q, name, text) {
  const snip = text.replace(/…$/, '').slice(0, 30);
  for (let r = q.closest('.msg').previousElementSibling; r; r = r.previousElementSibling) {
    const t = r.querySelector(':scope > .body > .text');
    if (r.dataset.who && r.dataset.who.toLowerCase() === name.toLowerCase() && t && t.textContent.trim().startsWith(snip)) {
      r.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1800); return;
    }
  }
}
function setReply(r) {   // r = { name, text, color } or null
  st.reply = r; let bar = $('replybar');
  if (!bar) { bar = el('div', 'replybar'); bar.id = 'replybar'; $('roomform').before(bar); }
  bar.hidden = !r; bar.textContent = '';
  if (!r) return;
  const c = quoteColor(r.color); bar.style.setProperty('--qc', c || ''); if (!c) bar.style.removeProperty('--qc');
  const t = el('span', 't'); t.append(el('b', '', 'Reply to ' + r.name), ' ' + r.text);
  const x = el('button', 'x', '✕'); x.type = 'button'; x.onclick = () => setReply(null);
  bar.append(t, x); $('roomtext').focus();
}
function msgSheet(who, text, color) {
  const items = [];
  if (who !== st.me) {
    items.push(['reply', 'Reply to ' + who, () => setReply({ name: who, text: text.length > 90 ? text.slice(0, 90) + '…' : text, color })]);
    items.push(['adduser', 'Mention ' + who, () => { const i = $('roomtext'); i.value += (i.value && !/\s$/.test(i.value) ? ' ' : '') + '@' + who + ' '; i.focus(); }]);
  }
  items.push(['copy', 'Copy message', async () => { try { await navigator.clipboard.writeText(text); } catch { const x = el('textarea'); x.value = text; document.body.append(x); x.select(); document.execCommand('copy'); x.remove(); } }]);
  sheet(who, items);
}

function chatRow(box, who, html, u, time) {
  const plan = Math.min(Math.max((u && u.plan) || 0, 0), 6), tag = u && u.tag;
  const row = el('div', 'msg' + (plan > 0 ? ' plan' : ''));
  const av = avatar(who, 44); av.onclick = () => openProfile(who); row.append(av);
  const body = el('div', 'body'), head = el('div', 'head');
  const w = el('span', 'who', who + (tag ? ' ' + tag : '')); w.style.color = tag ? HELP : plan > 0 ? planColor(plan) : ''; head.append(w);
  head.append(levelPill(who, u && u.crown > 0));
  if (plan > 0) head.append(pill(PLAN_NAMES[plan], '', null, planColor(plan)));
  if (u && u.admin > 0) head.append(el('span', 'adm', 'A'));
  head.append(el('span', 'time', clock(time)));
  const qm = /^\s*<span\b[^>]*\bdata-q="([^"]*)"[^>]*><b>([^<]*)<\/b><br>([^<]*)<\/span>/.exec(html || '');   // a reply: the quoted message comes first
  let q = null;
  if (qm) { html = html.slice(qm[0].length); q = quoteBox(plain(qm[2]), plain(qm[3]), qm[1]); }
  const text = el('div', 'text'); rich(text, html);
  if (q) body.append(head, q, text); else body.append(head, text);
  row.append(body);
  row.dataset.who = who;
  if ((qm && plain(qm[2]).toLowerCase() === String(st.me).toLowerCase()) || (st.me && who !== st.me && new RegExp('(^|\\s)@' + String(st.me).replace(/[^\w-]/g, '\\$&') + '(?![\\w-])', 'i').test(text.textContent))) row.classList.add('hit');   // somebody answered or mentioned me
  row.onclick = (e) => { if (e.target.closest('a,.rq') || e.target === av || av.contains(e.target)) return; msgSheet(who, text.textContent, tag ? HELP : plan > 0 ? planColor(plan) : FREE_Q); };
  const stick = !frozen && box.scrollTop + box.clientHeight >= box.scrollHeight - 60;
  box.append(row); if (stick) box.scrollTop = box.scrollHeight;
}

// ---------- rooms
function reqRooms() { send({ t: 'rooms', cat: st.cat, sub: st.sub }); }

function chip(label, on, tap) { const c = el('button', 'chip' + (on ? ' on' : ''), label); c.onclick = tap; return c; }

// the category chips are drawn when the selection changes; the room cards are redrawn on every list the server sends
function pick(cat, sub) { st.cat = cat; st.sub = sub; renderChips(); reqRooms(); }

function renderChips() {
  const cats = $('cats'); cats.textContent = '';
  cats.append(chip('All rooms', st.cat === 0, () => pick(0, 0)));
  for (const c of st.cats) cats.append(chip(c.name, st.cat === c.id, () => pick(c.id, 0)));
  const subs = $('subs'); subs.textContent = '';
  const cur = st.cats.find((c) => c.id === st.cat);
  if (cur && cur.subs && cur.subs.length) {
    subs.append(chip('Everything', st.sub === 0, () => pick(st.cat, 0)));
    for (const s of cur.subs) subs.append(chip(s.name, st.sub === s.id, () => pick(st.cat, s.id)));
  }
}

function renderRooms() {
  const grid = $('rooms'); grid.textContent = '';
  const list = st.rooms.filter((r) => !r.private);
  if (!list.length) grid.append(el('p', 'sub', 'No rooms here.'));
  for (const r of list) {
    const card = el('div', 'card');
    card.style.background = r.cat === HELP_CAT ? HELP : planColor(r.plan);
    const meta = el('span', 'meta'); meta.append(icon('user'), String(r.users)); if (r.locked) meta.append(icon('lock'));
    card.append(meta, el('b', '', r.name));
    card.onclick = () => joinRoom(r);
    grid.append(card);
  }
}

function joinRoom(r, code) {
  let lock = code || '';
  if (r.locked && !lock) { lock = prompt('This room is locked. Enter the code:') || ''; if (!lock) return; }
  audio(); // a tap is needed before the browser lets us play sound
  st.room = { id: r.id, name: r.name, lock }; st.users = {}; st.detail = null;
  const n = $('roomname'); n.textContent = r.name; n.style.color = r.cat === HELP_CAT ? HELP : nameColor(r.plan);
  $('lines').textContent = ''; $('userlist').hidden = true; renderStrip();
  show('room'); mediaUI(); send({ t: 'joinroom', room: r.id, lockCode: lock });
}

function leaveRoomUI(note, serverDone) {
  stopMedia(true);
  if (st.room && !serverDone) send({ t: 'leaveroom', room: st.room.id });
  st.room = null; setFrozen(false); setReply(null); show('main'); reqRooms();
  if (note) alertMsg(note);
}

// the dark strip under the room title: owner, people online, rating and the room's service level
function renderStrip() {
  const s = $('strip'), d = st.detail; s.textContent = '';
  s.append(el('span', 'dimtxt', 'Room'), document.createTextNode(d && d.owner ? 'Owner: ' + d.owner : (st.room ? st.room.name : '')));
  s.append(pill(`${Object.keys(st.users).length} online`, 'blue', 'user'));
  if (d) { s.append(pill(RATINGS[Math.min(Math.max(d.rating || 0, 0), 2)], 'dim')); if ((d.plan || 0) > 0) s.append(pill(d.planName || PLAN_NAMES[Math.min(d.plan, 6)], '', null, planColor(d.plan))); }
}

function setUsers(list) {
  st.users = {}; (list || []).forEach((u) => { st.users[u.name] = u; wantInfo(u.name); });
  // a webcam that starts opens by itself at the top of the room; closing it keeps it closed until they restart
  for (const u of Object.values(st.users)) considerCam(u);
  for (const n of [...media.watching]) if (!st.users[n]) { media.watching.delete(n); dropTile(n); }
  for (const n of [...media.auto]) if (!st.users[n]) media.auto.delete(n);
  renderUsers();
}

function considerCam(u) {
  if (!u.cam) { media.auto.delete(u.name); if (media.watching.has(u.name)) { media.watching.delete(u.name); dropTile(u.name); } }
  else if (u.name !== st.me && !media.auto.has(u.name)) { media.auto.add(u.name); watch(u.name); }
}

function renderUsers() {
  const names = Object.keys(st.users).sort((a, b) => (st.users[b].admin || 0) - (st.users[a].admin || 0) || a.toLowerCase().localeCompare(b.toLowerCase()));
  $('usercount').textContent = names.length; renderStrip();
  const box = $('userlist'); box.textContent = '';
  box.append(el('h3', '', `Members (${names.length})`));
  for (const n of names) {
    const u = st.users[n], row = el('div', 'row');
    row.append(avatar(n, 38, u.status || 1));
    const w = el('b', '', n + (u.tag ? ' ' + u.tag : '')); w.style.color = u.tag ? HELP : nameColor(u.plan); w.style.flex = 1; w.style.minWidth = 0;
    row.append(w);
    const marks = el('span', 'mark');
    if (u.admin > 0) { const s = icon('shield'); s.style.color = '#888'; marks.append(s); }
    if (u.hand) { const s = icon('hand'); s.style.color = '#ff9800'; marks.append(s); }
    if (u.mic) { const s = icon('mic'); s.style.color = '#2ea043'; marks.append(s); }
    if (u.cam) { const s = icon('video'); s.style.color = 'var(--blue)'; marks.append(s); }
    row.append(marks);
    row.onclick = () => { box.hidden = true; member(n); };
    box.append(row);
  }
  renderSpeakers();
}

function renderSpeakers() {
  const box = $('speakers'); box.textContent = '';
  const talking = Object.values(st.users).filter((u) => u.mic);
  box.hidden = !talking.length;
  for (const u of talking) { const s = el('span', 'spk'); s.append(icon('mic'), avatar(u.name, 30), u.name); box.append(s); }
}

// tapping a name: a small sheet with what you can do
function member(name, fromProfile) {
  if (name === st.me) return;
  const u = st.users[name] || {}, items = [];
  if (!fromProfile) items.push(['user', 'Profile', () => openProfile(name)]);
  items.push(['chat', 'Private message', () => openPM(name, true)]);
  if (st.room && !$('room').hidden) items.push(['send', 'Whisper', () => whisperSheet(name)]);
  if (u.cam && !media.watching.has(name)) items.push(['video', 'Watch webcam', () => watch(name)]);
  const buddy = st.buddies.some((b) => b.name === name), blocked = st.ignores.some((n) => n.toLowerCase() === name.toLowerCase());
  items.push([buddy ? 'close' : 'adduser', buddy ? 'Remove from contacts' : 'Add to contacts', () => send({ t: buddy ? 'rmbuddy' : 'addbuddy', name })]);
  items.push(['shield', blocked ? 'Unblock' : 'Block', () => send({ t: blocked ? 'unignore' : 'ignore', name })]);
  if (st.myLevel > 0 && st.room && !$('room').hidden) { // room admins: the same actions as the other apps
    const red = u.red || 0, adm = (op, value) => send({ t: 'admin', room: st.room.id, op, name, value });
    items.push(['close', red & 1 ? 'Remove red dot (text)' : 'Red dot: no text', () => adm(1, red & 1 ? 0 : 1)]);
    items.push(['video', red & 2 ? 'Remove red dot (video)' : 'Red dot: no video', () => adm(2, red & 2 ? 0 : 1)]);
    items.push(['mic', red & 4 ? 'Remove red dot (mic)' : 'Red dot: no mic', () => adm(4, red & 4 ? 0 : 1)]);
    items.push(['exit', 'Bounce from room', () => adm(8, 1)]);
    items.push(['lock', 'Ban from room', () => adm(16, 1)]);
  }
  sheet(name, items, avatar(name, 40));
}

const ageOf = (b) => {
  if (!b) return '';
  if (/^\d+$/.test(b)) return b;
  const d = new Date(b); if (isNaN(d)) return '';
  const now = new Date(), y = now.getFullYear() - d.getFullYear() - ((now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) ? 1 : 0);
  return y > 0 && y < 120 ? String(y) : '';
};

// someone's profile as a page: picture, service, level and XP, activity, counters and details (same as the Android app)
const currentScreen = () => (['main', 'room', 'pm', 'settings', 'profile'].find((id) => !$(id).hidden) || 'main');
const fmtDur = (secs) => { const s = Math.round(secs || 0), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h} h ${m} min` : `${m} min`; };
const fmtDate = (u) => { if (!u) return 'never'; const d = new Date(u * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function openProfile(name) {
  st.profileOf = name; st.profileBack = currentScreen() === 'profile' ? st.profileBack : currentScreen();
  send({ t: 'userinfo', name }); // always ask again, so the numbers are current
  renderProfile(); show('profile');
}

function renderProfile() {
  const name = st.profileOf, i = st.info[name], box = $('profbody'), mine = name === st.me;
  $('proftitle').textContent = mine ? 'My profile' : 'Profile'; box.textContent = '';
  const hero = el('div', 'phero'); hero.append(avatar(name, 96, i && i.status > 0 ? i.status : 0), el('b', '', name));
  if (!i) { hero.append(el('div', 'sub', 'Loading…')); box.append(hero); return; }
  const pills = el('div', 'pills');
  if (i.planName && i.planName !== 'Free') pills.append(pill(i.planName, '', null, planColor(PLAN_NAMES.indexOf(i.planName))));
  if (i.crown > 0) pills.append(pill('Crown ' + i.crown, 'gold', 'crown'));
  if (pills.children.length) hero.append(pills);
  if (i.text) hero.append(el('div', 'sub', i.text));
  box.append(hero);

  const x = i.stats || {}, level = x.level || 0, xp = x.xp || 0, from = x.levelXp || 0, to = x.nextXp || 1;
  const progress = to > from ? Math.min(Math.max((xp - from) / (to - from), 0), 1) : 0, active = x.active || 0;
  const lv = el('div', 'pcard'), head = el('div', 'lvl');
  head.append(el('b', '', `Level ${level}`), el('span', 'sub', x.rank || ''), el('span', 'sp'), el('span', 'sub', `${xp} XP`));
  const bar = el('div', 'bar'), fill = el('i'); fill.style.width = Math.round(progress * 100) + '%'; bar.append(fill);
  const act = el('div', 'lvl'); act.style.marginTop = '12px'; act.append(el('span', 'sub', 'Activity (7 days)'), el('span', 'sp'), el('b', '', active + '%'));
  const abar = el('div', 'bar green'), afill = el('i'); afill.style.width = Math.min(active, 100) + '%'; abar.append(afill);
  lv.append(head, bar, el('div', 'sub', `${Math.max(to - xp, 0)} XP to level ${level + 1}`), act, abar);
  box.append(lv);

  const ctr = el('div', 'pcard ctr');
  [['clock', 'Online', fmtDur(x.onlineSecs)], ['users', 'Room msgs', x.roomMsgs || 0], ['chat', 'Private', x.pms || 0],
    ['mic', 'Voice', fmtDur(x.voiceSecs)], ['video', 'Webcam', fmtDur(x.camSecs)], ['file', 'Files', x.files || 0]].forEach(([ic, label, v]) => {
    const c = el('div'); c.append(icon(ic), el('b', '', String(v)), el('small', '', label)); ctr.append(c);
  });
  box.append(ctr);

  const list = el('div', 'plist');
  const kv = (k, v) => { const r = el('div', 'kv'); r.append(el('span', 'sub', k), el('span', '', String(v))); list.append(r); };
  kv('Gender', ['Female', 'Male', 'Not specified'][Math.min(Math.max(i.gender == null ? 2 : i.gender, 0), 2)]);
  kv('Age', ageOf(i.birthday) ? ageOf(i.birthday) + ' years' : '-');
  kv('Country', i.country || '-'); kv('Member since', fmtDate(i.created)); kv('Last login', fmtDate(i.lastLogin)); kv('Sign-ins', x.logins || 0);
  box.append(list);

  const acts = el('div', 'pact');
  if (mine) {
    const b = el('button', '', 'Edit in settings'); b.prepend(icon('gear')); b.onclick = () => { fillSettings(); show('settings'); }; acts.append(b);
  } else {
    const m = el('button', '', 'Message'); m.prepend(icon('chat')); m.onclick = () => openPM(name, st.profileBack === 'room');
    const more = el('button', 'soft', 'More'); more.prepend(icon('more')); more.onclick = (e) => { e.stopPropagation(); member(name, true); };
    acts.append(m, more);
  }
  box.append(acts);
}

function whisperSheet(name) {
  const s = $('sheet'); s.textContent = ''; s.append(el('h3', '', `Whisper to ${name}`));
  const inp = el('input'); inp.placeholder = 'Only they will see this'; inp.autocomplete = 'off';
  const go = el('button', 'formbtn', 'Send whisper');
  const fire = () => { const t = inp.value.trim(); if (t && st.room) { send({ t: 'whisper', room: st.room.id, to: name, text: toWire(t) }); s.hidden = true; } };
  go.onclick = fire; inp.onkeydown = (e) => { if (e.key === 'Enter') fire(); };
  s.append(inp, go); s.hidden = false; inp.focus();
}

function sheet(title, items, lead) {
  const s = $('sheet'); s.textContent = '';
  const h = el('h3'); if (lead) { h.style.cssText = 'display:flex;align-items:center;gap:12px'; h.append(lead); } h.append(title); s.append(h);
  if (!items.length) s.append(el('p', '', 'Nothing here.'));
  for (const [ic, label, fn] of items) { const r = el('div', 'row'); r.append(icon(ic), label); r.onclick = () => { s.hidden = true; fn(); }; s.append(r); }
  s.hidden = false;
}

function roomMenu() {
  const m = $('menu');
  if (!m.hidden) { m.hidden = true; return; }
  m.textContent = '';
  const add = (ic, label, fn) => { const b = el('button'); b.append(icon(ic), label); b.onclick = () => { m.hidden = true; fn(); }; m.append(b); };
  add('users', 'Members', () => { $('userlist').hidden = !$('userlist').hidden; });
  add('pause', frozen ? 'Unfreeze chat' : 'Freeze chat', () => setFrozen(!frozen));
  add('dice', 'Games', openGames);
  add('info', 'Room info', roomInfo);
  add('hand', media.hand ? 'Lower hand' : 'Raise hand', () => send({ t: 'hand', room: st.room.id, value: media.hand ? 0 : 1 }));
  add('adduser', 'Invite a contact', inviteSheet);
  add('exit', 'Leave room', () => leaveRoomUI());
  m.hidden = false;
}

function roomInfo() {
  const d = st.detail || {}, s = $('sheet'); s.textContent = '';
  s.append(el('h3', '', st.room ? st.room.name : 'Room'));
  [['Owner', d.owner || '-'], ['Admins', (d.admins || []).join(', ') || '-'], ['Rating', RATINGS[Math.min(Math.max(d.rating || 0, 0), 2)]], ['Room level', d.planName || PLAN_NAMES[Math.min(d.plan || 0, 6)]]]
    .forEach(([k, v]) => s.append(el('p', '', `${k}: ${v}`)));
  const ok = el('div', 'row'); ok.append(icon('close'), 'Close'); ok.onclick = () => { s.hidden = true; }; s.append(ok);
  s.hidden = false;
}

function inviteSheet() {
  const online = st.buddies.filter((b) => b.status > 0);
  const items = online.map((b) => ['send', b.name, () => { send({ t: 'invite', room: st.room.id, to: b.name }); }]);
  sheet('Invite a contact', items);
  if (!items.length) $('sheet').querySelector('p').textContent = 'None of your contacts is online.';
}

// ---------- voice and webcam
const media = { rec: null, wait: false, hand: false, camOn: false, cam: null, viewers: new Set(), watching: new Set(), auto: new Set(), muted: false, next: 0 };
let actx;

function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

function playVoice(data, rate) {
  if (media.muted) return;
  const c = audio(), bin = atob(data), n = bin.length >> 1;
  if (!n) return;
  const buf = c.createBuffer(1, n, rate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; ch[i] = v / 32768; }
  const s = c.createBufferSource(); s.buffer = buf; s.connect(c.destination);
  if (media.next - c.currentTime > 1.5) media.next = 0; // too far behind: skip ahead instead of lagging
  const t = Math.max(c.currentTime + 0.06, media.next);
  s.start(t); media.next = t + buf.duration;
}

async function startRec() {
  if (media.rec) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const c = audio(), src = c.createMediaStreamSource(stream);
    const proc = c.createScriptProcessor(4096, 1, 1); // ponytail: ScriptProcessor works everywhere today; move to AudioWorklet if browsers drop it
    const ratio = c.sampleRate / RATE;
    proc.onaudioprocess = (e) => {
      const inp = e.inputBuffer.getChannelData(0), n = Math.floor(inp.length / ratio), out = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0, cnt = 0;
        for (let j = Math.floor(i * ratio); j < Math.floor((i + 1) * ratio) && j < inp.length; j++) { sum += inp[j]; cnt++; }
        out[i] = Math.max(-1, Math.min(1, cnt ? sum / cnt : 0)) * 32767;
      }
      if (st.room) send({ t: 'voice', room: st.room.id, value: RATE, data: b64(out.buffer) });
    };
    src.connect(proc); proc.connect(c.destination); // the output stays silent (we never write to it)
    media.rec = { stream, src, proc };
  } catch (_) {
    send({ t: 'micfree', room: st.room && st.room.id });
    alertMsg('Could not use the microphone. Allow microphone access for this site and try again.');
  }
  mediaUI();
}

function stopRec() {
  const r = media.rec; media.rec = null; media.wait = false; media.hand = false;
  if (r) { r.proc.disconnect(); r.src.disconnect(); r.stream.getTracks().forEach((t) => t.stop()); }
  mediaUI();
}

function toggleMic() {
  if (!st.room) return;
  audio();
  if (media.rec || media.wait || media.hand) { send({ t: 'micfree', room: st.room.id }); stopRec(); return; }
  media.wait = true; mediaUI();
  send({ t: 'micreq', room: st.room.id });
}

async function startCam() {
  if (media.camOn || !st.room) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } } });
    const vid = el('video'); vid.muted = true; vid.playsInline = true; vid.srcObject = stream; await vid.play();
    const cv = document.createElement('canvas'), cx = cv.getContext('2d');
    media.camOn = true; media.cam = { stream, vid, busy: false, timer: 0 };
    send({ t: 'camstate', room: st.room.id, value: 1 });
    const tile = el('div', 'tile'); tile.id = 'tile-me'; vid.style.transform = 'scaleX(-1)'; tile.append(vid, el('i', '', 'You'));
    $('cams').append(tile); $('cams').hidden = false;
    media.cam.timer = setInterval(() => {
      if (!media.viewers.size || !vid.videoWidth || media.cam.busy || !st.room) return; // only encode while somebody watches
      media.cam.busy = true;
      cv.width = 320; cv.height = Math.round(320 * vid.videoHeight / vid.videoWidth);
      cx.drawImage(vid, 0, 0, cv.width, cv.height);
      cv.toBlob(async (blob) => {
        try { if (blob && blob.size < 120000 && st.room) send({ t: 'camframe', room: st.room.id, data: b64(await blob.arrayBuffer()) }); } finally { media.cam.busy = false; }
      }, 'image/jpeg', 0.55);
    }, 200);
  } catch (_) {
    await stopCam();
    alertMsg('Could not start the camera. Allow camera access for this site and try again.');
  }
  mediaUI();
}

async function stopCam() {
  const c = media.cam; media.cam = null;
  if (media.camOn && st.room) send({ t: 'camstate', room: st.room.id, value: 0 });
  media.camOn = false; media.viewers.clear();
  if (c) { clearInterval(c.timer); c.stream.getTracks().forEach((t) => t.stop()); }
  const t = $('tile-me'); if (t) t.remove();
  camsVisible(); mediaUI();
}

function watch(name) {
  if (!st.room || media.watching.has(name)) return;
  media.watching.add(name);
  send({ t: 'camview', room: st.room.id, to: name });
  const tile = el('div', 'tile'); tile.id = 'tile-' + name;
  const img = el('img'); tile.append(img, el('i', '', name));
  const x = el('u'); x.append(icon('close')); x.onclick = (e) => { e.stopPropagation(); unwatch(name); }; tile.append(x);
  tile.onclick = () => tile.classList.toggle('big');
  $('cams').append(tile); $('cams').hidden = false;
}

function unwatch(name) {
  if (st.room) send({ t: 'camviewstop', room: st.room.id, to: name });
  media.watching.delete(name); dropTile(name);
}

function showFrame(from, data) {
  const t = $('tile-' + from); if (t && data) t.querySelector('img').src = 'data:image/jpeg;base64,' + data;
}

function dropTile(name) { const t = $('tile-' + name); if (t) t.remove(); camsVisible(); }
function camsVisible() { $('cams').hidden = !$('cams').children.length; }

function stopMedia(leaving) {
  if (leaving && st.room) for (const n of media.watching) send({ t: 'camviewstop', room: st.room.id, to: n });
  stopRec(); stopCam();
  media.watching.clear(); media.auto.clear(); $('cams').textContent = ''; camsVisible();
}

function mediaUI() {
  const mic = $('mic'), cam = $('cam');
  mic.className = 'ib' + (media.rec ? ' live' : media.wait || media.hand ? ' wait' : '');
  setIcon(mic, media.wait || media.hand ? 'hourglass' : 'mic');
  mic.title = media.rec ? 'Talking: tap to stop' : media.hand ? 'Waiting for the mic: tap to cancel' : 'Microphone';
  cam.className = 'ib' + (media.camOn ? ' camlive' : '');
  cam.title = media.camOn ? `Stop camera (${media.viewers.size} watching)` : 'Camera';
}

// ---------- private messages
function addPM(peer, from, text, time) { (st.pms[peer] ||= []).push({ from, text: text || '', time }); if (st.pmTo === peer) renderPM(); }

function openPM(name, fromRoom) {
  st.pmTo = name; st.pmFromRoom = !!fromRoom; st.unread.delete(name); wantInfo(name);
  $('pmname').textContent = name; $('pmav').textContent = ''; $('pmav').append(avatar(name, 40, 0)); pmHeader();
  show('pm'); renderPM(); renderContacts();
  send({ t: 'pmhistory', to: name });
}

// under the name: what the other person is doing right now (from the contact list, or from their profile)
const STATUS_TEXT = { 0: 'Offline', 1: 'Online', 2: 'Away', 3: 'On the phone', 4: 'Busy', 5: 'Do not disturb' };
function pmHeader() {
  const n = st.pmTo; if (!n) return;
  const b = st.buddies.find((x) => x.name === n), i = st.info[n] || {};
  const s = b ? b.status : (i.status || 0), txt = (b ? b.statusText : i.text) || '';
  $('pmsub').textContent = s === 6 && txt ? txt : STATUS_TEXT[s] || 'Online';
  const dot = $('pmav').querySelector('.av i'); if (dot) dot.style.background = STATUS_COLOR[s] || '#999';
}

// the chat as bubbles: mine on the right in blue, theirs on the left, a small time under each, a chip when the day changes
function renderPM() {
  const box = $('pmlines'); box.textContent = '';
  let day = '';
  for (const x of st.pms[st.pmTo] || []) {
    if (x.sys) { sysLine(box, x.text); continue; }
    const t = x.time || Date.now() / 1000, d = new Date(t * 1000), key = d.toDateString();
    if (key !== day) {
      day = key; const today = new Date().toDateString(), y = new Date(Date.now() - 864e5).toDateString();
      box.append(el('div', 'day', key === today ? 'Today' : key === y ? 'Yesterday' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })));
    }
    const mine = x.from === st.me, only = (!plain(x.text).trim() && x.text.includes('data-s=')) || EMO.solo(plain(x.text));
    const b = el('div', 'bub' + (mine ? ' me' : '') + (only ? ' stk' : ''));
    const body = el('div', 'bt'); rich(body, x.text); b.append(body, el('div', 't', clock(t)));
    box.append(b);
  }
  box.scrollTop = box.scrollHeight;
}

// ---------- add a contact
function addContactSheet() {
  const s = $('sheet'); s.textContent = '';
  s.append(el('h3', '', 'Add contact'));
  const row = el('div', 'addrow'), inp = el('input'), go = el('button', '', 'Add');
  inp.placeholder = 'Username'; inp.autocapitalize = 'off'; inp.autocomplete = 'off';
  const add = () => {
    const name = inp.value.trim(); if (!name) return;
    if (st.buddies.some((b) => b.name.toLowerCase() === name.toLowerCase())) { s.querySelector('p')?.remove(); s.append(el('p', '', `${name} is already in your contacts.`)); return; }
    send({ t: 'addbuddy', name }); s.hidden = true;
  };
  go.onclick = add; inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
  row.append(inp, go); s.append(row); s.hidden = false; inp.focus();
}

// ---------- create account (same rules as the Windows and Android apps)
let regCountry = '', regGender = '2';
document.querySelectorAll('#r-gender button').forEach((b) => { b.onclick = () => { regGender = b.dataset.v; document.querySelectorAll('#r-gender button').forEach((x) => x.classList.toggle('on', x === b)); }; });
$('r-country').onclick = () => { // a list you can scroll, with a search box on top
  const s = $('cpick'); s.textContent = '';
  const inp = el('input'); inp.placeholder = 'Search country'; inp.autocomplete = 'off'; inp.id = 'csearch';
  const list = el('div', 'clist');
  const draw = () => {
    list.textContent = ''; const q = inp.value.trim().toLowerCase();
    (window.COUNTRIES || []).filter((c) => c.toLowerCase().includes(q)).forEach((c) => {
      const r = el('div', 'row crow' + (c === regCountry ? ' sel' : ''), c);
      r.onclick = () => { regCountry = c; $('r-country').lastChild.textContent = c; $('r-country').classList.add('set'); s.hidden = true; };
      list.append(r);
    });
  };
  inp.oninput = draw; draw(); s.append(el('h3', '', 'Country'), inp, list); s.hidden = false;
};
$('r-pass2').oninput = $('r-pass').oninput = () => {
  const a = $('r-pass').value, b = $('r-pass2').value, h = $('r-pmatch');
  h.textContent = !b ? '' : a === b ? 'Passwords match' : 'Passwords do not match'; h.className = 'hintline ' + (!b ? '' : a === b ? 'okk' : 'bad');
};

function checkReg(f) {
  if (!f.user) return 'Please enter a username.';
  if (f.pass.length < 6) return 'Password must be at least 6 characters.';
  if (f.pass !== f.pass2) return 'The two passwords are not the same.';
  if (f.first.length < 3) return 'First name must be at least 3 characters.';
  if (f.last.length < 3) return 'Last name must be at least 3 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return 'Please enter a valid email address.';
  const age = parseInt(f.age, 10);
  if (!age) return 'Please enter your age.';
  if (age < 10) return 'Sorry, you must be 10 or older to use OldChatter.';
  if (age > 120) return 'Please enter a real age.';
  const i = (window.COUNTRIES || []).findIndex((c) => c.toLowerCase() === f.country.toLowerCase());
  if (i < 0) return 'Please choose your country.';
  f.country = window.COUNTRIES[i];
  if (f.answer.length < 3) return 'Security answer must be at least 3 characters.';
  return '';
}

$('toreg').onclick = () => { $('r-err').textContent = ''; show('reg'); };
$('toLogin').onclick = () => show('login');
$('r-go').onclick = async () => {
  const v = (id) => $(id).value.trim();
  const f = { user: v('r-user'), pass: $('r-pass').value, first: v('r-first'), last: v('r-last'), email: v('r-email'), age: v('r-age'), country: regCountry, answer: v('r-answer'), pass2: $('r-pass2').value };
  const bad = checkReg(f);
  if (bad) { $('r-err').textContent = bad; return; }
  $('r-go').disabled = true; $('r-err').textContent = '';
  dev = await deviceId();
  const done = (err) => { $('r-go').disabled = false; $('r-err').textContent = err || ''; };
  let s;
  try { s = new WebSocket(window.OLDCHATTER_SERVER); } catch (_) { return done('Cannot reach the server.'); }
  const timer = setTimeout(() => { s.close(); done('Cannot reach the server. Try again.'); }, 12000);
  s.onopen = () => s.send(JSON.stringify({ t: 'register', user: f.user, pass: f.pass, first: f.first, last: f.last, email: f.email, gender: parseInt(regGender, 10),
    birthday: f.age, country: f.country, question: 1, answer: f.answer, ver: VERSION, dev, vm: false }));
  s.onerror = () => {};
  s.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.t !== 'registered') return;
    clearTimeout(timer); s.close();
    if (!m.ok) return done(m.err || 'Could not create the account.');
    done(); $('user').value = f.user; $('pass').value = f.pass; show('login'); $('go').click(); // sign in right away
  };
};

// ---------- wiring
$('go').onclick = async () => {
  st.user = $('user').value.trim(); st.pass = $('pass').value;
  const saved = loadSession(); // an empty password with a saved session for this name signs in with the session
  if (!st.pass && saved && saved.user.toLowerCase() === st.user.toLowerCase()) st.token = saved.token;
  if (!st.user || (!st.pass && !st.token)) { $('err').textContent = 'Enter your username and password.'; return; }
  $('go').disabled = true; wantOnline = true; dev = await deviceId(); connect();
};
$('pass').onkeydown = (e) => { if (e.key === 'Enter') $('go').click(); };
$('roomback').onclick = () => leaveRoomUI();
$('more').onclick = roomMenu;
$('addb').onclick = addContactSheet;
$('pmav').onclick = () => openProfile(st.pmTo);
// ---------- settings, in groups
function applyPrefs() {
  document.documentElement.style.setProperty('--chat', { small: '14px', medium: '16px', large: '19px' }[prefs.size] || '16px');
  setTheme();
  document.querySelectorAll('#sizeseg button').forEach((b) => b.classList.toggle('on', b.dataset.v === prefs.size));
  document.querySelectorAll('#themeseg button').forEach((b) => b.classList.toggle('on', b.dataset.v === prefs.mode));
  $('joinleave').checked = prefs.joinleave;
}
const savePrefs = () => { try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch (_) { /* storage can be blocked */ } };
document.querySelectorAll('#sizeseg button').forEach((b) => { b.onclick = () => { prefs.size = b.dataset.v; savePrefs(); applyPrefs(); }; });
document.querySelectorAll('#themeseg button').forEach((b) => { b.onclick = () => { prefs.mode = b.dataset.v; savePrefs(); applyPrefs(); }; });
$('joinleave').onchange = () => { prefs.joinleave = $('joinleave').checked; savePrefs(); };

// who may reach me (the server keeps these per account, so every app shows the same values)
document.querySelectorAll('input.sw[data-bit]').forEach((sw) => {
  sw.onchange = () => { const bit = +sw.dataset.bit; st.privacy = sw.checked ? st.privacy | bit : st.privacy & ~bit; send({ t: 'privacy', value: st.privacy }); };
});

// status: the picked status and the custom message go together, like in the Windows app
const STATUS_LIST = [[1, 'Online'], [2, 'Away'], [3, 'On the phone'], [4, 'Busy'], [5, 'Do not disturb']];
function buildStatuses() {
  const box = $('statuses'); box.textContent = '';
  for (const [v, label] of STATUS_LIST) {
    const r = el('div', 'opt' + (st.status === v ? ' sel' : '')), sp = el('span'), d = el('i', 'dot');
    d.style.background = STATUS_COLOR[v] || '#999'; sp.append(d, label); r.append(sp);
    if (st.status === v) r.append(icon('check'));
    r.onclick = () => send({ t: 'status', status: v, text: $('custom').value.trim() });
    box.append(r);
  }
}
$('setcustom').onclick = () => send({ t: 'status', status: st.status >= 1 && st.status <= 5 ? st.status : 1, text: $('custom').value.trim() });
$('invis').onchange = () => send({ t: 'invisible', invis: $('invis').checked });

// profile picture: cropped square and shrunk so the server accepts it
$('avbtn').onclick = $('avchange').onclick = () => $('avfile').click();
$('avremove').onclick = () => send({ t: 'setavatar', avatar: '' });
$('avfile').onchange = async () => {
  const f = $('avfile').files[0]; $('avfile').value = '';
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f), side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
    c.width = c.height = 256;
    c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
    let q = 0.85, d = c.toDataURL('image/jpeg', q);
    while (d.length > 80000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
    send({ t: 'setavatar', avatar: d });
  } catch (_) { alertMsg('Could not use that picture.'); }
};

// blocked users
function renderBlocked() {
  const box = $('blocked'); box.textContent = '';
  if (!st.ignores.length) { box.append(el('div', 'empty', 'Nobody is blocked.')); return; }
  for (const n of st.ignores) {
    const r = el('div', 'opt'), sp = el('span'); sp.style.cssText = 'display:flex;align-items:center;gap:10px'; sp.append(avatar(n, 28), n);
    const b = el('button', 'soft', 'Unblock'); b.onclick = () => send({ t: 'unignore', name: n }); r.append(sp, b); box.append(r);
  }
}
$('blockgo').onclick = () => { const n = $('blockname').value.trim(); if (n) { send({ t: 'ignore', name: n }); $('blockname').value = ''; } };

// change password
$('chgpass').onclick = () => {
  const s = $('sheet'); s.textContent = ''; s.append(el('h3', '', 'Change password'));
  const f = (ph, type) => { const i = el('input'); i.placeholder = ph; i.type = type || 'text'; i.autocomplete = 'off'; s.append(i); return i; };
  const cur = f('Current password', 'password'), nw = f('New password (6+ characters)', 'password'), ans = f('Security answer');
  const note = el('p', ''), go = el('button', 'formbtn', 'Change password');
  go.onclick = () => {
    if (nw.value.length < 6) { note.textContent = 'The new password needs at least 6 characters.'; return; }
    send({ t: 'chgpass', pass: cur.value, newPass: nw.value, answer: ans.value }); s.hidden = true;
  };
  s.append(note, go); s.hidden = false;
};

function fillSettings() {
  $('setname').textContent = st.me; $('setav').textContent = ''; $('setav').append(avatar(st.me, 76));
  document.querySelectorAll('input.sw[data-bit]').forEach((sw) => { sw.checked = !!(st.privacy & +sw.dataset.bit); });
  $('invis').checked = !!st.invis;
  if (document.activeElement !== $('custom')) $('custom').value = st.statusText || '';
  buildStatuses(); renderBlocked(); applyPrefs();
}
$('setb').onclick = () => { fillSettings(); show('settings'); };
$('setback').onclick = () => show('main');
$('profback').onclick = () => show(st.profileBack || 'main');
$('viewprof').onclick = () => openProfile(st.me);
$('signout').onclick = () => {
  send({ t: 'logout' }); clearSession(); // ends this session on the server too
  wantOnline = false; clearInterval(ping); stopMedia(false); if (ws) ws.close();
  st.me = ''; st.room = null; st.pmTo = ''; st.pass = ''; $('pass').value = ''; $('go').disabled = false; show('login');
};
$('spk').onclick = () => { media.muted = !media.muted; setIcon($('spk'), media.muted ? 'mute' : 'vol'); $('spk').classList.toggle('off', media.muted); };
$('mic').onclick = toggleMic;
$('cam').onclick = () => (media.camOn ? stopCam() : startCam());
$('pmback').onclick = () => { st.pmTo = ''; show(st.pmFromRoom && st.room ? 'room' : 'main'); };
$('roomform').onsubmit = (e) => { e.preventDefault(); $('smilebox').hidden = true; const t = $('roomtext').value.trim(); if (t && st.room) { const rp = st.reply, qw = rp ? `<span data-q="${/^#[0-9a-fA-F]{6}$/.test(rp.color || '') ? rp.color : '1'}"><b>${escH(rp.name)}</b><br>${escH(rp.text)}</span>` : ''; send({ t: 'gmsg', room: st.room.id, text: qw + toWire(t) }); $('roomtext').value = ''; setReply(null); } };
$('lines').oncontextmenu = (e) => { if (e.target.closest('.msg')) return; e.preventDefault(); sheet('Chat', [['pause', frozen ? 'Unfreeze chat' : 'Freeze chat', () => setFrozen(!frozen)]]); };   // right-click on empty chat space (a message opens its own menu on tap)
$('rsm').onclick = () => smilePicker($('roomtext'), $('roomform'));
$('psm').onclick = () => smilePicker($('pmtext'), $('pmform'));
$('pmform').onsubmit = (e) => { e.preventDefault(); $('smilebox').hidden = true; const t = $('pmtext').value.trim(); if (t && st.pmTo) { const w = toWire(t); send({ t: 'pm', to: st.pmTo, text: w }); addPM(st.pmTo, st.me, w); $('pmtext').value = ''; } };
document.querySelectorAll('nav button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
    $('tab-contacts').hidden = b.dataset.tab !== 'contacts'; $('tab-rooms').hidden = b.dataset.tab !== 'rooms';
    if (b.dataset.tab === 'rooms') reqRooms();
  };
});
// tap anywhere else closes the menu, the member list and the sheet
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu, #more')) $('menu').hidden = true;
  if (!e.target.closest('#sheet, .row, .av, .msg, #menu, #addb, #chgpass, .pact')) $('sheet').hidden = true;
  if (!e.target.closest('#cpick, #r-country')) $('cpick').hidden = true;
  if (!e.target.closest('#userlist, #menu, #more')) $('userlist').hidden = true;
});
// the room list is live: while it is on screen the server is asked again every few seconds, so the member counts stay current
setInterval(() => { if (!document.hidden && st.me && !$('main').hidden && !$('tab-rooms').hidden) reqRooms(); }, 5000);
try { $('user').value = localStorage.getItem('user') || ''; } catch (_) { /* storage can be blocked */ }
if (tg && tg.BackButton) tg.BackButton.onClick(() => { if (!$('profile').hidden) $('profback').click(); else if (!$('settings').hidden) $('setback').click(); else if (!$('pm').hidden) $('pmback').click(); else if (!$('room').hidden) $('roomback').click(); else if (!$('reg').hidden) $('toLogin').click(); });

// start: with a saved session the app signs in by itself, no password needed
(async () => {
  const saved = loadSession();
  if (!saved || !saved.user || !saved.token) return;
  st.user = saved.user; st.token = saved.token; st.pass = '';
  $('user').value = saved.user; $('login').classList.add('auto'); $('err').textContent = 'Signing in…';
  wantOnline = true; dev = await deviceId(); connect();
})();

// coming back to the app (unlocking the phone, un-minimizing): a link that died while we were away is replaced at once
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !wantOnline || !st.me) return;
  if (!ws || ws.readyState > 1) return connect();
  const t0 = Date.now(); send({ t: 'ping' });
  setTimeout(() => { if (lastRx < t0 && wantOnline && ws) ws.close(); }, 3000); // no answer: the link is dead, onclose reconnects
});
