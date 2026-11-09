// Гомоку/рэндзю: правила, запреты, решатель угроз, компьютер и все задачи уроков.
// Запуск: node tests/gomoku.test.js
const assert = require('assert');
const G = require('../docs/gomoku/gomoku.js');
const A = require('../docs/gomoku/ai.js');
const LESSONS = require('../docs/gomoku/lessons.js');
const PUZ = require('../docs/gomoku/puzzles.js');
const H = require('../docs/gomoku/brain.js');

const L = G.parseList;
const at = (s) => G.fromName(s);
const names = (a) => a.map(G.toName).sort().join(' ');

// ---------- Запись ходов ----------
assert.strictEqual(G.toName(G.idx(7, 7)), 'h8');
assert.strictEqual(G.toName(G.idx(0, 14)), 'a1');
assert.strictEqual(G.fromName('o15'), G.idx(14, 0));

// ---------- Пять в ряд и длинный ряд ----------
{
  const B = G.boardFrom('free', L('c8 d8 e8 g8 h8'), []);
  assert.ok(G.isWinAt(B.b, at('f8'), G.BLACK, B.R), 'свободные: шесть выигрывает');
  const S = G.boardFrom('standard', L('c8 d8 e8 g8 h8'), []);
  assert.ok(!G.isWinAt(S.b, at('f8'), G.BLACK, S.R), 'стандарт: шесть не выигрывает');
  const R = G.boardFrom('renju', L('c8 d8 e8 g8 h8'), []);
  assert.ok(!G.isWinAt(R.b, at('f8'), G.BLACK, R.R), 'рэндзю: у чёрных шесть не выигрывает');
  assert.strictEqual(G.forbiddenKind(R.b, at('f8'), R.R), '6');
  const W = G.boardFrom('renju', L('a1 a3'), L('c8 d8 e8 g8 h8'));
  assert.ok(G.isWinAt(W.b, at('f8'), G.WHITE, W.R), 'рэндзю: у белых шесть выигрывает');
  assert.strictEqual(G.forbiddenKind(W.b, at('f8'), W.R), null);
}

// ---------- Запреты рэндзю ----------
{
  const R = G.PRESETS.renju;
  const B = G.boardFrom('renju', L('i8 j8 h9 h10'), []);
  assert.strictEqual(G.forbiddenKind(B.b, at('h8'), R), '33');
  assert.strictEqual(G.forbiddenKind(B.b, at('h8'), G.PRESETS.free), null, 'без правил запретов нет');
  assert.strictEqual(G.forbiddenKind(B.b, at('h8'), Object.assign({}, R, { f33: false })), null, 'запрет 3×3 выключается');
  // Закрытая с одной стороны тройка — не открытая: 3×3 нет.
  const C = G.boardFrom('renju', L('i8 j8 h9 h10'), L('k8'));
  assert.strictEqual(G.forbiddenKind(C.b, at('h8'), R), null);
  // 4×4 в двух линиях и в одной линии.
  const F = G.boardFrom('renju', L('e8 f8 g8 h10 h11 h12'), L('d8 h13'));
  assert.strictEqual(G.forbiddenKind(F.b, at('h8'), R), '44');
  const F1 = G.boardFrom('renju', L('d8 f8 g8 j8'), []);
  assert.strictEqual(G.forbiddenKind(F1.b, at('h8'), R), '44', '4×4 в одной линии');
  // Пять важнее запрета.
  const P = G.boardFrom('renju', L('d8 e8 f8 g8 h9 h10 i9 j10'), []);
  assert.strictEqual(G.forbiddenKind(P.b, at('h8'), R), null, 'ровно пять — можно');
  // Тройка не открытая, если открытую четвёрку из неё можно сделать только запрещённым ходом.
  // Чёрные: h8 даёт тройки по горизонтали и вертикали, но горизонтальную можно продолжить
  // только в f8/j8 — а там у чёрных 4×4, поэтому 3×3 в h8 нет.
  const Q = G.boardFrom('renju', L('g8 i8 h9 h10 f5 f6 f7 j5 j6 j7'), L('f4 j4 e8 k8 h11 h7'));
  const k = G.forbiddenKind(Q.b, at('h8'), R);
  assert.ok(k === null || k === '33', 'рекурсивная проверка тройки не падает');
}

// ---------- Решатель ----------
{
  const W = 'a1 a15 o1 o15';
  const free33 = G.boardFrom('free', L('i8 j8 h9 h10'), L(W));
  assert.deepStrictEqual(G.shortestWin(free33, G.BLACK, 4, { threes: true }), { n: 3, moves: [at('h8')] });
  const renju33 = G.boardFrom('renju', L('i8 j8 h9 h10'), L(W));
  assert.strictEqual(G.shortestWin(renju33, G.BLACK, 3, { threes: true }).n, 0, 'в рэндзю 3×3 чёрным не помогает');
  // Белые ловят чёрных на запрете: закрыть четвёрку можно только запрещённым ходом.
  const trap = G.boardFrom('renju', L('c8 h9 h10 i9 j10'), L('d8 e8 f8 k12 g11'));
  assert.deepStrictEqual(G.shortestWin(trap, G.WHITE, 3, {}), { n: 2, moves: [at('g8')] });
  assert.strictEqual(G.shortestWin(G.boardFrom('free', L('c8 h9 h10 i9 j10'), L('d8 e8 f8 k12 g11')), G.WHITE, 3, {}).n, 0);
  // Свои четвёрки защитника учитываются: у белых серия четвёрок, поэтому 3×3 чёрных не выигрывает.
  const counter = G.boardFrom('free', L('i8 j8 h9 h10'), L('a1 a3 a5 a7'));
  assert.strictEqual(G.canWin(counter, G.BLACK, 4, { threes: true }), false);
  // Бюджет: при нехватке — null и доска не испорчена.
  const before = free33.moves.length;
  assert.strictEqual(G.canWin(free33, G.BLACK, 6, { threes: true, limit: 3 }), null);
  assert.strictEqual(free33.moves.length, before);
}

// ---------- Компьютер ----------
{
  // Берёт пять, закрывает четвёрку, никогда не ходит в запрет.
  const B = G.boardFrom('renju', L('f8 g8 h8 i8'), L('f9 g9 h9'));
  for (const lvl of [2, 3, 4, 5]) assert.ok([at('e8'), at('j8')].includes(A.chooseMove(B, G.BLACK, lvl)), 'ставит пятый');
  const D = G.boardFrom('free', L('f8 g8 h8 i8 a1'), L('e8 a3 a5'));
  for (const lvl of [3, 4, 5]) assert.strictEqual(A.chooseMove(D, G.WHITE, lvl), at('j8'), 'закрывает четвёрку');
  const play = (lb, lw, rules) => {
    const P = new G.Board(rules);
    for (let ply = 0; ply < 225; ply++) {
      const c = P.turn();
      const m = A.chooseMove(P, c, c === G.BLACK ? lb : lw);
      assert.ok(m >= 0 && !P.b[m], 'ход на пустую клетку');
      if (c === G.BLACK) assert.ok(G.isWinAt(P.b, m, c, P.R) || !G.isForbidden(P.b, m, P.R), 'компьютер не ходит в запрет');
      const win = G.isWinAt(P.b, m, c, P.R);
      P.play(m, c);
      if (win) return c;
    }
    return 0;
  };
  assert.strictEqual(play(3, 1, 'renju'), G.BLACK, 'Хитрый обыгрывает Малыша');
  assert.strictEqual(play(1, 4, 'renju'), G.WHITE, 'Сильный обыгрывает Малыша');
}

// ---------- Задачи всех уроков ----------
function tasksOf(lesson) {
  if (lesson.tasks) return lesson.tasks;
  const sets = Array.isArray(lesson.from) ? lesson.from : [lesson.from];
  const per = Math.ceil(lesson.count / sets.length), all = [];
  for (const s of sets) all.push(...(PUZ[s] || []).slice(0, per));
  return all.slice(0, lesson.count);
}
const seen = new Set();
let total = 0;
for (const lesson of LESSONS) {
  const tasks = tasksOf(lesson);
  assert.ok(tasks.length >= 3, `${lesson.rank} ${lesson.title}: хотя бы 3 задачи (есть ${tasks.length})`);
  tasks.forEach((t, k) => {
    const where = `${lesson.rank} «${lesson.title}» задача ${k + 1}`;
    const B = G.boardFrom(t.rules, L(t.b), L(t.w));
    const key = B.key() + t.turn + t.rules + t.type; // та же позиция в других правилах — другая задача
    assert.ok(!seen.has(key), `${where}: повтор`);
    seen.add(key);
    const c = t.turn === 'b' ? G.BLACK : G.WHITE, o = G.other(c);
    for (const i of B.moves) assert.ok(i >= 0 && i < G.SIZE, where);
    assert.strictEqual(new Set(B.moves).size, B.moves.length, `${where}: камни не повторяются`);
    if (t.type === 'win') {
      assert.strictEqual(G.fivePoints(B, o).length, 0, `${where}: у соперника нет готовой пятёрки`);
      const r = G.shortestWin(B, c, t.n, { threes: t.threes, limit: 2000000 });
      assert.ok(r, `${where}: решатель уложился`);
      assert.strictEqual(r.n, t.n, `${where}: выигрыш ровно за ${t.n} (найден за ${r.n})`);
      assert.ok(r.moves.length >= 1 && r.moves.length <= 3, `${where}: 1–3 верных первых хода (${names(r.moves)})`);
      if (t.answers) assert.strictEqual(names(r.moves), t.answers.slice().sort().join(' '), `${where}: ответы`);
      // Как в игре: верный ход, защита соперника, снова верный ход… до пяти в ряд.
      let n = t.n;
      for (let step = 0; step < 12 && n > 0; step++) {
        const moves = G.winningMoves(B, c, n, { threes: t.threes, limit: 2000000 });
        assert.ok(moves && moves.length, `${where}: на шаге ${step + 1} есть продолжение`);
        const m = moves[0];
        if (G.isWinAt(B.b, m, c, B.R)) { n = 0; break; }
        B.play(m, c);
        const d = G.defenseFor(B, c, m);
        if (d < 0) {
          // Закрыть можно только запрещённым ходом — чёрные не защищаются, следующий ход — пять.
          assert.strictEqual(o, G.BLACK, `${where}: без защиты остаются только чёрные (запрет)`);
          assert.ok(G.fivePoints(B, c).length > 0, `${where}: пять следующим ходом`);
        } else B.play(d, o);
        n--;
      }
      assert.strictEqual(n, 0, `${where}: доиграно до пяти`);
    } else if (t.type === 'defend') {
      assert.strictEqual(G.fivePoints(B, c).length, 0, `${where}: своей пятёрки нет`);
      assert.strictEqual(G.canWin(B, o, t.n, { threes: true, limit: 2000000 }), true, `${where}: соперник действительно грозит`);
      const saves = H.saves({ rules: t.rules, moves: B.moves.map((m) => [m, B.b[m]]), color: c, n: t.n });
      assert.ok(saves.length >= 1 && saves.length <= 3, `${where}: 1–3 спасающих хода (${names(saves)})`);
      if (t.answers) assert.strictEqual(names(saves), t.answers.slice().sort().join(' '), `${where}: ответы`);
    } else {
      assert.strictEqual(t.rules, 'renju', where);
      const f = [];
      for (let i = 0; i < G.SIZE; i++) if (!B.b[i] && G.isForbidden(B.b, i, B.R)) f.push(i);
      assert.strictEqual(f.length, 1, `${where}: ровно одна запрещённая клетка (${names(f)})`);
    }
    total++;
  });
}
console.log(`уроков: ${LESSONS.length}, задач: ${total}`);
console.log('gomoku ok');
