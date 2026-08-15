"use strict";

let VIEW_W = 1280;
const VIEW_H = 720;
const GROUND = 610;
const WorldForge = window.ShihanWorldForge;
if (!WorldForge) throw new Error("worlds.js must be loaded before game.js");
let AREAS = [];
let WORLD_END = 1;

const ASSET_SRCS = {
  pixelHero: "assets/pixel-hero-sheet-v1.png",
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
  treasureCount: $("#treasure-count"),
  lives: $("#life-bar"),
  shell: $("#action-shell"),
  canvas: $("#action-canvas"),
  areaBanner: $("#area-banner"),
  areaBannerNumber: $("#area-banner-number"),
  areaBannerName: $("#area-banner-name"),
  bossAlert: $("#boss-alert"),
  pause: $("#pause-card"),
  mission: $("#mission-text"),
  finalArea: $("#final-area"),
  finalKills: $("#final-kills"),
  finalTreasures: $("#final-treasures"),
  finalScore: $("#final-score"),
  rank: $("#rank-letter"),
  rankTitle: $("#rank-title"),
  resultComment: $("#result-comment"),
};

const ctx = els.canvas.getContext("2d");
const images = {};
let assetsReady = null;
let state = {};
let frame = 0;
let audioContext = null;
let muted = false;

function loadAssets() {
  if (assetsReady) return assetsReady;
  const entries = Object.entries(ASSET_SRCS);
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
  ctx.imageSmoothingEnabled = false;
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
    treasures: 0,
    kills: 0,
    area: 0,
    checkpoint: 120,
    cameraX: 0,
    time: 0,
    nextHudAt: 0,
    last: performance.now(),
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
  [els.areaBanner, els.bossAlert, els.pause].forEach((el) => { el.className = el.className.split(" ")[0]; });
}

function updateHud() {
  const area = AREAS[state.area];
  els.score.textContent = padded(state.score);
  els.areaNumber.textContent = `AREA ${state.area + 1}`;
  els.areaName.textContent = area.name;
  const percent = clamp((state.player.x / WORLD_END) * 100, 0, 100);
  els.progress.style.width = `${percent}%`;
  els.distance.textContent = `${Math.floor(percent)}%`;
  els.treasureCount.textContent = state.treasures;
  els.lives.setAttribute("aria-label", `残り${state.lives}回`);
  $$("i", els.lives).forEach((heart, index) => heart.classList.toggle("lost", index >= state.lives));
  els.mission.innerHTML = `<b>AREA ${state.area + 1}</b> ${area.mission}<em>WORLD #${state.world.code}</em>`;
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
}

function doJump() {
  if (!state.playing || state.paused || state.dying) return;
  const player = state.player;
  if (player.onGround || player.coyoteTime > 0) performJump();
  else player.jumpBuffer = .18;
}

function doStomp() {
  if (!state.playing || state.paused || state.dying) return;
  const player = state.player;
  if (player.onGround) return;
  player.stomping = true;
  player.vy = 880;
  sound("hit");
}

function doAttack() {
  if (!state.playing || state.paused || state.dying) return;
  const player = state.player;
  if (player.attackCooldown > 0) return;
  player.attackTimer = .3;
  player.attackCooldown = .24;
  player.attackId += 1;
  sound("hit");
}

function playerDirection() {
  const left = state.controls.left || state.keys.has("ArrowLeft");
  const right = state.controls.right || state.keys.has("ArrowRight");
  return (right ? 1 : 0) - (left ? 1 : 0);
}

function updatePlayer(dt) {
  const player = state.player;
  const direction = playerDirection();
  const maxSpeed = direction > 0 ? 410 : 365;
  if (direction) {
    player.vx += direction * 2100 * dt;
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
      state.score += 220;
      state.treasures += 1;
      burst(pickup.x, pickup.y + 25, "#e3ff38", 12);
      sound("coin");
      if (state.treasures % 8 === 0 && state.lives < state.maxLives) {
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
  state.flash = .24;
  shakeScreen();
  burst(player.x, player.y + 65, "#ff386c", 18);
  sound("hurt");
  vibrate([55, 35, 70]);
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
  els.finalTreasures.textContent = state.treasures;
  els.finalScore.textContent = padded(state.score);

  const progress = state.player.x / WORLD_END;
  let rank = "D", title = "路地裏ランナー", comment = "走る、跳ぶ、殴る。まずはそこからだ。";
  if (progress >= .2 || state.score >= 5000) [rank, title, comment] = ["C", "歯車街の拳士", "パンチの間合いが見えてきた。"];
  if (progress >= .45 || state.score >= 12000) [rank, title, comment] = ["B", "宝石ハンター", "高い足場の宝石まで逃さない。"];
  if (progress >= .75 || state.score >= 22000) [rank, title, comment] = ["A", "師範ワールド走破者", "ボスを見ると先に拳が出る。かなり強い。"];
  if (state.won) [rank, title, comment] = ["S", "ドット拳の大師範", "5地区を完全走破。世界のほうが先に音を上げた!"];
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
  state.cameraX += (clamp(state.player.x - VIEW_W * .31, 0, WORLD_END - VIEW_W) - state.cameraX) * Math.min(1, dt * 5.5);
  state.score += Math.max(0, state.player.vx) * dt * .025;
  if (state.time >= state.nextHudAt) {
    updateHud();
    state.nextHudAt = state.time + 90;
  }
  draw();
  frame = requestAnimationFrame(loop);
}

function drawSky(area) {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, area.skyTop);
  sky.addColorStop(1, area.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const celestialX = VIEW_W * .78 - state.cameraX * .025;
  const celestialY = 120 + state.area * 9;
  ctx.save();
  ctx.globalAlpha = .82;
  ctx.fillStyle = state.area === 2 ? "#ffae27" : state.area === 3 ? "#dffbff" : "#fff4a8";
  ctx.shadowColor = area.color;
  ctx.shadowBlur = 35;
  ctx.beginPath();
  ctx.arc(celestialX, celestialY, state.area === 4 ? 72 : 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = .45;
  ctx.fillStyle = "#fff9e8";
  const starOffset = (state.cameraX * .06) % 160;
  for (let x = -starOffset; x < VIEW_W + 160; x += 160) {
    const y = 45 + (Math.abs(Math.sin(x * .031 + state.area)) * 210);
    ctx.fillRect(Math.round(x), Math.round(y), 4, 4);
    ctx.fillRect(Math.round(x + 52), Math.round(y + 38), 2, 2);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  const area = AREAS[state.area];
  const shakeX = state.shake > 0 ? random(-8, 8) : 0;
  const shakeY = state.shake > 0 ? random(-5, 5) : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-20, -20, VIEW_W + 40, VIEW_H + 40);
  drawSky(area);

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

  if (area.shape === "city") {
    for (let x = offset - 280; x < VIEW_W + 280; x += 280) {
      const heights = [230, 340, 185, 285];
      heights.forEach((height, index) => {
        const left = x + index * 72;
        ctx.fillRect(left, GROUND - height, 58, height);
        ctx.save();
        ctx.globalAlpha = .65;
        ctx.fillStyle = "#fff4a8";
        for (let y = GROUND - height + 24; y < GROUND - 30; y += 38) ctx.fillRect(left + 15, y, 9, 13);
        ctx.restore();
      });
    }
  } else if (area.shape === "cable") {
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
    if (x < -180 || x > VIEW_W + 180) return;
    const color = AREAS[item.area]?.color || "#39eaff";
    ctx.save();
    ctx.translate(x, item.y);
    ctx.scale(item.scale || 1, item.scale || 1);
    ctx.globalAlpha = .72;
    ctx.fillStyle = "#0b0a16";
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    if (item.kind === "tower") {
      ctx.fillRect(-46, -145, 92, 250);
      ctx.strokeRect(-46, -145, 92, 250);
      ctx.fillStyle = color;
      for (let y = -114; y < 82; y += 45) {
        ctx.fillRect(-28, y, 14, 20);
        ctx.fillRect(14, y, 14, 20);
      }
      ctx.beginPath();
      ctx.moveTo(-56, -145); ctx.lineTo(0, -205); ctx.lineTo(56, -145); ctx.closePath(); ctx.fill();
    } else if (item.kind === "pipe") {
      ctx.lineWidth = 25;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(-62, 105); ctx.lineTo(-62, -70); ctx.lineTo(48, -70); ctx.lineTo(48, -135); ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(25, -160, 47, 30);
      ctx.fillRect(-84, 82, 44, 30);
    } else if (item.kind === "sign") {
      ctx.fillRect(-9, -5, 18, 130);
      ctx.fillRect(-70, -108, 140, 104);
      ctx.strokeRect(-70, -108, 140, 104);
      ctx.fillStyle = color;
      ctx.font = "950 39px Arial Black";
      ctx.textAlign = "center";
      ctx.fillText(item.area === 4 ? "師" : "→", 0, -42);
    } else {
      ctx.fillRect(-62, -28, 124, 124);
      ctx.strokeRect(-62, -28, 124, 124);
      ctx.beginPath();
      ctx.moveTo(-58, -23); ctx.lineTo(58, 91); ctx.moveTo(58, -23); ctx.lineTo(-58, 91); ctx.stroke();
    }
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
    ctx.translate(x + pickup.w / 2, pickup.y + pickup.h / 2 + bob);
    ctx.scale(.78 + Math.abs(Math.sin(state.time / 230 + pickup.x)) * .22, 1);
    const palette = ["#39eaff", "#e3ff38", "#ff386c", "#ffae27"];
    const color = palette[pickup.gem % palette.length];
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -31); ctx.lineTo(24, -8); ctx.lineTo(14, 24); ctx.lineTo(0, 34); ctx.lineTo(-14, 24); ctx.lineTo(-24, -8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.beginPath();
    ctx.moveTo(0, -24); ctx.lineTo(15, -7); ctx.lineTo(3, -2); ctx.lineTo(-6, 18); ctx.lineTo(-14, -7); ctx.closePath();
    ctx.fill();
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
    if (enemy.boss) {
      const bossColor = enemy.final ? "#ff386c" : "#ffae27";
      const pulse = Math.sin(state.time / 120) * 5;
      ctx.shadowColor = bossColor;
      ctx.shadowBlur = 28;
      ctx.fillStyle = "#090812";
      ctx.strokeStyle = bossColor;
      ctx.lineWidth = enemy.final ? 11 : 8;
      ctx.beginPath();
      ctx.roundRect(-enemy.w * .46, -enemy.h * .45, enemy.w * .92, enemy.h * .82, 24);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = bossColor;
      ctx.fillRect(-enemy.w * .34, -enemy.h * .22, enemy.w * .68, enemy.h * .24);
      ctx.fillStyle = "#fff9e8";
      ctx.fillRect(-enemy.w * .22, -enemy.h * .14, enemy.w * .12, enemy.h * .08);
      ctx.fillRect(enemy.w * .1, -enemy.h * .14, enemy.w * .12, enemy.h * .08);
      ctx.fillStyle = "#090812";
      ctx.fillRect(-enemy.w * .18 + pulse * .15, -enemy.h * .115, enemy.w * .055, enemy.h * .035);
      ctx.fillRect(enemy.w * .14 + pulse * .15, -enemy.h * .115, enemy.w * .055, enemy.h * .035);
      ctx.fillStyle = bossColor;
      ctx.beginPath();
      ctx.moveTo(-enemy.w * .24, enemy.h * .09); ctx.lineTo(0, enemy.h * .22); ctx.lineTo(enemy.w * .24, enemy.h * .09); ctx.closePath(); ctx.fill();
      ctx.fillRect(-enemy.w * .62, -enemy.h * .18, enemy.w * .18, enemy.h * .38);
      ctx.fillRect(enemy.w * .44, -enemy.h * .18, enemy.w * .18, enemy.h * .38);
      ctx.fillStyle = "#fff9e8";
      ctx.font = `950 ${enemy.final ? 42 : 29}px Arial Black`;
      ctx.textAlign = "center";
      ctx.fillText(enemy.final ? "師" : "門", 0, enemy.h * .04);
      ctx.fillStyle = bossColor;
      ctx.font = "950 16px Arial Black";
      ctx.fillText(enemy.final ? "FINAL SHIHAN" : "AREA BOSS", 0, enemy.h * .48);
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
  let frameIndex = 0;
  if (player.invulnerable > 1.25) frameIndex = 7;
  else if (player.stomping) frameIndex = 6;
  else if (player.attackTimer > .22) frameIndex = 4;
  else if (player.attackTimer > 0) frameIndex = 5;
  else if (airborne) frameIndex = 3;
  else if (running) frameIndex = Math.floor(player.runTime * 10) % 2 ? 1 : 2;
  const bob = running && player.onGround ? Math.sin(player.runTime * 20) * 3 : 0;
  ctx.save();
  ctx.translate(x, player.y + player.h + bob);
  ctx.scale(player.facing, 1);
  if (player.invulnerable > 0 && Math.floor(state.time / 80) % 2) ctx.globalAlpha = .3;
  ctx.shadowColor = player.attackTimer > 0 ? "#e3ff38" : "rgba(0,0,0,.7)";
  ctx.shadowBlur = player.attackTimer > 0 ? 28 : 18;
  const sheet = images.pixelHero;
  if (sheet?.naturalWidth) {
    const cellW = sheet.naturalWidth / 4;
    const cellH = sheet.naturalHeight / 2;
    const column = frameIndex % 4;
    const row = Math.floor(frameIndex / 4);
    const drawW = 174;
    const drawH = 232;
    ctx.drawImage(sheet, column * cellW, row * cellH, cellW, cellH, -drawW / 2, -drawH + 27, drawW, drawH);
  } else {
    ctx.fillStyle = "#fff9e8";
    ctx.fillRect(-player.w / 2, -player.h, player.w, player.h);
  }
  if (player.attackTimer > 0 && player.attackTimer < .22) {
    ctx.strokeStyle = "#e3ff38";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(player.w * .8, -player.h * .54, 45, -1.35, 1.25);
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
  const text = `師範ワールド2Dで${AREAS[state.area].name}まで到達、宝石${state.treasures}個、${Math.round(state.score)}点！\nWORLD #${state.world.code}\n${sharedUrl}`;
  try { await navigator.clipboard.writeText(text); els.share.textContent = "コピーした!"; }
  catch { window.prompt("結果をコピー", text); }
  window.setTimeout(() => { els.share.textContent = "結果をコピー"; }, 1400);
});

loadAssets();
configureCanvas();
resetState();
state.playing = false;
els.topBest.textContent = padded(safeBest());
showScreen(els.title);
