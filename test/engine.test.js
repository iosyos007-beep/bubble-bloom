import test from "node:test";
import assert from "node:assert/strict";
import { BubbleGame, DIFFICULTIES, neighbors, reflectHorizontal } from "../src/engine.js";

test("creates deterministic playable boards for every difficulty", () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const first = new BubbleGame({ level: 8, difficulty });
    const second = new BubbleGame({ level: 8, difficulty });
    assert.deepEqual(first.bubbles, second.bubbles);
    assert.ok(first.bubbles.length > 20);
    assert.ok(first.shotsLeft > 0);
  }
});

test("hex cells always have six neighbor positions", () => {
  assert.equal(neighbors(0, 0).length, 6);
  assert.equal(neighbors(1, 1).length, 6);
  assert.notDeepEqual(neighbors(0, 1), neighbors(1, 1));
});

test("wall collisions preserve overshoot and reverse horizontal velocity", () => {
  assert.deepEqual(reflectHorizontal(15, -100, 0.1, 10, 110), {
    position: 15,
    velocity: 100,
    bounced: true
  });
  assert.deepEqual(reflectHorizontal(105, 100, 0.1, 10, 110), {
    position: 105,
    velocity: -100,
    bounced: true
  });
});

test("long frames can cross multiple walls without pinning the projectile", () => {
  assert.deepEqual(reflectHorizontal(50, 300, 1, 0, 100), {
    position: 50,
    velocity: -300,
    bounced: true
  });
});

test("a three-bubble color cluster is removed", () => {
  const game = new BubbleGame({ level: 1, difficulty: "relaxed" });
  game.grid.clear();
  game.grid.set("0:0", { row: 0, col: 0, color: "pink", perk: null });
  game.grid.set("0:1", { row: 0, col: 1, color: "pink", perk: null });
  game.currentColor = "pink";
  game.nextColor = "cyan";
  game.initialCount = 2;
  const result = game.shoot(1, 0);
  assert.equal(result.status, "won");
  assert.equal(result.removed.length, 3);
  assert.equal(game.grid.size, 0);
  assert.ok(game.score >= 300);
});

test("bomb removes its placement and adjacent bubbles", () => {
  const game = new BubbleGame({ level: 2, difficulty: "classic", inventory: { bomb: 2 } });
  game.grid.clear();
  game.grid.set("0:0", { row: 0, col: 0, color: "cyan", perk: null });
  game.grid.set("0:1", { row: 0, col: 1, color: "pink", perk: null });
  game.initialCount = 2;
  assert.equal(game.selectPower("bomb"), true);
  const result = game.shoot(1, 0);
  assert.equal(result.removed.length, 3);
  assert.equal(game.inventory.bomb, 1);
});

test("collecting a perk adds it to inventory", () => {
  const game = new BubbleGame({ level: 3, difficulty: "relaxed", inventory: { aim: 0 } });
  game.grid.clear();
  game.grid.set("0:0", { row: 0, col: 0, color: "green", perk: "aim" });
  game.grid.set("0:1", { row: 0, col: 1, color: "green", perk: null });
  game.currentColor = "green";
  game.nextColor = "green";
  game.initialCount = 2;
  const result = game.shoot(1, 0);
  assert.deepEqual(result.collected, ["aim"]);
  assert.equal(game.inventory.aim, 1);
});
