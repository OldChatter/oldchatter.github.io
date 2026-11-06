'use strict';
// The animated emoji (Google Noto Emoji Animation, CC BY 4.0). The pictures are files of this site (emoji/<code point>.webp),
// nothing comes from a CDN. Messages carry ordinary Unicode emoji; this file turns them into the pictures and runs the picker.
// Files are named by code point: "1f600", "263a_fe0f", "1f44b_1f3fd" (a waving hand in a skin tone).
const EMO = (function () {
  const MODS = ['', '1f3fb', '1f3fc', '1f3fd', '1f3fe', '1f3ff'];   // 0 = default yellow, 1-5 = light ... dark
  const isMod = (p) => MODS.indexOf(p) > 0;
  const RE = /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;
  const E = { cats: [], list: [], keys: new Set(), tonable: new Set(), ready: false };

  const hex = (s) => Array.from(s, (c) => c.codePointAt(0).toString(16)).join('_');
  const charOf = (key) => String.fromCodePoint.apply(null, key.split('_').map((h) => parseInt(h, 16)));
  const url = (key) => 'emoji/' + key + '.webp';
  function keyOf(s) {
    if (!E.ready) return null;
    const k = hex(s); if (E.keys.has(k)) return k;
    const bare = k.split('_').filter((p) => p !== 'fe0f'); const b = bare.join('_'); if (E.keys.has(b)) return b;
    const fe = [bare[0], 'fe0f'].concat(bare.slice(1)).join('_'); return E.keys.has(fe) ? fe : null;
  }
  const toneKey = (key, t) => (t > 0 && E.tonable.has(key) ? key + '_' + MODS[t] : key);

  // text -> nodes: an emoji with a picture becomes <img class="em">, everything else stays text
  function nodes(text) {
    const out = []; let last = 0;
    if (E.ready) for (const m of text.matchAll(RE)) {
      const key = keyOf(m[0]); if (!key) continue;
      if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
      const im = document.createElement('img'); im.className = 'em'; im.src = url(key); im.alt = m[0]; im.draggable = false; out.push(im);
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(document.createTextNode(text.slice(last)));
    return out;
  }
  // exactly one emoji and nothing else: it is shown three times bigger
  function solo(text) {
    if (!E.ready) return false;
    const t = text.trim(); const m = t.match(RE);
    return !!m && m.length === 1 && m[0] === t && !!keyOf(t);
  }

  // a search over the names ("thumbs up", "heart", "cat"): every word typed must appear
  function search(q) {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return w.length ? E.list.filter((e) => w.every((x) => e[2].includes(x))).slice(0, 150) : [];
  }
  // recently used, kept on this device
  const recent = () => { try { return JSON.parse(localStorage.getItem('oc-emoji-recent') || '[]').filter((k) => E.keys.has(k)); } catch (e) { return []; } };
  const pushRecent = (key) => { try { localStorage.setItem('oc-emoji-recent', JSON.stringify([key].concat(recent().filter((k) => k !== key)).slice(0, 36))); } catch (e) { /* storage blocked */ } };

  // ---- the skin tone this person uses: asked the first time an emoji with tones is picked, kept from then on
  const tone = () => { try { const v = localStorage.getItem('oc-tone'); return v === null ? -1 : +v; } catch (e) { return -1; } };
  const setTone = (t) => { try { localStorage.setItem('oc-tone', String(t)); } catch (e) { /* storage blocked */ } };

  fetch('emoji/emoji.json').then((r) => r.json()).then((j) => {
    E.cats = j.cats; E.list = j.list.filter((e) => !e[0].split('_').some(isMod));
    j.list.forEach((e) => { E.keys.add(e[0]); const p = e[0].split('_'); if (p.length === 2 && isMod(p[1])) E.tonable.add(p[0]); });
    E.ready = true;
    document.dispatchEvent(new Event('emoji-ready'));
  }).catch(() => { /* without the catalogue emoji simply stay characters */ });

  return Object.assign(E, { MODS, charOf, url, keyOf, toneKey, nodes, solo, tone, setTone, search, recent, pushRecent });
})();
