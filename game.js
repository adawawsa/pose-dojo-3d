"use strict";

const PHOTO_DB = [
  { src: "assets/pose-1.jpg", pose: "stand", number: "01", position: "50% 28%" },
  { src: "assets/pose-2.jpg", pose: "stand", number: "02", position: "50% 28%" },
  { src: "assets/pose-3.jpg", pose: "wing",  number: "03", position: "50% 28%" },
  { src: "assets/pose-4.jpg", pose: "wing",  number: "04", position: "50% 28%" },
  { src: "assets/pose-5.jpg", pose: "back",  number: "05", position: "50% 30%" },
  { src: "assets/pose-6.jpg", pose: "back",  number: "06", position: "50% 30%" },
  { src: "assets/pose-7.jpg", pose: "dash",  number: "07", position: "50% 31%" },
];

const POSES = {
  stand: { label: "直立", code: "CHOKURITSU", render: "assets/renders/pose-stand.png", color: "#d7ff45" },
  wing:  { label: "翼", code: "TSUBASA", render: "assets/renders/pose-wing.png", color: "#3ee8ff" },
  back:  { label: "背面", code: "USHIRO", render: "assets/renders/pose-back.png", color: "#ff416c" },
  dash:  { label: "突撃", code: "TOTSUMOU", render: "assets/renders/pose-dash.png", color: "#ffae31" },
};

const PRAISE = ["見切った!", "型が美しい!", "完璧!", "速いぞ!", "その調子!", "一本!", "キレてる!", "師範級!"];
const MISS = ["惜しい!", "それじゃない!", "迷うな!", "見切れ!", "型が違う!"];
const GAME_MS = 30000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  body: document.body,
  landing: $("#landing-screen"),
  game: $("#game-screen"),
  result: $("#result-screen"),
  start: $("#start-button"),
  retry: $("#retry-button"),
  share: $("#share-button"),
  sound: $("#sound-toggle"),
  ambient: $("#ambient-photo"),
  score: $("#score"),
  topBest: $("#top-best"),
  combo: $("#combo"),
  time: $("#time"),
  timeTenth: $("#time-tenth"),
  timerFill: $("#timer-fill"),
  roundFill: $("#round-fill"),
  lives: $("#lives"),
  command: $("#command-strip"),
  commandTag: $("#command-tag"),
  commandText: $("#command-text"),
  photoCard: $("#photo-card"),
  photo: $("#photo"),
  photoNumber: $("#photo-number"),
  modelCard: $("#model-card"),
  model: $("#model"),
  modelCaption: $("#model-caption"),
  feedback: $("#feedback"),
  feedbackMain: $("#feedback-main"),
  feedbackSub: $("#feedback-sub"),
  finalScore: $("#final-score"),
  correctCount: $("#correct-count"),
  maxCombo: $("#max-combo"),
  accuracy: $("#accuracy"),
  rankStamp: $("#rank-stamp b"),
  rankName: $("#rank-name"),
  resultQuote: $("#result-quote"),
  resultModel: $("#result-model"),
  particles: $("#particles"),
  landingReel: $("#landing-reel"),
  motionCut: $("#motion-cut"),
  motionFrame: $("#motion-frame"),
  superCutscene: $("#super-cutscene"),
  answers: $$(".answer"),
};

let audioContext = null;
let muted = false;
let animationFrame = 0;
let nextRoundTimer = 0;
let motionTimer = 0;
let state = {};

const MOTION_SEQUENCES = {
  stand: ["assets/pose-1.jpg", "assets/pose-2.jpg", "assets/pose-1.jpg"],
  wing: ["assets/pose-3.jpg", "assets/pose-4.jpg", "assets/pose-3.jpg"],
  back: ["assets/pose-5.jpg", "assets/pose-6.jpg", "assets/pose-5.jpg"],
  dash: ["assets/pose-7.jpg", "assets/pose-1.jpg", "assets/pose-7.jpg"],
};

function safeBest() {
  try { return Number(localStorage.getItem("pose-dojo-best")) || 0; }
  catch { return 0; }
}

function saveBest(score) {
  try { localStorage.setItem("pose-dojo-best", String(score)); }
  catch { /* Private browsing can reject storage; the game still works. */ }
}

function padded(value) {
  return String(Math.max(0, Math.round(value))).padStart(5, "0");
}

function showScreen(screen) {
  [els.landing, els.game, els.result].forEach((section) => { section.hidden = section !== screen; });
}

function initAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function tone(frequency, duration = 0.08, type = "square", volume = 0.035, delay = 0) {
  if (muted) return;
  initAudio();
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function sound(name) {
  if (name === "correct") {
    tone(520, .08, "square", .035);
    tone(780, .11, "square", .03, .065);
  } else if (name === "wrong") {
    tone(145, .17, "sawtooth", .04);
    tone(100, .18, "sawtooth", .03, .06);
  } else if (name === "start") {
    [260, 390, 520, 780].forEach((hz, i) => tone(hz, .1, "square", .03, i * .07));
  } else if (name === "fever") {
    [420, 560, 700, 920].forEach((hz, i) => tone(hz, .13, "triangle", .035, i * .045));
  } else if (name === "tick") {
    tone(850, .035, "square", .018);
  } else if (name === "end") {
    [600, 480, 360, 240].forEach((hz, i) => tone(hz, .15, "triangle", .028, i * .09));
  }
}

function resetState() {
  state = {
    playing: true,
    locked: false,
    score: 0,
    combo: 0,
    maxCombo: 0,
    correct: 0,
    attempts: 0,
    lives: 3,
    round: 0,
    startAt: performance.now(),
    deadline: 0,
    roundStarted: 0,
    roundDuration: 1800,
    currentPhoto: null,
    previousPose: null,
    mode: "normal",
    targetPose: null,
    fever: false,
    lastSecond: 30,
  };
}

function startGame() {
  clearTimeout(nextRoundTimer);
  cancelAnimationFrame(animationFrame);
  initAudio();
  sound("start");
  resetState();
  showScreen(els.game);
  els.body.classList.remove("fever", "screen-shake", "flash-red");
  els.score.textContent = "00000";
  els.combo.textContent = "0";
  [...els.lives.children].forEach((heart) => heart.classList.remove("lost"));
  requestAnimationFrame(() => {
    nextRound();
    animationFrame = requestAnimationFrame(loop);
  });
}

function pickPhoto() {
  let next;
  do { next = PHOTO_DB[Math.floor(Math.random() * PHOTO_DB.length)]; }
  while (next === state.currentPhoto && PHOTO_DB.length > 1);
  return next;
}

function chooseMode() {
  const roll = Math.random();
  if (state.round >= 5 && state.previousPose && roll < .18) return "memory";
  if (state.round >= 7 && roll < .35) return "reverse";
  return "normal";
}

function nextRound() {
  if (!state.playing) return;
  state.round += 1;
  state.locked = false;
  const photo = pickPhoto();
  const oldPose = state.previousPose;
  state.currentPhoto = photo;
  state.mode = chooseMode();
  state.targetPose = state.mode === "memory" ? oldPose : photo.pose;
  state.previousPose = photo.pose;
  state.roundDuration = Math.max(820, 1850 - state.round * 34);
  state.roundStarted = performance.now();
  state.deadline = state.roundStarted + state.roundDuration;

  els.photo.src = photo.src;
  els.photo.style.objectPosition = photo.position;
  els.photoCard.style.backgroundImage = `url("${photo.src}")`;
  els.ambient.src = photo.src;
  els.photoNumber.textContent = `PHOTO ${photo.number}`;
  els.model.src = "assets/renders/pose-gallery.jpg";
  els.model.alt = "まだ回答されていません";
  els.modelCard.classList.remove("revealed");
  els.modelCaption.textContent = "型を選べ";
  els.answers.forEach((button) => button.classList.remove("selected", "wrong"));

  els.photoCard.classList.remove("enter", "memory");
  void els.photoCard.offsetWidth;
  els.photoCard.classList.add("enter");
  els.command.dataset.mode = state.mode;
  if (state.mode === "memory") {
    els.commandTag.textContent = "記憶指令";
    els.commandText.textContent = "ひとつ前のポーズを答えろ！";
    els.photoCard.classList.add("memory");
  } else if (state.mode === "reverse") {
    els.commandTag.textContent = "逆指令";
    els.commandText.textContent = "この写真“以外”のポーズを選べ！";
  } else {
    els.commandTag.textContent = "通常指令";
    els.commandText.textContent = "この写真と同じポーズを選べ！";
  }
}

function isCorrectAnswer(pose) {
  return state.mode === "reverse" ? pose !== state.targetPose : pose === state.targetPose;
}

function answer(pose, timedOut = false) {
  if (!state.playing || state.locked) return;
  state.locked = true;
  state.attempts += 1;
  const button = els.answers.find((item) => item.dataset.pose === pose);
  const correct = !timedOut && isCorrectAnswer(pose);
  const now = performance.now();
  const timeRatio = Math.max(0, (state.deadline - now) / state.roundDuration);

  if (!timedOut) {
    els.model.src = POSES[pose].render;
    els.model.alt = `${POSES[pose].label}ポーズの3Dモデル`;
    els.modelCaption.textContent = `${POSES[pose].label} / ${POSES[pose].code}`;
    els.modelCard.classList.add("revealed");
    button?.classList.add("selected");
  } else {
    const reveal = state.targetPose;
    els.model.src = POSES[reveal].render;
    els.model.alt = `正解の${POSES[reveal].label}ポーズ`;
    els.modelCaption.textContent = `時間切れ / ${POSES[reveal].label}`;
    els.modelCard.classList.add("revealed");
  }

  if (correct) {
    state.correct += 1;
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    const feverMultiplier = state.combo >= 7 ? 2 : 1;
    const gain = Math.round((110 + timeRatio * 170 + state.combo * 9) * feverMultiplier);
    state.score += gain;
    els.feedback.classList.remove("bad");
    els.feedbackMain.textContent = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    els.feedbackSub.textContent = `+${gain}${feverMultiplier > 1 ? "  ×2" : ""}`;
    sound("correct");
    burst(POSES[pose].color, 28);
    playPhotoMotion(pose);
    if (state.combo === 7) {
      state.fever = true;
      els.body.classList.add("fever");
      sound("fever");
      playSuperCutscene();
    }
  } else {
    state.combo = 0;
    state.fever = false;
    state.lives -= 1;
    els.body.classList.remove("fever");
    els.feedback.classList.add("bad");
    els.feedbackMain.textContent = timedOut ? "時間切れ!" : MISS[Math.floor(Math.random() * MISS.length)];
    const answerLabel = state.mode === "reverse" ? "別の型なら正解" : `正解：${POSES[state.targetPose].label}`;
    els.feedbackSub.textContent = answerLabel;
    if (button) button.classList.add("wrong");
    [...els.lives.children].forEach((heart, index) => heart.classList.toggle("lost", index >= state.lives));
    els.lives.setAttribute("aria-label", `残り${state.lives}回`);
    els.body.classList.remove("screen-shake", "flash-red");
    void els.body.offsetWidth;
    els.body.classList.add("screen-shake", "flash-red");
    sound("wrong");
  }

  els.score.textContent = padded(state.score);
  els.combo.textContent = state.combo;
  els.feedback.classList.remove("show");
  void els.feedback.offsetWidth;
  els.feedback.classList.add("show");

  if (state.lives <= 0) {
    nextRoundTimer = window.setTimeout(endGame, 700);
  } else {
    nextRoundTimer = window.setTimeout(nextRound, correct ? (state.combo === 7 ? 980 : 510) : 680);
  }
}

function playPhotoMotion(pose) {
  window.clearInterval(motionTimer);
  const sequence = MOTION_SEQUENCES[pose];
  let frame = 0;
  els.motionFrame.src = sequence[0];
  els.motionCut.classList.remove("show");
  void els.motionCut.offsetWidth;
  els.motionCut.classList.add("show");
  motionTimer = window.setInterval(() => {
    frame += 1;
    if (frame >= sequence.length) {
      window.clearInterval(motionTimer);
      return;
    }
    els.motionFrame.src = sequence[frame];
  }, 105);
}

function playSuperCutscene() {
  // Freeze the 30-second clock during the cinematic so the reward never costs play time.
  state.startAt += 650;
  state.deadline += 650;
  els.superCutscene.classList.remove("show");
  void els.superCutscene.offsetWidth;
  els.superCutscene.classList.add("show");
}

function loop(now) {
  if (!state.playing) return;
  const elapsed = now - state.startAt;
  const remaining = Math.max(0, GAME_MS - elapsed);
  const seconds = remaining / 1000;
  const whole = Math.floor(seconds);
  els.time.textContent = String(whole).padStart(2, "0");
  els.timeTenth.textContent = Math.floor((seconds % 1) * 10);
  els.timerFill.style.transform = `scaleX(${remaining / GAME_MS})`;

  if (whole < state.lastSecond) {
    state.lastSecond = whole;
    if (whole <= 5 && whole > 0) sound("tick");
  }

  if (!state.locked) {
    const roundRemaining = Math.max(0, state.deadline - now);
    els.roundFill.style.transform = `scaleX(${roundRemaining / state.roundDuration})`;
    if (now >= state.deadline) answer(state.targetPose, true);
  }

  if (remaining <= 0) {
    endGame();
    return;
  }
  animationFrame = requestAnimationFrame(loop);
}

function getRank(score) {
  if (score >= 6000) return { grade: "S", name: "伝説のポーズ王", quote: "もはや写真のほうが、あなたに合わせにきている。", model: "dash" };
  if (score >= 4300) return { grade: "A", name: "七変化師範", quote: "キレ、記憶、勢い。三拍子そろった見事な型。", model: "wing" };
  if (score >= 2800) return { grade: "B", name: "居酒屋の星", quote: "その立ち姿、すでに作品。次は師範を狙え。", model: "stand" };
  if (score >= 1500) return { grade: "C", name: "ポーズ見習い", quote: "型は見えている。あとは迷わず叩き込むだけ。", model: "stand" };
  return { grade: "D", name: "道場の見学者", quote: "まずは直立から。師範はいつでも待っている。", model: "back" };
}

function endGame() {
  if (!state.playing) return;
  state.playing = false;
  clearTimeout(nextRoundTimer);
  cancelAnimationFrame(animationFrame);
  els.body.classList.remove("fever");
  sound("end");

  const best = Math.max(safeBest(), state.score);
  saveBest(best);
  els.topBest.textContent = padded(best);
  const rank = getRank(state.score);
  els.finalScore.textContent = padded(state.score);
  els.correctCount.textContent = state.correct;
  els.maxCombo.textContent = state.maxCombo;
  els.accuracy.textContent = `${state.attempts ? Math.round(state.correct / state.attempts * 100) : 0}%`;
  els.rankStamp.textContent = rank.grade;
  els.rankName.textContent = rank.name;
  els.resultQuote.textContent = `「${rank.quote}」`;
  els.resultModel.src = state.score >= 2800 ? "assets/generated-special-v2.png" : "assets/generated-hero-v2.png";
  showScreen(els.result);
  burst(POSES[rank.model].color, 55);
}

function burst(color, count = 25) {
  const originX = window.innerWidth * (.45 + Math.random() * .1);
  const originY = window.innerHeight * .5;
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("i");
    particle.className = "particle";
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 230;
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.setProperty("--color", i % 3 ? color : "#f4f0dc");
    particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * distance + 80}px`);
    particle.style.setProperty("--spin", `${Math.random() * 760 - 380}deg`);
    particle.style.animationDelay = `${Math.random() * 90}ms`;
    els.particles.appendChild(particle);
    window.setTimeout(() => particle.remove(), 900);
  }
}

async function shareResult() {
  const text = `『七変化！ポーズ道場 3D』で ${padded(state.score)}点！ 称号は「${els.rankName.textContent}」でした。`;
  try {
    if (navigator.share) await navigator.share({ title: "七変化！ポーズ道場 3D", text });
    else {
      await navigator.clipboard.writeText(text);
      els.share.textContent = "コピーしました！";
      window.setTimeout(() => { els.share.textContent = "結果をシェア"; }, 1600);
    }
  } catch { /* User cancelled the share sheet. */ }
}

function toggleSound() {
  muted = !muted;
  els.sound.classList.toggle("is-muted", muted);
  els.sound.setAttribute("aria-pressed", String(muted));
  els.sound.setAttribute("aria-label", muted ? "音を出す" : "音を消す");
  if (!muted) sound("correct");
}

els.start.addEventListener("click", startGame);
els.retry.addEventListener("click", startGame);
els.share.addEventListener("click", shareResult);
els.sound.addEventListener("click", toggleSound);
els.answers.forEach((button) => button.addEventListener("click", () => answer(button.dataset.pose)));

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const poseByKey = { Digit1: "stand", Numpad1: "stand", Digit2: "wing", Numpad2: "wing", Digit3: "back", Numpad3: "back", Digit4: "dash", Numpad4: "dash" };
  if (poseByKey[event.code] && state.playing) {
    event.preventDefault();
    answer(poseByKey[event.code]);
  }
  if ((event.code === "Space" || event.code === "Enter") && !state.playing) {
    event.preventDefault();
    startGame();
  }
});

// Decode all assets up front so fast rounds never wait on an image.
[...PHOTO_DB.map((item) => item.src), ...Object.values(POSES).map((item) => item.render)].forEach((src) => {
  const image = new Image();
  image.src = src;
});

let landingFrame = 0;
window.setInterval(() => {
  if (els.landing.hidden) return;
  landingFrame = (landingFrame + 1) % PHOTO_DB.length;
  els.landingReel.src = PHOTO_DB[landingFrame].src;
  els.landingReel.parentElement.classList.remove("kick");
  void els.landingReel.parentElement.offsetWidth;
  els.landingReel.parentElement.classList.add("kick");
}, 420);

state.playing = false;
els.topBest.textContent = padded(safeBest());
