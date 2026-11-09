// Гомоку и рэндзю: правила, доска, поиск выигрыша угрозами (четвёрками и тройками).
// Без рисования — используется страницей, фоновым «мозгом» (worker.js), тестами и генератором задач.
(function (root) {
  'use strict';

  const N = 15, SIZE = N * N;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const other = (c) => 3 - c;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const idx = (x, y) => y * N + x;
  const X = (i) => i % N;
  const Y = (i) => (i - (i % N)) / N;
  const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  // Координата клетки вдоль направления (у всех направлений, кроме вертикали, x растёт на 1).
  const along = (i, d) => (d === 1 ? Y(i) : X(i));

  // Правила. exact — «ровно пять» (6+ не выигрывает ни у кого); f33/f44/f6 — запреты для чёрных.
  const PRESETS = {
    free: { exact: false, f33: false, f44: false, f6: false },
    standard: { exact: true, f33: false, f44: false, f6: false },
    renju: { exact: false, f33: true, f44: true, f6: true },
  };
  const rulesOf = (r) => (typeof r === 'string' ? PRESETS[r] : r) || PRESETS.free;
  const hasForbid = (R) => R.f33 || R.f44 || R.f6;
  // Выигрывает ли длинный ряд (6+) у этого цвета.
  const overWins = (c, R) => !R.exact && !(c === BLACK && R.f6);

  // Лучи из клетки в каждую сторону каждого направления (до 5 клеток).
  const RAY = [];
  for (let i = 0; i < SIZE; i++) {
    RAY.push(DIRS.map(([dx, dy]) => [1, -1].map((s) => {
      const out = [];
      for (let k = 1; k <= 5; k++) {
        const x = X(i) + s * k * dx, y = Y(i) + s * k * dy;
        if (!inside(x, y)) break;
        out.push(idx(x, y));
      }
      return out;
    })));
  }

  // Окна из пяти клеток подряд: по ним быстро видно, где можно сделать четыре или пять.
  const WIN = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      for (const [dx, dy] of DIRS) {
        if (!inside(x + 4 * dx, y + 4 * dy)) continue;
        WIN.push([0, 1, 2, 3, 4].map((k) => idx(x + k * dx, y + k * dy)));
      }
    }
  }
  const CELL_WIN = Array.from({ length: SIZE }, () => []);
  WIN.forEach((w, k) => w.forEach((i) => CELL_WIN[i].push(k)));

  // Длина ряда цвета c через клетку i в направлении d (клетка i считается камнем c).
  function lineLen(b, i, c, d) {
    let n = 1;
    for (const ray of RAY[i][d]) {
      for (const j of ray) {
        if (b[j] !== c) break;
        n++;
      }
    }
    return n;
  }
  // Ход c в i — победа?
  function isWinAt(b, i, c, R) {
    for (let d = 0; d < 4; d++) {
      const L = lineLen(b, i, c, d);
      if (L === 5 || (L > 5 && overWins(c, R))) return true;
    }
    return false;
  }

  // Точки, куда c (уже стоящий в i) может поставить пятый в направлении d. Возвращает клетки.
  function fivePointsDir(b, i, c, R, d) {
    const out = [];
    for (const ray of RAY[i][d]) {
      for (let k = 0; k < 4 && k < ray.length; k++) {
        const q = ray[k];
        if (b[q] === EMPTY) {
          const L = lineLen(b, q, c, d);
          if (L === 5 || (L > 5 && overWins(c, R))) out.push(q);
        } else if (b[q] !== c) break;
      }
    }
    return out;
  }
  // Сколько четвёрок в направлении d: 0, 1 (в том числе открытая) или 2 (две в одной линии: X.XXX.X).
  function fourDir(b, i, c, R, d) {
    const p = fivePointsDir(b, i, c, R, d);
    if (p.length === 0) return { n: 0, straight: false };
    if (p.length === 2 && Math.abs(along(p[0], d) - along(p[1], d)) === 5) return { n: 1, straight: true };
    return { n: Math.min(2, p.length), straight: false };
  }
  // Открытая тройка в направлении d через i: можно одним (разрешённым) ходом сделать открытую четвёрку.
  function openThreeDir(b, i, c, R, d, depth) {
    if (fourDir(b, i, c, R, d).n > 0) return false;
    const ti = along(i, d);
    for (const ray of RAY[i][d]) {
      for (let k = 0; k < 4 && k < ray.length; k++) {
        const q = ray[k];
        if (b[q] === EMPTY) {
          b[q] = c;
          const p = fivePointsDir(b, q, c, R, d);
          b[q] = EMPTY;
          if (p.length === 2) {
            const t1 = along(p[0], d), t2 = along(p[1], d);
            if (Math.abs(t1 - t2) === 5 && Math.min(t1, t2) < ti && ti < Math.max(t1, t2)) {
              if (c !== BLACK || !hasForbid(R) || !forbiddenKind(b, q, R, depth + 1)) return true;
            }
          }
        } else if (b[q] !== c) break;
      }
    }
    return false;
  }

  // Запрещённый ход чёрных: '33', '44', '6' или null. Пять в ряд — всегда можно.
  function forbiddenKind(b, i, R, depth) {
    depth = depth || 0;
    if (b[i] !== EMPTY || !hasForbid(R)) return null;
    b[i] = BLACK;
    let res = null;
    let five = false, over = false;
    for (let d = 0; d < 4; d++) {
      const L = lineLen(b, i, BLACK, d);
      if (L === 5) five = true;
      else if (L > 5) over = true;
    }
    if (!five) {
      if (over && R.f6) res = '6';
      if (!res && R.f44) {
        let n = 0;
        for (let d = 0; d < 4; d++) n += fourDir(b, i, BLACK, R, d).n;
        if (n >= 2) res = '44';
      }
      if (!res && R.f33 && depth < 4) {
        let n = 0;
        for (let d = 0; d < 4 && n < 2; d++) if (openThreeDir(b, i, BLACK, R, d, depth)) n++;
        if (n >= 2) res = '33';
      }
    }
    b[i] = EMPTY;
    return res;
  }
  const isForbidden = (b, i, R) => !!forbiddenKind(b, i, R, 0);
  const legal = (b, i, c, R) => b[i] === EMPTY && !(c === BLACK && isForbidden(b, i, R));

  // Детерминированные случайные числа для хэшей позиций.
  let seed = 20240607;
  const rnd32 = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const Z = [null, [], []].map((a) => (a ? Array.from({ length: SIZE }, () => [rnd32(), rnd32() & 0x1fffff]) : null));

  // Ценность окна из пяти клеток (для оценки позиции): только камни одного цвета.
  const V = [0, 1, 12, 150, 2200, 100000];
  const winValue = (bc, wc) => (bc && wc ? 0 : bc ? V[bc] : wc ? -V[wc] : 0);

  // Доска: камни, счётчики камней в окнах, хэш, оценка (с точки зрения чёрных), ходы.
  class Board {
    constructor(rules) {
      this.R = rulesOf(rules);
      this.b = new Int8Array(SIZE);
      this.cnt = [null, new Int8Array(WIN.length), new Int8Array(WIN.length)];
      this.h1 = 0;
      this.h2 = 0;
      this.score = 0;
      this.moves = [];
    }
    play(i, c) {
      const cb = this.cnt[BLACK], cw = this.cnt[WHITE], cc = this.cnt[c];
      for (const w of CELL_WIN[i]) {
        const before = winValue(cb[w], cw[w]);
        cc[w]++;
        this.score += winValue(cb[w], cw[w]) - before;
      }
      this.b[i] = c;
      this.h1 ^= Z[c][i][0];
      this.h2 ^= Z[c][i][1];
      this.moves.push(i);
    }
    undo() {
      const i = this.moves.pop();
      const c = this.b[i];
      const cb = this.cnt[BLACK], cw = this.cnt[WHITE], cc = this.cnt[c];
      for (const w of CELL_WIN[i]) {
        const before = winValue(cb[w], cw[w]);
        cc[w]--;
        this.score += winValue(cb[w], cw[w]) - before;
      }
      this.b[i] = EMPTY;
      this.h1 ^= Z[c][i][0];
      this.h2 ^= Z[c][i][1];
      return i;
    }
    key() { return (this.h1 >>> 0) + this.h2 * 4294967296; }
    turn() { return this.moves.length % 2 === 0 ? BLACK : WHITE; }
  }
  // Доска из списков камней.
  function boardFrom(rules, black, white) {
    const B = new Board(rules);
    const n = Math.max(black.length, white.length);
    for (let k = 0; k < n; k++) {
      if (k < black.length) B.play(black[k], BLACK);
      if (k < white.length) B.play(white[k], WHITE);
    }
    return B;
  }

  // ---------- Угрозы ----------
  // Точки, куда c ставит пять (выигрывает).
  function fivePoints(B, c) {
    const o = other(c), mine = B.cnt[c], theirs = B.cnt[o], out = [];
    for (let w = 0; w < WIN.length; w++) {
      if (mine[w] !== 4 || theirs[w] !== 0) continue;
      for (const e of WIN[w]) {
        if (B.b[e] === EMPTY && out.indexOf(e) < 0 && isWinAt(B.b, e, c, B.R)) out.push(e);
      }
    }
    return out;
  }
  // Ходы c, после которых у него четвёрка (угроза пяти). Не пять и не запрещённые.
  function fourMoves(B, c) {
    const o = other(c), mine = B.cnt[c], theirs = B.cnt[o], seen = new Set(), out = [];
    for (let w = 0; w < WIN.length; w++) {
      if (mine[w] !== 3 || theirs[w] !== 0) continue;
      for (const e of WIN[w]) {
        if (B.b[e] !== EMPTY || seen.has(e)) continue;
        seen.add(e);
        if (isWinAt(B.b, e, c, B.R)) continue;
        B.b[e] = c;
        let four = false;
        for (let d = 0; d < 4 && !four; d++) if (fivePointsDir(B.b, e, c, B.R, d).length) four = true;
        B.b[e] = EMPTY;
        if (four && !(c === BLACK && hasForbid(B.R) && isForbidden(B.b, e, B.R))) out.push(e);
      }
    }
    return out;
  }
  // Ходы c, которые делают открытую тройку (и не четвёрку).
  function threeMoves(B, c, exclude) {
    const o = other(c), mine = B.cnt[c], theirs = B.cnt[o], seen = new Set(exclude || []), out = [];
    for (let w = 0; w < WIN.length; w++) {
      if (mine[w] !== 2 || theirs[w] !== 0) continue;
      for (const e of WIN[w]) {
        if (B.b[e] !== EMPTY || seen.has(e)) continue;
        seen.add(e);
        B.b[e] = c;
        let three = false;
        for (let d = 0; d < 4 && !three; d++) if (openThreeDir(B.b, e, c, B.R, d, 0)) three = true;
        B.b[e] = EMPTY;
        if (three && !(c === BLACK && hasForbid(B.R) && isForbidden(B.b, e, B.R))) out.push(e);
      }
    }
    return out;
  }

  // ---------- Решатель: выигрыш угрозами ----------
  // n — сколько своих ходов (включая последний, пятый камень). threes — можно ли угрожать тройками.
  // Защитник рассматривает все разумные ответы: закрыть угрозу (клетки на линиях последнего хода)
  // или сделать свою четвёрку. Поэтому найденный выигрыш — настоящий.
  class BudgetError extends Error {}
  function makeCtx(opts) {
    return { threes: !!(opts && opts.threes), limit: (opts && opts.limit) || 400000, nodes: 0, tt: new Map() };
  }
  function attack(B, c, n, ctx) {
    if (++ctx.nodes > ctx.limit) throw new BudgetError('budget');
    if (fivePoints(B, c).length) return true;
    if (n <= 1) return false;
    if (fivePoints(B, other(c)).length) return false; // сначала пришлось бы защищаться
    const key = B.key() + ':' + c + n + (ctx.threes ? 't' : '');
    const hit = ctx.tt.get(key);
    if (hit !== undefined) return hit;
    let cands = fourMoves(B, c);
    if (ctx.threes && n >= 3) cands = cands.concat(threeMoves(B, c, cands));
    let res = false;
    for (const m of cands) {
      B.play(m, c);
      const r = defend(B, c, n - 1, m, ctx);
      B.undo();
      if (r) { res = true; break; }
    }
    ctx.tt.set(key, res);
    return res;
  }
  // Ответ защитника после угрозы c ходом last. true — c всё равно выигрывает.
  function defend(B, c, n, last, ctx) {
    if (++ctx.nodes > ctx.limit) throw new BudgetError('budget');
    const o = other(c);
    if (fivePoints(B, o).length) return false;
    const fp = fivePoints(B, c);
    if (fp.length >= 2) return true;
    if (fp.length === 1) {
      const q = fp[0];
      if (o === BLACK && hasForbid(B.R) && isForbidden(B.b, q, B.R)) return true; // закрыть нельзя — запрет
      B.play(q, o);
      const r = attack(B, c, n, ctx);
      B.undo();
      return r;
    }
    if (n < 2) return false;
    // Угроза — тройка: защитник ставит на её линии или отвечает своей четвёркой.
    const cands = new Set(fourMoves(B, o));
    for (let d = 0; d < 4; d++) {
      for (const ray of RAY[last][d]) for (const q of ray) if (B.b[q] === EMPTY) cands.add(q);
    }
    for (const q of cands) {
      if (o === BLACK && hasForbid(B.R) && isForbidden(B.b, q, B.R)) continue;
      B.play(q, o);
      let r;
      if (fivePoints(B, o).length) {
        // Защитник сделал четвёрку — атакующий обязан закрыть, потом защитник ходит снова.
        const f = fivePoints(B, o);
        if (f.length >= 2 || (c === BLACK && hasForbid(B.R) && isForbidden(B.b, f[0], B.R))) r = false;
        else if (isWinAt(B.b, f[0], c, B.R)) r = true;
        else {
          B.play(f[0], c);
          r = defend(B, c, n, last, ctx); // угроза атакующего (ход last) по-прежнему на доске
          B.undo();
        }
      } else {
        r = attack(B, c, n, ctx);
      }
      B.undo();
      if (!r) return false;
    }
    return true;
  }

  // Первые ходы c, выигрывающие не дольше чем за n своих ходов. null — не уложились в бюджет.
  const winningMoves = (B, c, n, opts) => safeWinning(B, c, n, opts, B.moves.length);
  // Может ли c (его ход) выиграть за n ходов. null — не уложились в бюджет.
  function canWin(B, c, n, opts) {
    const ctx = makeCtx(opts);
    const depth = B.moves.length;
    try {
      return attack(B, c, n, ctx);
    } catch (e) {
      if (!(e instanceof BudgetError)) throw e;
      while (B.moves.length > depth) B.undo();
      return null;
    }
  }
  // Самый короткий выигрыш: { n, moves } или null.
  function shortestWin(B, c, maxN, opts) {
    for (let n = 1; n <= maxN; n++) {
      const depth = B.moves.length;
      const m = safeWinning(B, c, n, opts, depth);
      if (m === null) return null;
      if (m.length) return { n, moves: m };
    }
    return { n: 0, moves: [] };
  }
  function safeWinning(B, c, n, opts, depth) {
    const ctx = makeCtx(opts);
    const fives = fivePoints(B, c);
    if (fives.length) return fives;
    if (n <= 1 || fivePoints(B, other(c)).length) return [];
    let cands = fourMoves(B, c);
    if (ctx.threes && n >= 3) cands = cands.concat(threeMoves(B, c, cands));
    const out = [];
    try {
      for (const m of cands) {
        B.play(m, c);
        const r = defend(B, c, n - 1, m, ctx);
        B.undo();
        if (r) out.push(m);
      }
    } catch (e) {
      if (!(e instanceof BudgetError)) throw e;
      while (B.moves.length > depth) B.undo();
      return null;
    }
    return out;
  }
  // Как защитнику ответить на угрозу последнего хода атакующего (для показа в уроках):
  // закрыть пять, иначе — клетку на линии угрозы. -1 — закрыть нечем: у чёрных это только запрещённый ход.
  function defenseFor(B, c, last) {
    const o = other(c);
    const fp = fivePoints(B, c);
    if (fp.length) {
      const ok = fp.filter((q) => !(o === BLACK && hasForbid(B.R) && isForbidden(B.b, q, B.R)));
      return ok.length ? ok[0] : -1;
    }
    let best = -1, bestScore = -Infinity;
    for (let d = 0; d < 4; d++) {
      for (const ray of RAY[last][d]) {
        for (let k = 0; k < 4 && k < ray.length; k++) {
          const q = ray[k];
          if (B.b[q] !== EMPTY || (o === BLACK && hasForbid(B.R) && isForbidden(B.b, q, B.R))) continue;
          const s = (4 - k) + (openThreeDirAfter(B, last, c, d, q) ? 0 : 10);
          if (s > bestScore) { bestScore = s; best = q; }
        }
      }
    }
    return best;
  }
  // Ломает ли ход защитника q открытую тройку атакующего в направлении d.
  function openThreeDirAfter(B, last, c, d, q) {
    B.b[q] = other(c);
    const r = openThreeDir(B.b, last, c, B.R, d, 0);
    B.b[q] = EMPTY;
    return r;
  }

  // ---------- Запись ходов: «h8» — столбец a–o слева направо, строка 1–15 снизу вверх ----------
  const LETTERS = 'abcdefghijklmno';
  const toName = (i) => LETTERS[X(i)] + (N - Y(i));
  const fromName = (s) => idx(LETTERS.indexOf(s[0]), N - Number(s.slice(1)));
  const parseList = (s) => (s ? s.trim().split(/[\s,]+/).filter(Boolean).map(fromName) : []);

  const api = {
    N, SIZE, EMPTY, BLACK, WHITE, DIRS, PRESETS, WIN, CELL_WIN, V,
    other, idx, X, Y, inside, rulesOf, hasForbid, Board, boardFrom,
    lineLen, isWinAt, forbiddenKind, isForbidden, legal, fourDir, openThreeDir,
    fivePoints, fourMoves, threeMoves, winningMoves, canWin, shortestWin, defenseFor,
    toName, fromName, parseList,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gomoku = api;
})(this);
