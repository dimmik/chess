// Генератор задач для уроков гомоку/рэндзю (docs/gomoku/puzzles.js).
// Компьютер играет партии с разными началами, решатель ищет в них позиции:
//   vcfN  — выигрыш серией четвёрок ровно за N ходов (не короче), 1–2 первых хода;
//   vctN  — выигрыш тройками и четвёрками за N ходов, когда одними четвёрками не выиграть;
//   defN  — соперник грозит выиграть за N ходов; спасают только 1–3 хода, своего выигрыша нет.
// Запуск: node tools/generate-gomoku.js [секунд] [seed] > docs/gomoku/puzzles.js
const G = require('../docs/gomoku/gomoku.js');
const A = require('../docs/gomoku/ai.js');

const SECONDS = Number(process.argv[2]) || 600;
let seed = Number(process.argv[3]) || 777;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const WANT = { vcf3: 6, vcf4: 6, vcf5: 6, vcf6: 5, vcf7: 5, vct3: 6, vct4: 6, vct5: 5, def3: 6, def4: 6 };
// ONLY=vcf6,vcf7 — искать только эти наборы (остальные не нужны).
if (process.env.ONLY) for (const k of Object.keys(WANT)) if (!process.env.ONLY.split(',').includes(k)) WANT[k] = 0;
const found = {};
for (const k of Object.keys(WANT)) found[k] = [];
const seen = new Set();
const full = () => Object.keys(WANT).every((k) => found[k].length >= WANT[k]);
const t0 = Date.now();
const LIM = 120000;

function record(kind, B, c, extra) {
  if (found[kind].length >= WANT[kind]) return;
  const key = B.key() + ':' + c;
  if (seen.has(key)) return;
  seen.add(key);
  const b = [], w = [];
  for (let i = 0; i < G.SIZE; i++) {
    if (B.b[i] === G.BLACK) b.push(G.toName(i));
    if (B.b[i] === G.WHITE) w.push(G.toName(i));
  }
  found[kind].push(Object.assign({ rules: B.R === G.PRESETS.renju ? 'renju' : 'free', b: b.join(' '), w: w.join(' '), turn: c === G.BLACK ? 'b' : 'w' }, extra));
  process.stderr.write(`${kind} ${found[kind].length}/${WANT[kind]}  (${Math.round((Date.now() - t0) / 1000)}s)\n`);
}

function examine(B) {
  const c = B.turn(), o = G.other(c);
  if (G.fivePoints(B, c).length || G.fivePoints(B, o).length) return;
  // Выигрыш серией четвёрок.
  const vcf = G.shortestWin(B, c, 8, { limit: LIM });
  if (vcf === null) return;
  if (vcf.n >= 3 && vcf.moves.length <= 2) {
    const kind = 'vcf' + Math.min(vcf.n, 7);
    record(kind, B, c, { type: 'win', n: vcf.n, threes: false, answers: vcf.moves.map(G.toName) });
    return;
  }
  if (vcf.n) return;
  // Выигрыш тройками (одними четвёрками нельзя).
  const vct = G.shortestWin(B, c, 5, { threes: true, limit: LIM });
  if (vct === null) return;
  if (vct.n >= 3 && vct.moves.length <= 2) {
    record('vct' + vct.n, B, c, { type: 'win', n: vct.n, threes: true, answers: vct.moves.map(G.toName) });
    return;
  }
  if (vct.n) return;
  // Защита: если пропустить ход, соперник выигрывает за k ходов.
  const threat = G.shortestWin(B, o, 4, { threes: true, limit: LIM });
  if (!threat || threat.n < 3) return;
  const k = threat.n, depth = k + 1;
  const kind = 'def' + Math.min(k, 4);
  if (found[kind].length >= WANT[kind]) return;
  const saves = [];
  for (const m of A.candidates(B, 3)) {
    if (c === G.BLACK && G.isForbidden(B.b, m, B.R)) continue;
    B.play(m, c);
    const r = G.canWin(B, o, depth, { threes: true, limit: LIM });
    B.undo();
    if (r === null) return; // не ясно — такую позицию не берём
    if (r === false) saves.push(m);
    if (saves.length > 3) return;
  }
  if (saves.length >= 1 && saves.length <= 3) {
    record(kind, B, c, { type: 'defend', n: depth, threes: true, answers: saves.map(G.toName) });
  }
}

while (!full() && (Date.now() - t0) / 1000 < SECONDS) {
  const rules = rand() < 0.5 ? 'free' : 'renju';
  const B = new G.Board(rules);
  // Начало: центр и несколько случайных ходов рядом.
  B.play(G.idx(7, 7), G.BLACK);
  const opening = 2 + Math.floor(rand() * 4);
  for (let k = 0; k < opening; k++) {
    const c = B.turn();
    const near = A.candidates(B, 2).filter((i) => !(c === G.BLACK && G.isForbidden(B.b, i, B.R)));
    B.play(near[Math.floor(rand() * near.length)], c);
  }
  const levels = [2 + Math.floor(rand() * 3), 2 + Math.floor(rand() * 3)];
  for (let ply = 0; ply < 120; ply++) {
    const c = B.turn();
    if (B.moves.length >= 9) examine(B);
    const m = A.chooseMove(B, c, levels[c - 1], rand);
    if (m < 0 || B.b[m]) break;
    const win = G.isWinAt(B.b, m, c, B.R);
    B.play(m, c);
    if (win || full()) break;
  }
}

let out = '// Задачи для уроков (сгенерированы: node tools/generate-gomoku.js; проверяются tests/gomoku.test.js).\n';
out += '// b, w — камни (a–o слева направо, 1–15 снизу вверх), turn — чей ход, n — за сколько своих ходов,\n';
out += '// threes — можно ли угрожать тройками, answers — верные первые ходы.\n';
out += '(function (root) {\n  const PUZZLES = ' + JSON.stringify(found, null, 1).replace(/\n\s*/g, ' ') + ';\n';
out += "  if (typeof module !== 'undefined' && module.exports) module.exports = PUZZLES;\n  else root.GomokuPuzzles = PUZZLES;\n})(this);\n";
process.stdout.write(out);
process.stderr.write('done: ' + Object.keys(found).map((k) => k + '=' + found[k].length).join(' ') + '\n');
