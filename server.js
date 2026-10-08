'use strict';
/* ============================================================
 * TU TIEN ONLINE - Game server (Node.js + WebSocket)
 * MMO: nhieu ban do, cong dich chuyen, thuoc tinh nhan vat,
 *   AI quai, combat, ky nang, chat, rot do + trang bi,
 *   cua hang, vang, dan duoc, luu nhan vat, BXH
 * Chay: npm install && npm start  (PORT mac dinh 3000)
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'players.json');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server: httpServer });

/* ---------------- Ban do ---------------- */
const MAPS = {
  'tan-thu-thon': { name: 'Tân Thủ Thôn', desc: 'Làng tân thủ yên bình', levelReq: 1, w: 1600, h: 1200, theme: 'village',
    portals: [{ x: 1500, y: 600, to: 'rung-soi', tox: 120, toy: 700, label: 'Rừng Sói Bóng Đêm' }] },
  'rung-soi': { name: 'Rừng Sói Bóng Đêm', desc: 'Rừng tăm tối đầy sói hoang', levelReq: 1, w: 2400, h: 1600, theme: 'forest',
    spawns: [['wolf', 500, 400, 6, 250], ['wolf', 1800, 1100, 6, 250]],
    portals: [
      { x: 60, y: 800, to: 'tan-thu-thon', tox: 1440, toy: 600, label: 'Tân Thủ Thôn' },
      { x: 2320, y: 350, to: 'hang-ac-ma', tox: 120, toy: 700, label: 'Hang Ác Ma Sừng' },
    ] },
  'hang-ac-ma': { name: 'Hang Ác Ma Sừng', desc: 'Hang động của ác ma', levelReq: 8, w: 2400, h: 1600, theme: 'cave',
    spawns: [['demon', 500, 500, 5, 260], ['demon', 1800, 1000, 5, 260], ['wolf', 1200, 1300, 3, 200]],
    portals: [
      { x: 60, y: 700, to: 'rung-soi', tox: 2260, toy: 350, label: 'Rừng Sói Bóng Đêm' },
      { x: 2320, y: 1200, to: 'chien-truong-xuong', tox: 120, toy: 800, label: 'Chiến Trường Xương Khô' },
    ] },
  'chien-truong-xuong': { name: 'Chiến Trường Xương Khô', desc: 'Chiến trường cổ đầy xương trắng', levelReq: 18, w: 2600, h: 1700, theme: 'boneyard',
    spawns: [['skeleton', 600, 500, 5, 260], ['skeleton', 1900, 1100, 5, 260], ['demon', 1300, 1400, 3, 200]],
    portals: [
      { x: 60, y: 800, to: 'hang-ac-ma', tox: 2260, toy: 1200, label: 'Hang Ác Ma Sừng' },
      { x: 2520, y: 400, to: 'dong-cuu-vi', tox: 120, toy: 800, label: 'Động Cửu Vĩ' },
    ] },
  'dong-cuu-vi': { name: 'Động Cửu Vĩ', desc: 'Sào huyệt của Hồ Ly Chín Đuôi', levelReq: 30, w: 2200, h: 1500, theme: 'foxden', boss: 'Hồ Ly Chín Đuôi',
    spawns: [['demon', 500, 400, 4, 220], ['skeleton', 1500, 1000, 4, 220], ['fox', 1850, 400, 1, 80]],
    portals: [
      { x: 60, y: 800, to: 'chien-truong-xuong', tox: 2460, toy: 400, label: 'Chiến Trường Xương Khô' },
      { x: 2120, y: 1320, to: 'nui-golem', tox: 120, toy: 700, label: 'Núi Golem Dung Nham' },
    ] },
  'nui-golem': { name: 'Núi Golem Dung Nham', desc: 'Núi lửa của Golem cổ đại', levelReq: 45, w: 2200, h: 1500, theme: 'volcano', boss: 'Golem Dung Nham',
    spawns: [['skeleton', 500, 500, 4, 220], ['golem', 1650, 700, 1, 80]],
    portals: [{ x: 60, y: 700, to: 'dong-cuu-vi', tox: 2060, toy: 1320, label: 'Động Cửu Vĩ' }] },
};
const START_MAP = 'tan-thu-thon';

/* ---------------- Cau hinh ---------------- */
const TICK_MS = 50;
const BROADCAST_EVERY = 2;
const PLAYER_SPEED = 250;
const MAX_PLAYERS = 60;
const INV_MAX = 40;

const MONSTER_TYPES = {
  wolf:     { name: 'Sói Bóng Đêm',     hp: 60,   atk: 8,  xp: 20,   gold: 7,   speed: 80, tier: 1, scale: 0.55, sheet: 'monsters-1', row: 0 },
  demon:    { name: 'Ác Ma Sừng',        hp: 150,  atk: 16, xp: 45,   gold: 15,  speed: 65, tier: 2, scale: 0.65, sheet: 'monsters-1', row: 1 },
  skeleton: { name: 'Chiến Binh Xương',  hp: 260,  atk: 26, xp: 85,   gold: 28,  speed: 60, tier: 3, scale: 0.65, sheet: 'monsters-1', row: 2 },
  fox:      { name: 'Hồ Ly Chín Đuôi',   hp: 1500, atk: 60, xp: 600,  gold: 230, speed: 70, tier: 4, scale: 1.0,  sheet: 'monsters-2', row: 0, boss: true },
  golem:    { name: 'Golem Dung Nham',   hp: 2400, atk: 85, xp: 1000, gold: 400, speed: 45, tier: 5, scale: 1.1,  sheet: 'monsters-2', row: 1, boss: true },
};
const SKILLS = {
  1: { name: 'Kiếm Khí',  mana: 15, cd: 1.2 },
  2: { name: 'Lôi Kích',  mana: 30, cd: 6 },
  3: { name: 'Kim Chung', mana: 25, cd: 14 },
};
const SHOP = {
  hppot:  { name: 'Hồi Huyết Đan', price: 25, desc: 'Hồi 60% máu' },
  manapot:{ name: 'Hồi Linh Đan',  price: 20, desc: 'Hồi 60% linh lực' },
};
const RARITIES = [
  { name: 'Thường',     col: '#c9c9c9', mult: 1,   w: 58 },
  { name: 'Hiếm',       col: '#4da6ff', mult: 1.4, w: 26 },
  { name: 'Sử Thi',     col: '#c26bff', mult: 1.9, w: 11 },
  { name: 'Huyền Thoại',col: '#ffb02e', mult: 2.6, w: 5 },
];
const WEAPON_NAMES = ['Kiếm Gỗ Đào', 'Kiếm Hắc Thiết', 'Kiếm Tử Vân', 'Ma Diệm Kiếm', 'Thiên Lôi Kiếm'];
const ARMOR_NAMES = ['Đạo Bào Vải', 'Giáp Da Yêu Thú', 'Tử Vân Bảo Giáp', 'Thiên Ma Chiến Giáp', 'Huyền Vũ Thần Giáp'];
const ATTR_DEFS = {
  luc:  { name: 'Lực',  desc: '+3 công / điểm' },
  the:  { name: 'Thể',  desc: '+14 máu / điểm' },
  man:  { name: 'Mẫn',  desc: '+0.8% chí mạng, +0.6% né / điểm' },
  linh: { name: 'Linh',  desc: '+10 linh lực, +3% sát thương skill / điểm' },
};

/* ---------------- Cot truyen ---------------- */
const STORY_INTRO = `Ngàn năm trước, Ma Đế phá vỡ phong ấn, ma khí tràn ngập Cửu Châu. Các tông môn chính đạo lần lượt sụp đổ, tu sĩ chết như ngả rạ.

Ngươi — một thiếu niên mang Hắc Ám Linh Căn vạn người có một — được Trưởng Làng Lâm cứu mang về Tân Thủ Thôn trong đêm ma khí cuộn trào.

Nay ma khí lại trỗi dậy. Yêu thú hoành hành khắp nơi, từ Rừng Sói đến tận Núi Golem Dung Nham. Các trưởng lão nói: chỉ có người mang Hắc Ám Linh Căn mới có thể tu luyện Ma Diệm Quyết, đột phá cảnh giới, tiêu diệt yêu ma và phong ấn Ma Đế một lần nữa.

Hãy cầm kiếm lên. Con đường tu tiên của ngươi... bắt đầu từ đây!`;

const NPCS = {
  elder:     { id: 'elder',     mapId: 'tan-thu-thon', x: 700, y: 500, name: 'Trưởng Làng Lâm',      title: 'Trưởng làng',
    text: 'Ma khí ngày càng dày đặc... Sói Bóng Đêm từ trong rừng tràn ra quấy phá dân làng. Thiếu hiệp mang Hắc Ám Linh Căn, xin hãy giúp lão!', quests: ['q1'] },
  herbalist: { id: 'herbalist', mapId: 'tan-thu-thon', x: 950, y: 700, name: 'Dược Sư Mạc',           title: 'Dược sư',
    text: 'Ta cần yêu đan để luyện thuốc cứu người. Ngươi hạ yêu thú mang yêu đan về, ta trả công xứng đáng. Việc này có thể làm nhiều lần!', quests: ['qd'] },
  swordsman: { id: 'swordsman', mapId: 'rung-soi', x: 300, y: 900, name: 'Kiếm Khách Trọng Thương', title: 'Tán tu',
    text: 'Khụ... khụ... Ta bị Ác Ma Sừng trong hang đánh trọng thương. Bọn chúng ngày càng hung hãn. Thiếu hiệp, hãy thay ta tiến vào hang sâu!', quests: ['q2'] },
  guard:     { id: 'guard',     mapId: 'hang-ac-ma', x: 300, y: 800, name: 'Thủ Vệ Thiết Ngưu',      title: 'Thủ vệ',
    text: 'Phía trước là Chiến Trường Xương Khô — nơi vạn quân vong trận hóa thành yêu cốt. Không đủ thực lực thì đừng tiến vào!', quests: ['q3'] },
  general:   { id: 'general',   mapId: 'chien-truong-xuong', x: 400, y: 900, name: 'Tướng Quân Tần',  title: 'Tướng quân',
    text: 'Ta từng là đại tướng trấn thủ biên cương, nay chỉ còn là tàn hồn. Hồ Ly Chín Đuôi trong động sâu là tâm phúc của Ma Đế — hãy thay ta trừ khử nó!', quests: ['q4'] },
  hermit:    { id: 'hermit',    mapId: 'dong-cuu-vi', x: 400, y: 900, name: 'Ẩn Sĩ Vô Danh',          title: 'Ẩn sĩ',
    text: 'Golem Dung Nham trên núi là mảnh vỡ của Ma Đế năm xưa. Hạ được nó, ngươi sẽ tiến gần hơn đến ngày quyết chiến cuối cùng...', quests: ['q5'] },
};
const QUESTS = {
  q1: { name: 'Sói Hoang Quấy Phá',      type: 'kill', target: 'wolf',     targetName: 'Sói Bóng Đêm',     count: 8,  levelReq: 1,  rewards: { xp: 200,  gold: 80 },   desc: 'Hạ 8 Sói Bóng Đêm quanh Rừng Sói.' },
  q2: { name: 'Hang Động Tăm Tối',       type: 'kill', target: 'demon',    targetName: 'Ác Ma Sừng',        count: 10, req: 'q1', levelReq: 8,  rewards: { xp: 600,  gold: 180 },  desc: 'Tiêu diệt 10 Ác Ma Sừng trong hang sâu.' },
  q3: { name: 'Xương Trắng Chiến Trường', type: 'kill', target: 'skeleton', targetName: 'Chiến Binh Xương', count: 12, req: 'q2', levelReq: 18, rewards: { xp: 1500, gold: 350 },  desc: 'Đánh bại 12 Chiến Binh Xương Khô.' },
  q4: { name: 'Cửu Vĩ Yêu Hồ',            type: 'kill', target: 'fox',      targetName: 'Hồ Ly Chín Đuôi',   count: 1,  req: 'q3', levelReq: 30, rewards: { xp: 4000, gold: 900, item: { slot: 'weapon', tier: 4 } }, desc: 'Hạ gục Hồ Ly Chín Đuôi trong Động Cửu Vĩ.' },
  q5: { name: 'Golem Cổ Đại',             type: 'kill', target: 'golem',    targetName: 'Golem Dung Nham',   count: 1,  req: 'q4', levelReq: 45, rewards: { xp: 8000, gold: 1800, item: { slot: 'armor', tier: 5 } }, desc: 'Tiêu diệt Golem Dung Nham trên núi lửa.' },
  qd: { name: 'Thợ Săn Yêu Thú',          type: 'killany', targetName: 'quái bất kỳ', count: 15, levelReq: 5, repeat: true, rewards: { xp: 800, gold: 250 }, desc: 'Hạ 15 quái bất kỳ. Có thể làm lại nhiều lần.' },
};
function questState(p, qid) {
  const q = QUESTS[qid];
  if (!q) return 'none';
  if (p.quests.done.includes(qid) && !q.repeat) return 'done';
  if (p.quests.active[qid] !== undefined) return p.quests.active[qid] >= q.count ? 'ready' : 'active';
  if (q.req && !p.quests.done.includes(q.req)) return 'locked';
  if ((q.levelReq || 1) > p.level) return 'locked';
  return 'available';
}
function sendQuests(p) {
  const list = Object.keys(p.quests.active).map(qid => ({ id: qid, name: QUESTS[qid].name, prog: Math.min(p.quests.active[qid], QUESTS[qid].count), count: QUESTS[qid].count, target: QUESTS[qid].targetName }));
  const givers = [];
  for (const nid in NPCS) {
    for (const qid of NPCS[nid].quests) {
      const st = questState(p, qid);
      if (st === 'available' || st === 'ready') { givers.push(nid); break; }
    }
  }
  sendTo(p.id, { t: 'quests', list, givers });
}

/* ---------------- Luu tru ---------------- */
let db = {};
function loadDB() { try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = {}; } }
function saveDB() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); }
  catch (e) { console.error('[db] save fail:', e.message); }
}
function persistPlayer(p) {
  db[p.name] = { level: p.level, xp: p.xp, gold: p.gold, inv: p.inv, equip: p.equip, potions: p.potions, mapId: p.mapId, x: Math.round(p.x), y: Math.round(p.y), attrs: p.attrs, attrPoints: p.attrPoints, quests: p.quests };
}

/* ---------------- Trang bi ---------------- */
let itemSeq = 1;
function pickRarity(luck) {
  let r = Math.random() * 100 - (luck || 0), acc = 0;
  for (const ra of RARITIES) { acc += ra.w; if (r < acc) return ra; }
  return RARITIES[0];
}
function genItem(slot, tier, luck) {
  const ra = pickRarity(luck);
  const names = slot === 'weapon' ? WEAPON_NAMES : ARMOR_NAMES;
  const nm = names[Math.min(names.length - 1, Math.max(0, tier - 1))];
  const v = () => 0.9 + Math.random() * 0.2;
  const it = { id: 'it' + (itemSeq++) + Date.now().toString(36), slot, name: nm, rarity: ra.name, col: ra.col,
    reqLvl: Math.max(1, tier * 2 - 1), value: Math.round((8 + tier * 7) * ra.mult) };
  if (slot === 'weapon') it.atk = Math.round((8 + tier * 8) * ra.mult * v());
  else it.hp = Math.round((35 + tier * 30) * ra.mult * v());
  return it;
}
function itemLabel(it) {
  const stat = it.slot === 'weapon' ? `Công +${it.atk}` : `Máu +${it.hp}`;
  return `${it.name} [${it.rarity}] · ${stat} · YC Lv${it.reqLvl}`;
}

/* ---------------- State ---------------- */
let nextId = 1;
const players = new Map();
const monsters = [];
const projectiles = [];
let events = [];
let monsterSeq = 1, projSeq = 1;
const pendingBlasts = [];

const xpNeed = (l) => Math.floor(80 * Math.pow(l, 1.6));
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cleanName = (s) => String(s || '').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'Vô Danh';
function emit(mapId, e) { e.map = mapId; events.push(e); }

function recalc(p) {
  const a = p.attrs;
  p.atk = Math.round(24 + a.luc * 3 + (p.level - 1) * 5 + (p.equip.weapon ? p.equip.weapon.atk : 0));
  const oldMax = p.maxHp;
  p.maxHp = Math.round(220 + a.the * 14 + (p.level - 1) * 30 + (p.equip.armor ? p.equip.armor.hp : 0));
  if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
  p.hp = Math.min(p.hp, p.maxHp);
  p.maxMana = Math.round(100 + a.linh * 10 + (p.level - 1) * 10);
  p.crit = 5 + a.man * 0.8;
  p.dodge = Math.min(30, a.man * 0.6);
  p.skillMult = 1 + a.linh * 0.03;
}
function createPlayer(id, name) {
  const p = { id, name, mapId: START_MAP, x: 800, y: 600, dir: 0, moving: false,
    hp: 220, maxHp: 220, mana: 100, maxMana: 100, level: 1, xp: 0, atk: 24,
    crit: 5, dodge: 0, skillMult: 1, gold: 50,
    attrs: { luc: 0, the: 0, man: 0, linh: 0 }, attrPoints: 5,
    inv: [], equip: { weapon: null, armor: null }, potions: { hp: 3, mana: 2 }, potCd: 0,
    shield: 0, shieldT: 0, alive: true, respawnAt: 0,
    lastX: 800, lastY: 600, lastMoveT: Date.now(), cds: {}, lastChat: 0, atkAnimT: 0, ws: null,
    quests: { active: {}, done: [] } };
  const s = db[name];
  if (s) {
    p.level = s.level || 1; p.xp = s.xp || 0; p.gold = s.gold || 0;
    p.inv = s.inv || []; p.equip = s.equip || { weapon: null, armor: null };
    p.potions = s.potions || { hp: 0, mana: 0 };
    p.mapId = (s.mapId && MAPS[s.mapId]) ? s.mapId : START_MAP;
    p.attrs = s.attrs || { luc: 0, the: 0, man: 0, linh: 0 };
    p.attrPoints = s.attrPoints || 0;
    p.quests = s.quests || { active: {}, done: [] };
    const mp = MAPS[p.mapId];
    p.x = clamp(s.x || 800, 0, mp.w); p.y = clamp(s.y || 600, 0, mp.h);
    p.lastX = p.x; p.lastY = p.y;
  }
  recalc(p); p.hp = p.maxHp; p.mana = p.maxMana;
  return p;
}
function sendInv(p) { sendTo(p.id, { t: 'inv', inv: p.inv, equip: p.equip, gold: p.gold, potions: p.potions }); }
function sendAttrs(p) { sendTo(p.id, { t: 'attrs', attrs: p.attrs, points: p.attrPoints, crit: +p.crit.toFixed(1), dodge: +p.dodge.toFixed(1) }); }
function gainXp(p, amount) {
  p.xp += amount;
  let need = xpNeed(p.level), up = false;
  while (p.xp >= need) { p.xp -= need; p.level++; p.attrPoints += 5; need = xpNeed(p.level); up = true; }
  if (up) {
    recalc(p); p.hp = p.maxHp; p.mana = p.maxMana; sendAttrs(p);
    emit(p.mapId, { k: 'lvl', id: p.id, level: p.level, x: p.x, y: p.y });
  }
}
function damagePlayer(p, dmg) {
  if (!p.alive) return;
  if (Math.random() * 100 < p.dodge) { emit(p.mapId, { k: 'miss', id: p.id, x: p.x, y: p.y - 40 }); return; }
  let left = dmg;
  if (p.shield > 0) { const ab = Math.min(p.shield, left); p.shield -= ab; left -= ab; }
  p.hp -= left;
  emit(p.mapId, { k: 'dmg', target: 'p', id: p.id, x: p.x, y: p.y - 40, amount: Math.round(left) });
  if (p.hp <= 0) {
    p.hp = 0; p.alive = false; p.respawnAt = Date.now() + 5000; p.shield = 0;
    emit(p.mapId, { k: 'die', target: 'p', id: p.id, name: p.name, x: p.x, y: p.y });
  }
}
function damageMonster(m, dmg, ownerId, crit) {
  if (m.dead) return;
  m.hp -= dmg;
  emit(m.mapId, { k: 'dmg', target: 'm', id: m.id, x: m.x, y: m.y - 50, amount: Math.round(dmg), crit: !!crit });
  if (m.hp <= 0) {
    m.dead = true;
    const t = MONSTER_TYPES[m.type];
    m.respawnAt = Date.now() + (t.boss ? 60000 : 15000);
    emit(m.mapId, { k: 'die', target: 'm', id: m.id, name: t.name, x: m.x, y: m.y, boss: !!t.boss });
    const owner = players.get(ownerId);
    if (owner && owner.alive && owner.mapId === m.mapId) {
      gainXp(owner, t.xp);
      // Tien trinh nhiem vu
      for (const qid in owner.quests.active) {
        const q = QUESTS[qid];
        if (!q) continue;
        if ((q.type === 'kill' && q.target === m.type) || q.type === 'killany') {
          owner.quests.active[qid]++;
          if (owner.quests.active[qid] >= q.count) sendTo(ownerId, { t: 'notice', msg: `Nhiệm vụ "${q.name}" đã xong — hãy trả nhiệm vụ!` });
          sendQuests(owner);
        }
      }
      const gold = Math.round(t.gold * rand(0.7, 1.3));
      owner.gold += gold;
      const chance = t.boss ? 1 : 0.3;
      if (Math.random() < chance && owner.inv.length < INV_MAX) {
        const item = genItem(Math.random() < 0.5 ? 'weapon' : 'armor', t.tier, t.boss ? 18 : 0);
        owner.inv.push(item);
        emit(m.mapId, { k: 'itemdrop', id: ownerId, label: itemLabel(item), col: item.col, x: owner.x, y: owner.y - 90 });
      }
      sendInv(owner);
      emit(m.mapId, { k: 'loot', id: ownerId, xp: t.xp, gold, x: m.x, y: m.y });
    }
  }
}

/* ---------------- Hanh dong ---------------- */
function doAttack(p) {
  if (!p.alive) return;
  p.atkAnimT = Date.now();
  const range = 95, arc = Math.PI / 1.4;
  let hitAny = false;
  for (const m of monsters) {
    if (m.dead || m.mapId !== p.mapId) continue;
    if (dist(p.x, p.y, m.x, m.y) > range + 30) continue;
    let da = Math.atan2(m.y - p.y, m.x - p.x) - p.dir;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > arc / 2) continue;
    const crit = Math.random() * 100 < p.crit;
    damageMonster(m, p.atk * rand(0.85, 1.15) * (crit ? 1.8 : 1), p.id, crit);
    hitAny = true;
  }
  emit(p.mapId, { k: 'atkfx', id: p.id, x: p.x, y: p.y, dir: p.dir, hit: hitAny });
}
function doSkill(p, skillId) {
  if (!p.alive) return;
  const s = SKILLS[skillId];
  if (!s) return;
  const now = Date.now();
  if ((p.cds[skillId] || 0) > now) return;
  if (p.mana < s.mana) { sendTo(p.id, { t: 'notice', msg: 'Không đủ linh lực!' }); return; }
  p.mana -= s.mana;
  p.cds[skillId] = now + s.cd * 1000;
  p.atkAnimT = now;
  if (skillId === 1) {
    projectiles.push({ id: 'pr' + (projSeq++), mapId: p.mapId, x: p.x, y: p.y, vx: Math.cos(p.dir) * 520, vy: Math.sin(p.dir) * 520, life: 0.9, dmg: p.atk * 1.7 * p.skillMult, owner: p.id, kind: 'sword' });
  } else if (skillId === 2) {
    for (const m of monsters) {
      if (m.dead || m.mapId !== p.mapId || dist(p.x, p.y, m.x, m.y) > 190) continue;
      const crit = Math.random() * 100 < p.crit;
      damageMonster(m, p.atk * 2.3 * p.skillMult * rand(0.9, 1.1) * (crit ? 1.8 : 1), p.id, crit);
    }
  } else if (skillId === 3) { p.shield = p.maxHp * 0.5; p.shieldT = now + 7000; }
  emit(p.mapId, { k: 'skillfx', id: p.id, skill: skillId, x: p.x, y: p.y, dir: p.dir });
}
function usePotion(p, kind) {
  const now = Date.now();
  if (!p.alive || now < p.potCd) return;
  if ((p.potions[kind] || 0) <= 0) { sendTo(p.id, { t: 'notice', msg: 'Hết đan dược!' }); return; }
  if (kind === 'hp' && p.hp >= p.maxHp) return;
  if (kind === 'mana' && p.mana >= p.maxMana) return;
  p.potions[kind]--; p.potCd = now + 1000;
  if (kind === 'hp') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.6);
  else p.mana = Math.min(p.maxMana, p.mana + p.maxMana * 0.6);
  emit(p.mapId, { k: 'potfx', id: p.id, kind, x: p.x, y: p.y });
  sendInv(p);
}
function usePortal(p, idx) {
  const map = MAPS[p.mapId];
  const pt = map.portals[idx];
  if (!pt) return;
  if (dist(p.x, p.y, pt.x, pt.y) > 110) return;
  const target = MAPS[pt.to];
  if (p.level < target.levelReq) { sendTo(p.id, { t: 'notice', msg: `Cần Lv${target.levelReq} để vào ${target.name}!` }); return; }
  p.mapId = pt.to; p.x = pt.tox; p.y = pt.toy; p.lastX = pt.tox; p.lastY = pt.toy;
  sendTo(p.id, { t: 'mapchange', mapId: pt.to, x: pt.tox, y: pt.toy });
  emit(pt.to, { k: 'portalfx', id: p.id, x: pt.tox, y: pt.toy });
}

/* ---------------- Quai ---------------- */
function spawnMonster(mapId, type, x, y) {
  const t = MONSTER_TYPES[type];
  monsters.push({ id: 'm' + (monsterSeq++), mapId, type, x, y, hp: t.hp, maxHp: t.hp, dir: rand(0, Math.PI * 2), moving: false, atkCd: 0, wanderT: rand(0, 3), respawnAt: 0, dead: false, homeX: x, homeY: y });
}
function initMonsters() {
  for (const mapId in MAPS) {
    const mp = MAPS[mapId];
    if (!mp.spawns) continue;
    for (const [type, x, y, n, r] of mp.spawns)
      for (let i = 0; i < n; i++) spawnMonster(mapId, type, x + rand(-r, r), y + rand(-r, r));
  }
}

/* ---------------- Net ---------------- */
function sendTo(id, obj) {
  const p = players.get(id);
  if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(JSON.stringify(obj));
}
function broadcastToMap(mapId, obj) {
  const s = JSON.stringify(obj);
  for (const [, p] of players) {
    if (p.mapId !== mapId) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
  }
}
function broadcastAll(obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const [id, p] of players) {
    if (id === exceptId) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
  }
}
function nameTaken(name) { for (const [, p] of players) if (p.name === name) return true; return false; }

wss.on('connection', (ws) => {
  if (players.size >= MAX_PLAYERS) { ws.close(1013, 'Server day'); return; }
  const id = nextId++;
  let player = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      if (player) return;
      const name = cleanName(m.name);
      if (nameTaken(name)) { ws.send(JSON.stringify({ t: 'nameTaken' })); ws.close(); return; }
      const isNew = !db[name];
      player = createPlayer(id, name);
      player.ws = ws;
      players.set(id, player);
      sendTo(id, { t: 'welcome', id, maps: MAPS, skills: SKILLS, shop: SHOP, attrs: ATTR_DEFS,
        npcs: Object.values(NPCS).map(n => ({ id: n.id, mapId: n.mapId, x: n.x, y: n.y, name: n.name, title: n.title })),
        story: STORY_INTRO, isNew });
      sendInv(player); sendAttrs(player); sendQuests(player);
      sendTo(id, { t: 'mapchange', mapId: player.mapId, x: player.x, y: player.y });
      broadcastAll({ t: 'join', id, name: player.name }, id);
      broadcastAll({ t: 'chat', sys: true, msg: `${player.name} đã nhập thế giới tu tiên${isNew ? '' : ' (chào mừng trở lại)'}` });
      return;
    }
    if (!player) return;
    const now = Date.now();
    const mp = MAPS[player.mapId];
    if (m.t === 'move') {
      const nx = clamp(Number(m.x) || player.x, 0, mp.w);
      const ny = clamp(Number(m.y) || player.y, 0, mp.h);
      const dt = Math.max(0.02, (now - player.lastMoveT) / 1000);
      const maxD = PLAYER_SPEED * dt * 1.6 + 30;
      const d = dist(player.lastX, player.lastY, nx, ny);
      let fx = nx, fy = ny;
      if (d > maxD) { const r = maxD / d; fx = player.lastX + (nx - player.lastX) * r; fy = player.lastY + (ny - player.lastY) * r; }
      player.x = fx; player.y = fy; player.lastX = fx; player.lastY = fy; player.lastMoveT = now;
      player.dir = Number(m.dir) || 0; player.moving = !!m.moving;
    }
    else if (m.t === 'attack') { if (typeof m.dir === 'number') player.dir = m.dir; doAttack(player); }
    else if (m.t === 'skill') { if (typeof m.dir === 'number') player.dir = m.dir; doSkill(player, Number(m.id)); }
    else if (m.t === 'portal') usePortal(player, Number(m.idx));
    else if (m.t === 'talk') {
      const npc = NPCS[m.npcId];
      if (!npc || npc.mapId !== player.mapId || dist(player.x, player.y, npc.x, npc.y) > 150) return;
      const qs = npc.quests.map(qid => {
        const q = QUESTS[qid];
        return { id: qid, name: q.name, desc: q.desc, state: questState(player, qid), prog: Math.min(player.quests.active[qid] || 0, q.count), count: q.count, target: q.targetName, rewards: q.rewards };
      });
      sendTo(id, { t: 'dialog', npc: { id: npc.id, name: npc.name, title: npc.title, text: npc.text }, quests: qs });
    }
    else if (m.t === 'questAccept') {
      const q = QUESTS[m.questId];
      if (!q || questState(player, m.questId) !== 'available') return;
      player.quests.active[m.questId] = 0;
      sendTo(id, { t: 'notice', msg: `Đã nhận nhiệm vụ: ${q.name}` });
      sendQuests(player);
    }
    else if (m.t === 'questDone') {
      const q = QUESTS[m.questId];
      if (!q || questState(player, m.questId) !== 'ready') return;
      delete player.quests.active[m.questId];
      if (!q.repeat) player.quests.done.push(m.questId);
      gainXp(player, q.rewards.xp);
      player.gold += q.rewards.gold;
      if (q.rewards.item && player.inv.length < INV_MAX) {
        const item = genItem(q.rewards.item.slot, q.rewards.item.tier, 25);
        player.inv.push(item);
        emit(player.mapId, { k: 'itemdrop', id: player.id, label: itemLabel(item), col: item.col, x: player.x, y: player.y - 90 });
      }
      sendInv(player); sendQuests(player);
      emit(player.mapId, { k: 'questfx', id: player.id, x: player.x, y: player.y });
      sendTo(id, { t: 'notice', msg: `Hoàn thành: ${q.name}! +${q.rewards.xp} tu vi, +${q.rewards.gold} linh thạch` });
    }
    else if (m.t === 'allocate') {
      const a = m.attr;
      if (!['luc', 'the', 'man', 'linh'].includes(a) || (player.attrPoints || 0) <= 0) return;
      player.attrPoints--; player.attrs[a]++;
      recalc(player); sendAttrs(player);
    }
    else if (m.t === 'usepot') usePotion(player, m.kind === 'mana' ? 'mana' : 'hp');
    else if (m.t === 'equip') {
      const it = player.inv.find(i => i.id === m.itemId);
      if (!it) return;
      if (it.reqLvl > player.level) { sendTo(id, { t: 'notice', msg: `Cần Lv${it.reqLvl} để mặc!` }); return; }
      player.inv = player.inv.filter(i => i.id !== it.id);
      const cur = player.equip[it.slot];
      if (cur) player.inv.push(cur);
      player.equip[it.slot] = it;
      recalc(player); sendInv(player);
    }
    else if (m.t === 'unequip') {
      const cur = player.equip[m.slot];
      if (!cur || player.inv.length >= INV_MAX) return;
      player.equip[m.slot] = null; player.inv.push(cur);
      recalc(player); sendInv(player);
    }
    else if (m.t === 'sell') {
      const ix = player.inv.findIndex(i => i.id === m.itemId);
      if (ix < 0) return;
      const [it] = player.inv.splice(ix, 1);
      player.gold += it.value; sendInv(player);
    }
    else if (m.t === 'buy') {
      const s = SHOP[m.item];
      if (!s) return;
      if (player.gold < s.price) { sendTo(id, { t: 'notice', msg: 'Không đủ linh thạch!' }); return; }
      if ((player.potions[m.item === 'hppot' ? 'hp' : 'mana'] || 0) >= 20) { sendTo(id, { t: 'notice', msg: 'Túi đan đầy!' }); return; }
      player.gold -= s.price;
      player.potions[m.item === 'hppot' ? 'hp' : 'mana']++;
      sendInv(player);
    }
    else if (m.t === 'rank') {
      const all = [];
      for (const [, p] of players) all.push({ name: p.name, level: p.level, online: true });
      for (const n in db) if (!all.some(a => a.name === n)) all.push({ name: n, level: db[n].level || 1, online: false });
      all.sort((a, b) => b.level - a.level);
      sendTo(id, { t: 'rank', list: all.slice(0, 10) });
    }
    else if (m.t === 'chat') {
      if (now - player.lastChat < 800) return;
      player.lastChat = now;
      const msg = String(m.msg || '').slice(0, 120).replace(/[<>&"]/g, '');
      if (!msg.trim()) return;
      broadcastAll({ t: 'chat', id, name: player.name, msg });
    }
  });

  ws.on('close', () => {
    if (player) { persistPlayer(player); saveDB(); players.delete(id); broadcastAll({ t: 'leave', id, name: player.name }); }
  });
  ws.on('error', () => {});
});

/* ---------------- Game loop ---------------- */
let tickCount = 0;
function tick() {
  const now = Date.now(), dt = TICK_MS / 1000;
  tickCount++;
  for (const m of monsters) {
    if (m.dead && now >= m.respawnAt) {
      const t = MONSTER_TYPES[m.type];
      m.hp = t.hp; m.maxHp = t.hp; m.dead = false;
      m.x = m.homeX + rand(-80, 80); m.y = m.homeY + rand(-80, 80);
    }
  }
  for (const [, p] of players) {
    const mp = MAPS[p.mapId];
    if (!p.alive && now >= p.respawnAt) {
      p.alive = true; p.hp = p.maxHp; p.mana = p.maxMana; p.x = mp.w / 2; p.y = mp.h / 2; p.shield = 0;
      emit(p.mapId, { k: 'respawn', id: p.id, x: p.x, y: p.y });
    }
    p.mana = Math.min(p.maxMana, p.mana + 8 * dt);
    if (p.shieldT && now > p.shieldT) { p.shield = 0; p.shieldT = 0; }
    if (p.alive && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.01 * dt);
  }
  for (const m of monsters) {
    if (m.dead) continue;
    const t = MONSTER_TYPES[m.type];
    const mp = MAPS[m.mapId];
    m.atkCd = Math.max(0, m.atkCd - dt);
    let target = null, best = 380;
    for (const [, p] of players) {
      if (!p.alive || p.mapId !== m.mapId) continue;
      const d = dist(m.x, m.y, p.x, p.y);
      if (d < best) { best = d; target = p; }
    }
    if (target) {
      const d = dist(m.x, m.y, target.x, target.y);
      m.dir = Math.atan2(target.y - m.y, target.x - m.x);
      if (d > 55) { m.x += Math.cos(m.dir) * t.speed * dt; m.y += Math.sin(m.dir) * t.speed * dt; m.moving = true; }
      else {
        m.moving = false;
        if (m.atkCd <= 0) { m.atkCd = 1.2; damagePlayer(target, t.atk * rand(0.85, 1.15)); emit(m.mapId, { k: 'matkfx', id: m.id, x: m.x, y: m.y, dir: m.dir }); }
      }
      // Ky nang dac biet cua boss: AoE co canh bao
      if (t.boss) {
        m.abilityCd = (m.abilityCd === undefined ? 6 : m.abilityCd) - dt;
        if (m.abilityCd <= 0 && d < 450) {
          m.abilityCd = 9;
          const r = m.type === 'golem' ? 230 : 185;
          const bx = target.x, by = target.y;
          emit(m.mapId, { k: 'bosswarn', id: m.id, x: Math.round(bx), y: Math.round(by), r, ms: 1300, name: m.type === 'golem' ? 'Dung Nham Bùng Nổ' : 'Hồ Vĩ Quét' });
          pendingBlasts.push({ at: now + 1300, mapId: m.mapId, x: bx, y: by, r, dmg: t.atk * 2.2 });
        }
      }
    } else {
      m.wanderT -= dt;
      if (m.wanderT <= 0) { m.wanderT = rand(2, 5); m.dir = rand(0, Math.PI * 2); m.moving = Math.random() < 0.6; }
      if (m.moving) {
        const nx = m.x + Math.cos(m.dir) * t.speed * 0.4 * dt;
        const ny = m.y + Math.sin(m.dir) * t.speed * 0.4 * dt;
        if (dist(nx, ny, m.homeX, m.homeY) < 320) { m.x = nx; m.y = ny; } else m.dir += Math.PI;
      }
    }
    m.x = clamp(m.x, 20, mp.w - 20); m.y = clamp(m.y, 20, mp.h - 20);
  }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    const mp = MAPS[pr.mapId];
    pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    let dead = pr.life <= 0 || pr.x < 0 || pr.y < 0 || pr.x > mp.w || pr.y > mp.h;
    if (!dead) for (const m of monsters) {
      if (m.dead || m.mapId !== pr.mapId) continue;
      if (dist(pr.x, pr.y, m.x, m.y) < 42) {
        const owner = players.get(pr.owner);
        const crit = owner && Math.random() * 100 < owner.crit;
        damageMonster(m, pr.dmg * rand(0.9, 1.1) * (crit ? 1.8 : 1), pr.owner, crit);
        emit(pr.mapId, { k: 'hitfx', x: pr.x, y: pr.y });
        dead = true; break;
      }
    }
    if (dead) projectiles.splice(i, 1);
  }
  // Boss AoE no sau canh bao
  for (let i = pendingBlasts.length - 1; i >= 0; i--) {
    const b = pendingBlasts[i];
    if (now >= b.at) {
      pendingBlasts.splice(i, 1);
      emit(b.mapId, { k: 'bossblast', x: Math.round(b.x), y: Math.round(b.y), r: b.r });
      for (const [, p] of players) {
        if (!p.alive || p.mapId !== b.mapId) continue;
        if (dist(p.x, p.y, b.x, b.y) < b.r) damagePlayer(p, b.dmg * rand(0.9, 1.1));
      }
    }
  }
  if (tickCount % BROADCAST_EVERY === 0) {
    // Gom players theo map
    const byMap = {};
    for (const [, p] of players) {
      const g = byMap[p.mapId] || (byMap[p.mapId] = { ps: [], evs: [] });
      g.ps.push({ id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), dir: +p.dir.toFixed(2),
        moving: p.moving, hp: Math.round(p.hp), maxHp: p.maxHp, mana: Math.round(p.mana), maxMana: p.maxMana,
        level: p.level, xp: Math.round(p.xp), xpNeed: xpNeed(p.level), alive: p.alive,
        shield: Math.round(p.shield), atkAnimT: p.atkAnimT, gold: p.gold, atk: p.atk,
        potHp: p.potions.hp || 0, potMana: p.potions.mana || 0 });
    }
    for (const e of events) { const g = byMap[e.map]; if (g) g.evs.push(e); }
    for (const mapId in byMap) {
      const g = byMap[mapId];
      const mArr = [], prArr = [];
      for (const m of monsters) {
        if (m.dead || m.mapId !== mapId) continue;
        mArr.push({ id: m.id, type: m.type, x: Math.round(m.x), y: Math.round(m.y), dir: +m.dir.toFixed(2), moving: m.moving, hp: Math.round(m.hp), maxHp: m.maxHp });
      }
      for (const pr of projectiles) {
        if (pr.mapId !== mapId) continue;
        prArr.push({ id: pr.id, x: Math.round(pr.x), y: Math.round(pr.y), dir: +Math.atan2(pr.vy, pr.vx).toFixed(2), kind: pr.kind });
      }
      const s = JSON.stringify({ t: 'state', p: g.ps, m: mArr, pr: prArr, ev: g.evs, online: players.size });
      for (const pl of g.ps) {
        const p = players.get(pl.id);
        if (p && p.ws.readyState === WebSocket.OPEN) p.ws.send(s);
      }
    }
    events = [];
  }
}

loadDB();
initMonsters();
setInterval(tick, TICK_MS);
setInterval(() => { for (const [, p] of players) persistPlayer(p); saveDB(); }, 30000);
httpServer.listen(PORT, () => console.log(`[tu-tien-online] MMO server chay tai port ${PORT} - ${Object.keys(MAPS).length} maps`));
