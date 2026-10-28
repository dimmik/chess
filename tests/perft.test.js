// Проверка генератора ходов по эталонным значениям perft (https://www.chessprogramming.org/Perft_Results).
// Запуск: node tests/perft.test.js
const assert = require('assert');
const { Chess } = require('../docs/engine.js');

function perft(game, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of game.moves()) {
    game.makeMove(m);
    n += perft(game, depth - 1);
    game.undo();
  }
  return n;
}

const cases = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

for (const [fen, counts] of cases) {
  const g = new Chess(fen);
  counts.forEach((expected, i) => {
    const got = perft(g, i + 1);
    assert.strictEqual(got, expected, `${fen} depth ${i + 1}: ${got} != ${expected}`);
  });
  assert.strictEqual(g.fen(), fen, 'позиция восстановлена после undo');
  console.log('ok', fen);
}

// Мат, пат и ничья по материалу.
assert.deepStrictEqual(new Chess('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3').outcome(),
  { result: 'b', reason: 'checkmate' });
assert.deepStrictEqual(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').outcome(), { result: 'draw', reason: 'stalemate' });
assert.deepStrictEqual(new Chess('8/8/4k3/8/8/3NK3/8/8 w - - 0 1').outcome(), { result: 'draw', reason: 'material' });
assert.strictEqual(new Chess().outcome(), null);
console.log('all tests passed');
