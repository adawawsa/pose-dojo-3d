"use strict";

let VIEW_W = 1280;
const VIEW_H = 720;
const GROUND = 610;
const WorldForge = window.ShihanWorldForge;
if (!WorldForge) throw new Error("worlds.js must be loaded before game.js");
let AREAS = [];
let WORLD_END = 1;

const PHOTO_SRCS = Array.from({ length: 7 }, (_, index) => `assets/pose-${index + 1}.jpg`);
const ASSET_SRCS = {
  world: "assets/generated-shihan-world-v1.png",
  photoCity: "assets/generated-photo-city-v1.png",
  arena: "assets/generated-arena-v2.png",
  special: "assets/generated-special-v2.png",
  stand: "assets/renders/pose-stand.png",
  wing: "assets/renders/pose-wing.png",
  back: "assets/renders/pose-back.png",
  dash: "assets/renders/pose-dash.png",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const random = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

const els = {
  title: $("#title-screen"),
  game: $("#game-screen"),
  result: $("#result-screen"),
  start: $("#start-button"),
  retry: $("#retry-button"),
  share: $("#share-button"),
  home: $("#home-link"),
  sound: $("#sound-button"),
  topBest: $("#top-best"),
  score: $("#score"),
  areaNumber: $("#area-number"),
  areaName: $("#area-name"),
  progress: $("#world-progress-fill"),
  distance: $("#distance"),
  streak: $("#streak"),
  lives: $("#life-bar"),
  shell: $("#action-shell"),
  canvas: $("#action-canvas"),
  areaBanner: $("#area-banner"),
  areaBannerNumber: $("#area-banner-number"),
  areaBannerName: $("#area-banner-name"),
  orderCard: $("#order-card"),
  orderText: $("#order-text"),
  orderHint: $("#order-hint"),
  orderTimer: $("#order-timer"),
  orderResult: $("#order-result"),
  orderResultLabel: $("#order-result-label"),
  orderResultText: $("#order-result-text"),
  orderResultScore: $("#order-result-score"),
  bossAlert: $("#boss-alert"),
  pause: $("#pause-card"),
  mission: $("#mission-text"),
  finalArea: $("#final-area"),
  finalKills: $("#final-kills"),
  finalOrders: $("#final-orders"),
  finalScore: $("#final-score"),
  rank: $("#rank-letter"),
  rankTitle: $("#rank-title"),
  resultComment: $("#result-comment"),
  titleReel: $("#title-reel"),
};

const ctx = els.canvas.getContext("2d");
const images = {};
const backgroundCache = new Map();
let assetsReady = null;
let state = {};
let frame = 0;
let audioContext = null;
let muted = false;
let titleReelTimer = 0;

function loadAssets() {
  if (assetsReady) return assetsReady;
  const entries = [
    ...Object.entries(ASSET_SRCS),
    ...PHOTO_SRCS.map((src, index) => [`photo${index + 1}`, src]),
  ];
  assetsReady = Promise.all(entries.map(([key, src]) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = () => resolve();
    image.src = src;
  })));
  return assetsReady;
}

function configureCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const ratio = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
  VIEW_W = Math.round(clamp(VIEW_H * ratio, 560, 1500));
  els.canvas.width = VIEW_W;
  els.canvas.height = VIEW_H;
  backgroundCache.clear();
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function safeBest() {
  try { return Number(localStorage.getItem("shihan-run-best")) || 0; }
  catch { return 0; }
}

function saveBest(value) {
  try { localStorage.setItem("shihan-run-best", String(value)); }
  catch { /* The run still works if storage is unavailable. */ }
}

function padded(value) {
  return String(Math.max(0, Math.round(value))).padStart(6, "0");
}

function showScreen(screen) {
  [els.title, els.game, els.result].forEach((item) => { item.hidden = item !== screen; });
  document.body.classList.toggle("is-playing", screen === els.game);
}

function initAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function tone(frequency, duration = .06, type = "square", volume = .025, delay = 0) {
  if (muted) return;
  initAudio();
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .006);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function sound(name) {
  if (name === "jump") tone(420, .09, "square", .025);
  if (name === "hit") { tone(145, .055, "sawtooth", .04); tone(310, .045, "square", .025, .025); }
  if (name === "hurt") [150, 95].forEach((hz, i) => tone(hz, .14, "sawtooth", .035, i * .07));
  if (name === "coin") [660, 920].forEach((hz, i) => tone(hz, .07, "square", .026, i * .045));
  if (name === "order") [340, 500, 760].forEach((hz, i) => tone(hz, .075, "square", .028, i * .045));
  if (name === "clear") [520, 720, 980].forEach((hz, i) => tone(hz, .1, "triangle", .032, i * .055));
  if (name === "boss") [95, 95, 155].forEach((hz, i) => tone(hz, .16, "sawtooth", .035, i * .12));
  if (name === "start") [260, 390, 520, 780].forEach((hz, i) => tone(hz, .1, "square", .03, i * .055));
}

function groundAt(x) {
  return !(state.gaps || []).some(([left, right]) => x > left && x < right);
}

function makeEnemy(x, type = "pen", boss = false, final = false, options = {}) {
  const sizes = { pen: [34, 92], bottle: [58, 82], cable: [110, 58] };
  const [w, h] = boss ? (final ? [190, 230] : [135, 175]) : sizes[type];
  const hp = options.hp || (boss ? (final ? 9 : 4) : 1);
  const speed = options.speed || random(22, 42);
  return {
    id: Math.random().toString(36).slice(2),
    x, y: GROUND - h, w, h, type, boss, final,
    hp,
    maxHp: hp,
    alive: true,
    vx: boss ? 0 : -speed,
    baseX: x,
    lastHit: -1,
    active: false,
    alerted: false,
    attackAt: 0,
    orderTarget: false,
  };
}

function buildEnemies(world) {
  return world.enemies.map((enemy) => makeEnemy(enemy.x, enemy.type, Boolean(enemy.boss), Boolean(enemy.final), enemy));
}

function requestedWorldSeed() {
  const value = new URLSearchParams(location.search).get("seed");
  if (!value) return `${Date.now()}-${Math.random()}`;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function resetState() {
  const world = WorldForge.createWorld({ seed: requestedWorldSeed() });
  AREAS = world.areas;
  WORLD_END = world.length;
  state = {
    world,
    playing: true,
    paused: false,
    won: false,
    dying: false,
    score: 0,
    lives: 5,
    maxLives: 5,
    photosCollected: 0,
    assist: { autoRun: true },
    streak: 0,
    maxStreak: 0,
    orderWins: 0,
    kills: 0,
    area: 0,
    checkpoint: 120,
    cameraX: 0,
    time: 0,
    nextHudAt: 0,
    last: performance.now(),
    nextOrderAt: 4800,
    lastOrder: "",
    challenge: null,
    bannerUntil: performance.now() + 1350,
    bossAlertUntil: 0,
    shake: 0,
    flash: 0,
    controls: { left: false, right: false, down: false },
    keys: new Set(),
    gaps: world.gaps,
    platforms: world.platforms,
    enemies: buildEnemies(world),
    pickups: world.pickups.map((pickup) => ({ ...pickup })),
    projectiles: [],
    particles: [],
    decorations: world.decorations,
    player: {
      x: 120, y: GROUND - 152, w: 88, h: 152,
      vx: 0, vy: 0, facing: 1, onGround: true,
      attackTimer: 0, attackCooldown: 0, attackId: 0,
      invulnerable: 0, runTime: 0, stomping: false,
      coyoteTime: .14, jumpBuffer: 0,
    },
  };
}

async function startRun() {
  els.start.disabled = true;
  els.start.querySelector("span").textContent = "読込中…";
  await loadAssets();
  els.start.disabled = false;
  els.start.querySelector("span").textContent = "師範ワールドへ";
  cancelAnimationFrame(frame);
  resetState();
  initAudio();
  sound("start");
  showScreen(els.game);
  configureCanvas();
  hideOverlays();
  showAreaBanner(0);
  updateHud();
  draw();
  frame = requestAnimationFrame(loop);
}

function hideOverlays() {
  [els.areaBanner, els.orderCard, els.orderResult, els.bossAlert, els.pause].forEach((el) => { el.className = el.className.split(" ")[0]; });
}

function updateHud() {
  const area = AREAS[state.area];
  els.score.textContent = padded(state.score);
  els.areaNumber.textContent = `AREA ${state.area + 1}`;
  els.areaName.textContent = area.name;
  const percent = clamp((state.player.x / WORLD_END) * 100, 0, 100);
  els.progress.style.width = `${percent}%`;
  els.distance.textContent = `${Math.floor(percent)}%`;
  els.streak.textContent = state.streak;
  els.lives.setAttribute("aria-label", `残り${state.lives}回`);
  $$("i", els.lives).forEach((heart, index) => heart.classList.toggle("lost", index >= state.lives));
  els.mission.innerHTML = `<b>AREA ${state.area + 1}</b> ${area.mission}<mark>AUTO RUN</mark><em>WORLD #${state.world.code}</em>`;
}

function showAreaBanner(areaIndex) {
  els.areaBannerNumber.textContent = `AREA ${areaIndex + 1}`;
  els.areaBannerName.textContent = AREAS[areaIndex].name;
  els.areaBanner.classList.remove("show");
  void els.areaBanner.offsetWidth;
  els.areaBanner.classList.add("show");
  state.bannerUntil = performance.now() + 1350;
}

function showBossAlert() {
  els.bossAlert.classList.remove("show");
  void els.bossAlert.offsetWidth;
  els.bossAlert.classList.add("show");
  state.bossAlertUntil = performance.now() + 1000;
  sound("boss");
}

function togglePause(force) {
  if (!state.playing) return;
  state.paused = typeof force === "boolean" ? force : !state.paused;
  els.pause.classList.toggle("show", state.paused);
  if (!state.paused) {
    state.last = performance.now();
    frame = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(frame);
  }
}

function performJump() {
  const player = state.player;
  player.vy = -690;
  player.onGround = false;
  player.coyoteTime = 0;
  player.jumpBuffer = 0;
  player.stomping = false;
  sound("jump");
  if (isOrderPlaying("jump")) finishOrder(true, "飛んだ!");
  if (isOrderPlaying("nojump")) finishOrder(false, "飛ぶなァ!");
}

function doJump() {
  if (!state.playing || state.paused || state.dying) return;
  if (isOrderPlaying("freeze")) { finishOrder(false, "押したァ!"); return; }
  const player = state.player;
  if (player.onGround || player.coyoteTime > 0) performJump();
  else player.jumpBuffer = .18;
}

function doStomp() {
  if (!state.playing || state.paused || state.dying) return;
  if (isOrderPlaying("freeze")) { finishOrder(false, "押したァ!"); return; }
  const player = state.player;
  if (player.onGround) return;
  player.stomping = true;
  player.vy = 880;
  sound("hit");
}

function doAttack() {
  if (!state.playing || state.paused || state.dying) return;
  if (isOrderPlaying("freeze")) { finishOrder(false, "押したァ!"); return; }
  const player = state.player;
  if (player.attackCooldown > 0) return;
  player.attackTimer = .3;
  player.attackCooldown = .24;
  player.attackId += 1;
  sound("hit");
  if (isOrderPlaying("attack3")) {
    state.challenge.count += 1;
    if (state.challenge.count >= 3) finishOrder(true, "三連打!");
  }
}

function isOrderPlaying(type) {
  return state.challenge?.phase === "play" && state.challenge.type === type;
}

const ORDER_POOL = [
  { type: "jump", text: "↑ 跳べ!", hint: "十字キーの上", duration: 3000 },
  { type: "attack3", text: "A 3回!", hint: "Aボタンを3回", duration: 3300 },
  { type: "dash", text: "→ 走れ!", hint: "十字キーの右", duration: 3500 },
  { type: "back", text: "← 戻れ!", hint: "十字キーの左", duration: 3300 },
  { type: "freeze", text: "離せ!", hint: "自動走行も止まる。触るな", duration: 3000 },
  { type: "nojump", text: "↑ 禁止!", hint: "ジャンプせず耐えろ", duration: 3000 },
  { type: "smash", text: "A 倒せ!", hint: "近くの赤い敵へAボタン", duration: 4600 },
  { type: "collect", text: "写真を取れ!", hint: "近くで光る写真へ", duration: 4500 },
  { type: "safe", text: "よけろ!", hint: "十字キーだけで回避", duration: 3500 },
];

function availableOrders() {
  const byArea = [
    ["jump", "attack3", "dash", "freeze", "collect"],
    ["jump", "smash", "back", "nojump", "safe"],
    ["smash", "collect", "attack3", "safe", "dash"],
    ["jump", "freeze", "dash", "nojump", "back"],
    ORDER_POOL.map((order) => order.type),
  ];
  return ORDER_POOL.filter((order) => byArea[state.area].includes(order.type));
}

function startOrder(now) {
  if (state.challenge || state.dying || now < state.bannerUntil || now < state.bossAlertUntil) return;
  let template;
  do { template = pick(availableOrders()); }
  while (template.type === state.lastOrder && availableOrders().length > 1);
  state.lastOrder = template.type;
  state.challenge = {
    ...template,
    phase: "intro",
    introUntil: now + 520,
    startedAt: now + 520,
    deadline: now + 520 + template.duration,
    startX: state.player.x,
    count: 0,
    targetId: null,
  };

  if (template.type === "smash") {
    const enemy = makeEnemy(Math.min(state.player.x + 270, AREAS[state.area].end - 260), "cable", false, false, { speed: 18 });
    enemy.orderTarget = true;
    state.enemies.push(enemy);
    state.challenge.targetId = enemy.id;
  }
  if (template.type === "collect") {
    const pickup = { id: `order-${now}`, x: state.player.x + 220, y: GROUND - 100, w: 58, h: 76, photo: 7, active: true, special: true };
    state.pickups.push(pickup);
    state.challenge.targetId = pickup.id;
  }

  els.orderText.textContent = template.text;
  els.orderHint.textContent = template.hint;
  els.orderTimer.style.transform = "scaleX(1)";
  els.orderCard.className = "order-card show";
  sound("order");
}

function finishOrder(success, message) {
  const challenge = state.challenge;
  if (!challenge || !["intro", "play"].includes(challenge.phase)) return;
  challenge.phase = "result";
  challenge.resultUntil = performance.now() + 760;
  els.orderCard.className = "order-card";
  els.orderResult.className = `order-result ${success ? "" : "bad"} show`.trim();
  els.orderResultLabel.textContent = success ? "ORDER CLEAR" : "ORDER MISS";
  els.orderResultText.textContent = message || (success ? "できた!" : "失敗!");
  if (success) {
    const points = 700 + state.streak * 90 + state.area * 150;
    state.score += points;
    state.streak += 1;
    state.maxStreak = Math.max(state.maxStreak, state.streak);
    state.orderWins += 1;
    els.orderResultScore.textContent = `+${points}`;
    burst(state.player.x, state.player.y + 50, AREAS[state.area].color, 22);
    sound("clear");
    vibrate(25);
  } else {
    state.streak = 0;
    state.lives -= 1;
    els.orderResultScore.textContent = `残り ${state.lives}`;
    shakeScreen();
    sound("hurt");
    vibrate([45, 30, 55]);
    if (state.lives <= 0) beginGameOver();
  }
  updateHud();
}

function updateOrder(now) {
  const challenge = state.challenge;
  if (!challenge) {
    if (state.time >= state.nextOrderAt) startOrder(now);
    return;
  }
  if (challenge.phase === "intro" && now >= challenge.introUntil) {
    challenge.phase = "play";
    els.orderCard.className = "order-card active";
  }
  if (challenge.phase === "play") {
    const remaining = clamp((challenge.deadline - now) / challenge.duration, 0, 1);
    els.orderTimer.style.transform = `scaleX(${remaining})`;
    if (challenge.type === "dash" && state.player.x - challenge.startX > 245) finishOrder(true, "爆走!");
    if (challenge.type === "back" && challenge.startX - state.player.x > 105) finishOrder(true, "逆走成功!");
    if (challenge.type === "freeze" && now > challenge.startedAt + 330) {
      const moving = Math.abs(state.player.vx) > 42 || state.controls.left || state.controls.right || state.controls.down || state.keys.has("ArrowLeft") || state.keys.has("ArrowRight") || state.keys.has("ArrowDown");
      if (moving) finishOrder(false, "動いたァ!");
    }
    if (now >= challenge.deadline && challenge.phase === "play") {
      if (["freeze", "nojump", "safe"].includes(challenge.type)) finishOrder(true, "耐えた!");
      else finishOrder(false, "間に合わない!");
    }
  }
  if (challenge.phase === "result" && now >= challenge.resultUntil) {
    els.orderResult.className = "order-result";
    state.challenge = null;
    state.nextOrderAt = state.time + 3000;
  }
}

function playerDirection() {
  const left = state.controls.left || state.keys.has("ArrowLeft");
  const right = state.controls.right || state.keys.has("ArrowRight");
  return (right ? 1 : 0) - (left ? 1 : 0);
}

function updatePlayer(dt) {
  const player = state.player;
  const manualDirection = playerDirection();
  const orderType = ["intro", "play"].includes(state.challenge?.phase) ? state.challenge.type : "";
  const autoRun = state.assist.autoRun && state.time > 1350 && performance.now() >= state.bannerUntil && !["freeze", "back"].includes(orderType);
  const direction = manualDirection || (autoRun ? 1 : 0);
  const maxSpeed = manualDirection > 0 ? 380 : manualDirection < 0 ? 340 : 220;
  if (direction) {
    player.vx += direction * (manualDirection ? 1900 : 900) * dt;
    player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
    player.facing = direction;
    player.runTime += dt;
  } else {
    player.vx *= Math.pow(.00002, dt);
  }
  player.attackTimer = Math.max(0, player.attackTimer - dt);
  player.attackCooldown = Math.max(0, player.attackCooldown - dt);
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
  player.coyoteTime = player.onGround ? .14 : Math.max(0, player.coyoteTime - dt);
  player.vy += 1750 * dt;

  const previousBottom = player.y + player.h;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, 25, WORLD_END - 30);
  player.onGround = false;

  const blockingBoss = state.enemies.find((enemy) => enemy.boss && enemy.alive && Math.abs(enemy.x - player.x) < 230 && player.x < enemy.x);
  if (blockingBoss && player.x > blockingBoss.x - 110) {
    player.x = blockingBoss.x - 110;
    player.vx = Math.min(0, player.vx);
  }

  const nextBottom = player.y + player.h;
  const feetX = player.x;
  if (player.vy >= 0) {
    for (const platform of state.platforms) {
      if (feetX + player.w * .35 > platform.x && feetX - player.w * .35 < platform.x + platform.w && previousBottom <= platform.y + 8 && nextBottom >= platform.y) {
        player.y = platform.y - player.h;
        player.vy = 0;
        player.onGround = true;
        break;
      }
    }
    if (!player.onGround && groundAt(feetX) && previousBottom <= GROUND + 14 && nextBottom >= GROUND) {
      player.y = GROUND - player.h;
      player.vy = 0;
      player.onGround = true;
      if (player.stomping) burst(player.x, GROUND - 10, "#e3ff38", 12);
      player.stomping = false;
    }
  }

  if (player.onGround && player.jumpBuffer > 0) performJump();

  if (player.y > VIEW_H + 130) fallOff();
  checkAttack();
}

function checkAttack() {
  const player = state.player;
  if (player.attackTimer <= 0) return;
  const reach = 112;
  const attackRect = {
    x: player.facing > 0 ? player.x + player.w * .15 : player.x - player.w * .15 - reach,
    y: player.y + 24,
    w: reach,
    h: player.h - 42,
  };
  state.enemies.forEach((enemy) => {
    if (!enemy.alive || enemy.lastHit === player.attackId) return;
    if (rectsOverlap(attackRect, enemy)) {
      enemy.lastHit = player.attackId;
      hitEnemy(enemy);
    }
  });
}

function hitEnemy(enemy) {
  enemy.hp -= 1;
  state.player.vx -= state.player.facing * 55;
  burst(enemy.x, enemy.y + enemy.h * .5, enemy.boss ? "#ffae27" : "#ff386c", enemy.boss ? 18 : 10);
  state.shake = enemy.boss ? .32 : .16;
  sound("hit");
  vibrate(enemy.boss ? 35 : 18);
  if (enemy.hp > 0) return;
  enemy.alive = false;
  state.score += enemy.boss ? 2500 : 320;
  state.kills += 1;
  if (isOrderPlaying("smash") && state.challenge.targetId === enemy.id) finishOrder(true, "粉砕!");
  if (enemy.final) {
    state.won = true;
    state.dying = true;
    window.setTimeout(endRun, 1100);
  }
  updateHud();
}

function updateEnemies(dt, now) {
  const player = state.player;
  state.enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    if (enemy.boss) {
      const distance = Math.abs(enemy.x - player.x);
      if (distance < 580) {
        enemy.active = true;
        if (!enemy.alerted) { enemy.alerted = true; showBossAlert(); }
      }
      if (enemy.active && now > enemy.attackAt) {
        const direction = Math.sign(player.x - enemy.x) || -1;
        state.projectiles.push({ x: enemy.x, y: enemy.y + 55, vx: direction * (enemy.final ? 410 : 310), vy: random(-90, 20), r: enemy.final ? 20 : 14, active: true });
        enemy.attackAt = now + (enemy.final ? 720 : 1150);
      }
      return;
    }
    if (Math.abs(enemy.x - player.x) < 700) {
      enemy.x += enemy.vx * dt;
      if (enemy.x < enemy.baseX - 100 || enemy.x > enemy.baseX + 70) enemy.vx *= -1;
    }
    if (rectsOverlap(playerHitbox(24, 18), enemy)) {
      if (player.stomping && player.vy > 0 && player.y + player.h * .72 < enemy.y + enemy.h * .55) {
        hitEnemy(enemy);
        player.stomping = false;
        player.vy = -470;
      } else if (player.invulnerable <= 0) {
        hurtPlayer("敵に激突!");
      }
    }
  });
}

function updateProjectiles(dt) {
  state.projectiles.forEach((projectile) => {
    if (!projectile.active) return;
    projectile.vy += 260 * dt;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    if (projectile.y > VIEW_H + 100 || Math.abs(projectile.x - state.player.x) > 1200) projectile.active = false;
    const hitbox = { x: projectile.x - projectile.r, y: projectile.y - projectile.r, w: projectile.r * 2, h: projectile.r * 2 };
    if (projectile.active && state.player.invulnerable <= 0 && rectsOverlap(playerHitbox(26, 18), hitbox)) {
      projectile.active = false;
      hurtPlayer("弾に当たった!");
    }
  });
  state.projectiles = state.projectiles.filter((projectile) => projectile.active);
}

function updatePickups() {
  state.pickups.forEach((pickup) => {
    if (!pickup.active) return;
    if (rectsOverlap(playerHitbox(-7, -4), pickup)) {
      pickup.active = false;
      state.score += pickup.special ? 700 : 180;
      if (!pickup.special) state.photosCollected += 1;
      burst(pickup.x, pickup.y + 25, "#e3ff38", 12);
      sound("coin");
      if (isOrderPlaying("collect") && state.challenge.targetId === pickup.id) finishOrder(true, "回収!");
      if (!pickup.special && state.photosCollected % 5 === 0 && state.lives < state.maxLives) {
        state.lives += 1;
        burst(state.player.x, state.player.y + 40, "#39eaff", 24);
        sound("clear");
        vibrate([18, 20, 18]);
        els.lives.classList.remove("heal");
        void els.lives.offsetWidth;
        els.lives.classList.add("heal");
      }
      updateHud();
    }
  });
}

function updateArea() {
  const foundArea = AREAS.findIndex((area) => state.player.x < area.end);
  const nextArea = foundArea < 0 ? AREAS.length - 1 : foundArea;
  if (nextArea === state.area) return;
  state.area = nextArea;
  state.checkpoint = AREAS[nextArea].start + 100;
  state.player.invulnerable = Math.max(state.player.invulnerable, 1.8);
  state.score += 1500;
  showAreaBanner(nextArea);
  updateHud();
}

function hurtPlayer(message) {
  const player = state.player;
  if (player.invulnerable > 0 || state.dying) return;
  player.invulnerable = 1.8;
  player.vy = -390;
  player.vx = -player.facing * 240;
  state.lives -= 1;
  state.streak = 0;
  state.flash = .24;
  shakeScreen();
  burst(player.x, player.y + 65, "#ff386c", 18);
  sound("hurt");
  vibrate([55, 35, 70]);
  if (isOrderPlaying("safe")) finishOrder(false, message);
  if (state.lives <= 0) beginGameOver();
  updateHud();
}

function fallOff() {
  if (state.dying) return;
  state.player.x = state.checkpoint;
  state.player.y = GROUND - state.player.h;
  state.player.vx = 0;
  state.player.vy = 0;
  state.cameraX = Math.max(0, state.checkpoint - 260);
  hurtPlayer("落下ァー!");
}

function beginGameOver() {
  if (state.dying) return;
  state.dying = true;
  state.controls.left = false;
  state.controls.right = false;
  window.setTimeout(endRun, 850);
}

function endRun() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(frame);
  const best = Math.max(safeBest(), state.score);
  saveBest(best);
  els.topBest.textContent = padded(best);
  els.finalArea.textContent = AREAS[state.area].name;
  els.finalKills.textContent = state.kills;
  els.finalOrders.textContent = state.orderWins;
  els.finalScore.textContent = padded(state.score);

  const progress = state.player.x / WORLD_END;
  let rank = "D", title = "路地裏ランナー", comment = "走る、跳ぶ、殴る。まずはそこからだ。";
  if (progress >= .2 || state.score >= 5000) [rank, title, comment] = ["C", "写真街の暴走客", "無茶振りに少しだけ反応できる脚になった。"];
  if (progress >= .45 || state.score >= 12000) [rank, title, comment] = ["B", "コード沼の破壊者", "障害物を見ると、先に拳が出る。"];
  if (progress >= .75 || state.score >= 22000) [rank, title, comment] = ["A", "師範ワールド走破者", "ルールが変わるほど速くなる。かなり危険だ。"];
  if (state.won) [rank, title, comment] = ["S", "無茶振りアクション師範", "世界のほうが先に音を上げた。完全走破!"];
  els.rank.textContent = rank;
  els.rankTitle.textContent = title;
  els.resultComment.textContent = comment;
  showScreen(els.result);
}

function shakeScreen() {
  state.shake = .36;
  els.shell.classList.remove("shake");
  void els.shell.offsetWidth;
  els.shell.classList.add("shake");
  window.setTimeout(() => els.shell.classList.remove("shake"), 360);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function insetRect(rect, xInset, yInset) {
  return { x: rect.x + xInset, y: rect.y + yInset, w: rect.w - xInset * 2, h: rect.h - yInset * 2 };
}

function playerHitbox(xInset = 0, yInset = 0) {
  const player = state.player;
  return insetRect({ x: player.x - player.w / 2, y: player.y, w: player.w, h: player.h }, xInset, yInset);
}

function burst(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    state.particles.push({ x, y, vx: random(-260, 260), vy: random(-360, -80), life: random(.35, .75), color, size: random(4, 12) });
  }
}

function updateParticles(dt) {
  state.particles.forEach((particle) => {
    particle.life -= dt;
    particle.vy += 900 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function loop(now) {
  if (!state.playing || state.paused) return;
  const dt = Math.min(.034, (now - state.last) / 1000);
  state.last = now;
  state.time += dt * 1000;
  state.shake = Math.max(0, state.shake - dt);
  state.flash = Math.max(0, state.flash - dt);
  updatePlayer(dt);
  updateEnemies(dt, now);
  updateProjectiles(dt);
  updatePickups();
  updateParticles(dt);
  updateArea();
  updateOrder(now);
  state.cameraX += (clamp(state.player.x - VIEW_W * .31, 0, WORLD_END - VIEW_W) - state.cameraX) * Math.min(1, dt * 5.5);
  state.score += Math.max(0, state.player.vx) * dt * .025;
  if (state.time >= state.nextHudAt) {
    updateHud();
    state.nextHudAt = state.time + 90;
  }
  draw();
  frame = requestAnimationFrame(loop);
}

function drawCover(image, x, y, w, h, target = ctx) {
  if (!image?.complete || !image.naturalWidth) return;
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  target.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function cachedBackground(key) {
  const cacheKey = `${key}-${VIEW_W}-${VIEW_H}`;
  if (backgroundCache.has(cacheKey)) return backgroundCache.get(cacheKey);
  const canvas = document.createElement("canvas");
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  drawCover(images[key], 0, 0, VIEW_W, VIEW_H, canvas.getContext("2d"));
  backgroundCache.set(cacheKey, canvas);
  return canvas;
}

function draw() {
  const area = AREAS[state.area];
  const shakeX = state.shake > 0 ? random(-8, 8) : 0;
  const shakeY = state.shake > 0 ? random(-5, 5) : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
  ctx.drawImage(cachedBackground(area.bg), 0, 0);
  ctx.fillStyle = state.area === 0 ? "rgba(6,5,11,.28)" : "rgba(6,5,11,.42)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  drawParallax(area);
  drawGround(area);
  drawDecorations();
  drawPlatforms(area);
  drawPickups();
  drawEnemies();
  drawProjectiles();
  drawPlayer();
  drawParticles();
  drawBossHealth();

  const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 180, VIEW_W / 2, VIEW_H / 2, 760);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,40,90,${state.flash * 1.5})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}

function drawParallax(area) {
  const offset = -((state.cameraX * .18) % 280);
  ctx.save();
  ctx.globalAlpha = .36;
  ctx.fillStyle = area.color;
  ctx.strokeStyle = area.color;

  if (area.shape === "cable") {
    ctx.lineWidth = 20;
    for (let x = offset - 280; x < VIEW_W + 280; x += 280) {
      ctx.beginPath();
      ctx.moveTo(x - 30, GROUND - 80);
      ctx.bezierCurveTo(x + 30, GROUND - 330, x + 170, GROUND - 20, x + 300, GROUND - 270);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 145, GROUND - 190, 54, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (area.shape === "factory") {
    for (let x = offset - 280; x < VIEW_W + 280; x += 280) {
      ctx.fillRect(x, GROUND - 250, 92, 250);
      ctx.fillRect(x + 112, GROUND - 355, 52, 355);
      ctx.fillRect(x + 184, GROUND - 190, 105, 190);
      ctx.globalAlpha = .18;
      for (let y = GROUND - 225; y < GROUND - 30; y += 42) ctx.fillRect(x + 15, y, 22, 20);
      ctx.globalAlpha = .36;
    }
  } else if (area.shape === "coast") {
    ctx.lineWidth = 34;
    for (let x = offset - 280; x < VIEW_W + 280; x += 280) {
      ctx.beginPath();
      ctx.arc(x + 70, GROUND - 90, 105, Math.PI, Math.PI * 2);
      ctx.arc(x + 230, GROUND - 90, 105, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(x + 70, GROUND - 52, 160, 52);
    }
  } else if (area.shape === "castle") {
    for (let x = offset - 280; x < VIEW_W + 280; x += 280) {
      ctx.fillRect(x + 25, GROUND - 300, 80, 300);
      ctx.fillRect(x + 155, GROUND - 390, 100, 390);
      for (let block = 0; block < 4; block += 1) ctx.fillRect(x + 148 + block * 31, GROUND - 425, 20, 36);
      ctx.fillRect(x + 85, GROUND - 170, 90, 170);
    }
  } else {
    for (let x = offset - 280; x < VIEW_W + 280; x += 280) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND - 115);
      ctx.lineTo(x + 90, GROUND - 260);
      ctx.lineTo(x + 210, GROUND - 150);
      ctx.lineTo(x + 280, GROUND - 330);
      ctx.lineTo(x + 280, GROUND);
      ctx.lineTo(x, GROUND);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGround(area) {
  ctx.fillStyle = "rgba(5,5,10,.92)";
  const start = Math.floor(state.cameraX / 40) * 40;
  for (let worldX = start; worldX < state.cameraX + VIEW_W + 80; worldX += 40) {
    if (!groundAt(worldX + 20)) continue;
    const x = worldX - state.cameraX;
    ctx.fillRect(x, GROUND, 42, VIEW_H - GROUND + 30);
    ctx.fillStyle = area.color;
    ctx.fillRect(x, GROUND, 42, 8);
    ctx.fillStyle = "rgba(5,5,10,.92)";
  }
  ctx.globalAlpha = .28;
  ctx.fillStyle = area.color;
  for (let x = -((state.cameraX * .8) % 80); x < VIEW_W; x += 80) ctx.fillRect(x, GROUND + 38, 35, 4);
  ctx.globalAlpha = 1;
}

function drawPlatforms(area) {
  state.platforms.forEach((platform) => {
    const x = platform.x - state.cameraX;
    if (x < -platform.w || x > VIEW_W) return;
    ctx.fillStyle = "rgba(8,7,14,.94)";
    ctx.fillRect(x, platform.y, platform.w, platform.h);
    ctx.fillStyle = area.color;
    ctx.fillRect(x, platform.y, platform.w, 6);
    for (let bolt = 18; bolt < platform.w; bolt += 38) {
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.fillRect(x + bolt, platform.y + 10, 4, 4);
    }
  });
}

function drawDecorations() {
  state.decorations.forEach((item) => {
    const x = item.x - state.cameraX * .92;
    if (x < -130 || x > VIEW_W + 130) return;
    const image = images[`photo${item.photo}`];
    if (!image) return;
    ctx.save();
    ctx.translate(x, item.y);
    ctx.scale(item.scale || 1, item.scale || 1);
    ctx.rotate(Math.sin(item.x) * .035);
    ctx.fillStyle = item.photo % 2 ? "#fff9e8" : "#e3ff38";
    ctx.fillRect(-54, -72, 108, 144);
    ctx.drawImage(image, -48, -66, 96, 119);
    ctx.fillStyle = "#08070e";
    ctx.fillRect(-35, 59, 70, 5);
    ctx.restore();
  });
}

function drawPickups() {
  state.pickups.forEach((pickup) => {
    if (!pickup.active) return;
    const x = pickup.x - state.cameraX;
    if (x < -80 || x > VIEW_W + 80) return;
    const bob = Math.sin(state.time / 170 + pickup.x) * 8;
    ctx.save();
    ctx.translate(x, pickup.y + bob);
    ctx.shadowColor = pickup.special ? "#e3ff38" : "#39eaff";
    ctx.shadowBlur = pickup.special ? 28 : 13;
    ctx.fillStyle = pickup.special ? "#e3ff38" : "#fff9e8";
    ctx.fillRect(-pickup.w / 2, -pickup.h / 2, pickup.w, pickup.h);
    const image = images[`photo${pickup.photo}`];
    if (image) ctx.drawImage(image, -pickup.w / 2 + 4, -pickup.h / 2 + 4, pickup.w - 8, pickup.h - 17);
    ctx.restore();
  });
}

function drawEnemies() {
  state.enemies.forEach((enemy) => {
    if (!enemy.alive) return;
    const x = enemy.x - state.cameraX;
    if (x < -240 || x > VIEW_W + 240) return;
    ctx.save();
    ctx.translate(x + enemy.w / 2, enemy.y + enemy.h / 2);
    if (enemy.orderTarget) {
      ctx.strokeStyle = "#ff386c";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(enemy.w, enemy.h) * .62 + Math.sin(state.time / 90) * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (enemy.boss) {
      ctx.shadowColor = enemy.final ? "#ff386c" : "#ffae27";
      ctx.shadowBlur = 28;
      ctx.fillStyle = "rgba(8,7,14,.88)";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(enemy.w, enemy.h) * .48, 0, Math.PI * 2);
      ctx.fill();
      const image = images[enemy.final ? "photo3" : `photo${state.area + 1}`];
      if (image) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(enemy.w, enemy.h) * .42, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(image, -enemy.w * .62, -enemy.h * .55, enemy.w * 1.24, enemy.h * 1.18);
        ctx.restore();
      }
      ctx.fillStyle = enemy.final ? "#ff386c" : "#ffae27";
      ctx.font = "950 18px Arial Black";
      ctx.textAlign = "center";
      ctx.fillText(enemy.final ? "FINAL" : "BOSS", 0, enemy.h * .49);
    } else if (enemy.type === "pen") {
      ctx.rotate(-.18);
      ctx.fillStyle = "#39eaff";
      ctx.fillRect(-enemy.w / 2, -enemy.h / 2, enemy.w, enemy.h);
      ctx.fillStyle = "#fff9e8";
      ctx.fillRect(-enemy.w / 2 + 6, -enemy.h / 2 + 9, enemy.w - 12, 18);
      ctx.fillStyle = "#08070e";
      ctx.fillRect(-8, -6, 5, 5);ctx.fillRect(7, -6, 5, 5);
    } else if (enemy.type === "bottle") {
      ctx.fillStyle = "#ffae27";
      ctx.fillRect(-12, -enemy.h / 2, 24, 20);
      ctx.beginPath();
      ctx.roundRect(-enemy.w / 2, -enemy.h / 2 + 16, enemy.w, enemy.h - 16, 13);
      ctx.fill();
      ctx.fillStyle = "#08070e";
      ctx.fillRect(-14, -5, 7, 7);ctx.fillRect(8, -5, 7, 7);
    } else {
      ctx.strokeStyle = "#9b63ff";
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(-enemy.w / 2, 10);
      ctx.bezierCurveTo(-25, -enemy.h, 25, enemy.h, enemy.w / 2, -6);
      ctx.stroke();
      ctx.fillStyle = "#fff9e8";
      ctx.beginPath();ctx.arc(-12,-5,8,0,Math.PI*2);ctx.arc(12,-5,8,0,Math.PI*2);ctx.fill();
      ctx.fillStyle = "#08070e";ctx.beginPath();ctx.arc(-12,-5,3,0,Math.PI*2);ctx.arc(12,-5,3,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  });
}

function drawProjectiles() {
  state.projectiles.forEach((projectile) => {
    const x = projectile.x - state.cameraX;
    ctx.save();
    ctx.translate(x, projectile.y);
    ctx.rotate(state.time / 150);
    ctx.fillStyle = "#ff386c";
    ctx.shadowColor = "#ff386c";
    ctx.shadowBlur = 18;
    for (let point = 0; point < 8; point += 1) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-projectile.r / 3, -projectile.r, projectile.r * .66, projectile.r * 2);
    }
    ctx.restore();
  });
}

function drawPlayer() {
  const player = state.player;
  const x = player.x - state.cameraX;
  const airborne = !player.onGround;
  const running = Math.abs(player.vx) > 55;
  const sprite = player.stomping ? images.back : player.attackTimer > 0 ? images.wing : airborne ? images.wing : running ? images.dash : images.stand;
  const bob = running && player.onGround ? Math.sin(player.runTime * 18) * 7 : 0;
  ctx.save();
  ctx.translate(x, player.y + player.h + bob);
  ctx.scale(player.facing, 1);
  if (player.stomping) ctx.rotate(Math.PI);
  else if (player.attackTimer > 0) ctx.rotate(-player.facing * .12);
  if (player.invulnerable > 0 && Math.floor(state.time / 80) % 2) ctx.globalAlpha = .3;
  ctx.shadowColor = player.attackTimer > 0 ? "#e3ff38" : "rgba(0,0,0,.7)";
  ctx.shadowBlur = player.attackTimer > 0 ? 28 : 18;
  if (sprite) ctx.drawImage(sprite, -player.w * .7, -player.h, player.w * 1.4, player.h);
  else { ctx.fillStyle = "#fff9e8"; ctx.fillRect(-player.w / 2, -player.h, player.w, player.h); }
  if (player.attackTimer > 0) {
    ctx.strokeStyle = "#e3ff38";
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.arc(player.w * .62, -player.h * .52, 52, -1.4, 1.35);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  state.particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - state.cameraX, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
}

function drawBossHealth() {
  const boss = state.enemies.find((enemy) => enemy.boss && enemy.alive && enemy.active && Math.abs(enemy.x - state.player.x) < 800);
  if (!boss) return;
  const width = boss.final ? 520 : 360;
  const x = (VIEW_W - width) / 2;
  ctx.fillStyle = "rgba(7,7,13,.88)";
  ctx.fillRect(x - 5, 35, width + 10, 28);
  ctx.fillStyle = "#ff386c";
  ctx.fillRect(x, 40, width * (boss.hp / boss.maxHp), 18);
  ctx.fillStyle = "#fff9e8";
  ctx.font = "950 13px Arial Black";
  ctx.textAlign = "center";
  ctx.fillText(boss.final ? "FINAL SHIHAN" : "AREA BOSS", VIEW_W / 2, 29);
}

function goHome(event) {
  if (event) event.preventDefault();
  state.playing = false;
  cancelAnimationFrame(frame);
  showScreen(els.title);
  els.topBest.textContent = padded(safeBest());
}

function setControl(control, pressed) {
  if (control === "left" || control === "right") state.controls[control] = pressed;
  if (control === "down") state.controls.down = pressed;
  if (pressed && control === "up") doJump();
  if (pressed && control === "down") doStomp();
  if (pressed && control === "a") doAttack();
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyZ", "Space", "Enter", "KeyP"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyP" && !event.repeat) { togglePause(); return; }
  state.keys?.add(event.code);
  if (event.code === "ArrowUp" && !event.repeat) doJump();
  if (event.code === "ArrowDown" && !event.repeat) doStomp();
  if (["KeyZ", "Space", "Enter"].includes(event.code) && !event.repeat) doAttack();
});

window.addEventListener("keyup", (event) => state.keys?.delete(event.code));
window.addEventListener("blur", () => { if (state.playing && !state.paused) togglePause(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden && state.playing && !state.paused) togglePause(true); });
window.addEventListener("resize", () => { configureCanvas(); if (state.player) draw(); });
els.shell.addEventListener("contextmenu", (event) => event.preventDefault());
els.canvas.addEventListener("pointerdown", (event) => { event.preventDefault(); doJump(); });
els.pause.addEventListener("pointerdown", () => togglePause(false));

$$('[data-control]').forEach((button) => {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("active");
    setControl(control, true);
  });
  const release = (event) => {
    event.preventDefault();
    button.classList.remove("active");
    setControl(control, false);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
});

els.start.addEventListener("click", startRun);
els.retry.addEventListener("click", startRun);
els.home.addEventListener("click", goHome);
els.sound.addEventListener("click", () => {
  muted = !muted;
  els.sound.textContent = muted ? "×" : "♪";
  els.sound.setAttribute("aria-label", muted ? "音を出す" : "音を消す");
});
els.share.addEventListener("click", async () => {
  const sharedUrl = new URL(location.href);
  sharedUrl.searchParams.set("seed", state.world.seed);
  const text = `無茶振り！師範ランで${AREAS[state.area].name}まで到達、${Math.round(state.score)}点！\nWORLD #${state.world.code}\n${sharedUrl}`;
  try { await navigator.clipboard.writeText(text); els.share.textContent = "コピーした!"; }
  catch { window.prompt("結果をコピー", text); }
  window.setTimeout(() => { els.share.textContent = "結果をコピー"; }, 1400);
});

function startTitleReel() {
  let index = 6;
  clearInterval(titleReelTimer);
  titleReelTimer = window.setInterval(() => {
    if (els.title.hidden) return;
    index = (index + 1) % PHOTO_SRCS.length;
    els.titleReel.src = PHOTO_SRCS[index];
  }, 430);
}

loadAssets();
configureCanvas();
resetState();
state.playing = false;
els.topBest.textContent = padded(safeBest());
showScreen(els.title);
startTitleReel();
