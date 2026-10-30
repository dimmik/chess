// Ямб: подсчёт очков, порядок заполнения столбцов и полные партии компьютерных игроков.
// Запуск: node tests/jamb.test.js
const assert = require('assert');
const J = require('../docs/jamb/jamb.js');

// Очки
assert.strictEqual(J.score('3', [3, 3, 1, 3, 6], 1), 9);
assert.strictEqual(J.score('max', [6, 6, 5, 4, 6], 2), 27);
assert.strictEqual(J.score('kenta', [1, 2, 3, 4, 5], 1), 66);
assert.strictEqual(J.score('kenta', [6, 2, 3, 4, 5], 2), 56);
assert.strictEqual(J.score('kenta', [6, 2, 3, 4, 5], 3), 46);
assert.strictEqual(J.score('kenta', [1, 2, 3, 4, 6], 1), 0);
assert.strictEqual(J.score('triling', [4, 4, 4, 1, 2], 1), 32);
assert.strictEqual(J.score('ful', [5, 5, 5, 2, 2], 1), 49);
assert.strictEqual(J.score('ful', [5, 5, 5, 5, 5], 1), 0);
assert.strictEqual(J.score('poker', [2, 2, 2, 2, 6], 1), 48);
assert.strictEqual(J.score('jamb', [6, 6, 6, 6, 6], 1), 80);
assert.strictEqual(J.score('jamb', [6, 6, 6, 6, 5], 1), 0);

// Порядок столбцов и объява
const cols = J.ALL_COLS;
const s = J.emptySheet(cols);
assert.ok(J.allowed(s, 'down', '1', null) && !J.allowed(s, 'down', '2', null));
assert.ok(J.allowed(s, 'up', 'jamb', null) && !J.allowed(s, 'up', 'poker', null));
assert.ok(J.allowed(s, 'free', 'ful', null));
assert.ok(!J.allowed(s, 'announce', 'ful', null));
assert.ok(J.allowed(s, 'announce', 'ful', 'ful') && !J.allowed(s, 'free', 'ful', 'ful'));

// Итоги столбца: бонус и разница
const col = { 1: 3, 2: 6, 3: 12, 4: 16, 5: 15, 6: 18, max: 27, min: 8, kenta: 66, triling: 0, ful: 0, poker: 0, jamb: 0 };
const t = J.columnTotals(col);
assert.deepStrictEqual([t.top, t.bonus, t.diff, t.bottom, t.total], [100, 30, 57, 66, 223]);

// Полные партии: три компьютерных игрока, оба режима — всегда доходят до конца.
function playGame(gameCols) {
  const players = [0, 1, 2].map(() => J.emptySheet(gameCols));
  let turns = 0;
  while (!players.every((p) => J.isFull(p, gameCols))) {
    const sheet = players[turns % 3];
    turns++;
    if (J.isFull(sheet, gameCols)) continue;
    let dice = [0, 0, 0, 0, 0], held = [false, false, false, false, false], announced = null, written = false;
    for (let roll = 1; roll <= 3 && !written; roll++) {
      dice = dice.map((d, i) => (held[i] ? d : 1 + Math.floor(Math.random() * 6)));
      for (let step = 0; step < 3; step++) {
        const d = J.aiDecide(sheet, gameCols, announced, dice, roll);
        if (d.announce) { assert.strictEqual(roll, 1); announced = d.announce; continue; }
        if (d.write) {
          assert.ok(J.allowed(sheet, d.write.col, d.write.row, announced), 'запись в разрешённую клетку');
          sheet[d.write.col][d.write.row] = J.score(d.write.row, dice, roll);
          written = true;
        } else {
          assert.ok(roll < 3, 'на третьем броске надо записать');
          held = d.hold;
        }
        break;
      }
    }
    assert.ok(written, 'ход закончился записью');
    assert.ok(turns < 1000);
  }
  return players.map((p) => J.total(p, gameCols));
}
const scores = [];
for (let g = 0; g < 30; g++) scores.push(...playGame(J.ALL_COLS));
for (let g = 0; g < 30; g++) playGame(['free']);
const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
console.log('средний счёт компьютера (4 столбца):', avg, 'мин', Math.min(...scores), 'макс', Math.max(...scores));
assert.ok(avg > 300 && avg < 1500);
console.log('jamb ok');
