"use strict";

const PHOTOS = [
  { src: "assets/pose-1.jpg", pose: "直立", crop: "50% 27%" },
  { src: "assets/pose-2.jpg", pose: "直立", crop: "50% 27%" },
  { src: "assets/pose-3.jpg", pose: "翼", crop: "50% 26%" },
  { src: "assets/pose-4.jpg", pose: "翼", crop: "50% 26%" },
  { src: "assets/pose-5.jpg", pose: "背面", crop: "50% 30%" },
  { src: "assets/pose-6.jpg", pose: "背面", crop: "50% 30%" },
  { src: "assets/pose-7.jpg", pose: "突撃", crop: "50% 28%" },
];

const RENDERS = {
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
  body: document.body,
  title: $("#title-screen"),
  game: $("#game-screen"),
  result: $("#result-screen"),
  start: $("#start-button"),
  retry: $("#retry-button"),
  share: $("#share-button"),
  sound: $("#sound-button"),
  home: $("#home-link"),
  topBest: $("#top-best"),
  score: $("#score"),
  round: $("#round-number"),
  speed: $("#speed-label"),
  worldName: $("#world-name"),
  lives: $("#life-bar"),
  track: $("#run-track"),
  streak: $("#streak"),
  stage: $("#micro-stage"),
  cabinet: $("#game-cabinet"),
  command: $("#command-card"),
  commandLabel: $("#command-label"),
  commandText: $("#command-text"),
  commandHint: $("#command-hint"),
  flash: $("#result-flash"),
  flashKicker: $("#result-kicker"),
  flashWord: $("#result-word"),
  flashPoints: $("#result-points"),
  speedUp: $("#speed-up"),
  speedUpLabel: $("#speed-up-label"),
  worldDistrict: $("#world-district"),
  bossIntro: $("#boss-intro"),
  control: $("#control-hint"),
  timer: $("#micro-timer-fill"),
  titleReel: $("#title-reel"),
  confetti: $("#confetti"),
  finalRound: $("#final-round"),
  finalWins: $("#final-wins"),
  finalStreak: $("#final-streak"),
  finalScore: $("#final-score"),
  rank: $("#rank-letter"),
  rankTitle: $("#rank-title"),
  resultComment: $("#result-comment"),
};

let state = {};
let raf = 0;
let transitionTimer = 0;
let titleTimer = 0;
let audioContext = null;
let muted = false;

function safeBest() {
  try { return Number(localStorage.getItem("pose-dojo-panic-best")) || 0; }
  catch { return 0; }
}

function saveBest(value) {
  try { localStorage.setItem("pose-dojo-panic-best", String(value)); }
  catch { /* Storage can be disabled without breaking play. */ }
}

function padded(value) {
  return String(Math.max(0, Math.round(value))).padStart(6, "0");
}

function showScreen(screen) {
  [els.title, els.game, els.result].forEach((item) => { item.hidden = item !== screen; });
}

function initAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function tone(frequency, duration = .07, type = "square", volume = .026, delay = 0) {
  if (muted) return;
  initAudio();
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + .007);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + .02);
}

function sound(name) {
  if (name === "command") tone(620, .055, "square", .025);
  if (name === "tap") tone(410 + Math.random() * 100, .035, "square", .018);
  if (name === "start") [260, 390, 520, 780].forEach((hz, index) => tone(hz, .09, "square", .03, index * .055));
  if (name === "success") [520, 720, 980].forEach((hz, index) => tone(hz, .1, "square", .032, index * .055));
  if (name === "fail") [180, 125, 78].forEach((hz, index) => tone(hz, .13, "sawtooth", .033, index * .055));
  if (name === "speed") [420, 560, 710, 920].forEach((hz, index) => tone(hz, .12, "triangle", .032, index * .045));
  if (name === "boss") [110, 110, 160, 220].forEach((hz, index) => tone(hz, .16, "sawtooth", .032, index * .1));
}

function makeContext() {
  const token = state.token;
  return {
    stage: els.stage,
    win: (message) => { if (state.token === token) finishMicrogame(true, message); },
    lose: (message) => { if (state.token === token) finishMicrogame(false, message); },
  };
}

function pointFromEvent(event) {
  const rect = els.stage.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    px: event.clientX - rect.left,
    py: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function stopGame() {
  const targets = ["直立", "翼", "背面", "突撃"];
  const target = pick(targets);
  let index = Math.floor(Math.random() * PHOTOS.length);
  let nextSwap = 0;
  let image;
  return {
    id: "stop",
    command: `${target}で止めろ!`,
    hint: "写真が一致した瞬間にタップ",
    control: "● タップで写真を止める",
    baseDuration: 4700,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="stop-game"><div class="stop-frame"><img src="${PHOTOS[index].src}" alt="切り替わるポーズ写真"></div><b class="stop-target">目標：${target}</b><span class="stop-tap">ここで<br>止める!</span></div>`;
      image = $(".stop-frame img", ctx.stage);
    },
    update(elapsed) {
      if (elapsed >= nextSwap) {
        index = (index + 1) % PHOTOS.length;
        image.src = PHOTOS[index].src;
        image.style.objectPosition = PHOTOS[index].crop;
        nextSwap = elapsed + Math.max(125, 230 / state.speed);
        sound("tap");
      }
    },
    pointerDown() {
      PHOTOS[index].pose === target ? this.ctx.win("ジャストポーズ!") : this.ctx.lose(`${PHOTOS[index].pose}だぞ!`);
    },
    keyDown(event) { if (event.code === "Space" || event.code === "Enter") this.pointerDown(); },
  };
}

function turnGame() {
  let startX = null;
  let image;
  return {
    id: "turn",
    command: "振り向かせろ!",
    hint: "大きく左右へスワイプ",
    control: "↔ スワイプ / ← → キー",
    baseDuration: 4000,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="turn-game"><img class="turn-photo" src="assets/pose-1.jpg" alt="正面を向く師範"><div class="swipe-arrow">← →</div></div>`;
      image = $(".turn-photo", ctx.stage);
    },
    pointerDown(point) { startX = point.px; },
    pointerMove(point) {
      if (startX === null) return;
      image.style.transform = `rotateY(${clamp((point.px - startX) / 3, -38, 38)}deg)`;
    },
    pointerUp(point) {
      if (startX === null) return;
      const distance = Math.abs(point.px - startX);
      startX = null;
      if (distance > Math.min(105, point.width * .22)) {
        image.src = "assets/pose-5.jpg";
        image.classList.add("turned");
        this.ctx.win("こっち見た!");
      } else {
        image.style.transform = "";
      }
    },
    keyDown(event) { if (["ArrowLeft", "ArrowRight"].includes(event.code)) this.ctx.win("こっち見た!"); },
  };
}

function pumpGame() {
  let expected = "left";
  let count = 0;
  let image;
  let meter;
  const hit = (side, ctx) => {
    if (side !== expected) {
      count = Math.max(0, count - 1);
      meter.style.width = `${count / 8 * 100}%`;
      return;
    }
    count += 1;
    expected = expected === "left" ? "right" : "left";
    image.src = count % 2 ? "assets/pose-3.jpg" : "assets/pose-4.jpg";
    meter.style.width = `${count / 8 * 100}%`;
    $$(".tap-zone", ctx.stage).forEach((zone) => zone.classList.toggle("active", zone.dataset.side === side));
    sound("tap");
    if (count >= 8) ctx.win("腕がエンジン!");
  };
  return {
    id: "pump",
    command: "左右交互に押せ!",
    hint: "左・右・左・右…8回",
    control: "L / R を交互にタップ",
    baseDuration: 4800,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="pump-game"><img class="pump-char" src="assets/pose-3.jpg" alt="腕を上げた師範"><button class="tap-zone left" data-side="left"><span>LEFT</span></button><button class="tap-zone right" data-side="right"><span>RIGHT</span></button><div class="pump-meter"><i></i></div></div>`;
      image = $(".pump-char", ctx.stage);
      meter = $(".pump-meter i", ctx.stage);
    },
    pointerDown(point, event) {
      const side = event.target.closest("[data-side]")?.dataset.side || (point.x < 50 ? "left" : "right");
      hit(side, this.ctx);
    },
    keyDown(event) {
      if (["ArrowLeft", "KeyA"].includes(event.code)) hit("left", this.ctx);
      if (["ArrowRight", "KeyD"].includes(event.code)) hit("right", this.ctx);
    },
    onTimeout() { this.ctx.lose(`${8 - count}回たりない!`); },
  };
}

function balanceGame() {
  let angle = random(-18, 18);
  let control = angle > 0 ? .65 : -.65;
  let master;
  let platform;
  let needle;
  return {
    id: "balance",
    command: "まっすぐ保て!",
    hint: "左右に動かして重心を戻す",
    control: "↔ ドラッグ / ← → キー",
    baseDuration: 5000,
    winsOnTimeout: true,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="balance-game"><div class="wind">≋≋ 強風 ≋≋</div><div class="tilt-meter"><i></i></div><img class="balance-master" src="${RENDERS.stand}" alt="バランスを取る3D師範"><div class="balance-platform"></div></div>`;
      master = $(".balance-master", ctx.stage);
      platform = $(".balance-platform", ctx.stage);
      needle = $(".tilt-meter i", ctx.stage);
    },
    pointerMove(point) { control = (point.x - 50) / 50; },
    pointerDown(point) { this.pointerMove(point); },
    keyDown(event) {
      if (event.code === "ArrowLeft") control = clamp(control - .28, -1, 1);
      if (event.code === "ArrowRight") control = clamp(control + .28, -1, 1);
    },
    update(elapsed, dt) {
      const wind = Math.sin(elapsed / 320) * 7 + Math.sin(elapsed / 117) * 3;
      angle += ((control * 42 - angle) * 2.15 + wind) * dt;
      master.style.transform = `translateX(-50%) rotate(${angle}deg)`;
      platform.style.transform = `rotate(${angle * .48}deg)`;
      needle.style.left = `${clamp(50 + angle, 3, 97)}%`;
      if (Math.abs(angle) > 41) this.ctx.lose("転倒ォー!");
    },
    onTimeout() { this.ctx.win("体幹つよすぎ!"); },
  };
}

function dodgeGame() {
  let playerX = 50;
  let spawnAt = 0;
  let pens = [];
  let master;
  const move = (x) => { playerX = clamp(x, 9, 91); if (master) master.style.left = `${playerX}%`; };
  return {
    id: "dodge",
    command: "ペンをよけろ!",
    hint: "師範を左右に動かす",
    control: "↔ ドラッグ / ← → キー",
    baseDuration: 5100,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="dodge-game"><img class="dodge-master" src="${RENDERS.dash}" alt="逃げる3D師範"></div>`;
      master = $(".dodge-master", ctx.stage);
    },
    pointerDown(point) { move(point.x); },
    pointerMove(point) { move(point.x); },
    keyDown(event) {
      if (event.code === "ArrowLeft") move(playerX - 13);
      if (event.code === "ArrowRight") move(playerX + 13);
    },
    update(elapsed, dt) {
      if (elapsed >= spawnAt) {
        const pen = { x: random(8, 92), y: -12, speed: random(54, 72) * state.speed };
        pen.el = document.createElement("i");
        pen.el.className = "flying-pen";
        pen.el.style.setProperty("--pen", pick(["#3ee8ff", "#ff3d70", "#dfff3f", "#ffae31"]));
        pen.el.style.setProperty("--rot", `${random(-24, 24)}deg`);
        $(".dodge-game", this.ctx.stage).append(pen.el);
        pens.push(pen);
        spawnAt = elapsed + Math.max(360, 680 / state.speed);
      }
      pens.forEach((pen) => {
        pen.y += pen.speed * dt;
        pen.el.style.left = `${pen.x}%`;
        pen.el.style.top = `${pen.y}%`;
        if (pen.y > 65 && pen.y < 103 && Math.abs(pen.x - playerX) < 9) this.ctx.lose("ペン刺さった!");
      });
      pens = pens.filter((pen) => {
        if (pen.y < 115) return true;
        pen.el.remove();
        return false;
      });
    },
    onTimeout() { this.ctx.win("紙一重!"); },
  };
}

function catchGame() {
  let playerX = 50;
  let caught = 0;
  let spawnAt = 0;
  let bottles = [];
  let catcher;
  let count;
  const move = (x) => { playerX = clamp(x, 10, 90); if (catcher) catcher.style.left = `${playerX}%`; };
  return {
    id: "catch",
    command: "瓶を受けろ!",
    hint: "3本キャッチで成功",
    control: "↔ 師範を左右に動かす",
    baseDuration: 5600,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="catch-game"><img class="catcher" src="${RENDERS.wing}" alt="瓶を受ける3D師範"><b class="catch-count">0 / 3</b></div>`;
      catcher = $(".catcher", ctx.stage);
      count = $(".catch-count", ctx.stage);
    },
    pointerDown(point) { move(point.x); },
    pointerMove(point) { move(point.x); },
    keyDown(event) {
      if (event.code === "ArrowLeft") move(playerX - 14);
      if (event.code === "ArrowRight") move(playerX + 14);
    },
    update(elapsed, dt) {
      if (elapsed >= spawnAt) {
        const bottle = { x: random(10, 90), y: -10, speed: random(44, 58) * state.speed };
        bottle.el = document.createElement("i");
        bottle.el.className = "falling-bottle";
        bottle.el.textContent = "🍾";
        bottle.el.style.setProperty("--rot", `${random(-38, 38)}deg`);
        $(".catch-game", this.ctx.stage).append(bottle.el);
        bottles.push(bottle);
        spawnAt = elapsed + Math.max(480, 830 / state.speed);
      }
      bottles.forEach((bottle) => {
        bottle.y += bottle.speed * dt;
        bottle.el.style.left = `${bottle.x}%`;
        bottle.el.style.top = `${bottle.y}%`;
        if (!bottle.done && bottle.y > 72 && bottle.y < 100 && Math.abs(bottle.x - playerX) < 13) {
          bottle.done = true;
          bottle.el.remove();
          caught += 1;
          count.textContent = `${caught} / 3`;
          sound("tap");
          if (caught >= 3) this.ctx.win("一滴もこぼさず!");
        }
      });
      bottles = bottles.filter((bottle) => {
        if (!bottle.done && bottle.y < 112) return true;
        bottle.el.remove();
        return false;
      });
    },
    onTimeout() { this.ctx.lose(`あと${3 - caught}本!`); },
  };
}

function shakeGame() {
  let lastX = null;
  let amount = 0;
  let lastKey = null;
  let image;
  let meter;
  const add = (value, ctx) => {
    amount += value;
    meter.style.width = `${clamp(amount / 230 * 100, 0, 100)}%`;
    image.classList.add("shaking");
    if (amount >= 230) ctx.win("ほどけたァ!");
  };
  return {
    id: "shake",
    command: "ケーブルを振りほどけ!",
    hint: "左右に激しくこする",
    control: "↔ 何度も左右スワイプ",
    baseDuration: 4800,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="shake-game"><img class="shake-char" src="assets/pose-7.jpg" alt="ケーブルに絡む師範"><div class="cable"></div><div class="shake-meter"><i></i></div></div>`;
      image = $(".shake-char", ctx.stage);
      meter = $(".shake-meter i", ctx.stage);
    },
    pointerDown(point) { lastX = point.x; },
    pointerMove(point) {
      if (lastX === null) return;
      add(Math.abs(point.x - lastX), this.ctx);
      lastX = point.x;
    },
    pointerUp() { lastX = null; image.classList.remove("shaking"); },
    keyDown(event) {
      if (!["ArrowLeft", "ArrowRight"].includes(event.code) || event.code === lastKey) return;
      lastKey = event.code;
      add(28, this.ctx);
    },
    onTimeout() { this.ctx.lose("コード地獄!"); },
  };
}

function findGame() {
  return {
    id: "find",
    command: "背中を探せ!",
    hint: "7枚から背面写真をタップ",
    control: "● 写真を選ぶ",
    baseDuration: 4400,
    setup(ctx) {
      this.ctx = ctx;
      const cards = shuffle(PHOTOS.map((photo, index) => ({ ...photo, index })));
      ctx.stage.innerHTML = `<div class="find-game"><b class="find-target">背中はどれだ!?</b><div class="photo-grid">${cards.map((photo) => `<button class="photo-tile" data-pose="${photo.pose}" style="--tilt:${random(-3, 3)}deg"><img src="${photo.src}" alt="候補写真"></button>`).join("")}</div></div>`;
    },
    pointerDown(point, event) {
      const tile = event.target.closest(".photo-tile");
      if (!tile) return;
      tile.dataset.pose === "背面" ? this.ctx.win("背中発見!") : this.ctx.lose("顔あるやん!");
    },
  };
}

function jumpGame() {
  let obstacleX = 108;
  let jumpUntil = 0;
  let runner;
  let obstacle;
  const jump = () => {
    if (performance.now() < jumpUntil) return;
    jumpUntil = performance.now() + 660;
    runner.classList.remove("jump");
    void runner.offsetWidth;
    runner.classList.add("jump");
    sound("tap");
  };
  return {
    id: "jump",
    command: "コードを跳べ!",
    hint: "ぶつかる直前にタップ",
    control: "● タップ / Space でジャンプ",
    baseDuration: 4700,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="jump-game"><div class="jump-floor"></div><img class="runner" src="${RENDERS.dash}" alt="走る3D師範"><div class="cable-obstacle"></div><span class="tap-jump">JUMP!</span></div>`;
      runner = $(".runner", ctx.stage);
      obstacle = $(".cable-obstacle", ctx.stage);
    },
    pointerDown: jump,
    keyDown(event) { if (["Space", "ArrowUp"].includes(event.code)) jump(); },
    update(elapsed, dt) {
      obstacleX -= 40 * state.speed * dt;
      obstacle.style.left = `${obstacleX}%`;
      const airborne = performance.now() < jumpUntil;
      if (obstacleX < 31 && obstacleX > 17 && !airborne) this.ctx.lose("足にからんだ!");
      if (obstacleX < -12) this.ctx.win("華麗にクリア!");
    },
  };
}

function chargeGame() {
  let holding = false;
  let held = 0;
  let button;
  let master;
  let ring;
  const down = () => { holding = true; if (button) button.classList.add("down"); };
  const up = (ctx) => {
    if (!holding) return;
    holding = false;
    button.classList.remove("down");
    if (held < 1120) ctx.lose("早すぎるッ!");
  };
  return {
    id: "charge",
    command: "力をためろ!",
    hint: "ボタンを離さず長押し",
    control: "● 長押し / Space長押し",
    baseDuration: 4200,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="charge-game"><div class="energy-ring"></div><img class="charge-master" src="${RENDERS.stand}" alt="力をためる3D師範"><button class="charge-button">長押し!</button></div>`;
      button = $(".charge-button", ctx.stage);
      master = $(".charge-master", ctx.stage);
      ring = $(".energy-ring", ctx.stage);
    },
    pointerDown: down,
    pointerUp() { up(this.ctx); },
    keyDown(event) { if (event.code === "Space" && !event.repeat) down(); },
    keyUp(event) { if (event.code === "Space") up(this.ctx); },
    update(elapsed, dt) {
      if (!holding) return;
      held += dt * 1000;
      const ratio = clamp(held / 1120, 0, 1);
      ring.style.setProperty("--power", `${.12 + ratio * .88}`);
      ring.style.setProperty("--scale", `${.5 + ratio * .72}`);
      master.style.transform = `scale(${1 + ratio * .16})`;
      master.style.filter = `drop-shadow(0 0 ${12 + ratio * 42}px #3ee8ff)`;
      if (ratio >= 1) this.ctx.win("満タン爆発!");
    },
  };
}

function stillGame() {
  let anchor = null;
  return {
    id: "still",
    command: "動くな!",
    hint: "タップもキーも禁止",
    control: "手を止めろ。何もするな。",
    baseDuration: 3200,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="still-game"><img class="still-master" src="assets/pose-1.jpg" alt="静止する師範"><div class="still-crosshair"></div><i class="distraction" style="left:8%;top:15%">👆</i><i class="distraction" style="right:8%;bottom:15%;animation-delay:-.45s">押せ!</i></div>`;
    },
    pointerDown() { this.ctx.lose("動いたァ!"); },
    pointerMove(point) {
      if (!anchor) { anchor = point; return; }
      if (Math.hypot(point.px - anchor.px, point.py - anchor.py) > 42) this.ctx.lose("動いたァ!");
    },
    keyDown() { this.ctx.lose("押したァ!"); },
    onTimeout() { this.ctx.win("静寂の達人!"); },
  };
}

function placeGame() {
  let dragging = false;
  let master;
  const move = (point) => {
    master.style.left = `${point.x}%`;
    master.style.top = `${point.y}%`;
  };
  return {
    id: "place",
    command: "丸に入れろ!",
    hint: "3D師範を中央へドラッグ",
    control: "● つかんで丸へ運ぶ",
    baseDuration: 4700,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="place-game"><div class="place-target"></div><img class="place-master" src="${RENDERS.stand}" alt="運べる3D師範" draggable="false"></div>`;
      master = $(".place-master", ctx.stage);
    },
    pointerDown(point, event) {
      if (!event.target.closest(".place-master")) return;
      dragging = true;
      master.classList.add("dragging");
      move(point);
    },
    pointerMove(point) { if (dragging) move(point); },
    pointerUp(point) {
      if (!dragging) return;
      dragging = false;
      master.classList.remove("dragging");
      Math.abs(point.x - 50) < 14 && Math.abs(point.y - 50) < 19 ? this.ctx.win("収納完了!") : this.ctx.lose("はみ出てる!");
    },
  };
}

function bossGame() {
  let hits = 0;
  let enemy;
  let count;
  let boss;
  const relocate = () => {
    enemy.style.left = `${random(45, 86)}%`;
    enemy.style.top = `${random(10, 70)}%`;
    $("img", enemy).src = pick(PHOTOS).src;
    enemy.style.animation = "none";
    void enemy.offsetWidth;
    enemy.style.animation = "";
  };
  return {
    id: "boss",
    command: "10発たたけ!",
    hint: "逃げる敵を連続タップ",
    control: "● 敵を追って10回タップ",
    baseDuration: 6500,
    minDuration: 4600,
    boss: true,
    setup(ctx) {
      this.ctx = ctx;
      ctx.stage.innerHTML = `<div class="boss-game"><img class="boss-master" src="assets/pose-3.jpg" alt="戦う師範"><button class="enemy"><img src="assets/pose-2.jpg" alt="逃げる敵"></button><b class="boss-count"><small>REMAIN</small>10</b><div class="boss-meter"><i></i></div></div>`;
      boss = $(".boss-game", ctx.stage);
      enemy = $(".enemy", ctx.stage);
      count = $(".boss-count", ctx.stage);
      relocate();
    },
    pointerDown(point, event) {
      if (!event.target.closest(".enemy")) return;
      hits += 1;
      count.innerHTML = `<small>REMAIN</small>${10 - hits}`;
      $(".boss-meter i", this.ctx.stage).style.width = `${hits * 10}%`;
      sound("tap");
      if (hits >= 10) {
        boss.classList.add("special");
        this.ctx.win("必殺・十連打!");
      } else {
        relocate();
      }
    },
    onTimeout() { this.ctx.lose(`あと${10 - hits}発!`); },
  };
}

const GAME_FACTORIES = [
  stopGame,
  turnGame,
  pumpGame,
  balanceGame,
  dodgeGame,
  catchGame,
  shakeGame,
  findGame,
  jumpGame,
  chargeGame,
  stillGame,
  placeGame,
];

const AREAS = [
  { name: "写真村", slug: "photo", games: [stopGame, turnGame, findGame, stillGame, placeGame] },
  { name: "コード沼", slug: "cable", games: [shakeGame, jumpGame, dodgeGame, balanceGame, pumpGame] },
  { name: "ガラクタ工場", slug: "factory", games: [catchGame, dodgeGame, pumpGame, chargeGame, stopGame] },
  { name: "バランス海岸", slug: "beach", games: [balanceGame, jumpGame, stillGame, turnGame, catchGame] },
  { name: "師範城", slug: "castle", games: [placeGame, findGame, chargeGame, pumpGame, dodgeGame, shakeGame] },
];

function areaIndexForRound(round) {
  return Math.min(AREAS.length - 1, Math.floor((round - 1) / 5));
}

function resetState() {
  state = {
    running: true,
    phase: "ready",
    score: 0,
    round: 0,
    wins: 0,
    lives: 4,
    streak: 0,
    maxStreak: 0,
    speed: 1,
    token: 0,
    current: null,
    startedAt: 0,
    deadline: 0,
    duration: 0,
    lastFrame: performance.now(),
    areaIndex: -1,
    areaDeck: [],
    blockResults: [],
  };
}

function fillTrack() {
  els.track.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const result = state.blockResults[index];
    const current = index === (state.round - 1) % 10 && state.phase !== "result";
    const boss = index === 9 ? "boss" : "";
    const status = result === true ? "done" : result === false ? "fail" : current ? "current" : "";
    return `<i class="${boss} ${status}"></i>`;
  }).join("");
}

function updateHud() {
  els.score.textContent = padded(state.score);
  els.round.textContent = state.round;
  els.streak.textContent = state.streak;
  const labels = ["ふつう", "はやい", "爆速", "地獄", "無理"];
  els.speed.textContent = labels[Math.min(labels.length - 1, Math.round((state.speed - 1) / .18))];
  els.worldName.textContent = AREAS[areaIndexForRound(Math.max(1, state.round))].name;
  els.lives.setAttribute("aria-label", `残り${state.lives}回`);
  $$("i", els.lives).forEach((heart, index) => heart.classList.toggle("lost", index >= state.lives));
  fillTrack();
}

function chooseMicrogame() {
  if (state.round % 10 === 0) return bossGame();
  const areaIndex = areaIndexForRound(state.round);
  if (state.areaIndex !== areaIndex || !state.areaDeck.length) {
    state.areaIndex = areaIndex;
    state.areaDeck = shuffle(AREAS[areaIndex].games);
  }
  return state.areaDeck.pop()();
}

function startRun() {
  clearTimeout(transitionTimer);
  cancelAnimationFrame(raf);
  initAudio();
  sound("start");
  resetState();
  showScreen(els.game);
  els.flash.className = "result-flash";
  els.speedUp.classList.remove("show");
  els.bossIntro.classList.remove("show");
  els.stage.className = "micro-stage";
  updateHud();
  nextMicrogame();
  state.lastFrame = performance.now();
  raf = requestAnimationFrame(loop);
}

function nextMicrogame() {
  if (!state.running) return;
  state.round += 1;
  if (state.round % 10 === 1) state.blockResults = [];
  state.speed = Math.min(1.9, 1 + Math.floor((state.round - 1) / 5) * .18);
  state.phase = "intro";
  state.token += 1;
  const area = AREAS[areaIndexForRound(state.round)];
  els.cabinet.dataset.area = area.slug;
  state.current = chooseMicrogame();
  const game = state.current;
  const ctx = makeContext();

  els.stage.className = `micro-stage ${game.id}-stage`;
  game.setup(ctx);
  els.commandLabel.textContent = game.boss ? `${area.name}・師範戦` : `${area.name} / 無茶振り ${String(state.round).padStart(2, "0")}`;
  els.commandText.textContent = game.command;
  els.commandHint.textContent = game.hint;
  els.control.textContent = game.control;
  els.command.classList.remove("hide");
  els.timer.style.transform = "scaleX(1)";
  updateHud();
  sound(game.boss ? "boss" : "command");

  const introTime = game.boss ? 1350 : Math.max(480, 690 / state.speed);
  if (game.boss) {
    els.bossIntro.classList.remove("show");
    void els.bossIntro.offsetWidth;
    els.bossIntro.classList.add("show");
  }
  const token = state.token;
  transitionTimer = window.setTimeout(() => {
    if (!state.running || token !== state.token) return;
    els.bossIntro.classList.remove("show");
    els.command.classList.add("hide");
    state.phase = "play";
    state.duration = Math.max(game.minDuration || 2450, game.baseDuration / state.speed);
    state.startedAt = performance.now();
    state.deadline = state.startedAt + state.duration;
    if (game.start) game.start();
  }, introTime);
}

function finishMicrogame(success, message) {
  if (!state.running || state.phase !== "play") return;
  state.phase = "result";
  const timeLeft = Math.max(0, state.deadline - performance.now());
  let points = 0;
  if (success) {
    state.streak += 1;
    state.wins += 1;
    state.maxStreak = Math.max(state.maxStreak, state.streak);
    points = Math.round((480 + (timeLeft / state.duration) * 620 + state.streak * 55) * state.speed);
    if (state.current.boss) points *= 2;
    state.score += points;
  } else {
    state.lives -= 1;
    state.streak = 0;
  }
  state.blockResults[(state.round - 1) % 10] = success;

  els.stage.classList.add(success ? "success" : "failure");
  els.flash.className = `result-flash ${success ? "" : "bad"}`.trim();
  els.flashKicker.textContent = success ? "SUCCESS" : "MISS";
  els.flashWord.textContent = message || (success ? "できた!" : "失敗!");
  els.flashPoints.textContent = success ? `+${points}` : `残り ${state.lives}`;
  void els.flash.offsetWidth;
  els.flash.classList.add("show");
  sound(success ? "success" : "fail");
  if (success) burstConfetti(state.current.boss ? 48 : 18);
  if (!success) {
    els.body.classList.remove("screen-shake");
    void els.body.offsetWidth;
    els.body.classList.add("screen-shake");
  }
  updateHud();

  const token = state.token;
  transitionTimer = window.setTimeout(() => {
    if (!state.running || token !== state.token) return;
    els.flash.className = "result-flash";
    els.body.classList.remove("screen-shake");
    if (state.lives <= 0) {
      endRun();
      return;
    }
    if (state.round % 5 === 0) {
      showSpeedUp();
    } else {
      nextMicrogame();
    }
  }, state.current.boss ? 1050 : 760);
}

function showSpeedUp() {
  const nextSpeed = Math.min(1.9, state.speed + .18);
  const nextArea = AREAS[Math.min(AREAS.length - 1, areaIndexForRound(state.round + 1))];
  els.worldDistrict.textContent = nextArea.name;
  els.speedUpLabel.textContent = `SPEED ×${nextSpeed.toFixed(1)}`;
  els.speedUp.classList.remove("show");
  void els.speedUp.offsetWidth;
  els.speedUp.classList.add("show");
  sound("speed");
  transitionTimer = window.setTimeout(() => {
    els.speedUp.classList.remove("show");
    nextMicrogame();
  }, 930);
}

function loop(now) {
  if (!state.running) return;
  const dt = Math.min(.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  if (state.phase === "play") {
    const elapsed = now - state.startedAt;
    const remaining = clamp((state.deadline - now) / state.duration, 0, 1);
    els.timer.style.transform = `scaleX(${remaining})`;
    if (state.current.update) state.current.update(elapsed, dt);
    if (now >= state.deadline && state.phase === "play") {
      if (state.current.onTimeout) state.current.onTimeout();
      else if (state.current.winsOnTimeout) finishMicrogame(true, "耐えた!");
      else finishMicrogame(false, "時間切れ!");
    }
  }
  raf = requestAnimationFrame(loop);
}

function endRun() {
  state.running = false;
  state.phase = "ended";
  cancelAnimationFrame(raf);
  clearTimeout(transitionTimer);
  const best = Math.max(safeBest(), state.score);
  saveBest(best);
  els.topBest.textContent = padded(best);
  els.finalRound.textContent = state.round;
  els.finalWins.textContent = state.wins;
  els.finalStreak.textContent = state.maxStreak;
  els.finalScore.textContent = padded(state.score);

  let rank = "D";
  let title = "見習いの見習い";
  let comment = "失敗はオチ。もう一回なら、それはネタになる。";
  if (state.round >= 7) [rank, title, comment] = ["C", "無茶振り耐性あり", "指示を読む前に、指がちょっと動きはじめた。"];
  if (state.round >= 13) [rank, title, comment] = ["B", "高速ポーズ芸人", "写真と3D師範を、だいぶ手なずけている。"];
  if (state.round >= 21) [rank, title, comment] = ["A", "無茶振り免許皆伝", "考えるより速い。その反射神経はもう芸だ。"];
  if (state.round >= 31) [rank, title, comment] = ["S", "伝説のポーズ師範", "無茶振りのほうが、あなたを恐れている。"];
  els.rank.textContent = rank;
  els.rankTitle.textContent = title;
  els.resultComment.textContent = comment;
  showScreen(els.result);
  if (rank === "S" || rank === "A") burstConfetti(80);
}

function burstConfetti(count) {
  const colors = ["#ff3d70", "#3ee8ff", "#dfff3f", "#ffae31", "#f7f1dc"];
  for (let index = 0; index < count; index += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.left = `${random(18, 82)}%`;
    piece.style.top = `${random(35, 65)}%`;
    piece.style.setProperty("--c", pick(colors));
    piece.style.setProperty("--dx", `${random(-280, 280)}px`);
    piece.style.setProperty("--dy", `${random(-260, 300)}px`);
    piece.style.setProperty("--r", `${random(-720, 720)}deg`);
    els.confetti.append(piece);
    window.setTimeout(() => piece.remove(), 850);
  }
}

function goHome(event) {
  if (event) event.preventDefault();
  state.running = false;
  clearTimeout(transitionTimer);
  cancelAnimationFrame(raf);
  showScreen(els.title);
  els.topBest.textContent = padded(safeBest());
}

function dispatchPointer(name, event) {
  if (!state.running || state.phase !== "play" || !state.current?.[name]) return;
  event.preventDefault();
  if (name === "pointerDown") {
    try { els.stage.setPointerCapture(event.pointerId); } catch { /* Optional on synthetic events. */ }
  }
  state.current[name](pointFromEvent(event), event);
}

els.stage.addEventListener("pointerdown", (event) => dispatchPointer("pointerDown", event));
els.stage.addEventListener("pointermove", (event) => dispatchPointer("pointerMove", event));
els.stage.addEventListener("pointerup", (event) => dispatchPointer("pointerUp", event));
els.stage.addEventListener("pointercancel", (event) => dispatchPointer("pointerUp", event));

window.addEventListener("keydown", (event) => {
  if (!state.running || state.phase !== "play" || !state.current?.keyDown) return;
  if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.code)) event.preventDefault();
  state.current.keyDown(event);
});

window.addEventListener("keyup", (event) => {
  if (!state.running || state.phase !== "play" || !state.current?.keyUp) return;
  state.current.keyUp(event);
});

els.start.addEventListener("click", startRun);
els.retry.addEventListener("click", startRun);
els.home.addEventListener("click", goHome);
els.sound.addEventListener("click", () => {
  muted = !muted;
  els.sound.textContent = muted ? "×" : "♪";
  els.sound.setAttribute("aria-label", muted ? "音を出す" : "音を消す");
  if (!muted) sound("tap");
});

els.share.addEventListener("click", async () => {
  const text = `無茶振り！ポーズ道場で${state.round}本到達、${state.score}点、ランク${els.rank.textContent}！\n${location.href}`;
  try {
    await navigator.clipboard.writeText(text);
    els.share.textContent = "コピーした!";
  } catch {
    window.prompt("結果をコピー", text);
  }
  window.setTimeout(() => { els.share.textContent = "結果をコピー"; }, 1400);
});

function startTitleReel() {
  let index = 0;
  clearInterval(titleTimer);
  titleTimer = window.setInterval(() => {
    if (els.title.hidden) return;
    index = (index + 1) % PHOTOS.length;
    els.titleReel.src = PHOTOS[index].src;
    els.titleReel.style.objectPosition = PHOTOS[index].crop;
    els.titleReel.style.animation = "none";
    void els.titleReel.offsetWidth;
    els.titleReel.style.animation = "reel .3s ease";
  }, 420);
}

[
  ...PHOTOS.map((photo) => photo.src),
  ...Object.values(RENDERS),
  "assets/generated-hero-v2.png",
  "assets/generated-arena-v2.png",
  "assets/generated-special-v2.png",
  "assets/generated-shihan-world-v1.png",
].forEach((src) => { const image = new Image(); image.src = src; });

resetState();
state.running = false;
els.topBest.textContent = padded(safeBest());
showScreen(els.title);
startTitleReel();
