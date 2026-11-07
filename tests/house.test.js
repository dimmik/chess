// Игра «Дом»: путь по дому, желания питомца, грязь и места, где прятаться.
// Запуск: node tests/house.test.js
const assert = require('assert');
const H = require('../docs/house/house.js');

// Путь: на том же этаже — сразу к цели, на другой этаж — через стремянку.
assert.deepStrictEqual(H.path({ x: 100, floor: 1 }, { x: 600, floor: 1 }), [{ x: 600, y: H.FLOOR_Y[1] }]);
const up = H.path({ x: 600, floor: 1 }, { x: 500, floor: 2 });
assert.deepStrictEqual(up.map((p) => [p.x, p.y]), [[H.LADDER_X, H.FLOOR_Y[1]], [H.LADDER_X, H.FLOOR_Y[2]], [500, H.FLOOR_Y[2]]]);
assert.strictEqual(H.path({ x: 0, floor: 2 }, { x: 9999, floor: 2 })[0].x, H.X_MAX);
assert.strictEqual(H.floorAt(200), 2);
assert.strictEqual(H.floorAt(500), 1);

// Потребности убывают и не уходят ниже нуля.
const st = { food: 50, fun: 10 };
H.decay(st, 50);
assert.deepStrictEqual([st.food, st.fun], [40, 0]);
assert.strictEqual(H.cleanliness(0), 100);
assert.strictEqual(H.cleanliness(20), 0);

// Желания: сытый и весёлый в чистом доме только прячется; голодный чаще просит есть.
for (let i = 0; i < 200; i++) assert.strictEqual(H.chooseRequest({ food: 100, fun: 100, dirt: 0 }), 'hide');
const counts = { feed: 0, clean: 0, play: 0, hide: 0 };
for (let i = 0; i < 2000; i++) counts[H.chooseRequest({ food: 5, fun: 90, dirt: 1 })]++;
assert.ok(counts.feed > counts.hide * 2 && counts.clean === 0 && counts.play === 0, JSON.stringify(counts));
assert.strictEqual(H.chooseRequest({ food: 100, fun: 100, dirt: 5 }, () => 0), 'clean');

// Питомцы: новый — другого вида, имя из списка, у каждого есть еда, игрушка и голос.
for (const p of H.PETS) {
  assert.ok(p.emoji && p.voice && p.toy && p.foods.length === 3 && p.names.length >= 2, p.type);
  for (let i = 0; i < 20; i++) {
    const n = H.newPet(Math.random, p.type);
    assert.notStrictEqual(n.type, p.type);
    assert.ok(H.petInfo(n.type).names.some(([name, g]) => name === n.name && g === n.g));
  }
}

// Места для пряток — внутри комнат своего этажа; новое место не совпадает с прошлым.
for (const s of H.SPOTS) {
  assert.ok(H.ROOMS.some((r) => r.floor === s.floor && s.x > r.x0 && s.x < r.x1), s.id);
  for (let i = 0; i < 20; i++) assert.notStrictEqual(H.pickSpot(Math.random, s.id).id, s.id);
  const p = H.spotPos(s), q = H.spotPos(s, true);
  assert.ok(p.y <= H.FLOOR_Y[s.floor] && p.y > H.FLOOR_Y[s.floor] - 30, 'прячется у пола');
  assert.ok(q.x !== p.x || q.y < p.y, 'высовывается');
}

// Грязь: внутри комнат, на полу или у потолка, не налезает друг на друга.
const dirt = [];
for (let i = 0; i < H.MAX_DIRT; i++) {
  const d = H.randomDirt(dirt);
  assert.ok(d, 'нашлось место для грязи');
  const room = H.ROOMS.find((r) => d.x >= r.x0 && d.x <= r.x1 && (d.y === H.FLOOR_Y[r.floor] || d.y === H.CEIL_Y[r.floor]));
  assert.ok(room, JSON.stringify(d));
  assert.strictEqual(d.hp, H.DIRT[d.type].hp);
  assert.ok(dirt.every((o) => Math.hypot(o.x - d.x, o.y - d.y) >= 70));
  dirt.push(d);
}
assert.strictEqual(H.randomDirt([], Math.random, 'crumbs', 'kitchen').y, H.FLOOR_Y[1]);
assert.ok(new Set(dirt.map((d) => d.id)).size === dirt.length);

console.log('house ok');
