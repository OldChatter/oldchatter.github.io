'use strict';
// Room games for the web app: Ludo and Backgammon, the same two games as in the Windows app.
// The server owns every game (dice, rules, turns). This file only draws the state it receives and sends
// "roll", "move" and the lobby actions. Room admins start a game, everybody in the room can join or just watch.

const GAME = { st: null, left: 0, sel: null, rolling: 0, prev: null };
const NS = 'http://www.w3.org/2000/svg';
PATHS.dice = '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>';

function gameSend(act, extra) { if (st.room) send(Object.assign({ t: 'game', room: st.room.id, act: act }, extra || {})); }
function gameMe() { return String(st.me || '').toLowerCase(); }
function gameIsAdmin() { const u = st.users[st.me]; return !!(u && u.admin > 0); }

function openGames() {
  if (!st.room) return;
  GAME.st = null; GAME.sel = null; show('game'); gameSend('sync'); renderGame();
}

function onGameState(m) {
  if (!st.room || m.room !== st.room.id || !m.game) return;
  const g = m.game, prev = GAME.st;
  GAME.prev = prev; GAME.st = g; GAME.left = g.seconds || 0; GAME.sel = null;
  if (g.kind === 'backgammon' && g.phase === 'playing') {   // one possible starting point is selected for you
    const me = gamePlayers(g).findIndex((p) => p.name.toLowerCase() === gameMe() && !p.left);
    const froms = Array.from(new Set((g.moves || []).map((x) => x[0])));
    if (me >= 0 && g.turn === me && g.rolled && froms.length === 1) GAME.sel = froms[0];
  }
  renderGame();
}

const gamePlayers = (g) => (g && g.players) || [];
const gbtn = (label, fn, kind, disabled) => { const b = el('button', 'gbtn' + (kind ? ' ' + kind : ''), label); b.type = 'button'; b.disabled = !!disabled; if (!disabled) b.onclick = fn; return b; };

// ---------- dice
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
function dieSvg(v, size, color, dim) {
  const pips = (PIPS[v] || []).map((p) => `<circle cx="${18 + p[0] * 14}" cy="${18 + p[1] * 14}" r="5" fill="#222"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.3));opacity:${dim ? 0.3 : 1}"><rect x="4" y="4" width="56" height="56" rx="11" fill="#fff" stroke="${color || '#555'}" stroke-width="3"/>${pips}</svg>`;
}

// ---------- Ludo
const LC = ['#E53935', '#43A047', '#F9B21B', '#1E88E5'], LD = ['#B71C1C', '#2E7D32', '#C68400', '#1565C0'], LL = ['#FFCDD2', '#C8E6C9', '#FFF1C4', '#BBDEFB'];
const LNAMES = ['Red', 'Green', 'Yellow', 'Blue'], LSTART = [0, 13, 26, 39], LSAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const LLOOP = (() => {
  const a = [];
  for (let c = 1; c <= 5; c++) a.push([c, 6]);
  for (let r = 5; r >= 0; r--) a.push([6, r]);
  a.push([7, 0], [8, 0]);
  for (let r = 1; r <= 5; r++) a.push([8, r]);
  for (let c = 9; c <= 14; c++) a.push([c, 6]);
  a.push([14, 7], [14, 8]);
  for (let c = 13; c >= 9; c--) a.push([c, 8]);
  for (let r = 9; r <= 14; r++) a.push([8, r]);
  a.push([7, 14], [6, 14]);
  for (let r = 13; r >= 9; r--) a.push([6, r]);
  for (let c = 5; c >= 0; c--) a.push([c, 8]);
  a.push([0, 7], [0, 6]);
  return a;
})();
const LHOME = [[[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]];
const LFIN = [[6.5, 7.5], [7.5, 6.5], [8.5, 7.5], [7.5, 8.5]];
const LYARD = [[[2, 2], [4, 2], [2, 4], [4, 4]], [[11, 2], [13, 2], [11, 4], [13, 4]], [[11, 11], [13, 11], [11, 13], [13, 13]], [[2, 11], [4, 11], [2, 13], [4, 13]]];
const LYORG = [[0, 0], [9, 0], [9, 9], [0, 9]];
const lcenter = (p) => [p[0] + 0.5, p[1] + 0.5];
function lplace(color, tok, p) {
  if (p < 0) return LYARD[color][tok];
  if (p <= 50) return lcenter(LLOOP[(LSTART[color] + p) % 52]);
  if (p <= 55) return lcenter(LHOME[color][p - 51]);
  const o = [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]][tok];
  return [LFIN[color][0] + o[0], LFIN[color][1] + o[1]];
}

function ludoBoard(g, meIdx, canMove) {
  let s = '<rect width="15" height="15" fill="#fff"/>';
  LYORG.forEach((o, k) => {
    s += `<rect x="${o[0]}" y="${o[1]}" width="6" height="6" fill="${LC[k]}"/><rect x="${o[0] + 0.9}" y="${o[1] + 0.9}" width="4.2" height="4.2" rx="0.6" fill="#fff" opacity="0.92"/>`;
    LYARD[k].forEach((y) => { s += `<circle cx="${y[0]}" cy="${y[1]}" r="0.46" fill="${LL[k]}" stroke="${LC[k]}" stroke-width="0.06"/>`; });
  });
  LLOOP.forEach((c, i) => {
    const so = LSTART.indexOf(i);
    s += `<rect x="${c[0]}" y="${c[1]}" width="1" height="1" fill="${so >= 0 ? LC[so] : '#fff'}" stroke="#9AA0A6" stroke-width="0.04"/>`;
    if (LSAFE.indexOf(i) >= 0 && so < 0) {
      const pts = Array.from({ length: 10 }, (_, n) => { const a = -Math.PI / 2 + n * Math.PI / 5, r = n % 2 ? 0.14 : 0.3; return (c[0] + 0.5 + Math.cos(a) * r).toFixed(3) + ',' + (c[1] + 0.5 + Math.sin(a) * r).toFixed(3); }).join(' ');
      s += `<polygon points="${pts}" fill="#B0B0B0"/>`;
    }
  });
  LHOME.forEach((col, k) => col.forEach((c) => { s += `<rect x="${c[0]}" y="${c[1]}" width="1" height="1" fill="${LC[k]}" opacity="0.85" stroke="#fff" stroke-width="0.04"/>`; }));
  const tri = [[[6, 6], [9, 6], [7.5, 7.5]], [[9, 6], [9, 9], [7.5, 7.5]], [[9, 9], [6, 9], [7.5, 7.5]], [[6, 9], [6, 6], [7.5, 7.5]]], order = [1, 2, 3, 0];
  tri.forEach((p, i) => { s += `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="${LC[order[i]]}" stroke="#fff" stroke-width="0.04"/>`; });

  const stack = {}, movable = {};
  if (canMove) (g.movable || []).forEach((t) => { movable[g.players[meIdx].tokens[t]] = t; });
  gamePlayers(g).forEach((p, pi) => p.tokens.forEach((pos, ti) => {
    if (p.left) return;
    const key = pos < 0 || pos > 55 ? 'own' + pi + '-' + ti : pos <= 50 ? 'loop' + ((LSTART[p.color] + pos) % 52) : 'home' + p.color + '-' + pos;
    const n = (stack[key] = (stack[key] || 0) + 1) - 1, pt = lplace(p.color, ti, pos);
    const x = pt[0] + (n ? (n % 2 ? 0.16 : -0.16) : 0), y = pt[1] + (n > 1 ? -0.16 : 0);
    const can = canMove && pi === meIdx && movable[pos] !== undefined;
    s += `<g transform="translate(${x} ${y})"${can ? ` data-pick="${movable[pos]}" style="cursor:pointer"` : ''}>${can ? '<circle r="0.5" fill="none" stroke="#fff" stroke-width="0.1" class="ludo-pulse"/><circle r="0.62" fill="transparent"/>' : ''}<circle r="0.36" fill="${LD[p.color]}"/><circle r="0.31" cy="-0.02" fill="${LC[p.color]}" stroke="#fff" stroke-width="0.05"/><circle r="0.11" cx="-0.1" cy="-0.12" fill="#fff" opacity="0.55"/></g>`;
  }));
  return `<svg viewBox="0 0 15 15" class="gsvg">${s}</svg>`;
}

// ---------- Backgammon
const BW = 880, BH = 600, BTOP = 20, BBOT = 580, BPW = 60, BTRI = 250, BAR_X = 405;
const bcolX = (c) => (c < 6 ? 20 + c * BPW : 430 + (c - 6) * BPW);
const bpointX = (p) => bcolX(p >= 13 ? p - 13 : 12 - p);
const BFILL = ['#F7F2E8', '#2A2A2E'], BEDGE = ['#8C8472', '#000'], BNAMES = ['White', 'Black'];
function bchecker(x, y, c, label, glow, attrs) {
  return `<g${attrs || ''}>${glow ? `<circle cx="${x}" cy="${y}" r="29" fill="none" stroke="#2EA3F2" stroke-width="4" opacity="0.9"/>` : ''}<circle cx="${x}" cy="${y}" r="24" fill="${BFILL[c]}" stroke="${BEDGE[c]}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${c ? '#4A4A52' : '#D8D0BE'}" stroke-width="2"/>${label ? `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="${c ? '#fff' : '#222'}">${label}</text>` : ''}</g>`;
}
function bgBoard(g, myColor, canMove) {
  const moves = g.moves || [], sel = GAME.sel, froms = new Set(moves.map((m) => m[0])), dests = new Set(moves.filter((m) => m[0] === sel).map((m) => m[1]));
  const offMark = myColor === 0 ? 0 : 25;
  let s = `<rect width="${BW}" height="${BH}" fill="#5B3A22"/><rect x="14" y="14" width="776" height="572" rx="6" fill="#3E7A52"/><rect x="380" y="14" width="50" height="572" fill="#5B3A22"/><rect x="800" y="14" width="66" height="572" rx="6" fill="#4A2F1B"/>`;
  const offTarget = sel !== null && dests.has(offMark);
  s += `<rect x="800" y="14" width="66" height="572" rx="6" fill="${offTarget ? '#2EA3F2' : 'transparent'}" opacity="0.35"${offTarget ? ' data-off="1" style="cursor:pointer"' : ''}/>`;
  let tris = '', stacks = '';
  for (let p = 1; p <= 24; p++) {
    const x = bpointX(p), top = p >= 13, n = g.pts[p];
    const pts = top ? `${x},${BTOP} ${x + BPW},${BTOP} ${x + BPW / 2},${BTOP + BTRI}` : `${x},${BBOT} ${x + BPW},${BBOT} ${x + BPW / 2},${BBOT - BTRI}`;
    const target = sel !== null && dests.has(p), act = canMove && (target || froms.has(p));
    tris += `<g${act ? ` data-pt="${p}" style="cursor:pointer"` : ''}><polygon points="${pts}" fill="${p % 2 ? '#B5651D' : '#EFD9A8'}"/>${target ? `<polygon points="${pts}" fill="#2EA3F2" opacity="0.5"/>` : ''}<rect x="${x}" y="${top ? BTOP : BBOT - 300}" width="${BPW}" height="300" fill="transparent"/></g>`;
    tris += `<text x="${x + BPW / 2}" y="${top ? BTOP - 5 : BBOT + 15}" text-anchor="middle" font-size="11" fill="#6A5A44">${p}</text>`;
    if (n !== 0) {
      const c = n > 0 ? 0 : 1, cnt = Math.abs(n), show = Math.min(cnt, 5);
      for (let i = 0; i < show; i++) {
        const y = top ? BTOP + 26 + i * 46 : BBOT - 26 - i * 46;
        const mine = canMove && c === myColor && froms.has(p);
        stacks += bchecker(x + BPW / 2, y, c, i === 4 && cnt > 5 ? cnt : '', mine && i === show - 1 && (sel === null || sel === p), mine ? ` data-pt="${p}" style="cursor:pointer"` : '');
      }
    }
  }
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < Math.min(g.bar[c], 4); i++) {
      const mine = canMove && c === myColor;
      stacks += bchecker(BAR_X, c === 0 ? 335 + i * 44 : 265 - i * 44, c, i === 3 && g.bar[c] > 4 ? g.bar[c] : '', mine && froms.has(0) && i === 0, mine && froms.has(0) ? ' data-pt="0" style="cursor:pointer"' : '');
    }
  }
  let trays = '';
  [0, 1].forEach((c) => { for (let i = 0; i < g.off[c]; i++) trays += `<rect x="810" y="${c === 0 ? BBOT - 14 * (i + 1) : BTOP + 14 * i}" width="50" height="12" rx="3" fill="${BFILL[c]}" stroke="${BEDGE[c]}" stroke-width="1.5"/>`; });
  const bar = canMove && froms.has(0) ? '<rect x="380" y="270" width="50" height="60" fill="transparent" data-pt="0"/>' : '';
  return `<svg viewBox="0 0 ${BW} ${BH}" class="gsvg">${s}${tris}${trays}${stacks}${bar}<text x="833" y="305" text-anchor="middle" font-size="12" fill="#C9B79C">OFF</text></svg>`;
}

// ---------- the game screen
function renderGame() {
  const box = $('gamebody'); if (!box) return;
  const g = GAME.st; box.textContent = '';
  const title = $('gametitle'), ph = $('gamephase');
  if (!g || g.phase === 'none') {
    title.textContent = 'Games'; ph.hidden = true;
    const w = el('div', 'gempty');
    w.append(el('div', 'gdice', '🎲'), el('b', '', g ? 'No game is running' : 'Loading…'));
    w.append(el('p', 'sub', gameIsAdmin() ? 'As a room admin you can start a game for everybody in this room.' : 'A room admin can start a game here. Everybody in the room can join or just watch.'));
    if (g && gameIsAdmin()) { const r = el('div', 'grow'); r.append(gbtn('Start Ludo', () => gameSend('start', { name: 'ludo' }), 'primary'), gbtn('Start Backgammon', () => gameSend('start', { name: 'backgammon' }), 'primary')); w.append(r); }
    box.append(w); return;
  }
  const bg = g.kind === 'backgammon', players = gamePlayers(g);
  title.textContent = bg ? 'Backgammon' : 'Ludo';
  ph.hidden = false; ph.textContent = g.phase === 'lobby' ? 'WAITING' : g.phase === 'playing' ? 'PLAYING' : 'FINISHED'; ph.className = 'pill gph ' + g.phase;
  const meIdx = players.findIndex((p) => p.name.toLowerCase() === gameMe() && !p.left), isPlayer = meIdx >= 0;
  const control = gameIsAdmin() || (g.host && g.host.toLowerCase() === gameMe());
  const myTurn = g.phase === 'playing' && isPlayer && g.turn === meIdx;
  const turnPlayer = g.phase === 'playing' ? players[g.turn] : null;
  const myColor = isPlayer ? players[meIdx].color : -1;
  const canMove = bg ? (myTurn && g.rolled && (g.moves || []).length > 0) : (myTurn && g.dice > 0);
  const mustRoll = bg ? (myTurn && !g.rolled) : (myTurn && g.dice === 0);

  const boardWrap = el('div', 'gboard' + (bg ? ' bg' : ''));
  boardWrap.innerHTML = bg ? bgBoard(g, myColor, canMove) : ludoBoard(g, meIdx, canMove);
  box.append(boardWrap);

  const side = el('div', 'gside');
  const list = el('div', 'gplayers');
  players.forEach((p, i) => {
    const turn = g.phase === 'playing' && g.turn === i, row = el('div', 'gp' + (turn ? ' turn' : '') + (p.left ? ' left' : ''));
    const dot = el('span', 'gdot'); dot.style.background = bg ? BFILL[p.color] : LC[p.color]; if (bg) dot.style.border = '2px solid ' + BEDGE[p.color];
    const nm = el('b', '', p.name); row.append(dot, nm);
    if (i === meIdx) row.append(el('small', '', '(you)'));
    const info = el('span', 'ginfo', g.phase === 'lobby' ? (bg ? BNAMES[p.color] : LNAMES[p.color]) : bg ? g.off[p.color] + '/15 off' : p.tokens.filter((t) => t === 56).length + '/4 home');
    row.append(info); if (turn) row.append(el('span', '', '◀'));
    list.append(row);
  });
  if (!players.length) list.append(el('p', 'sub', 'Nobody has joined yet.'));
  side.append(list);

  if (g.phase === 'playing') {
    const card = el('div', 'gturn'), dice = el('div', 'gdiceRow');
    if (bg) {
      const shown = g.last && g.last[0] ? (g.last[0] === g.last[1] ? [g.last[0], g.last[0], g.last[0], g.last[0]] : g.last) : [], rem = (g.dice || []).slice();
      shown.forEach((d) => { const i = rem.indexOf(d); if (i >= 0) rem.splice(i, 1); dice.insertAdjacentHTML('beforeend', dieSvg(d, shown.length > 2 ? 40 : 52, null, i < 0 || !g.rolled)); });
      if (!shown.length) dice.append(el('span', 'sub', 'Roll the dice'));
    } else dice.innerHTML = dieSvg(g.dice || g.last || 1, 56, turnPlayer ? LC[turnPlayer.color] : null, false);
    card.append(dice);
    const what = el('div', 'gwhat');
    if (mustRoll) what.append(el('b', 'me', 'Your turn: roll the dice'));
    else if (canMove) what.append(el('b', 'me', bg ? 'Tap a checker, then where it goes' : 'You rolled ' + g.dice + ': choose a token'));
    else what.append(el('span', '', 'Waiting for ' + (turnPlayer ? turnPlayer.name : '')));
    const meta = el('div', 'gmeta'); meta.append(el('span', 'gleft', GAME.left + 's left'));
    if (g.lastBy) meta.append(el('span', '', ' · '), el('span', '', bg ? g.lastBy + ' rolled ' + g.last[0] + ' and ' + g.last[1] : g.lastBy + ' rolled ' + g.last));
    what.append(meta); card.append(what); side.append(card);
    side.append(gbtn(mustRoll ? 'Roll the dice' : 'Waiting for your turn…', () => gameSend('roll'), 'primary', !mustRoll));
  }
  if (g.phase === 'over') { const w = el('div', 'gwin'); w.append(el('div', 'gdice', '🏆'), el('b', '', g.winner + ' wins!')); side.append(w); }
  const full = players.length >= (bg ? 2 : 4);
  if (g.phase === 'lobby') {
    side.append(!isPlayer ? gbtn(full ? 'Game is full: you can watch' : 'Join the game', () => gameSend('join'), 'primary', full) : gbtn('Leave the game', () => gameSend('leave')));
    side.append(control ? gbtn(players.length < 2 ? 'Start game (need 2 players)' : 'Start the game', () => gameSend('begin'), 'primary', players.length < 2)
      : el('p', 'sub', bg ? 'The host or a room admin starts the game when both players are in.' : 'The host or a room admin starts the game when everybody is in.'));
  }
  if (g.phase === 'playing' && isPlayer) side.append(gbtn('Leave the game', () => gameSend('leave')));
  if (g.phase === 'over' && control) side.append(gbtn('Play again', () => gameSend('again'), 'primary'));
  if (control) side.append(gbtn('Close the game', () => gameSend('stop'), 'danger'));
  if (!isPlayer && g.phase !== 'lobby') side.append(el('p', 'sub', 'You are watching.'));
  if (bg && isPlayer && g.phase === 'playing') side.append(el('p', 'sub', myColor === 0 ? 'You play White: from point 24 down to 1.' : 'You play Black: from point 1 up to 24.'));
  const log = el('div', 'glog'); (g.log || []).slice().reverse().forEach((l) => log.append(el('div', '', l))); side.append(log);
  box.append(side);
}

// taps on the board
document.addEventListener('DOMContentLoaded', () => {
  const box = $('gamebody'); if (!box) return;
  box.addEventListener('click', (e) => {
    const g = GAME.st; if (!g) return;
    const pick = e.target.closest('[data-pick]');
    if (pick && g.kind !== 'backgammon') { gameSend('move', { value: +pick.dataset.pick }); return; }
    if (g.kind !== 'backgammon') return;
    if (e.target.closest('[data-off]')) { const me = gamePlayers(g).findIndex((p) => p.name.toLowerCase() === gameMe()); const off = me >= 0 && gamePlayers(g)[me].color === 0 ? 0 : 25; if (GAME.sel !== null) { gameSend('move', { move: [GAME.sel, off] }); GAME.sel = null; } return; }
    const pt = e.target.closest('[data-pt]'); if (!pt) return;
    const p = +pt.dataset.pt, moves = g.moves || [];
    if (GAME.sel !== null && moves.some((m) => m[0] === GAME.sel && m[1] === p)) { gameSend('move', { move: [GAME.sel, p] }); GAME.sel = null; return; }
    if (moves.some((m) => m[0] === p)) { GAME.sel = p === GAME.sel ? null : p; renderGame(); }
  });
  $('gameback').onclick = () => show('room');
  setInterval(() => { if (GAME.left > 0) { GAME.left--; const n = document.querySelector('#gamebody .gleft'); if (n) n.textContent = GAME.left + 's left'; } }, 1000);
});
