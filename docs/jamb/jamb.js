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
    const diffReady = colSheet.max !== null && colSheet.min !== null && colSheet['1'] !== null;
    const diff = diffReady ? Math.max(0, (colSheet.max - colSheet.min) * colSheet['1']) : 0;
    const bottom = BOTTOM.reduce((s, r) => s + v(r), 0);
    return { top: top + bonus, bonus, diff, diffReady, bottom, total: top + bonus + diff + bottom };
  }

  const total = (sheet, cols) => cols.reduce((s, col) => s + columnTotals(sheet[col]).total, 0);

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

  const api = {
    ROWS, ALL_COLS, TOP, BOTTOM, DICE, score, emptySheet, isFull, mustAnnounce, allowed, allowedCells,
    columnTotals, total, aiDecide, utility,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Jamb = api;
})(this);
