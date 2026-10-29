// Проверка задач: позиция корректна, мат ставится ровно за заявленное число ходов,
// в задачах «мат в 2» первый ход единственный.
// Запуск: node tests/puzzles.test.js
const assert = require('assert');
const { Chess, normalizeFen } = require('../docs/engine.js');
const { matingMoves } = require('../docs/ai.js');
const PUZZLES = require('../docs/puzzles.js');

const seen = new Set();
for (const [key, set] of Object.entries(PUZZLES)) {
  assert.ok(set.list.length > 0, key);
  set.list.forEach((p, i) => {
    const where = `${key} #${i + 1} ${p.fen}`;
    assert.strictEqual(normalizeFen(p.fen), p.fen, `${where}: FEN в полном виде`);
    assert.ok(!seen.has(p.fen), `${where}: повтор`);
    seen.add(p.fen);
    const g = new Chess(p.fen);
    assert.deepStrictEqual(g.problems(), [], where);
    assert.strictEqual(g.outcome(), null, `${where}: партия ещё идёт`);
    if (set.n > 1) {
      assert.strictEqual(matingMoves(g, set.n - 1, true).length, 0, `${where}: нет более короткого мата`);
      assert.strictEqual(matingMoves(g, set.n).length, 1, `${where}: единственный первый ход`);
    } else {
      assert.ok(matingMoves(g, 1, true).length > 0, `${where}: есть мат в 1 ход`);
    }
  });
  console.log('ok', key, set.list.length);
}
console.log('all puzzles ok');
