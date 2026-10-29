// Генератор задач «мат в 2 хода» для docs/puzzles.js.
// Перебирает случайные позиции, оставляет корректные задачи и выбирает лучшие:
// единственный первый ход (ключ), ключ без шаха и взятия, много разных защит, без «двойных» решений.
// Запуск: node tools/generate-mate2.js [сколько_задач] [секунд_на_поиск] [seed]
const { Chess, squareName } = require('../docs/engine.js');
const { matingMoves, forcedMate } = require('../docs/ai.js');

const WANT = Number(process.argv[2]) || 30;
const SECONDS = Number(process.argv[3]) || 120;
let seed = Number(process.argv[4]) || 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const VAL = { q: 9, r: 5, b: 3, n: 3, p: 1 };

function randomPosition() {
  const board = new Array(64).fill(null);
  const free = () => { let i; do { i = Math.floor(rand() * 64); } while (board[i]); return i; };
  // Чёрный король чаще у края — там больше матов.
  let bk;
  do {
    bk = Math.floor(rand() * 64);
  } while (rand() < 0.75 && !((bk >> 3) === 0 || (bk >> 3) === 7 || (bk & 7) === 0 || (bk & 7) === 7));
  board[bk] = 'k';
  let wk;
  do { wk = free(); } while (Math.abs((wk >> 3) - (bk >> 3)) <= 1 && Math.abs((wk & 7) - (bk & 7)) <= 1);
  board[wk] = 'K';
  const white = [];
  if (rand() < 0.55) white.push('Q');
  for (const [p, max] of [['R', 2], ['B', 2], ['N', 2], ['P', 3]]) {
    const n = Math.floor(rand() * (max + 1));
    for (let i = 0; i < n; i++) white.push(p);
  }
  const black = [];
  for (const [p, max] of [['r', 1], ['b', 1], ['n', 2], ['p', 4], ['q', rand() < 0.15 ? 1 : 0]]) {
    const n = Math.floor(rand() * (max + 1));
    for (let i = 0; i < n; i++) black.push(p);
  }
  if (white.length < 2 || white.length > 6) return null;
  // Большинство фигур — рядом с чёрным королём: так чаще получаются задачи.
  const near = (i, d) => Math.max(Math.abs((i >> 3) - (bk >> 3)), Math.abs((i & 7) - (bk & 7))) <= d;
  for (const p of white.concat(black)) {
    const radius = p === p.toLowerCase() ? 2 : 3;
    const close = rand() < 0.8;
    let i, tries = 0;
    do {
      i = free();
      tries++;
    } while (tries < 60 && ((close && !near(i, radius)) ||
      (p.toLowerCase() === 'p' && ((i >> 3) === 0 || (i >> 3) === 7))));
    if (p.toLowerCase() === 'p' && ((i >> 3) === 0 || (i >> 3) === 7)) return null;
    board[i] = p;
  }
  const fen = boardFen(board) + ' w - - 0 1';
  const g = new Chess(fen);
  if (g.inCheck('w') || g.inCheck('b')) return null;
  return g;
}

function boardFen(board) {
  const g = new Chess('8/8/8/8/8/8/8/8 w - - 0 1');
  g.board = board;
  return g.fen().split(' ')[0];
}

function kingMoves(g) {
  return g.moves().filter((m) => m.piece.toLowerCase() === 'k').length;
}

function evaluate(g) {
  if (matingMoves(g, 1, true).length) return null;
  // Ищем ключ; второй найденный ключ — задача с двумя решениями, такие не берём.
  const keys = [];
  for (const m of g.moves()) {
    g.makeMove(m);
    const ok = forcedMate(g, 1);
    g.undo();
    if (ok) keys.push(m);
    if (keys.length > 1) return null;
  }
  if (keys.length !== 1) return null;
  const key = keys[0];
  if (key.promotion) return null;
  g.makeMove(key);
  const check = g.inCheck();
  const replies = g.moves();
  const mates = new Set();
  let duals = 0;
  for (const r of replies) {
    g.makeMove(r);
    const m = matingMoves(g, 1);
    g.undo();
    if (m.length > 1) duals++;
    for (const x of m) mates.add(x.from + '-' + x.to);
  }
  const flightsAfter = kingMoves(g);
  // Есть ли угроза: если бы чёрные пропустили ход, был бы мат?
  const passed = g.clone();
  passed.turn = 'w';
  passed.ep = -1;
  const threat = check || (!passed.inCheck('b') && matingMoves(passed, 1, true).length > 0);
  // Ключевую фигуру можно съесть — жертва.
  const sacrifice = g.isAttacked(key.to, 'b');
  g.undo();
  const before = g.clone();
  before.turn = 'b';
  const flightsBefore = before.inCheck('w') ? 0 : kingMoves(before);
  const whiteMaterial = g.board.reduce((s, p) => s + (p && p !== 'K' && p === p.toUpperCase() ? VAL[p.toLowerCase()] : 0), 0);
  const quiet = !check && !key.captured;
  const score = mates.size * 2 + replies.length * 0.3 - duals * 1.5 + (quiet ? 6 : 0) + (check ? -2 : 0) +
    (threat ? 0 : 6) + (flightsAfter > flightsBefore ? 4 : 0) + (sacrifice ? 4 : 0) +
    (key.piece === 'K' ? 3 : 0) - Math.max(0, whiteMaterial - 16) * 0.5;
  return {
    fen: g.fen(), key: squareName(key.from) + squareName(key.to), score: Math.round(score * 10) / 10,
    variations: mates.size, replies: replies.length, duals, threat, sacrifice, quiet, check, capture: !!key.captured,
    flight: flightsAfter > flightsBefore, piece: key.piece,
  };
}

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

function search(seconds) {
  const out = [];
  const end = Date.now() + seconds * 1000;
  let tried = 0;
  while (Date.now() < end) {
    const g = randomPosition();
    if (!g) continue;
    tried++;
    const r = evaluate(g);
    if (r) out.push(r);
  }
  return { out, tried };
}

if (!isMainThread) {
  seed = workerData.seed;
  parentPort.postMessage(search(workerData.seconds));
  return;
}

const THREADS = require('os').cpus().length;
const results = await_all();
function await_all() {
  return Promise.all(Array.from({ length: THREADS }, (_, t) => new Promise((resolve, reject) => {
    const w = new Worker(__filename, { workerData: { seed: seed * 7919 + t * 104729 + 1, seconds: SECONDS }, argv: process.argv.slice(2) });
    w.on('message', resolve);
    w.on('error', reject);
  })));
}
results.then((parts) => {
const found = [];
const seen = new Set();
let tried = 0;
for (const p of parts) {
  tried += p.tried;
  for (const r of p.out) if (!seen.has(r.fen)) { seen.add(r.fen); found.push(r); }
}
found.sort((a, b) => b.score - a.score);
// Разнообразие: не больше трети задач с ключом одной и той же фигурой.
const chosen = [];
const perPiece = {};
for (const r of found) {
  if ((perPiece[r.piece] || 0) >= Math.ceil(WANT / 3)) continue;
  perPiece[r.piece] = (perPiece[r.piece] || 0) + 1;
  chosen.push(r);
  if (chosen.length === WANT) break;
}
chosen.sort((a, b) => a.score - b.score);
console.error(`tried ${tried}, found ${found.length}`);
console.log(JSON.stringify(chosen, null, 1));
});
