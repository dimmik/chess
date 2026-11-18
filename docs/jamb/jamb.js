// Сербский ямб: правила, подсчёт очков и простой компьютерный игрок.
// 5 кубиков, до 3 бросков за ход. Столбцы: ↓ (сверху вниз), ↑ (снизу вверх), свободный, объява.
(function (root) {
  'use strict';

  const ROWS = ['1', '2', '3', '4', '5', '6', 'max', 'min', 'kenta', 'triling', 'ful', 'poker', 'jamb'];
  const ALL_COLS = ['down', 'up', 'free', 'announce'];
  const TOP = ['1', '2', '3', '4', '5', '6'];
  const BOTTOM = ['kenta', 'triling', 'ful', 'poker', 'jamb'];
  const DICE = 5;

  const counts = (dice) => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dice) c[d]++;
    return c;
  };
  const sum = (dice) => dice.reduce((a, b) => a + b, 0);

  // Сколько очков даёт строка при этих кубиках; rollNo — каким броском получено (для кенты).
  function score(row, dice, rollNo) {
    const c = counts(dice);
    if (TOP.includes(row)) return c[+row] * +row;
    if (row === 'max' || row === 'min') return sum(dice);
    if (row === 'kenta') {
      const s = new Set(dice);
      const ok = s.size === 5 && !(s.has(1) && s.has(6)); // 1-2-3-4-5 или 2-3-4-5-6
      return ok ? [0, 66, 56, 46][rollNo] : 0;
    }
    if (row === 'triling') {
      for (let n = 6; n >= 1; n--) if (c[n] >= 3) return 3 * n + 20;
      return 0;
    }
    if (row === 'ful') {
      const three = c.indexOf(3), two = c.indexOf(2);
      return three > 0 && two > 0 ? sum(dice) + 30 : 0;
    }
    if (row === 'poker') {
      for (let n = 6; n >= 1; n--) if (c[n] >= 4) return 4 * n + 40;
      return 0;
    }
    if (row === 'jamb') {
      for (let n = 6; n >= 1; n--) if (c[n] === 5) return 5 * n + 50;
      return 0;
    }
    return 0;
  }

  function emptySheet(cols) {
    const sheet = {};
    for (const col of cols) {
      sheet[col] = {};
      for (const row of ROWS) sheet[col][row] = null;
    }
    return sheet;
  }

  const isFull = (sheet, cols) => cols.every((col) => ROWS.every((row) => sheet[col][row] !== null));

  // Обязательно объявлять: кроме объявы, писать больше некуда.
  const mustAnnounce = (sheet, cols) => cols.includes('announce') &&
    cols.filter((c) => c !== 'announce').every((col) => ROWS.every((row) => sheet[col][row] !== null));

  // Можно ли сейчас записать в клетку. announced — объявленная строка (или null).
  function allowed(sheet, col, row, announced) {
    if (!sheet[col] || sheet[col][row] !== null) return false;
    if (announced) return col === 'announce' && row === announced;
    if (col === 'down') return ROWS.find((r) => sheet.down[r] === null) === row;
    if (col === 'up') return [...ROWS].reverse().find((r) => sheet.up[r] === null) === row;
    if (col === 'free') return true;
    return false; // в объяву — только после объявления
  }

  function allowedCells(sheet, cols, announced) {
    const out = [];
    for (const col of cols) for (const row of ROWS) if (allowed(sheet, col, row, announced)) out.push({ col, row });
    return out;
  }

  // Итоги столбца: верх (с бонусом 30 за 60+), разница (Макс − Мин) × единицы, низ, всего.
  function columnTotals(colSheet) {
    const v = (r) => colSheet[r] || 0;
    const top = TOP.reduce((s, r) => s + v(r), 0);
    const bonus = top >= 60 ? 30 : 0;
    const delta = colSheet.max !== null && colSheet.min !== null ? colSheet.max - colSheet.min : null;
    const ones = colSheet['1'];
    const diffReady = delta !== null && ones !== null;
    const diff = diffReady ? Math.max(0, delta * ones) : 0;
    const bottom = BOTTOM.reduce((s, r) => s + v(r), 0);
    return { top: top + bonus, bonus, delta, ones, diff, diffReady, bottom, total: top + bonus + diff + bottom };
  }

  const total = (sheet, cols) => cols.reduce((s, col) => s + columnTotals(sheet[col]).total, 0);

  // ---------- Запись партии и повтор ----------
  // rec = { cols, players: [{ name, type }], over, log: [ход] }, ход = { p: игрок, r: ['33356', …] — кубики
  // после каждого броска, h: ['11100', …] — какие кубики были оставлены перед 2-м и 3-м броском,
  // a: объявленная строка (если была), w: { c: столбец, r: строка, v: очки } — запись (у недоигранного хода нет) }.

  // Листы игроков после первых turns ходов.
  function replaySheets(rec, turns) {
    const sheets = rec.players.map(() => emptySheet(rec.cols));
    for (let t = 0; t < Math.min(turns, rec.log.length); t++) {
      const { p, w } = rec.log[t];
      if (w) sheets[p][w.c][w.r] = w.v;
    }
    return sheets;
  }

  // Шаги повтора: начало, каждый бросок, объява, запись; у доигранной партии в конце — итог.
  function replaySteps(rec) {
    const steps = [{ kind: 'start', t: -1 }];
    rec.log.forEach((turn, t) => {
      turn.r.forEach((_, n) => {
        steps.push({ kind: 'roll', t, n: n + 1 });
        if (n === 0 && turn.a) steps.push({ kind: 'announce', t });
      });
      if (turn.w) steps.push({ kind: 'write', t });
    });
    if (rec.over) steps.push({ kind: 'end', t: rec.log.length });
    return steps;
  }

  // Что видно на шаге k: листы, чей ход, кубики (и какие были оставлены), объява.
  function replayState(rec, steps, k) {
    const step = steps[k];
    const turn = rec.log[step.t];
    const st = {
      step, turn, sheets: replaySheets(rec, step.kind === 'write' ? step.t + 1 : step.t),
      current: turn ? turn.p : 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rollNo: 0, announced: null,
    };
    if (turn && turn.r.length) {
      const n = step.kind === 'roll' ? step.n : step.kind === 'announce' ? 1 : turn.r.length;
      st.rollNo = n;
      st.dice = turn.r[n - 1].split('').map(Number);
      if (step.kind === 'roll' && n > 1) st.held = turn.h[n - 2].split('').map((c) => c === '1');
      if (turn.a && !(step.kind === 'roll' && n === 1)) st.announced = turn.a;
    }
    return st;
  }

  // ---------- Компьютерный игрок: простой и не слишком умный ----------

  // «Нормальный» результат строки: запись ниже — плохо, выше — хорошо. Зачеркнуть строку стоит её «нормы».
  const PAR = { 1: 3, 2: 6, 3: 9, 4: 12, 5: 15, 6: 18, max: 23, kenta: 25, triling: 28, ful: 32, poker: 25, jamb: 15 };

  function utility(row, value) {
    if (row === 'min') return 14 - value;          // чем меньше, тем лучше
    if (row === 'max') return value - PAR.max;
    if (TOP.includes(row)) return value - PAR[row] + (value >= 4 * +row ? 3 : 0);
    return value > 0 ? value - PAR[row] : -PAR[row];
  }

  function bestCell(sheet, cols, announced, dice, rollNo, noise = 0) {
    let best = null;
    for (const cell of allowedCells(sheet, cols, announced)) {
      let u = utility(cell.row, score(cell.row, dice, rollNo)) + (Math.random() - 0.5) * noise;
      if (cell.col === 'down' || cell.col === 'up') u += 1; // эти столбцы лучше заполнять понемногу
      if (!best || u > best.u) best = { ...cell, u };
    }
    return best;
  }

  // Какие кубики оставить. target — строка, к которой стремимся (объява), иначе — по ситуации.
  function holdFor(dice, row) {
    const c = counts(dice);
    if (TOP.includes(row)) return dice.map((d) => d === +row);
    if (row === 'max') return dice.map((d) => d >= 5);
    if (row === 'min') return dice.map((d) => d <= 2);
    if (row === 'kenta') {
      const seen = new Set();
      const want = c[1] > 0 && c[6] === 0 ? [1, 2, 3, 4, 5] : [2, 3, 4, 5, 6];
      return dice.map((d) => (want.includes(d) && !seen.has(d) ? (seen.add(d), true) : false));
    }
    if (row === 'ful') {
      const pairs = [1, 2, 3, 4, 5, 6].filter((n) => c[n] >= 2).sort((a, b) => c[b] - c[a] || b - a).slice(0, 2);
      const keep = {};
      for (const n of pairs) keep[n] = Math.min(c[n], 3);
      return dice.map((d) => (keep[d] > 0 ? (keep[d]--, true) : false));
    }
    // трилинг, покер, ямб: копим самое частое (при равенстве — большее)
    let v = 6;
    for (let n = 6; n >= 1; n--) if (c[n] > c[v]) v = n;
    return dice.map((d) => d === v);
  }

  // Решение после броска: { announce?: row, write?: {col,row}, hold?: bool[] }.
  function aiDecide(sheet, cols, announced, dice, rollNo) {
    const c = counts(dice);
    // Объява: обязательно, если больше некуда, или если сразу выпало что-то крупное.
    if (rollNo === 1 && !announced && cols.includes('announce')) {
      const open = ROWS.filter((r) => sheet.announce[r] === null);
      if (open.length && (mustAnnounce(sheet, cols) || (Math.max(...c) >= 4 && (open.includes('poker') || open.includes('jamb'))))) {
        let pick = open[0], bestU = -Infinity;
        for (const r of open) {
          const u = utility(r, score(r, dice, 1)) + (r === 'jamb' && Math.max(...c) >= 4 ? 10 : 0);
          if (u > bestU) { bestU = u; pick = r; }
        }
        return { announce: pick };
      }
    }
    const best = bestCell(sheet, cols, announced, dice, rollNo, 4);
    if (rollNo >= 3 || (best && best.u >= 12)) return { write: best };
    // Куда стремимся: объявленная строка, кента (если почти собрана и её можно писать) или самое частое.
    let target = announced;
    if (!target) {
      const open = (r) => cols.some((col) => allowed(sheet, col, r, null));
      const distinct = new Set(dice);
      const run = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]].map((k) => k.filter((n) => distinct.has(n)).length);
      if (open('kenta') && Math.max(...run) >= 4) target = 'kenta';
      else if (Math.max(...c) <= 1 && open('max')) target = 'max';
      else target = 'jamb';
    }
    return { hold: holdFor(dice, target) };
  }

  // ---------- «Хитрый» компьютер: быстрая партия (один свободный столбец) ----------
  // Каждый ход точно перебирает три броска: что оставить и куда записать. Позицию после записи
  // оценивает по таблицам из smart-data.js — их считает tools/jamb-smart.c из точного решения игры.
  // Играет почти как лучшая стратегия: ~313 очков в среднем против ~255 у простого компьютера.
  const R1 = 0, RMAX = 6, RMIN = 7, NROWS = ROWS.length, FULL = (1 << NROWS) - 1;
  let SM = null;

  function smartTables() {
    if (SM) return SM;
    const data = typeof module !== 'undefined' && module.exports ? require('./smart-data.js') : root.JambSmartData;
    if (!data) return null;
    const code = (c) => c.slice(1).reduce((x, n) => x * 6 + n, 0);
    const kcnt = [], dcnt = [], kidx = new Map(), didx = new Map();
    const c = [0, 0, 0, 0, 0, 0, 0];
    (function rec(f, left) {
      if (f > 6) {
        kidx.set(code(c), kcnt.length); kcnt.push(c.slice());
        if (left === 0) { didx.set(code(c), dcnt.length); dcnt.push(c.slice()); }
        return;
      }
      for (let n = 0; n <= left; n++) { c[f] = n; rec(f + 1, left - n); }
      c[f] = 0;
    })(1, DICE);
    const fact = [1, 1, 2, 6, 24, 120];
    // Оставили набор k — какие наборы выйдут после броска остальных и с какой вероятностью.
    const trans = kcnt.map((k) => {
      const r = DICE - k.reduce((a, b) => a + b, 0), out = [];
      for (const j of kcnt) {
        if (j.reduce((a, b) => a + b, 0) !== r) continue;
        let p = fact[r] / 6 ** r;
        const t = [0, 0, 0, 0, 0, 0, 0];
        for (let f = 1; f <= 6; f++) { p /= fact[j[f]]; t[f] = k[f] + j[f]; }
        out.push([didx.get(code(t)), p]);
      }
      return out;
    });
    // Что можно оставить из набора d.
    const subs = dcnt.map((d) => {
      const out = [], t = [0, 0, 0, 0, 0, 0, 0];
      (function rec(f) {
        if (f > 6) { out.push(kidx.get(code(t))); return; }
        for (let n = 0; n <= d[f]; n++) { t[f] = n; rec(f + 1); }
        t[f] = 0;
      })(1);
      return out;
    });
    const diceOf = (cnt) => { const a = []; for (let f = 1; f <= 6; f++) for (let n = 0; n < cnt[f]; n++) a.push(f); return a; };
    const sc = [null, 1, 2, 3].map((r) => r && ROWS.map((row) => dcnt.map((d) => score(row, diceOf(d), r))));
    SM = { code, kcnt, kidx, didx, trans, subs, sc, data, cache: new Map() };
    return SM;
  }

  // «1» / Макс / Мин: pattern — что из них записано (1, 2, 4); ds — их значения, пока разница не посчитана.
  const patternOf = (mask) => (mask & 1) | ((mask >> RMAX & 1) << 1) | ((mask >> RMIN & 1) << 2);

  function smartState(col) {
    let mask = 0, top = 0;
    ROWS.forEach((row, i) => { if (col[row] !== null) mask |= 1 << i; });
    for (const row of TOP) top += col[row] || 0;
    const o = col['1'], M = col.max, m = col.min;
    const ds = [0, o, M - 5, o * 26 + M - 5, m - 5, o * 26 + m - 5, Math.max(0, M - m), 0][patternOf(mask)];
    return { mask, top: Math.min(60, top), ds };
  }

  // Записать v в строку i: очки сейчас (с бонусом и разницей, когда она становится известна) и новая позиция.
  // Сами Макс и Мин в итог не входят — только через (Макс − Мин) × «1».
  function smartWrite(st, i, v) {
    let reward = i === RMAX || i === RMIN ? 0 : v, top = st.top, ds = st.ds;
    const mask = st.mask | (1 << i);
    if (i < 6) { if (top < 60 && top + v >= 60) reward += 30; top = Math.min(60, top + v); }
    if (i === R1 || i === RMAX || i === RMIN) {
      const p = patternOf(st.mask);
      let o = [, st.ds, , Math.floor(st.ds / 26), , Math.floor(st.ds / 26)][p];
      let M = [, , st.ds + 5, st.ds % 26 + 5][p], m = [, , , , st.ds + 5, st.ds % 26 + 5][p];
      let d = p === 6 ? st.ds : null;
      if (i === R1) o = v; else if (i === RMAX) M = v; else m = v;
      const np = patternOf(mask);
      if (np === 7) { reward += (d !== null ? d : Math.max(0, M - m)) * o; ds = 0; }
      else ds = [0, o, M - 5, o * 26 + M - 5, m - 5, o * 26 + m - 5, Math.max(0, M - m)][np];
    }
    return { reward, mask, top, ds };
  }

  function smartValue(s) {
    if (s.mask === FULL) return 0;
    const D = SM.data;
    return (D.a0[s.mask] + D.c[s.mask & 63][s.top] + D.b[patternOf(s.mask)][s.ds]) / 10;
  }

  function smartBestWrite(st, r, d) {
    let best = -Infinity, row = -1;
    for (let i = 0; i < NROWS; i++) {
      if (st.mask & (1 << i)) continue;
      const n = smartWrite(st, i, SM.sc[r][i][d]);
      const v = n.reward + smartValue(n);
      if (v > best) { best = v; row = i; }
    }
    return { v: best, row };
  }

  // Ценность «оставить набор k» перед 2-м (K2) и 3-м (K3) броском — один раз на позицию.
  function smartTurn(st) {
    const key = `${st.mask},${st.top},${st.ds}`;
    if (SM.cache.has(key)) return SM.cache.get(key);
    const nd = SM.sc[1][0].length;
    const expect = (B) => SM.trans.map((t) => t.reduce((s, [d, p]) => s + p * B[d], 0));
    const B3 = [];
    for (let d = 0; d < nd; d++) B3.push(smartBestWrite(st, 3, d).v);
    const K3 = expect(B3), B2 = [];
    for (let d = 0; d < nd; d++) {
      let b = smartBestWrite(st, 2, d).v;
      for (const k of SM.subs[d]) if (K3[k] > b) b = K3[k];
      B2.push(b);
    }
    const res = { K2: expect(B2), K3 };
    if (SM.cache.size > 200) SM.cache.clear();
    SM.cache.set(key, res);
    return res;
  }

  // Решение после броска — как aiDecide. В полной партии (и без данных) играет простой компьютер.
  function smartDecide(sheet, cols, announced, dice, rollNo) {
    if (cols.length !== 1 || cols[0] !== 'free' || !smartTables()) return aiDecide(sheet, cols, announced, dice, rollNo);
    const st = smartState(sheet.free);
    const cnt = counts(dice), d = SM.didx.get(SM.code(cnt));
    const w = smartBestWrite(st, rollNo, d);
    if (rollNo < 3) {
      const K = rollNo === 1 ? smartTurn(st).K2 : smartTurn(st).K3;
      let bk = -Infinity, keep = null;
      for (const k of SM.subs[d]) if (K[k] > bk) { bk = K[k]; keep = k; }
      if (bk > w.v) {
        const left = SM.kcnt[keep].slice();
        return { hold: dice.map((x) => (left[x] > 0 ? (left[x]--, true) : false)) };
      }
    }
    return { write: { col: 'free', row: ROWS[w.row] } };
  }

  const api = {
    ROWS, ALL_COLS, TOP, BOTTOM, DICE, score, emptySheet, isFull, mustAnnounce, allowed, allowedCells,
    columnTotals, total, aiDecide, smartDecide, utility, replaySheets, replaySteps, replayState,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Jamb = api;
})(this);
