// Задания для «мозга»: ход компьютера и проверки решателем. Работает и в фоновом потоке (worker.js),
// и прямо на странице, если фоновый поток недоступен.
(function (root) {
  'use strict';
  const G = root.Gomoku || require('./gomoku.js');
    const A = root.GomokuAI || require('./ai.js');
  
  // Позиция приходит списком ходов [клетка, цвет].
  function boardOf(rules, moves) {
    const B = new G.Board(rules);
    for (const [i, c] of moves) B.play(i, c);
    return B;
  }
  const handlers = {
    ai: (d) => A.chooseMove(boardOf(d.rules, d.moves), d.color, d.level),
    hint: (d) => A.chooseMove(boardOf(d.rules, d.moves), d.color, 4),
    winning: (d) => G.winningMoves(boardOf(d.rules, d.moves), d.color, d.n, { threes: d.threes, limit: d.limit || 300000 }),
    canWin: (d) => G.canWin(boardOf(d.rules, d.moves), d.color, d.n, { threes: d.threes, limit: 300000 }),
    defense: (d) => G.defenseFor(boardOf(d.rules, d.moves), d.color, d.last),
    // Ходы, после которых у соперника (d.color — защищающийся) нет выигрыша за n.
    saves: (d) => {
      const B = boardOf(d.rules, d.moves), c = d.color, o = G.other(c), out = [];
      for (const m of A.candidates(B, 3)) {
        if (c === G.BLACK && G.isForbidden(B.b, m, B.R)) continue;
        B.play(m, c);
        const r = G.canWin(B, o, d.n, { threes: true, limit: 300000 });
        B.undo();
        if (r === false) out.push(m);
      }
      return out;
    },
    forbidden: (d) => {
      const B = boardOf(d.rules, d.moves), out = [];
      if (!G.hasForbid(B.R)) return out;
      for (let i = 0; i < G.SIZE; i++) if (!B.b[i] && G.isForbidden(B.b, i, B.R)) out.push(i);
      return out;
    },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = handlers;
  else root.GomokuBrain = handlers;
})(typeof self !== 'undefined' ? self : this);
