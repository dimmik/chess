// Партии «компьютер против компьютера» на всех уровнях: ходы всегда разрешённые, партия заканчивается.
// Запуск: node tests/ai.test.js
const assert = require('assert');
const { Chess } = require('../docs/engine.js');
const { chooseMove, hintMove } = require('../docs/ai.js');

const levels = ['baby', 'easy', 'medium'];
let slowest = 0;
const results = {};
for (const white of levels) {
  for (const black of levels) {
    const g = new Chess();
    let out = null;
    for (let ply = 0; ply < 400 && !(out = g.outcome()); ply++) {
      const t0 = Date.now();
      const m = chooseMove(g, g.turn === 'w' ? white : black);
      slowest = Math.max(slowest, Date.now() - t0);
      assert.ok(g.moves().some((x) => x.from === m.from && x.to === m.to), 'разрешённый ход');
      g.makeMove(m);
    }
    const key = `${white} vs ${black}`;
    results[key] = out ? out.result + ':' + out.reason : 'unfinished';
  }
}
assert.ok(hintMove(new Chess()));
// «Хитрый» уровень забирает незащищённого ферзя.
const free = new Chess('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
assert.strictEqual(chooseMove(free, 'medium').to, 27);
console.table(results);
console.log('slowest move, ms:', slowest);
