export const COLS = 9;
export const MAX_LEVELS = 30;

export const COLORS = [
  { id: "pink", fill: "#ff4f91", shade: "#a61654" },
  { id: "cyan", fill: "#36d8f5", shade: "#147eaa" },
  { id: "yellow", fill: "#ffd166", shade: "#b36d18" },
  { id: "green", fill: "#47dcab", shade: "#168564" },
  { id: "purple", fill: "#9b68ff", shade: "#5530a9" },
  { id: "orange", fill: "#ff8a4c", shade: "#b64029" }
];

export const DIFFICULTIES = {
  relaxed: { label: "Relaxed", colors: 4, rows: 4, shots: 36, missLimit: 7, score: 1 },
  classic: { label: "Classic", colors: 5, rows: 5, shots: 29, missLimit: 5, score: 1.25 },
  expert: { label: "Expert", colors: 6, rows: 6, shots: 24, missLimit: 4, score: 1.6 }
};

const PERKS = ["bomb", "rainbow", "aim"];

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function key(row, col) {
  return `${row}:${col}`;
}

export function neighbors(row, col) {
  const shifted = row % 2 !== 0;
  const offsets = shifted
    ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return offsets.map(([rowOffset, colOffset]) => [row + rowOffset, col + colOffset]);
}

export function reflectHorizontal(position, velocity, elapsed, min, max) {
  if (!(max > min) || elapsed < 0) {
    throw new RangeError("Horizontal reflection requires valid bounds and elapsed time.");
  }

  let nextPosition = position + velocity * elapsed;
  let nextVelocity = velocity;
  let bounced = false;

  while (nextPosition < min || nextPosition > max) {
    if (nextPosition < min) {
      nextPosition = min + (min - nextPosition);
      nextVelocity = Math.abs(nextVelocity);
    } else {
      nextPosition = max - (nextPosition - max);
      nextVelocity = -Math.abs(nextVelocity);
    }
    bounced = true;
  }

  if (nextPosition === min && nextVelocity < 0) {
    nextVelocity = Math.abs(nextVelocity);
    bounced = true;
  } else if (nextPosition === max && nextVelocity > 0) {
    nextVelocity = -Math.abs(nextVelocity);
    bounced = true;
  }

  return { position: nextPosition, velocity: nextVelocity, bounced };
}

export class BubbleGame {
  constructor({ level = 1, difficulty = "relaxed", inventory } = {}) {
    if (!DIFFICULTIES[difficulty]) {
      throw new Error(`Unknown difficulty: ${difficulty}`);
    }

    this.level = Math.min(Math.max(1, level), MAX_LEVELS);
    this.difficulty = difficulty;
    this.config = DIFFICULTIES[difficulty];
    this.random = mulberry32(this.level * 7919 + Object.keys(DIFFICULTIES).indexOf(difficulty) * 104729);
    this.grid = new Map();
    this.score = 0;
    this.shotsLeft = Math.max(12, this.config.shots - Math.floor((this.level - 1) / 4));
    this.misses = 0;
    this.inventory = { bomb: 1, rainbow: 1, aim: 1, ...inventory };
    this.selectedPower = null;
    this.status = "playing";
    this.generateBoard();
    this.initialCount = this.grid.size;
    this.currentColor = this.randomPlayableColor();
    this.nextColor = this.randomPlayableColor();
  }

  generateBoard() {
    const colorCount = Math.min(COLORS.length, this.config.colors + Math.floor((this.level - 1) / 10));
    const rowCount = Math.min(8, this.config.rows + Math.floor((this.level - 1) / 7));

    for (let row = 0; row < rowCount; row += 1) {
      const width = row % 2 === 0 ? COLS : COLS - 1;
      for (let col = 0; col < width; col += 1) {
        if (row > 2 && this.random() < 0.08) continue;
        const color = COLORS[Math.floor(this.random() * colorCount)].id;
        const perkChance = this.level >= 2 && row >= 2 && this.random() < Math.min(0.035 + this.level * 0.002, 0.09);
        const perk = perkChance ? PERKS[Math.floor(this.random() * PERKS.length)] : null;
        this.grid.set(key(row, col), { row, col, color, perk });
      }
    }
  }

  get bubbles() {
    return [...this.grid.values()];
  }

  get remainingRatio() {
    return this.initialCount ? this.grid.size / this.initialCount : 0;
  }

  get maxRow() {
    return this.bubbles.reduce((max, bubble) => Math.max(max, bubble.row), 0);
  }

  getBubble(row, col) {
    return this.grid.get(key(row, col));
  }

  isValidCell(row, col) {
    return row >= 0 && col >= 0 && col < (row % 2 === 0 ? COLS : COLS - 1);
  }

  getNeighbors(row, col) {
    return neighbors(row, col)
      .filter(([nextRow, nextCol]) => this.isValidCell(nextRow, nextCol))
      .map(([nextRow, nextCol]) => this.getBubble(nextRow, nextCol))
      .filter(Boolean);
  }

  selectPower(power) {
    if (!PERKS.includes(power)) return false;
    if (this.inventory[power] <= 0 || this.status !== "playing") return false;
    this.selectedPower = this.selectedPower === power ? null : power;
    return true;
  }

  findSnapCell(preferredRow, preferredCol) {
    const candidates = [[preferredRow, preferredCol], ...neighbors(preferredRow, preferredCol)];
    const direct = candidates.find(([row, col]) => this.isValidCell(row, col) && !this.getBubble(row, col));
    if (direct) return direct;

    for (let distance = 2; distance < 14; distance += 1) {
      for (let row = Math.max(0, preferredRow - distance); row <= preferredRow + distance; row += 1) {
        const width = row % 2 === 0 ? COLS : COLS - 1;
        for (let col = 0; col < width; col += 1) {
          if (!this.getBubble(row, col) && Math.abs(row - preferredRow) + Math.abs(col - preferredCol) <= distance) {
            return [row, col];
          }
        }
      }
    }
    return null;
  }

  shoot(preferredRow, preferredCol) {
    if (this.status !== "playing") return { status: this.status, removed: [], collected: [] };

    const cell = this.findSnapCell(preferredRow, preferredCol);
    if (!cell) {
      this.status = "lost";
      return { status: this.status, removed: [], collected: [] };
    }

    const [row, col] = cell;
    const power = this.selectedPower;
    const color = power === "rainbow" ? this.bestNeighborColor(row, col) : this.currentColor;
    const bubble = { row, col, color, perk: null };
    this.grid.set(key(row, col), bubble);
    this.shotsLeft -= 1;

    let removed = [];
    if (power === "bomb") {
      removed = [bubble, ...this.getNeighbors(row, col)];
    } else {
      const cluster = this.findCluster(row, col, color);
      if (cluster.length >= 3) removed = cluster;
    }

    const collected = this.removeBubbles(removed);
    if (removed.length > 0) {
      const floating = this.findFloating();
      collected.push(...this.removeBubbles(floating));
      removed.push(...floating);
      this.misses = 0;
      this.score += Math.round((removed.length * 100 + Math.max(0, removed.length - 3) * 35) * this.config.score);
    } else {
      this.misses += 1;
    }

    if (power) {
      this.inventory[power] -= 1;
      this.selectedPower = null;
    }

    let rowAdded = false;
    if (this.misses >= this.config.missLimit && this.grid.size > 0) {
      this.addPressureRow();
      this.misses = 0;
      rowAdded = true;
    }

    if (this.grid.size === 0) {
      this.status = "won";
      this.score += this.shotsLeft * 50;
    } else if (this.shotsLeft <= 0 || this.maxRow >= 12) {
      this.status = "lost";
    }

    this.currentColor = this.nextColor;
    this.nextColor = this.randomPlayableColor();

    return { status: this.status, placed: bubble, removed, collected, rowAdded };
  }

  findCluster(row, col, color) {
    const found = [];
    const queue = [[row, col]];
    const visited = new Set();

    while (queue.length) {
      const [currentRow, currentCol] = queue.shift();
      const cellKey = key(currentRow, currentCol);
      if (visited.has(cellKey)) continue;
      visited.add(cellKey);
      const bubble = this.getBubble(currentRow, currentCol);
      if (!bubble || bubble.color !== color) continue;
      found.push(bubble);
      for (const neighbor of neighbors(currentRow, currentCol)) queue.push(neighbor);
    }
    return found;
  }

  findFloating() {
    const connected = new Set();
    const queue = this.bubbles.filter((bubble) => bubble.row === 0);

    while (queue.length) {
      const bubble = queue.shift();
      const bubbleKey = key(bubble.row, bubble.col);
      if (connected.has(bubbleKey)) continue;
      connected.add(bubbleKey);
      queue.push(...this.getNeighbors(bubble.row, bubble.col));
    }

    return this.bubbles.filter((bubble) => !connected.has(key(bubble.row, bubble.col)));
  }

  removeBubbles(bubbles) {
    const collected = [];
    for (const bubble of bubbles) {
      if (!this.grid.delete(key(bubble.row, bubble.col))) continue;
      if (bubble.perk) {
        this.inventory[bubble.perk] += 1;
        collected.push(bubble.perk);
      }
    }
    return collected;
  }

  bestNeighborColor(row, col) {
    const counts = new Map();
    for (const bubble of this.getNeighbors(row, col)) {
      counts.set(bubble.color, (counts.get(bubble.color) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || this.currentColor;
  }

  randomPlayableColor() {
    const present = [...new Set(this.bubbles.map((bubble) => bubble.color))];
    const choices = present.length ? present : COLORS.slice(0, this.config.colors).map((color) => color.id);
    return choices[Math.floor(this.random() * choices.length)];
  }

  addPressureRow() {
    const shifted = [...this.grid.values()].sort((a, b) => b.row - a.row);
    this.grid.clear();
    for (const bubble of shifted) {
      const moved = { ...bubble, row: bubble.row + 1 };
      if (this.isValidCell(moved.row, moved.col)) this.grid.set(key(moved.row, moved.col), moved);
    }
    const colorCount = Math.min(COLORS.length, this.config.colors + Math.floor((this.level - 1) / 10));
    for (let col = 0; col < COLS; col += 1) {
      const color = COLORS[Math.floor(this.random() * colorCount)].id;
      this.grid.set(key(0, col), { row: 0, col, color, perk: null });
    }
  }
}
