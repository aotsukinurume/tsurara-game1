// ===== BGM設定 =====
const bgm = new Audio('winter-wonderland.mp3');
bgm.loop = true;  // ループ再生を有効にする
bgm.volume = 0.2; // 音量（0.0 〜 1.0）※お好みで調整してください

// ===== 設定（ここの数字をいじると難易度が変わる） =====
const CONFIG = {
  spawnStart: 0.55,    // つららが出る間隔（秒）の初期値
  spawnMin: 0.12,      // 間隔の下限
  spawnRamp: 0.014,    // 1秒ごとに間隔を縮める量
  speedBase: 200,      // 落下速度の初期値
  speedRamp: 11,       // 1秒ごとに速くなる量
  speedRand: 100,      // 速度のばらつき
  diagonalFrom: 8,     // ななめつららが出始める秒数
  diagonalChance: 0.35,
  tripleFrom: 12,      // 3連発が出始める秒数
  tripleChance: 0.25,
  keySpeed: 300,       // キーボード移動の速さ
  follow: 12,          // 指への追従（小さいほど重い）
  rankSize: 5,         // ランキングの件数
  storageKey: 'tsurara-rank',
};

const W = 360, H = 540, GROUND = 488;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const ui = document.getElementById('ui');
const el = id => document.getElementById(id);

// ===== 画像 =====
const loadImg = src => { const im = new Image(); im.src = src; return im; };
const ok = im => im.complete && im.naturalWidth > 0;
const bgImg = loadImg('assets/bg.jpg'), playerImg = loadImg('assets/player.png');
const SPRITES = [
  { f: 'assets/icicle1.png', tx: 0.01, big: true },
  { f: 'assets/icicle2.png', tx: -0.02 },
  { f: 'assets/icicle3.png', tx: 0.16 },
  { f: 'assets/icicle4.png', tx: -0.22 },
  { f: 'assets/icicle5.png', tx: -0.01 },
  { f: 'assets/icicle6.png', tx: 0.32 },
  { f: 'assets/icicle7.png', tx: 0.07 },
  { f: 'assets/icicle8.png', tx: -0.02 },
  { f: 'assets/icicle9.png', tx: 0.09 },
  { f: 'assets/icicle10.png', tx: -0.13 }
];   // tx = 先端が中心からどれだけずれているか(-1〜1)
SPRITES.forEach(s => s.img = loadImg(s.f));
// 自キャラの当たり判定（円：中心x, 中心y, 半径。地面からの相対位置）
const BODY = [[-24, 0, 11], [0, -4, 15], [24, 0, 11], [12, -16, 10]];
let face = 1;    // 1=左向き, -1=右向き

let state = 'ready', t = 0, px = W / 2, target = W / 2, last = 0, spawn = 0, icicles = [];

// ===== ランキング（このブラウザ内に保存） =====
let ranking = [];
try { ranking = JSON.parse(localStorage.getItem(CONFIG.storageKey)) || []; } catch (e) {}
let best = ranking.length ? ranking[0].s : 0;

function renderRank(pos) {
  el('rank').innerHTML = ranking.map((r, i) => {
    const d = new Date(r.d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
    return '<li' + (i === pos ? ' class="new"' : '') + '><span>' + (i + 1) + '位 ' +
           r.s.toFixed(1) + '秒</span><small>' + d + '</small></li>';
  }).join('');
}

// ===== 入力 =====
function setTarget(clientX) {
  const r = cv.getBoundingClientRect();
  target = Math.max(16, Math.min(W - 16, (clientX - r.left) * W / r.width));
}
cv.addEventListener('pointerdown', e => setTarget(e.clientX));
cv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') setTarget(e.clientX); });
const keys = {};
addEventListener('keydown', e => {
  keys[e.key] = true;
  if ((e.key === 'Enter' || e.key === ' ') && state !== 'play') start();
});
addEventListener('keyup', e => keys[e.key] = false);

// ===== ゲームの流れ =====
function start() {
  state = 'play'; t = 0; spawn = 0; icicles = []; px = target = W / 2;
  ui.classList.add('hide');

  // BGMを再生する（曲を最初からにして再生）
  bgm.currentTime = 0;
  bgm.play().catch(e => {});
}

function gameOver() {
  state = 'over';
  //bgm.pause(); // ゲームオーバー時に音楽を止める

  const score = Math.round(t * 10) / 10;
  const entry = { s: score, d: Date.now() };
  ranking.push(entry);
  ranking.sort((a, b) => b.s - a.s);
  ranking = ranking.slice(0, CONFIG.rankSize);
  const pos = ranking.indexOf(entry);   // ランク外なら -1
  best = ranking[0].s;
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(ranking)); } catch (e) {}
  renderRank(pos);

  el('title').textContent = 'ぶつかった！';
  el('msg').textContent = pos === 0 ? '自己ベスト更新！' : pos > 0 ? (pos + 1) + '位に入った！' : 'ランキング圏外';
  el('result').textContent = score.toFixed(1) + ' 秒';
  el('start').textContent = 'もういちど';

  const text = 'つらら避けで ' + score.toFixed(1) + ' 秒よけた！' + (pos === 0 ? '（自己ベスト）' : '') + ' #つらら避け';
  el('share').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) +
                     '&url=' + encodeURIComponent(location.href);
  el('share').hidden = false;
  ui.classList.remove('hide');
}
el('start').addEventListener('click', start);

function spawnIcicles() {
  const c = CONFIG;
  spawn = Math.max(c.spawnMin, c.spawnStart - t * c.spawnRamp);
  const n = (t > c.tripleFrom && Math.random() < c.tripleChance) ? 3 : 1;
  for (let k = 0; k < n; k++) {
    const pool = SPRITES.filter(s => !s.big);
    const s = (t > 10 && Math.random() < 0.06) ? SPRITES[0] : pool[Math.floor(Math.random() * pool.length)];
    if (!ok(s.img)) continue;
    const sc = 0.5 * (s.big ? 0.8 : 0.7 + Math.random() * 0.5);   // 画像は2倍サイズで入っている
    const w = s.img.naturalWidth * sc, h = s.img.naturalHeight * sc;
    const vx = (t > c.diagonalFrom && Math.random() < c.diagonalChance)
      ? (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 40 + t * 2) : 0;
    icicles.push({ x: 12 + Math.random() * (W - 24), y: -h, w, h, s, vx,
                   v: c.speedBase + t * c.speedRamp + Math.random() * c.speedRand });
  }
}

// つららの軸に沿った小さな円と、自キャラの円が重なったらヒット（少し甘め）
function hits(i) {
  const a = -Math.atan2(i.vx, i.v), ca = Math.cos(a), sa = Math.sin(a);
  for (const f of [0.35, 0.55, 0.75, 0.92]) {
    const lx = i.s.tx * i.w / 2 * f, ly = i.h * f;
    const cx = i.x + lx * ca - ly * sa, cy = i.y + lx * sa + ly * ca;
    const r = Math.max(3, i.w / 2 * (1 - f) * 0.7);
    for (const c of BODY) {
      const dx = cx - (px + c[0] * face), dy = cy - (GROUND + c[1]);
      if (dx * dx + dy * dy < (r + c[2]) * (r + c[2])) return true;
    }
  }
  return false;
}

function update(dt) {
  t += dt;
  if (keys.ArrowLeft) target -= CONFIG.keySpeed * dt;
  if (keys.ArrowRight) target += CONFIG.keySpeed * dt;
  target = Math.max(16, Math.min(W - 16, target));
  if (Math.abs(target - px) > 1.5) face = target > px ? -1 : 1;
  px += (target - px) * Math.min(1, dt * CONFIG.follow);

  spawn -= dt;
  if (spawn <= 0) spawnIcicles();

  for (const i of icicles) {
    i.y += i.v * dt;
    i.x += i.vx * dt;
    if (hits(i)) { gameOver(); return; }
  }
  icicles = icicles.filter(i => i.y + i.h < GROUND + 14);   // 先端が地面に着いたら消える
}

// ===== 描画 =====
function draw() {
  if (ok(bgImg)) ctx.drawImage(bgImg, 0, 0, W, H);
  else { ctx.fillStyle = '#1f4a9a'; ctx.fillRect(0, 0, W, H); }

  for (const i of icicles) {
    if (!ok(i.s.img)) continue;
    ctx.save();
    ctx.translate(i.x, i.y); ctx.rotate(-Math.atan2(i.vx, i.v));
    ctx.drawImage(i.s.img, -i.w / 2, 0, i.w, i.h);
    ctx.restore();
  }

  if (ok(playerImg)) {
    const pw = 80, ph = pw * playerImg.naturalHeight / playerImg.naturalWidth;
    ctx.save(); ctx.translate(px, GROUND + 10); ctx.scale(face, 1);
    ctx.drawImage(playerImg, -pw / 2, -ph, pw, ph);
    ctx.restore();
  }

  ctx.shadowColor = 'rgba(8,24,64,.8)'; ctx.shadowBlur = 5;
  ctx.fillStyle = '#fff'; ctx.font = '700 28px "Hiragino Sans","Yu Gothic",sans-serif';
  ctx.textAlign = 'left'; ctx.fillText(t.toFixed(1) + ' 秒', 16, 40);
  ctx.textAlign = 'right'; ctx.font = '700 14px "Hiragino Sans","Yu Gothic",sans-serif';
  ctx.fillText('ベスト ' + best.toFixed(1), W - 16, 38);
  ctx.shadowBlur = 0;
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  if (state === 'play') update(dt);
  draw();
  requestAnimationFrame(loop);
}
renderRank(-1);
requestAnimationFrame(loop);
