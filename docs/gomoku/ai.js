// Компьютерный противник для гомоку/рэндзю: пять уровней — от почти случайных ходов до поиска
// с угрозами (серии четвёрок и троек) и просмотром на несколько ходов вперёд.
(function (root) {
  'use strict';
  const G = (typeof module !== 'undefined' && module.exports) ? require('./gomoku.js') : root.Gomoku;
  const { N, EMPTY, BLACK, other, X, Y, idx, inside, CELL_WIN, V } = G;

  const LEVELS = [
    { id: 1, emoji: '🐣', name: 'Малыш', about: 'ставит камни почти наугад' },
    { id: 2, emoji: '🐰', name: 'Новичок', about: 'строит свои ряды, иногда забывает защититься' },
    { id: 3, emoji: '🦊', name: 'Хитрый', about: 'не пропускает четвёрки и видит серии четвёрок' },
    { id: 4, emoji: '🐻', name: 'Сильный', about: 'защищается от угроз и смотрит на ход вперёд' },
    { id: 5, emoji: '🦉', name: 'Мудрый', about: 'ищет выигрыш тройками и думает на несколько ходов' },
  ];

  // Пустые клетки рядом с камнями (на расстоянии r).
  function candidates(B, r) {
    if (!B.moves.length) return [idx(7, 7)];
    const mark = new Uint8Array(N * N), out = [];
    for (const i of B.moves) {
      const x0 = X(i), y0 = Y(i);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = x0 + dx, y = y0 + dy;
          if (!inside(x, y)) continue;
          const j = idx(x, y);
          if (!mark[j] && B.b[j] === EMPTY) { mark[j] = 1; out.push(j); }
        }
      }
    }
    return out;
  }
  // Насколько ход хорош: свои ряды растут (нападение) и чужие ломаются (защита).
  function heur(B, i, c) {
    const o = other(c), mine = B.cnt[c], theirs = B.cnt[o];
    let att = 0, def = 0;
    for (const w of CELL_WIN[i]) {
      const a = mine[w], t = theirs[w];
      if (t === 0) att += V[a + 1] - V[a];
      if (a === 0) def += V[t + 1] - V[t];
    }
    return att + def * 0.85;
  }
  const legalFor = (B, i, c) => !(c === BLACK && G.hasForbid(B.R) && G.isForbidden(B.b, i, B.R));
  // Лучшие по эвристике ходы (разрешённые).
  function ordered(B, c, k) {
    const list = candidates(B, 2).map((i) => ({ i, s: heur(B, i, c) })).sort((a, b) => b.s - a.s);
    const out = [];
    for (const m of list) {
      if (legalFor(B, m.i, c)) out.push(m);
      if (out.length >= k) break;
    }
    return out;
  }

  // Поиск на несколько ходов вперёд (negamax с альфа-бета отсечением).
  const WIN_SCORE = 10000000;
  function negamax(B, c, depth, alpha, beta, ply, ctx) {
    ctx.nodes++;
    if (G.fivePoints(B, c).length) return WIN_SCORE - ply;
    const opF = G.fivePoints(B, other(c));
    if (opF.length > 1) {
      // Две пятёрки у соперника не закрыть (если только сам не ставишь пять — проверено выше).
      return -(WIN_SCORE - ply - 1);
    }
    if (depth === 0 || ctx.stop()) return (c === BLACK ? B.score : -B.score);
    let moves;
    if (opF.length === 1) moves = legalFor(B, opF[0], c) ? [{ i: opF[0] }] : [];
    else moves = ordered(B, c, ctx.width);
    if (!moves.length) return -(WIN_SCORE - ply - 1);
    let best = -Infinity;
    for (const m of moves) {
      B.play(m.i, c);
      const v = -negamax(B, other(c), depth - 1, -beta, -alpha, ply + 1, ctx);
      B.undo();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  function searchBest(B, c, maxDepth, width, ms) {
    const t0 = Date.now();
    const ctx = { nodes: 0, width, stop: () => Date.now() - t0 > ms };
    let root = ordered(B, c, width + 4);
    let best = root.length ? root[0].i : -1;
    for (let depth = 2; depth <= maxDepth; depth += 2) {
      let bestV = -Infinity, bestI = best;
      for (const m of root) {
        B.play(m.i, c);
        const v = -negamax(B, other(c), depth - 1, -Infinity, -bestV, 1, ctx);
        B.undo();
        m.v = v;
        if (v > bestV) { bestV = v; bestI = m.i; }
        if (ctx.stop()) break;
      }
      if (ctx.stop() && depth > 2) break;
      best = bestI;
      if (bestV >= WIN_SCORE - 50) break;
      root = root.slice().sort((a, b) => (b.v || -Infinity) - (a.v || -Infinity));
    }
    return best;
  }

  // Ходы, после которых у соперника нет выигрыша угрозами за n ходов.
  function safeMoves(B, c, list, n, threes, limit) {
    const o = other(c), out = [];
    for (const m of list) {
      B.play(m, c);
      const r = G.canWin(B, o, n, { threes, limit });
      B.undo();
      if (r === false) out.push(m);
    }
    return out;
  }

  // Выбор хода. rnd — случайные числа (для разнообразия), по умолчанию Math.random.
  function chooseMove(B, c, level, rnd) {
    rnd = rnd || Math.random;
    const o = other(c);
    if (!B.moves.length) return idx(7, 7);
    const win = G.fivePoints(B, c);
    const block = G.fivePoints(B, o).filter((i) => legalFor(B, i, c));
    const near1 = candidates(B, 1).filter((i) => legalFor(B, i, c));
    const near = candidates(B, 2).filter((i) => legalFor(B, i, c));
    const pick = (a) => a[Math.floor(rnd() * a.length)];

    if (level <= 1) {
      // Малыш: почти наугад рядом с камнями; иногда замечает пять.
      if (win.length && rnd() < 0.6) return win[0];
      if (block.length && rnd() < 0.35) return block[0];
      return pick(near1.length ? near1 : near);
    }
    if (win.length) return win[0];
    if (level === 2) {
      if (block.length && rnd() < 0.85) return block[0];
      const top = ordered(B, c, 4);
      if (rnd() < 0.25) return pick(near1.length ? near1 : near);
      return top[Math.min(top.length - 1, Math.floor(rnd() * rnd() * top.length))].i;
    }
    if (block.length) return block[0];
    // Свой выигрыш серией четвёрок.
    const vcf = G.winningMoves(B, c, level >= 4 ? 10 : 6, { limit: level >= 4 ? 60000 : 15000 });
    if (vcf && vcf.length) return vcf[0];
    if (level === 3) {
      const top = ordered(B, c, 3);
      return (rnd() < 0.8 ? top[0] : pick(top)).i;
    }
    // Сильный и Мудрый: защита от выигрыша соперника угрозами.
    const deep = level >= 5;
    const oppVcf = G.canWin(B, o, 10, { limit: 40000 });
    const oppVct = deep ? G.canWin(B, o, 4, { threes: true, limit: 40000 }) : G.canWin(B, o, 3, { threes: true, limit: 15000 });
    if (!oppVcf) {
      const vct = G.winningMoves(B, c, deep ? 5 : 3, { threes: true, limit: deep ? 80000 : 20000 });
      if (vct && vct.length) return vct[0];
    }
    if (oppVcf || oppVct) {
      const list = ordered(B, c, 14).map((m) => m.i);
      const safe = oppVcf ? safeMoves(B, c, list, 10, false, 20000) : safeMoves(B, c, list, deep ? 4 : 3, true, 15000);
      if (safe.length === 1) return safe[0];
      if (safe.length > 1) {
        // Из безопасных — лучший по поиску.
        let best = safe[0], bestV = -Infinity;
        for (const m of safe) {
          B.play(m, c);
          const v = -negamax(B, o, deep ? 3 : 1, -Infinity, Infinity, 1, { nodes: 0, width: 8, stop: () => false });
          B.undo();
          if (v > bestV) { bestV = v; best = m; }
        }
        return best;
      }
    }
    return searchBest(B, c, deep ? 6 : 4, deep ? 9 : 8, deep ? 1500 : 700);
  }

  const api = { LEVELS, chooseMove, candidates, heur, ordered };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GomokuAI = api;
})(this);
