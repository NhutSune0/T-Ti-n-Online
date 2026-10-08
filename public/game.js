'use strict';
/* ============================================================
 * TU TIEN ONLINE - Client
 * Canvas 2D + WebSocket, sprite AI, hieu ung phong cach donghua
 * ============================================================ */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
function resize() { cv.width = innerWidth; cv.height = innerHeight; }
addEventListener('resize', resize); resize();

/* ---------------- State ---------------- */
let ws = null, myId = null, world = { w: 1600, h: 1200 }, SKILLS = {};
let MAPS = {}, curMapId = 'tan-thu-thon', ATTR_DEFS = {};
let myAttrs = { luc: 0, the: 0, man: 0, linh: 0 }, myAttrPoints = 0, myCrit = 5, myDodge = 0;
let nearPortalIdx = -1;
let NPCS = [], questList = [], questGivers = [], nearNpcId = null, dlgNpcId = null;
let players = {}, monsters = {}, projectiles = [];
let cam = { x: 0, y: 0 }, shake = 0;
let effects = [], dmgNums = [], floatTxts = [];
let bossWarns = [];
let keys = {}, mouse = { x: innerWidth / 2, y: innerHeight / 2 };
let aimAngle = 0, moveVec = { x: 0, y: 0 };
let lastMoveSent = 0, lastDirSent = 0;
let myCds = {};            // skillId -> timestamp het hoi chieu (client)
let myInv = [], myEquip = { weapon: null, armor: null }, SHOP = {};
let chatting = false;
let stars = [], motes = [], decos = [];

/* ---------------- Sprite ---------------- */
const SHEETS = {
  walk:   { src: 'sprites/player-walk.webp', rows: 3, cols: 4, frames: [] },
  attack: { src: 'sprites/player-attack.webp', rows: 4, cols: 3, frames: [] },
  mon1:   { src: 'sprites/monsters-1.webp', rows: 3, cols: 4, frames: [] },
  mon2:   { src: 'sprites/monsters-2.webp', rows: 2, cols: 4, frames: [] },
};
const MON_LOOK = {
  wolf:     { sheet: 'mon1', row: 0, h: 95 },
  demon:    { sheet: 'mon1', row: 1, h: 135 },
  skeleton: { sheet: 'mon1', row: 2, h: 135 },
  fox:      { sheet: 'mon2', row: 0, h: 155 },
  golem:    { sheet: 'mon2', row: 1, h: 195 },
};
function chromaKey(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 180 && px[i + 1] < 110 && px[i + 2] > 180) px[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
  return c;
}
function loadSheets() {
  const jobs = Object.entries(SHEETS).map(([k, s]) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const clean = chromaKey(img);
      const fw = clean.width / s.cols, fh = clean.height / s.rows;
      s.fw = fw; s.fh = fh;
      for (let r = 0; r < s.rows; r++) {
        s.frames[r] = [];
        for (let cI = 0; cI < s.cols; cI++) {
          const f = document.createElement('canvas');
          f.width = fw; f.height = fh;
          f.getContext('2d').drawImage(clean, cI * fw, r * fh, fw, fh, 0, 0, fw, fh);
          s.frames[r][cI] = f;
        }
      }
      res();
    };
    img.onerror = () => res();
    img.src = s.src;
  }));
  return Promise.all(jobs);
}
function dir4(a) {
  const deg = ((a * 180 / Math.PI) % 360 + 360) % 360;
  if (deg < 45 || deg >= 315) return 'right';
  if (deg < 135) return 'down';
  if (deg < 225) return 'left';
  return 'up';
}
function drawSheetFrame(sheet, row, col, x, y, targetH, flip, alpha) {
  const s = SHEETS[sheet];
  if (!s.frames[row] || !s.frames[row][col]) return;
  const f = s.frames[row][col];
  const sc = targetH / s.fh, w = s.fw * sc;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(f, -w / 2, -targetH, w, targetH);
  ctx.restore();
}

/* ---------------- Login / WS ---------------- */
const loginEl = document.getElementById('login');
const hudEl = document.getElementById('hud');
document.getElementById('join-btn').onclick = joinGame;
document.getElementById('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinGame(); });
function joinGame() {
  const name = document.getElementById('name-input').value.trim();
  if (!name) { document.getElementById('login-err').textContent = 'Hãy nhập đạo hiệu!'; return; }
  document.getElementById('join-btn').disabled = true;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name }));
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
  ws.onclose = () => {
    document.getElementById('login-err').textContent = 'Mất kết nối tới server. Hãy tải lại trang.';
    document.getElementById('join-btn').disabled = false;
  };
  ws._pendingName = name;
}
function onMsg(m) {
  if (m.t === 'welcome') {
    myId = m.id; MAPS = m.maps; SKILLS = m.skills; SHOP = m.shop || {}; ATTR_DEFS = m.attrs || {};
    NPCS = m.npcs || [];
    if (m.isNew && m.story) {
      document.getElementById('story-text').textContent = m.story;
      document.getElementById('story-modal').classList.add('open');
    }
    renderShop();
    loginEl.style.display = 'none'; hudEl.style.display = 'block';
    addChat(null, 'Chào mừng <b>' + esc(ws._pendingName) + '</b> đến với Tu Tiên Online!', true);
    initWorldDeco();
  }
  else if (m.t === 'state') {
    const np = {}, nm = {};
    for (const p of m.p) {
      const old = players[p.id];
      np[p.id] = Object.assign(old || { animT: 0, atkPlay: -1, lastAtkT: 0 }, p);
      const e = np[p.id];
      if (p.atkAnimT !== e.lastAtkT) { e.lastAtkT = p.atkAnimT; e.atkPlay = 0; }
      if (e.moving) e.animT += 1 / 10;
    }
    for (const x of m.m) {
      const old = monsters[x.id];
      nm[x.id] = Object.assign(old || { animT: Math.random() * 4 }, x);
      if (nm[x.id].moving) nm[x.id].animT += 1 / 10;
    }
    players = np; monsters = nm; projectiles = m.pr;
    document.getElementById('online-n').textContent = m.online;
    document.getElementById('plist').innerHTML =
      Object.values(players).map(p => `<div>${esc(p.name)} <span style="color:#8f7bb8">Lv${p.level}</span></div>`).join('');
    for (const e of m.ev) onEvent(e);
    updateHUD();
  }
  else if (m.t === 'chat') addChat(m.name, esc(m.msg), m.sys);
  else if (m.t === 'join') addChat(null, `<b>${esc(m.name)}</b> đã nhập thế giới`, true);
  else if (m.t === 'leave') addChat(null, `<b>${esc(m.name)}</b> đã rời đi`, true);
  else if (m.t === 'inv') { myInv = m.inv; myEquip = m.equip; renderInv(); renderChar(); }
  else if (m.t === 'mapchange') onMapChange(m.mapId, m.x, m.y);
  else if (m.t === 'attrs') { myAttrs = m.attrs; myAttrPoints = m.points; myCrit = m.crit; myDodge = m.dodge; renderChar(); }
  else if (m.t === 'dialog') openDialog(m.npc, m.quests);
  else if (m.t === 'quests') { questList = m.list; questGivers = m.givers || []; renderQuests(); }
  else if (m.t === 'rank') renderRank(m.list);
  else if (m.t === 'nameTaken') { document.getElementById('login-err').textContent = 'Đạo hiệu đã có người dùng!'; document.getElementById('join-btn').disabled = false; }
  else if (m.t === 'notice') addChat(null, esc(m.msg), true);
}
function esc(s) { return String(s == null ? '' : s); }

/* ---------------- Am thanh (WebAudio tong hop) ---------------- */
let AC = null, soundOn = true;
function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); return AC; }
function tone(f0, f1, dur, type, vol) {
  if (!soundOn) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), a.currentTime + dur);
    g.gain.setValueAtTime(vol || .1, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function noiseBurst(dur, vol, fc) {
  if (!soundOn) return;
  try {
    const a = ac(), len = a.sampleRate * dur, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fc;
    const g = a.createGain(); g.gain.value = vol || .1;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  } catch (e) {}
}
function sfx(n) {
  switch (n) {
    case 'swing': noiseBurst(.12, .08, 2000); break;
    case 'hit': tone(200, 70, .1, 'square', .07); break;
    case 'skill': tone(280, 950, .35, 'sawtooth', .09); break;
    case 'levelup': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, f, .3, 'sine', .11), i * 95)); break;
    case 'drop': tone(880, 1320, .22, 'sine', .1); break;
    case 'potion': tone(420, 820, .18, 'sine', .1); break;
    case 'hurt': tone(230, 110, .14, 'sawtooth', .08); break;
    case 'die': tone(170, 40, .4, 'triangle', .11); break;
    case 'buy': tone(700, 1050, .12, 'sine', .1); break;
    case 'warn': tone(180, 180, .5, 'square', .08); tone(180, 180, .5, 'square', .08); break;
    case 'blast': noiseBurst(.4, .3, 300); tone(120, 40, .5, 'sawtooth', .14); break;
  }
}
document.getElementById('sound-toggle').addEventListener('click', function () {
  soundOn = !soundOn; this.textContent = soundOn ? '🔊' : '🔇';
});

/* ---------------- Events -> hieu ung ---------------- */
function onEvent(e) {
  if (e.k === 'dmg') {
    dmgNums.push({ x: e.x + (Math.random() * 30 - 15), y: e.y, txt: e.amount, crit: e.crit, t: 0, col: e.target === 'p' ? '#ff6b6b' : (e.crit ? '#ffb02e' : '#fff') });
  }
  else if (e.k === 'die' && e.target === 'm') {
    soulBurst(e.x, e.y, e.boss ? 40 : 16);
    if (e.boss) { banner('ĐÃ HẠ ' + e.name.toUpperCase() + '!'); shake = Math.max(shake, 14); ring(e.x, e.y, '#ffd76a', 260); }
  }
  else if (e.k === 'die' && e.target === 'p') {
    soulBurst(e.x, e.y, 20);
    if (e.id === myId) banner('BẠN ĐÃ NGÃ XUỐNG', 'Hồi sinh sau 5 giây...');
  }
  else if (e.k === 'lvl' && e.id === myId) { banner('ĐỘT PHÁ · LV ' + e.level + '!'); levelPillar(e.x, e.y); }
  else if (e.k === 'loot' && e.id === myId) { floatTxts.push({ x: e.x, y: e.y - 70, txt: '+' + e.xp + ' tu vi · +' + e.gold + ' linh thạch', t: 0, col: '#c9a6ff' }); }
  else if (e.k === 'itemdrop' && e.id === myId) { floatTxts.push({ x: e.x, y: e.y, txt: '✨ ' + e.label, t: 0, col: e.col }); sfx('drop'); }
  else if (e.k === 'potfx') { for (let i = 0; i < 12; i++) effects.push({ kind: 'wisp', x: e.x + (Math.random() - .5) * 60, y: e.y - 40, vx: (Math.random() - .5) * 40, vy: -Math.random() * 90 - 30, t: 0, dur: .8, r: 3, col: '#5dff8a' }); sfx('potion'); }
  else if (e.k === 'atkfx') { sfx('swing'); }
  else if (e.k === 'skillfx') { sfx('skill'); }
  else if (e.k === 'lvl') { if (e.id === myId) sfx('levelup'); }
  else if (e.k === 'die') { sfx('die'); }
  else if (e.k === 'miss') { floatTxts.push({ x: e.x, y: e.y, txt: 'Né!', t: 0, col: '#9be8ff' }); }
  else if (e.k === 'portalfx') { ring(e.x, e.y, '#7db8ff', 130); }
  else if (e.k === 'questfx') { ring(e.x, e.y, '#ffd76a', 110); floatTxts.push({ x: e.x, y: e.y - 70, txt: 'Hoàn thành nhiệm vụ!', t: 0, col: '#ffd76a' }); }
  else if (e.k === 'bosswarn') {
    bossWarns.push({ x: e.x, y: e.y, r: e.r, until: Date.now() + e.ms });
    floatTxts.push({ x: e.x, y: e.y - e.r - 20, txt: '⚠ ' + e.name + '!', t: 0, col: '#ff5d5d' });
    sfx('warn');
  }
  else if (e.k === 'bossblast') {
    ring(e.x, e.y, '#ff5d2e', e.r + 60); shake = Math.max(shake, 12);
    for (let i = 0; i < 24; i++) effects.push({ kind: 'wisp', x: e.x + (Math.random() - .5) * e.r, y: e.y + (Math.random() - .5) * e.r * .6, vx: (Math.random() - .5) * 260, vy: -Math.random() * 200 - 40, t: 0, dur: .9, r: Math.random() * 4 + 2, col: Math.random() < .5 ? '#ff5d2e' : '#ffb02e' });
    sfx('blast');
  }
  else if (e.k === 'atkfx') effects.push({ kind: 'slash', x: e.x, y: e.y, dir: e.dir, t: 0, dur: 0.28 });
  else if (e.k === 'matkfx') effects.push({ kind: 'claw', x: e.x, y: e.y, dir: e.dir, t: 0, dur: 0.3 });
  else if (e.k === 'hitfx') effects.push({ kind: 'impact', x: e.x, y: e.y, t: 0, dur: 0.25 });
  else if (e.k === 'skillfx') {
    if (e.skill === 1) { effects.push({ kind: 'castflash', x: e.x, y: e.y, t: 0, dur: 0.3, col: '#b47bff' }); }
    else if (e.skill === 2) { lightningStorm(e.x, e.y); shake = Math.max(shake, 8); }
    else if (e.skill === 3) { effects.push({ kind: 'bell', x: e.x, y: e.y, t: 0, dur: 1.2 }); ring(e.x, e.y, '#ffd76a', 150); }
  }
  else if (e.k === 'respawn' && e.id === myId) banner('HỒI SINH!');
}
function banner(txt, sub) {
  const b = document.getElementById('banner');
  b.innerHTML = txt + (sub ? `<div style="font-size:18px;color:#e8ddff;letter-spacing:2px">${sub}</div>` : '');
  b.style.opacity = 1;
  clearTimeout(b._to); b._to = setTimeout(() => b.style.opacity = 0, 2200);
}

/* ---------------- Chat ---------------- */
const chatlog = document.getElementById('chatlog');
function addChat(name, msg, sys) {
  const d = document.createElement('div');
  d.innerHTML = sys ? `<span class="sys">${msg}</span>` : `<span class="nm">${esc(name)}:</span> ${msg}`;
  chatlog.appendChild(d);
  while (chatlog.children.length > 60) chatlog.removeChild(chatlog.firstChild);
  chatlog.scrollTop = chatlog.scrollHeight;
}
const chatinput = document.getElementById('chatinput');
chatinput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (chatting && chatinput.value.trim()) ws.send(JSON.stringify({ t: 'chat', msg: chatinput.value }));
    chatinput.value = ''; chatinput.blur(); chatting = false;
  }
  e.stopPropagation();
});
chatinput.addEventListener('focus', () => chatting = true);
chatinput.addEventListener('blur', () => chatting = false);

/* ---------------- Input ---------------- */
addEventListener('keydown', (e) => {
  if (chatting) return;
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  if (e.key === 'Enter') { chatinput.focus(); }
  if (e.key.toLowerCase() === 'j') doAttack();
  if (e.key >= '1' && e.key <= '3') doSkill(+e.key);
  const k = e.key.toLowerCase();
  if (k === 'i') togglePanel('inv');
  else if (k === 'c') togglePanel('char');
  else if (k === 'b') togglePanel('shop');
  else if (k === 't') togglePanel('rank');
  else if (k === 'q') usePotion('hp');
  else if (k === 'e') { if (!tryTalk()) usePotion('mana'); }
  else if (k === 'f') tryPortal();
  else if (k === 'escape') document.querySelectorAll('.panel').forEach(x => x.classList.remove('open'));
});
addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);
cv.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', (e) => { if (e.button === 0 && ws && myId) doAttack(); });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
document.querySelectorAll('.skill').forEach(el => {
  el.addEventListener('click', () => doSkill(+el.dataset.skill));
});
document.getElementById('pot-hp').addEventListener('click', () => usePotion('hp'));
document.getElementById('pot-mana').addEventListener('click', () => usePotion('mana'));
function usePotion(kind) { if (ws && myId) ws.send(JSON.stringify({ t: 'usepot', kind })); }

/* ---------------- NPC / Nhiem vu / Cot truyen ---------------- */
function drawNPC(n, t) {
  const bob = Math.sin(t * 2 + n.x) * 3;
  ctx.fillStyle = '#2a1f4d';
  ctx.beginPath(); ctx.moveTo(n.x - 20, n.y); ctx.lineTo(n.x + 20, n.y); ctx.lineTo(n.x, n.y - 72 + bob); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6d3fd4'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#e8c39e'; ctx.beginPath(); ctx.arc(n.x, n.y - 82 + bob, 12, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a1430'; ctx.beginPath(); ctx.arc(n.x, n.y - 86 + bob, 14, Math.PI, 0); ctx.fill();
  ctx.fillRect(n.x - 14, n.y - 88 + bob, 28, 4);
  ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText(n.name, n.x, n.y - 112 + bob);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#9d86c9';
  ctx.fillText('· ' + n.title + ' ·', n.x, n.y - 96 + bob);
  ctx.shadowBlur = 0;
  if (questGivers.includes(n.id)) {
    const b2 = Math.sin(t * 4) * 4;
    ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#ffd76a'; ctx.shadowColor = '#ff9d2e'; ctx.shadowBlur = 12;
    ctx.fillText('!', n.x, n.y - 132 + bob + b2);
    ctx.shadowBlur = 0;
  }
}
function tryTalk() {
  if (nearNpcId && ws && ws.readyState === 1) { ws.send(JSON.stringify({ t: 'talk', npcId: nearNpcId })); return true; }
  return false;
}
function renderQuests() {
  document.getElementById('quest-tracker').style.display = questList.length ? 'block' : 'none';
  document.getElementById('qt-list').innerHTML = questList.map(q =>
    `<div class="qt"><b>• ${esc(q.name)}</b><br><span class="qp">${q.prog}/${q.count} ${esc(q.target)}</span></div>`).join('');
}
function openDialog(npc, quests) {
  dlgNpcId = npc.id;
  document.getElementById('dlg-name').textContent = '💬 ' + npc.name;
  document.getElementById('dlg-title').textContent = npc.title;
  document.getElementById('dlg-text').textContent = npc.text;
  const box = document.getElementById('dlg-quests');
  if (!quests.length) box.innerHTML = '<p class="hint">NPC này hiện không có nhiệm vụ nào.</p>';
  else box.innerHTML = quests.map(q => {
    let ctrl = '';
    if (q.state === 'available') ctrl = `<button data-q="accept" data-id="${q.id}">Nhận nhiệm vụ</button>`;
    else if (q.state === 'ready') ctrl = `<button data-q="done" data-id="${q.id}">Trả nhiệm vụ ✓</button>`;
    else if (q.state === 'active') ctrl = `<div class="qd">Đang làm: ${q.prog}/${q.count} ${esc(q.target)}</div>`;
    else if (q.state === 'done') ctrl = `<div class="qd">Đã hoàn thành ✓</div>`;
    else ctrl = `<div class="qd">Chưa đủ điều kiện mở</div>`;
    const rw = q.rewards.item ? ' + trang bị đặc biệt' : '';
    return `<div class="qrow"><b style="color:#c9a6ff">${esc(q.name)}</b><div class="qd">${esc(q.desc)}</div><div class="qd">Thưởng: +${q.rewards.xp} tu vi · +${q.rewards.gold} linh thạch${rw}</div>${ctrl}</div>`;
  }).join('');
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    ws.send(JSON.stringify({ t: b.dataset.q === 'accept' ? 'questAccept' : 'questDone', questId: b.dataset.id }));
    setTimeout(() => { if (ws && ws.readyState === 1 && dlgNpcId) ws.send(JSON.stringify({ t: 'talk', npcId: dlgNpcId })); }, 450);
  }));
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('open'));
  document.getElementById('panel-dialog').classList.add('open');
}
document.getElementById('story-btn').addEventListener('click', () => document.getElementById('story-modal').classList.remove('open'));

/* ---------------- Panels: tui do / nhan vat / shop / BXH ---------------- */
function togglePanel(id) {
  const p = document.getElementById('panel-' + id);
  const was = p.classList.contains('open');
  document.querySelectorAll('.panel').forEach(x => x.classList.remove('open'));
  if (!was) { p.classList.add('open'); if (id === 'rank' && ws) ws.send(JSON.stringify({ t: 'rank' })); }
}
document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => togglePanel(b.dataset.panel)));
document.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', () => x.closest('.panel').classList.remove('open')));
function itemStat(it) { return it.slot === 'weapon' ? 'Công +' + it.atk : 'Máu +' + it.hp; }
function renderInv() {
  const g = document.getElementById('inv-grid');
  g.innerHTML = myInv.length ? '' : '<p style="grid-column:1/-1;color:#8f7bb8;font-size:13px">Túi trống — đi đánh quái để rớt đồ!</p>';
  for (const it of myInv) {
    const d = document.createElement('div');
    d.className = 'inv-item'; d.style.borderColor = it.col;
    d.title = `${it.name}\n[${it.rarity}] ${itemStat(it)}\nYêu cầu Lv${it.reqLvl}\nBán: ${it.value} linh thạch`;
    d.innerHTML = `<b style="color:${it.col}">${esc(it.name)}</b><span>${itemStat(it)}</span><span style="color:#8f7bb8">Lv${it.reqLvl}</span><span class="sell" data-sell="${it.id}">Bán ${it.value}💰</span>`;
    d.addEventListener('click', (ev) => {
      if (ev.target.dataset.sell) { ws.send(JSON.stringify({ t: 'sell', itemId: ev.target.dataset.sell })); }
      else ws.send(JSON.stringify({ t: 'equip', itemId: it.id }));
    });
    g.appendChild(d);
  }
}
function renderChar() {
  const me = players[myId]; if (!me) return;
  let attrHtml = `<div style="margin:10px 0;padding:10px;border:1px solid #4a2f8f;border-radius:8px;background:rgba(0,0,0,.3)">
    <div><b style="color:#c9a6ff">✨ Thuộc tính</b> <span style="color:#ffd76a">(${myAttrPoints} điểm chưa dùng)</span></div>`;
  for (const k of ['luc', 'the', 'man', 'linh']) {
    const d = ATTR_DEFS[k] || { name: k, desc: '' };
    attrHtml += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:13px">
      <span>${d.name}: <b style="color:#fff">${myAttrs[k] || 0}</b> <small style="color:#8f7bb8">${d.desc}</small></span>
      <button data-attr="${k}" ${myAttrPoints > 0 ? '' : 'disabled'} style="padding:4px 14px;border-radius:6px;border:1px solid #6d3fd4;background:#2a1650;color:#fff;cursor:pointer;font-weight:bold">+</button></div>`;
  }
  attrHtml += `<div style="margin-top:8px;font-size:12px;color:#8f7bb8">Chí mạng: ${myCrit}% · Né tránh: ${myDodge}%</div></div>`;
  document.getElementById('char-stats').innerHTML =
    `<div>🗡️ Công kích: <b>${me.atk || '?'}</b> &nbsp; ❤️ Máu: <b>${me.maxHp}</b> &nbsp; 🔷 Linh lực: <b>${me.maxMana}</b></div>
     <div>💰 Linh thạch: <b>${me.gold}</b> &nbsp; 🧪 Hồi máu: <b>${me.potHp}</b> · Hồi linh: <b>${me.potMana}</b></div>` + attrHtml;
  document.querySelectorAll('[data-attr]').forEach(b => b.addEventListener('click', () => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'allocate', attr: b.dataset.attr }));
  }));
  const es = document.getElementById('equip-slots');
  es.innerHTML = '';
  for (const slot of ['weapon', 'armor']) {
    const it = myEquip[slot];
    const d = document.createElement('div');
    d.className = 'equip-slot';
    d.innerHTML = it
      ? `<b style="color:${it.col}">${slot === 'weapon' ? '🗡️' : '🛡️'} ${esc(it.name)}</b> <span style="color:#8f7bb8">[${it.rarity}] ${itemStat(it)}</span> <span style="color:#9d86c9">(bấm để tháo)</span>`
      : `<span style="color:#5a4a7a">${slot === 'weapon' ? '🗡️ Vũ khí: trống' : '🛡️ Giáp: trống'}</span>`;
    if (it) d.addEventListener('click', () => ws.send(JSON.stringify({ t: 'unequip', slot })));
    es.appendChild(d);
  }
}
function renderShop() {
  const box = document.getElementById('shop-items');
  box.innerHTML = '';
  for (const k of Object.keys(SHOP)) {
    const s = SHOP[k];
    const d = document.createElement('div');
    d.className = 'shop-row';
    d.innerHTML = `<span>${k === 'hppot' ? '🧪' : '🔷'} <b>${s.name}</b><br><small style="color:#8f7bb8">${s.desc}</small></span><button data-buy="${k}">Mua ${s.price}💰</button>`;
    d.querySelector('button').addEventListener('click', () => { ws.send(JSON.stringify({ t: 'buy', item: k })); sfx('buy'); });
    box.appendChild(d);
  }
}
function renderRank(list) {
  const medals = ['🥇', '🥈', '🥉'];
  document.getElementById('rank-list').innerHTML = list.map((r, i) =>
    `<div class="rank-row${players[myId] && r.name === players[myId].name ? ' me' : ''}"><span>${medals[i] || (i + 1) + '.'} ${esc(r.name)} ${r.online ? '🟢' : '⚫'}</span><b>Lv${r.level}</b></div>`
  ).join('') || '<p style="color:#8f7bb8">Chưa có dữ liệu</p>';
}

/* ---------------- Minimap ---------------- */
const mm = document.getElementById('minimap'), mmc = mm.getContext('2d');
function drawMinimap() {
  const W = 170, H = 113;
  mmc.clearRect(0, 0, W, H);
  mmc.fillStyle = 'rgba(12,6,28,.9)'; mmc.fillRect(0, 0, W, H);
  const sx = W / world.w, sy = H / world.h;
  for (const id in monsters) { const m = monsters[id]; mmc.fillStyle = m.maxHp > 500 ? '#ffd76a' : '#ff4d6a'; mmc.fillRect(m.x * sx - 1.5, m.y * sy - 1.5, 3, 3); }
  for (const id in players) {
    const p = players[id];
    mmc.fillStyle = +id === myId ? '#9be8ff' : '#b47bff';
    mmc.beginPath(); mmc.arc(p.x * sx, p.y * sy, 2.6, 0, 7); mmc.fill();
  }
}
function doAttack() {
  const me = players[myId];
  if (!me || !me.alive || !ws) return;
  ws.send(JSON.stringify({ t: 'attack', dir: aimAngle }));
}
function doSkill(id) {
  const me = players[myId];
  if (!me || !me.alive || !ws || !SKILLS[id]) return;
  const now = Date.now();
  if ((myCds[id] || 0) > now) return;
  if (me.mana < SKILLS[id].mana) { addChat(null, 'Không đủ linh lực!', true); return; }
  myCds[id] = now + SKILLS[id].cd * 1000;
  ws.send(JSON.stringify({ t: 'skill', id, dir: aimAngle }));
}
/* Touch */
const joy = document.getElementById('joy'), knob = document.getElementById('joy-knob');
let joyId = null, joyVec = { x: 0, y: 0 };
joy.addEventListener('touchstart', (e) => { joyId = e.changedTouches[0].identifier; e.preventDefault(); }, { passive: false });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) if (t.identifier === joyId) {
    const r = joy.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), max = 45;
    if (m > max) { dx *= max / m; dy *= max / m; }
    knob.style.left = (35 + dx) + 'px'; knob.style.top = (35 + dy) + 'px';
    joyVec = { x: dx / max, y: dy / max };
  }
}, { passive: true });
addEventListener('touchend', (e) => {
  for (const t of e.changedTouches) if (t.identifier === joyId) {
    joyId = null; joyVec = { x: 0, y: 0 };
    knob.style.left = '35px'; knob.style.top = '35px';
  }
});
document.getElementById('btn-atk').addEventListener('touchstart', (e) => { doAttack(); e.preventDefault(); }, { passive: false });

function onMapChange(mapId, x, y) {
  curMapId = mapId;
  const mp = MAPS[mapId] || { w: 1600, h: 1200, name: mapId, desc: '', levelReq: 1 };
  world = { w: mp.w, h: mp.h };
  const me = players[myId];
  if (me) { me.x = x; me.y = y; }
  cam.x = x; cam.y = y;
  monsters = {}; projectiles = []; effects = []; dmgNums = [];
  document.getElementById('panel-dialog').classList.remove('open');
  initWorldDeco();
  banner(mp.name.toUpperCase(), (mp.desc || '') + (mp.levelReq > 1 ? ' · Đề nghị Lv' + mp.levelReq : ''));
  addChat(null, `Đã đến <b>${esc(mp.name)}</b>`, true);
}
function tryPortal() { if (nearPortalIdx >= 0 && ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'portal', idx: nearPortalIdx })); }
function drawPortals(t) {
  const mp = MAPS[curMapId]; if (!mp || !mp.portals) return;
  ctx.textAlign = 'center';
  for (let i = 0; i < mp.portals.length; i++) {
    const pt = mp.portals[i];
    const pulse = .6 + .4 * Math.sin(t * 3 + i * 1.7);
    ctx.save(); ctx.translate(pt.x, pt.y - 60);
    ctx.strokeStyle = '#7db8ff'; ctx.lineWidth = 7; ctx.shadowColor = '#3f8cff'; ctx.shadowBlur = 22 * pulse;
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 56, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 42, 0, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#9be8ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText('➤ ' + pt.label, pt.x, pt.y - 135);
    ctx.shadowBlur = 0;
  }
}

/* ---------------- World deco ---------------- */
const THEMES = {
  village:  { top: '#1c1533', mid: '#0e0a1e', bot: '#070512', mtn: '#1c1238', star: '#cbb8ff', mote: '#ffd76a' },
  forest:   { top: '#0e1f16', mid: '#0a140e', bot: '#050805', mtn: '#12241a', star: '#b8ffc9', mote: '#7dff9b' },
  cave:     { top: '#101a2e', mid: '#0a1020', bot: '#05070f', mtn: '#16223a', star: '#b8d4ff', mote: '#7db8ff' },
  boneyard: { top: '#1e1626', mid: '#120d18', bot: '#080509', mtn: '#241a30', star: '#d4b8ff', mote: '#b47bff' },
  foxden:   { top: '#251228', mid: '#140a18', bot: '#080409', mtn: '#2e1633', star: '#ffb8e8', mote: '#ff7dc9' },
  volcano:  { top: '#2b0f0a', mid: '#160805', bot: '#080302', mtn: '#331410', star: '#ffc9b8', mote: '#ff8b5d' },
};
function curTheme() { return THEMES[(MAPS[curMapId] || {}).theme] || THEMES.village; }
function initWorldDeco() {
  stars = []; motes = []; decos = [];
  for (let i = 0; i < 260; i++) stars.push({ x: Math.random() * world.w, y: Math.random() * world.h, r: Math.random() * 1.6 + .4, tw: Math.random() * 6 });
  for (let i = 0; i < 70; i++) motes.push({ x: Math.random() * world.w, y: Math.random() * world.h, vx: (Math.random() - .5) * 12, vy: -Math.random() * 14 - 4, r: Math.random() * 2.5 + 1 });
  for (let i = 0; i < 40; i++) decos.push({ x: Math.random() * world.w, y: Math.random() * world.h, k: Math.random() < .5 ? 'crystal' : 'rune', s: Math.random() * 20 + 14, a: Math.random() * 6 });
}

/* ---------------- Hieu ung (donghua style) ---------------- */
function soulBurst(x, y, n) {
  for (let i = 0; i < n; i++) effects.push({ kind: 'wisp', x, y: y - 20, vx: (Math.random() - .5) * 90, vy: -Math.random() * 130 - 40, t: 0, dur: Math.random() * .9 + .5, r: Math.random() * 3 + 1.5, col: Math.random() < .5 ? '#b47bff' : '#7b5cff' });
}
function ring(x, y, col, maxR) { effects.push({ kind: 'ring', x, y, t: 0, dur: .6, col, maxR }); }
function levelPillar(x, y) { effects.push({ kind: 'pillar', x, y, t: 0, dur: 1.4 }); }
function lightningStorm(x, y) {
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 150;
    effects.push({ kind: 'bolt', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * .7, t: -i * 0.06, dur: 0.3 });
  }
  effects.push({ kind: 'flash', t: 0, dur: 0.18 });
}
function drawBolt(x, y, h) {
  ctx.strokeStyle = '#e8ccff'; ctx.lineWidth = 3; ctx.shadowColor = '#a64dff'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(x, y - h);
  let px = x, py = y - h;
  for (let i = 1; i <= 6; i++) { px += (Math.random() - .5) * 44; py = y - h + (h / 6) * i; ctx.lineTo(px, py); }
  ctx.stroke(); ctx.shadowBlur = 0;
}
function updateFx(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.t += dt;
    if (e.kind === 'wisp') { e.x += e.vx * dt; e.y += e.vy * dt; }
    if (e.t >= e.dur) effects.splice(i, 1);
  }
  for (let i = dmgNums.length - 1; i >= 0; i--) { const d = dmgNums[i]; d.t += dt; d.y -= 55 * dt; if (d.t > 1) dmgNums.splice(i, 1); }
  for (let i = floatTxts.length - 1; i >= 0; i--) { const f = floatTxts[i]; f.t += dt; f.y -= 30 * dt; if (f.t > 1.4) floatTxts.splice(i, 1); }
  for (const m of motes) { m.x += m.vx * dt; m.y += m.vy * dt; if (m.y < 0) { m.y = world.h; m.x = Math.random() * world.w; } }
}
function drawFx() {
  for (const e of effects) {
    const p = e.t / e.dur, a = 1 - p;
    if (e.kind === 'slash') {
      ctx.save(); ctx.translate(e.x, e.y - 40); ctx.rotate(e.dir);
      ctx.globalAlpha = a; ctx.strokeStyle = '#c9a6ff'; ctx.lineWidth = 10; ctx.shadowColor = '#8b4dff'; ctx.shadowBlur = 25;
      ctx.beginPath(); ctx.arc(0, 0, 60 + p * 40, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.arc(0, 0, 60 + p * 40, -1.1, 1.1); ctx.stroke();
      ctx.restore();
    } else if (e.kind === 'claw') {
      ctx.save(); ctx.translate(e.x, e.y - 30); ctx.rotate(e.dir); ctx.globalAlpha = a;
      ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 5; ctx.shadowColor = '#ff2f2f'; ctx.shadowBlur = 15;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(0, 0, 34 + p * 22, k * .5 - .4, k * .5 + .4); ctx.stroke(); }
      ctx.restore();
    } else if (e.kind === 'impact') {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.shadowColor = '#c9a6ff'; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(e.x, e.y - 30, 6 + p * 26, 0, 7); ctx.fill(); ctx.restore();
    } else if (e.kind === 'wisp') {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = e.col; ctx.shadowColor = e.col; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 7); ctx.fill(); ctx.restore();
    } else if (e.kind === 'ring') {
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = e.col; ctx.lineWidth = 5; ctx.shadowColor = e.col; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.maxR * p, e.maxR * p * .45, 0, 0, 7); ctx.stroke(); ctx.restore();
    } else if (e.kind === 'bolt' && e.t >= 0) {
      ctx.save(); ctx.globalAlpha = 1 - p; drawBolt(e.x, e.y, 420); ctx.restore();
    } else if (e.kind === 'flash') {
      ctx.save(); ctx.globalAlpha = a * .35; ctx.fillStyle = '#d9b8ff'; ctx.fillRect(cam.x - innerWidth / 2, cam.y - innerHeight / 2, innerWidth, innerHeight); ctx.restore();
    } else if (e.kind === 'pillar') {
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, e.y - 420, 0, e.y);
      g.addColorStop(0, 'rgba(200,150,255,0)'); g.addColorStop(1, 'rgba(200,150,255,.85)');
      ctx.fillStyle = g; ctx.shadowColor = '#a64dff'; ctx.shadowBlur = 40;
      ctx.fillRect(e.x - 34, e.y - 420, 68, 420); ctx.restore();
      if (Math.random() < .5) effects.push({ kind: 'wisp', x: e.x + (Math.random() - .5) * 90, y: e.y - 10, vx: 0, vy: -160, t: 0, dur: .8, r: 3, col: '#e3c9ff' });
    } else if (e.kind === 'bell') {
      ctx.save(); ctx.translate(e.x, e.y - 55); ctx.globalAlpha = Math.min(1, a * 2);
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 4; ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 25;
      ctx.beginPath(); ctx.arc(0, 0, 62, 0, 7); ctx.stroke();
      ctx.rotate(e.t * 2.4);
      ctx.font = '20px serif'; ctx.fillStyle = '#ffe9a8'; ctx.textAlign = 'center';
      const runes = ['卍', 'ॐ', '道', '法'];
      for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2; ctx.fillText(runes[k], Math.cos(an) * 62, Math.sin(an) * 62 + 7); }
      ctx.restore();
    } else if (e.kind === 'castflash') {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = e.col; ctx.shadowColor = e.col; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(e.x, e.y - 40, 20 + p * 50, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  ctx.textAlign = 'center';
  for (const d of dmgNums) {
    ctx.save(); ctx.globalAlpha = 1 - d.t * d.t;
    ctx.font = d.crit ? 'bold 30px sans-serif' : 'bold 20px sans-serif';
    ctx.fillStyle = d.col; ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText(d.txt, d.x, d.y); ctx.restore();
  }
  for (const f of floatTxts) {
    ctx.save(); ctx.globalAlpha = 1 - f.t / 1.4; ctx.font = '16px sans-serif';
    ctx.fillStyle = f.col; ctx.fillText(f.txt, f.x, f.y); ctx.restore();
  }
}

/* ---------------- Ve the gioi ---------------- */
function drawBackground(t) {
  const th = curTheme();
  const g = ctx.createLinearGradient(0, 0, 0, innerHeight);
  g.addColorStop(0, th.top); g.addColorStop(.6, th.mid); g.addColorStop(1, th.bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.save(); ctx.translate(-cam.x * .9, -cam.y * .9);
  for (const s of stars) {
    const tw = .4 + .6 * Math.abs(Math.sin(t * .8 + s.tw));
    ctx.globalAlpha = tw * .8; ctx.fillStyle = th.star;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.restore(); ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  // Nui xa
  ctx.fillStyle = th.mtn;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    const baseY = world.h * .25 + i * 60;
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= world.w; x += 200) ctx.lineTo(x, baseY - 60 - 80 * Math.abs(Math.sin(x * .01 + i * 2)));
    ctx.lineTo(world.w, baseY); ctx.closePath(); ctx.fill();
  }
  // Deco: tinh the / phu van
  for (const d of decos) {
    const pulse = .5 + .5 * Math.sin(t * 2 + d.a);
    if (d.k === 'crystal') {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(Math.sin(d.a) * .2);
      ctx.fillStyle = th.mote; ctx.globalAlpha = .25 + pulse * .3; ctx.shadowColor = th.mote; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(0, -d.s); ctx.lineTo(d.s * .5, 0); ctx.lineTo(0, d.s * .4); ctx.lineTo(-d.s * .5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha = .12 + pulse * .1; ctx.strokeStyle = th.mote; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.s, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(d.x, d.y, d.s * .6, 0, 7); ctx.stroke(); ctx.restore();
    }
  }
  // Linh khi bay
  for (const m of motes) {
    ctx.save(); ctx.globalAlpha = .5; ctx.fillStyle = th.mote; ctx.shadowColor = th.mote; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 7); ctx.fill(); ctx.restore();
  }
  // Vien the gioi
  ctx.strokeStyle = th.mote; ctx.lineWidth = 6; ctx.shadowColor = th.mote; ctx.shadowBlur = 25;
  ctx.strokeRect(0, 0, world.w, world.h); ctx.shadowBlur = 0;
  ctx.restore();
}
function hpBar(x, y, w, frac, col) {
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2, y, w, 7);
  ctx.fillStyle = col; ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, frac), 5);
}
function drawMonster(m, t) {
  const look = MON_LOOK[m.type]; if (!look) return;
  const frame = Math.floor(m.animT * 8) % 4;
  const alpha = 1;
  drawSheetFrame(look.sheet, look.row, frame, m.x, m.y, look.h, false, alpha);
  const boss = m.maxHp > 500;
  ctx.textAlign = 'center'; ctx.font = (boss ? 'bold 15px' : '12px') + ' sans-serif';
  ctx.fillStyle = boss ? '#ffd76a' : '#c9a6ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillText((boss ? '👹 ' : '') + (m._name || ''), m.x, m.y - look.h - 22);
  ctx.shadowBlur = 0;
  hpBar(m.x, m.y - look.h - 14, boss ? 110 : 64, m.hp / m.maxHp, '#ff4d6a');
}
function drawPlayer(p, t) {
  const isMe = p.id === myId;
  const d = dir4(p.dir);
  const H = 112;
  let alpha = p.alive ? 1 : .35;
  // Attack anim uu tien
  if (p.atkPlay >= 0 && p.atkPlay < 0.45) {
    const row = { down: 0, up: 1, left: 2, right: 3 }[d];
    const col = Math.min(2, Math.floor(p.atkPlay / 0.45 * 3));
    drawSheetFrame('attack', row, col, p.x, p.y, H * 1.15, false, alpha);
  } else {
    const flip = d === 'left';
    const row = d === 'down' ? 0 : d === 'up' ? 1 : 2;
    const col = p.moving ? Math.floor(p.animT * 8) % 4 : 1;
    // Do nay nhe khi buoc
    const bob = p.moving ? Math.abs(Math.sin(p.animT * 8 * Math.PI)) * -5 : 0;
    ctx.save(); ctx.translate(0, bob);
    drawSheetFrame('walk', row, col, p.x, p.y, H, flip, alpha);
    ctx.restore();
  }
  if (p.shield > 0) {
    ctx.save(); ctx.globalAlpha = .8; ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3; ctx.shadowColor = '#ffb300'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(p.x, p.y - 55, 62, 0, 7); ctx.stroke(); ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = isMe ? '#9be8ff' : '#e8ddff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
  ctx.fillText(p.name + ' · Lv' + p.level, p.x, p.y - H - 24);
  ctx.shadowBlur = 0;
  hpBar(p.x, p.y - H - 16, 74, p.hp / p.maxHp, isMe ? '#5dff8a' : '#ff4d6a');
}
function drawProjectile(pr) {
  ctx.save(); ctx.translate(pr.x, pr.y - 40); ctx.rotate(pr.dir);
  ctx.globalAlpha = .95; ctx.shadowColor = '#b47bff'; ctx.shadowBlur = 25;
  ctx.strokeStyle = '#d9b8ff'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(0, 0, 34, -.9, .9); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(0, 0, 34, -.9, .9); ctx.stroke();
  ctx.restore();
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  const me = players[myId]; if (!me) return;
  setBar('hpbar', me.hp / me.maxHp, `${Math.max(0, Math.round(me.hp))} / ${me.maxHp}`);
  setBar('manabar', me.mana / me.maxMana, `${Math.round(me.mana)} / ${me.maxMana}`);
  setBar('xpbar', me.xp / me.xpNeed, `Tu vi ${Math.round(me.xp)} / ${me.xpNeed}`);
  document.getElementById('lvl-badge').textContent = `Lv ${me.level} · Công ${me.atk}`;
  document.getElementById('gold-n').textContent = me.gold;
  document.getElementById('pot-hp-n').textContent = me.potHp;
  document.getElementById('pot-mana-n').textContent = me.potMana;
  const now = Date.now();
  document.querySelectorAll('.skill').forEach(el => {
    const id = +el.dataset.skill, cdEl = el.querySelector('.cd');
    const left = (myCds[id] || 0) - now;
    if (left > 0) { el.classList.add('cooling'); cdEl.textContent = (left / 1000).toFixed(1); }
    else el.classList.remove('cooling');
  });
}
function setBar(id, frac, txt) {
  const b = document.getElementById(id);
  b.querySelector('.fill').style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
  b.querySelector('span').textContent = txt;
}

/* ---------------- Game loop ---------------- */
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  const t = now / 1000;
  const me = players[myId];

  // Input -> di chuyen
  if (me && me.alive && ws && ws.readyState === 1) {
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    dx += joyVec.x; dy += joyVec.y;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    // Aim = huong chuot (twin-stick), mac dinh theo huong di
    const wx = cam.x + (mouse.x - innerWidth / 2), wy = cam.y + (mouse.y - innerHeight / 2);
    if (Math.hypot(mouse.x - innerWidth / 2, mouse.y - innerHeight / 2) > 40) aimAngle = Math.atan2(wy - me.y, wx - me.x);
    else if (m > .1) aimAngle = Math.atan2(dy, dx);
    const SPEED = 250;
    me.x += dx * SPEED * dt; me.y += dy * SPEED * dt;
    me.x = Math.max(20, Math.min(world.w - 20, me.x));
    me.y = Math.max(20, Math.min(world.h - 20, me.y));
    me.moving = m > .1; me.dir = aimAngle;
    if (me.moving) me.animT += dt;
    if (now - lastMoveSent > 90) {
      lastMoveSent = now;
      ws.send(JSON.stringify({ t: 'move', x: Math.round(me.x), y: Math.round(me.y), dir: +aimAngle.toFixed(2), moving: me.moving }));
    }
    cam.x += (me.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (me.y - cam.y) * Math.min(1, dt * 6);
  } else if (me) { cam.x += (me.x - cam.x) * Math.min(1, dt * 6); cam.y += (me.y - cam.y) * Math.min(1, dt * 6); }

  // Tien trien attack anim local
  for (const id in players) { const p = players[id]; if (p.atkPlay >= 0) p.atkPlay += dt; }

  updateFx(dt);
  shake = Math.max(0, shake - dt * 30);
  const shx = (Math.random() - .5) * shake, shy = (Math.random() - .5) * shake;

  drawBackground(t);
  ctx.save(); ctx.translate(-cam.x + innerWidth / 2 + shx, -cam.y + innerHeight / 2 + shy);
  drawPortals(t);
  // Phat hien cong gan nhat
  nearPortalIdx = -1;
  const mpNow = MAPS[curMapId];
  if (mpNow && mpNow.portals && me && me.alive) {
    let bd = 115;
    for (let i = 0; i < mpNow.portals.length; i++) {
      const d = Math.hypot(mpNow.portals[i].x - me.x, mpNow.portals[i].y - me.y);
      if (d < bd) { bd = d; nearPortalIdx = i; }
    }
    if (nearPortalIdx >= 0) {
      ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#9be8ff'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText('Nhấn F để qua: ' + mpNow.portals[nearPortalIdx].label, me.x, me.y - 145);
      ctx.shadowBlur = 0;
    }
  }
  // NPCs cua map hien tai
  nearNpcId = null;
  if (me && me.alive) {
    let bd = 150;
    for (const n of NPCS) {
      if (n.mapId !== curMapId) continue;
      drawNPC(n, t);
      const d = Math.hypot(n.x - me.x, n.y - me.y);
      if (d < bd) { bd = d; nearNpcId = n.id; }
    }
    if (nearNpcId) {
      const n = NPCS.find(x => x.id === nearNpcId);
      ctx.textAlign = 'center'; ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#ffd76a'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText('Nhấn E để trò chuyện với ' + n.name, me.x, me.y - 168);
      ctx.shadowBlur = 0;
    }
  }
  // Vung canh bao AoE cua boss
  const nowMs = Date.now();
  bossWarns = bossWarns.filter(w => w.until > nowMs);
  for (const w of bossWarns) {
    const left = Math.max(0, (w.until - nowMs)) / 1300;
    const pulse = .5 + .5 * Math.sin(t * 12);
    ctx.save();
    ctx.globalAlpha = .22 + pulse * .2;
    ctx.fillStyle = '#ff2e2e';
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.fill();
    ctx.globalAlpha = .9;
    ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 4; ctx.setLineDash([14, 10]);
    ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(w.x, w.y, Math.max(6, w.r * left), 0, 7); ctx.stroke();
    ctx.restore();
  }
  const view = { x0: cam.x - innerWidth / 2 - 200, x1: cam.x + innerWidth / 2 + 200, y0: cam.y - innerHeight / 2 - 200, y1: cam.y + innerHeight / 2 + 200 };
  for (const id in monsters) { const m = monsters[id]; if (m.x > view.x0 && m.x < view.x1 && m.y > view.y0 && m.y < view.y1) drawMonster(m, t); }
  const order = Object.values(players).sort((a, b) => a.y - b.y);
  for (const p of order) drawPlayer(p, t);
  for (const pr of projectiles) drawProjectile(pr);
  drawFx();
  ctx.restore();

  drawMinimap();
  // Vignette
  const vg = ctx.createRadialGradient(innerWidth / 2, innerHeight / 2, innerHeight * .35, innerWidth / 2, innerHeight / 2, innerHeight * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,2,15,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, innerWidth, innerHeight);
  requestAnimationFrame(loop);
}

/* ---------------- Khoi dong ---------------- */
loadSheets().then(() => {
  // Gan ten quai cho client hien thi
  const NAMES = { wolf: 'Sói Bóng Đêm', demon: 'Ác Ma Sừng', skeleton: 'Chiến Binh Xương Khô', fox: 'Hồ Ly Chín Đuôi', golem: 'Golem Dung Nham' };
  const _drawMonster = drawMonster;
  drawMonster = function (m, t) { m._name = NAMES[m.type] || m.type; _drawMonster(m, t); };
  requestAnimationFrame(loop);
});
