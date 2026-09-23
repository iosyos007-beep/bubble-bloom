import { BubbleGame, COLORS, COLS, DIFFICULTIES, MAX_LEVELS } from "./engine.js";

const STORAGE_KEY = "bubble-bloom-progress-v1";
const colorMap = new Map(COLORS.map((color) => [color.id, color]));
const screens = {
  menu: document.querySelector("#menuScreen"),
  levels: document.querySelector("#levelsScreen"),
  game: document.querySelector("#gameScreen")
};
const canvas = document.querySelector("#gameCanvas");
const stage = document.querySelector("#gameStage");
const context = canvas.getContext("2d");
const resultDialog = document.querySelector("#resultDialog");

let progress = loadProgress();
let game = null;
let metrics = null;
let pointer = null;
let projectile = null;
let particles = [];
let animationFrame = 0;
let lastFrame = 0;
let toastTimer = 0;
let audioContext = null;

function savedCount(value, fallback = 1) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : fallback;
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      unlocked: Math.min(MAX_LEVELS, Math.max(1, Number(saved?.unlocked) || 1)),
      completed: saved?.completed && typeof saved.completed === "object" ? saved.completed : {},
      difficulty: DIFFICULTIES[saved?.difficulty] ? saved.difficulty : "relaxed",
      sound: saved?.sound !== false,
      inventory: {
        bomb: savedCount(saved?.inventory?.bomb),
        rainbow: savedCount(saved?.inventory?.rainbow),
        aim: savedCount(saved?.inventory?.aim)
      }
    };
  } catch (error) {
    console.warn("Saved progress could not be read and was reset.", error);
    localStorage.removeItem(STORAGE_KEY);
    return { unlocked: 1, completed: {}, difficulty: "relaxed", sound: true, inventory: { bomb: 1, rainbow: 1, aim: 1 } };
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function showScreen(name) {
  Object.entries(screens).forEach(([screenName, element]) => element.classList.toggle("active", screenName === name));
  document.querySelector(".topbar").hidden = name === "menu";
  if (name !== "game") cancelAnimationFrame(animationFrame);
}

function renderMenu() {
  const select = document.querySelector("#difficultySelect");
  select.value = progress.difficulty;
  document.querySelector("#continueButton").textContent = `Play level ${progress.unlocked}`;
  document.querySelector("#soundButton").textContent = progress.sound ? "♪" : "×";
}

function renderLevels() {
  const grid = document.querySelector("#levelGrid");
  grid.replaceChildren();
  for (let level = 1; level <= MAX_LEVELS; level += 1) {
    const button = document.createElement("button");
    const complete = Boolean(progress.completed[level]);
    const locked = level > progress.unlocked;
    button.className = `level-button${complete ? " completed" : ""}${level === progress.unlocked ? " current" : ""}${locked ? " locked" : ""}`;
    button.disabled = locked;
    button.innerHTML = `${complete ? "★" : level}<small>${complete ? `${progress.completed[level].toLocaleString()} PTS` : locked ? "LOCKED" : "PLAY"}</small>`;
    button.addEventListener("click", () => startLevel(level));
    grid.append(button);
  }
}

function startLevel(level) {
  game = new BubbleGame({ level, difficulty: progress.difficulty, inventory: progress.inventory });
  pointer = null;
  projectile = null;
  particles = [];
  document.querySelector("#levelLabel").textContent = `Level ${level}`;
  document.querySelector("#difficultyLabel").textContent = DIFFICULTIES[progress.difficulty].label;
  resultDialog.close();
  showScreen("game");
  resizeCanvas();
  updateHud();
  lastFrame = performance.now();
  animationFrame = requestAnimationFrame(frame);
}

function resizeCanvas() {
  if (!game) return;
  const rect = stage.getBoundingClientRect();
  const density = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * density);
  canvas.height = Math.round(rect.height * density);
  context.setTransform(density, 0, 0, density, 0, 0);
  const radius = Math.min(rect.width / (COLS * 2 + 1), rect.height / 23);
  metrics = {
    width: rect.width,
    height: rect.height,
    radius,
    rowHeight: radius * 1.72,
    top: radius + 6,
    shooterX: rect.width / 2,
    shooterY: rect.height - radius * 1.5
  };
}

function cellPosition(row, col) {
  const boardWidth = metrics.radius * 2 * COLS + metrics.radius;
  const left = (metrics.width - boardWidth) / 2 + metrics.radius;
  return {
    x: left + col * metrics.radius * 2 + (row % 2 ? metrics.radius : 0),
    y: metrics.top + row * metrics.rowHeight
  };
}

function positionToCell(x, y) {
  const row = Math.max(0, Math.round((y - metrics.top) / metrics.rowHeight));
  const boardWidth = metrics.radius * 2 * COLS + metrics.radius;
  const left = (metrics.width - boardWidth) / 2 + metrics.radius;
  const col = Math.round((x - left - (row % 2 ? metrics.radius : 0)) / (metrics.radius * 2));
  return [row, col];
}

function updateHud() {
  document.querySelector("#scoreValue").textContent = game.score.toLocaleString();
  document.querySelector("#shotsValue").textContent = game.shotsLeft;
  document.querySelector("#levelProgress").style.width = `${(1 - game.remainingRatio) * 100}%`;
  for (const power of ["bomb", "rainbow", "aim"]) {
    document.querySelector(`#${power}Count`).textContent = game.inventory[power];
    const button = document.querySelector(`[data-power="${power}"]`);
    button.disabled = game.inventory[power] <= 0 || Boolean(projectile);
    button.classList.toggle("selected", game.selectedPower === power);
  }
}

function frame(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.035);
  lastFrame = now;
  updateProjectile(delta);
  updateParticles(delta);
  draw();
  animationFrame = requestAnimationFrame(frame);
}

function draw() {
  context.clearRect(0, 0, metrics.width, metrics.height);
  drawBackdrop();
  for (const bubble of game.bubbles) {
    const position = cellPosition(bubble.row, bubble.col);
    drawBubble(position.x, position.y, metrics.radius * 0.92, bubble.color, bubble.perk);
  }
  drawAimGuide();
  drawShooter();
  for (const particle of particles) drawParticle(particle);
  if (projectile) drawBubble(projectile.x, projectile.y, metrics.radius * 0.9, projectile.color, projectile.power === "bomb" ? "bomb" : null);
}

function drawBackdrop() {
  const gradient = context.createLinearGradient(0, 0, 0, metrics.height);
  gradient.addColorStop(0, "rgba(26, 56, 112, .48)");
  gradient.addColorStop(1, "rgba(6, 14, 42, .15)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, metrics.width, metrics.height);

  context.fillStyle = "rgba(255,255,255,.025)";
  for (let x = 16; x < metrics.width; x += 34) {
    for (let y = 14; y < metrics.height; y += 34) {
      context.beginPath();
      context.arc(x, y, 1.2, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawBubble(x, y, radius, colorId, perk = null) {
  const color = colorMap.get(colorId) || colorMap.get("cyan");
  const gradient = context.createRadialGradient(x - radius * 0.35, y - radius * 0.4, radius * 0.08, x, y, radius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.1, color.fill);
  gradient.addColorStop(0.72, color.fill);
  gradient.addColorStop(1, color.shade);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = "rgba(255,255,255,.28)";
  context.lineWidth = Math.max(1, radius * 0.06);
  context.stroke();

  if (perk) {
    const symbols = { bomb: "✹", rainbow: "◆", aim: "⌖" };
    context.font = `900 ${radius * 0.85}px system-ui`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ffffff";
    context.shadowColor = "rgba(0,0,0,.45)";
    context.shadowBlur = 4;
    context.fillText(symbols[perk], x, y + 1);
    context.shadowBlur = 0;
  }
}

function drawShooter() {
  const angle = getAimAngle();
  context.save();
  context.translate(metrics.shooterX, metrics.shooterY);
  context.rotate(angle + Math.PI / 2);
  context.fillStyle = "#a9b8d7";
  roundedRect(-metrics.radius * 0.45, -metrics.radius * 1.7, metrics.radius * 0.9, metrics.radius * 1.7, metrics.radius * 0.4);
  context.fill();
  context.restore();

  const power = game.selectedPower;
  const color = power === "bomb" ? "pink" : power === "rainbow" ? "purple" : game.currentColor;
  if (!projectile) drawBubble(metrics.shooterX, metrics.shooterY, metrics.radius, color, power === "bomb" ? "bomb" : null);
  drawBubble(metrics.shooterX + metrics.radius * 2.2, metrics.shooterY + metrics.radius * 0.25, metrics.radius * 0.58, game.nextColor);
}

function roundedRect(x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function getAimAngle() {
  const target = pointer || { x: metrics.shooterX, y: metrics.shooterY - 100 };
  const raw = Math.atan2(target.y - metrics.shooterY, target.x - metrics.shooterX);
  return Math.min(-0.16, Math.max(-Math.PI + 0.16, raw));
}

function drawAimGuide() {
  if (projectile) return;
  const angle = getAimAngle();
  const length = game.selectedPower === "aim" ? metrics.height * 1.4 : metrics.height * 0.42;
  let x = metrics.shooterX;
  let y = metrics.shooterY;
  let vx = Math.cos(angle);
  const vy = Math.sin(angle);
  context.fillStyle = "rgba(255,255,255,.48)";
  const minX = metrics.radius;
  const maxX = metrics.width - metrics.radius;
  for (let distance = metrics.radius * 2.2; distance < length; distance += metrics.radius * 1.25) {
    let nextX = x + vx * metrics.radius * 1.25;
    y += vy * metrics.radius * 1.25;
    if (nextX < minX || nextX > maxX) {
      vx *= -1;
      nextX = Math.min(maxX, Math.max(minX, nextX));
    }
    x = nextX;
    context.beginPath();
    context.arc(x, y, Math.max(1.5, metrics.radius * 0.1), 0, Math.PI * 2);
    context.fill();
    if (y < 0) break;
  }
}

function fire() {
  if (projectile || game.status !== "playing") return;
  const angle = getAimAngle();
  const power = game.selectedPower;
  projectile = {
    x: metrics.shooterX,
    y: metrics.shooterY,
    vx: Math.cos(angle) * metrics.radius * 25,
    vy: Math.sin(angle) * metrics.radius * 25,
    color: power === "rainbow" ? game.bestNeighborColor(...positionToCell(pointer?.x || metrics.shooterX, pointer?.y || 0)) : game.currentColor,
    power
  };
  playTone(260, 0.055);
  updateHud();
}

function updateProjectile(delta) {
  if (!projectile) return;
  projectile.x += projectile.vx * delta;
  projectile.y += projectile.vy * delta;
  if (projectile.x <= metrics.radius || projectile.x >= metrics.width - metrics.radius) {
    projectile.x = Math.min(metrics.width - metrics.radius, Math.max(metrics.radius, projectile.x));
    projectile.vx *= -1;
    playTone(170, 0.025);
  }

  const collision = projectile.y <= metrics.top ||
    game.bubbles.some((bubble) => {
      const position = cellPosition(bubble.row, bubble.col);
      return Math.hypot(projectile.x - position.x, projectile.y - position.y) <= metrics.radius * 1.82;
    });
  if (collision) resolveShot();
}

function resolveShot() {
  const [row, col] = positionToCell(projectile.x, projectile.y);
  const result = game.shoot(row, col);
  const center = result.placed ? cellPosition(result.placed.row, result.placed.col) : { x: projectile.x, y: projectile.y };
  projectile = null;

  if (result.removed.length) {
    for (const bubble of result.removed) {
      const position = cellPosition(bubble.row, bubble.col);
      burst(position.x, position.y, bubble.color);
    }
    playPop(result.removed.length);
  } else {
    playTone(120, 0.07);
  }

  if (result.collected.length) showToast(`Collected ${result.collected.map(formatPower).join(", ")}!`);
  if (result.rowAdded) showToast("Careful — a new row appeared!");
  progress.inventory = { ...game.inventory };
  saveProgress();
  pointer = center;
  updateHud();
  if (result.status !== "playing") window.setTimeout(() => showResult(result.status), 450);
}

function burst(x, y, colorId) {
  const color = colorMap.get(colorId)?.fill || "#fff";
  for (let index = 0; index < 7; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x, y, color,
      vx: Math.cos(angle) * (50 + Math.random() * 90),
      vy: Math.sin(angle) * (50 + Math.random() * 90),
      life: 0.55 + Math.random() * 0.3,
      size: 2 + Math.random() * 4
    });
  }
}

function updateParticles(delta) {
  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 180 * delta;
    particle.life -= delta;
  }
  particles = particles.filter((particle) => particle.life > 0);
}

function drawParticle(particle) {
  context.globalAlpha = Math.min(1, particle.life * 2);
  context.fillStyle = particle.color;
  context.beginPath();
  context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

function showResult(status) {
  const won = status === "won";
  if (won) {
    progress.unlocked = Math.min(MAX_LEVELS, Math.max(progress.unlocked, game.level + 1));
    progress.completed[game.level] = Math.max(progress.completed[game.level] || 0, game.score);
    progress.inventory = { ...game.inventory };
    saveProgress();
  }
  document.querySelector("#resultBadge").textContent = won ? "★" : "↻";
  document.querySelector("#resultEyebrow").textContent = won ? "LEVEL COMPLETE" : "OUT OF SHOTS";
  document.querySelector("#resultTitle").textContent = won ? "Brilliant!" : "So close!";
  document.querySelector("#resultMessage").textContent = won
    ? game.level === MAX_LEVELS ? "You completed every Bubble Bloom level!" : "The next level is now unlocked."
    : "Try a bank shot or use a power-up to clear a larger group.";
  document.querySelector("#resultScore").textContent = game.score.toLocaleString();
  document.querySelector("#nextButton").hidden = !won || game.level >= MAX_LEVELS;
  document.querySelector("#retryButton").textContent = won ? "Play again" : "Try again";
  resultDialog.showModal();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function formatPower(power) {
  return power === "aim" ? "long aim" : power;
}

function playTone(frequency, duration) {
  if (!progress.sound) return;
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.08, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function playPop(count) {
  playTone(Math.min(700, 340 + count * 24), 0.1);
}

function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (event) => {
  if (projectile) return;
  canvas.setPointerCapture(event.pointerId);
  pointer = eventPoint(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) pointer = eventPoint(event);
});
canvas.addEventListener("pointerup", (event) => {
  pointer = eventPoint(event);
  if (pointer.y < metrics.shooterY - metrics.radius) fire();
});
canvas.addEventListener("pointercancel", () => { pointer = null; });

document.querySelector("#continueButton").addEventListener("click", () => startLevel(progress.unlocked));
document.querySelector("#levelSelectButton").addEventListener("click", () => {
  renderLevels();
  showScreen("levels");
});
document.querySelector("#levelsBackButton").addEventListener("click", () => showScreen("menu"));
document.querySelector("#homeButton").addEventListener("click", () => {
  if (resultDialog.open) resultDialog.close();
  renderLevels();
  showScreen("levels");
});
document.querySelector("#difficultySelect").addEventListener("change", (event) => {
  progress.difficulty = event.target.value;
  saveProgress();
});
document.querySelector("#soundButton").addEventListener("click", () => {
  progress.sound = !progress.sound;
  document.querySelector("#soundButton").textContent = progress.sound ? "♪" : "×";
  saveProgress();
  playTone(440, 0.08);
});
document.querySelectorAll(".power-button").forEach((button) => {
  button.addEventListener("click", () => {
    game.selectPower(button.dataset.power);
    updateHud();
  });
});
document.querySelector("#nextButton").addEventListener("click", () => startLevel(game.level + 1));
document.querySelector("#retryButton").addEventListener("click", () => startLevel(game.level));
document.querySelector("#mapButton").addEventListener("click", () => {
  resultDialog.close();
  renderLevels();
  showScreen("levels");
});

window.addEventListener("resize", resizeCanvas);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && game && screens.game.classList.contains("active")) {
    lastFrame = performance.now();
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(frame);
  }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

renderMenu();
showScreen("menu");
