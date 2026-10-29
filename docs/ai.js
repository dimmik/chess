// Очень простой компьютерный соперник с тремя уровнями.
//   baby   — почти случайные ходы, иногда что-нибудь съедает;
//   easy   — смотрит на один ход: любит брать фигуры, но часто ошибается;
//   medium — смотрит на ответ соперника (2 полухода) и не отдаёт фигуры даром.
(function (root) {
  'use strict';

  const E = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.ChessEngine;
  const { VALUE, typeOf, other } = E;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const gain = (m) => (m.captured ? VALUE[typeOf(m.captured)] : 0) + (m.promotion ? VALUE[m.promotion] - 1 : 0);

  // Превращаем пешку только в ферзя — так проще и понятнее.
  const candidateMoves = (game) => game.moves().filter((m) => !m.promotion || m.promotion === 'q');

  function babyMove(game) {
    const moves = candidateMoves(game);
    const captures = moves.filter((m) => m.captured);
    if (captures.length && Math.random() < 0.4) return pick(captures);
    return pick(moves);
  }

  function easyMove(game) {
    const me = game.turn;
    let best = null, bestScore = -Infinity;
    for (const m of candidateMoves(game)) {
      let score = gain(m) + Math.random() * 3;
      game.makeMove(m);
      if (game.moves().length === 0 && game.inCheck()) score += 100;
      // Иногда замечает, что фигуру сразу съедят.
      if (Math.random() < 0.5 && game.isAttacked(m.to, other(me))) {
        score -= VALUE[typeOf(m.promotion || m.piece)] * 0.7;
      }
      game.undo();
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // Оценка позиции после ответа соперника: материал + мат/пат.
  function replyScore(game, me) {
    const sign = me === 'w' ? 1 : -1;
    const replies = game.moves();
    if (replies.length === 0) return game.inCheck() ? 1000 : 0;
    let worst = Infinity;
    for (const r of replies) {
      game.makeMove(r);
      let s = game.material() * sign;
      if (game.moves().length === 0 && game.inCheck()) s = -1000;
      game.undo();
      if (s < worst) worst = s;
    }
    return worst;
  }

  function mediumMove(game, noise = 0.6) {
    const me = game.turn;
    let best = null, bestScore = -Infinity;
    for (const m of candidateMoves(game)) {
      game.makeMove(m);
      const score = replyScore(game, me) + Math.random() * noise;
      game.undo();
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  function chooseMove(game, level) {
    const g = game.clone();
    if (level === 'medium') return mediumMove(g);
    if (level === 'easy') return easyMove(g);
    return babyMove(g);
  }

  // Подсказка для ребёнка — хороший ход по мнению «среднего» уровня.
  function hintMove(game) {
    return mediumMove(game.clone(), 0.1);
  }

  // ---------- Решатель задач на мат ----------

  const isMate = (game) => game.inCheck() && game.moves().length === 0;

  // Сторона, которая только что сходила, ставит мат не более чем за k своих ходов при любой защите.
  function forcedMate(game, k) {
    if (isMate(game)) return true;
    if (k === 0) return false;
    const replies = game.moves();
    if (replies.length === 0) return false; // пат
    // Сначала ходы короля — они чаще всего спасают от мата, и перебор заканчивается раньше.
    replies.sort((a, b) => (typeOf(b.piece) === 'k') - (typeOf(a.piece) === 'k'));
    for (const r of replies) {
      game.makeMove(r);
      const ok = matingMoves(game, k, true).length > 0;
      game.undo();
      if (!ok) return false;
    }
    return true;
  }

  // Ходы, после которых мат ставится не более чем за n ходов (n = 1 — мат сразу).
  // firstOnly — достаточно найти один такой ход.
  function matingMoves(game, n, firstOnly = false) {
    const found = [];
    for (const m of game.moves()) {
      game.makeMove(m);
      const ok = forcedMate(game, n - 1);
      game.undo();
      if (ok) {
        found.push(m);
        if (firstOnly) break;
      }
    }
    return found;
  }

  const api = { chooseMove, hintMove, matingMoves, forcedMate, isMate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChessAI = api;
})(this);
