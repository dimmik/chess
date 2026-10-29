// Шахматный движок: правила, генерация ходов, проверка шаха/мата/ничьей.
// Доска — массив из 64 клеток, индекс 0 = a8, 7 = h8, 56 = a1, 63 = h1.
// Фигуры — буквы: заглавные белые (KQRBNP), строчные чёрные (kqrbnp).
(function (root) {
  'use strict';

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Если с клетки уходит/на клетку приходит фигура, теряется соответствующее право рокировки.
  const CASTLE_SQUARES = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q', 60: 'KQ', 4: 'kq' };

  const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const typeOf = (p) => p.toLowerCase();
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const squareName = (i) => 'abcdefgh'[i & 7] + (8 - (i >> 3));
  const squareIndex = (name) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);

  // Проверяет строку FEN и возвращает её в полном виде (недостающие поля дополняются).
  // При ошибке бросает Error с понятным объяснением по-русски.
  function normalizeFen(text) {
    const parts = String(text).trim().split(/\s+/);
    if (!parts[0]) throw new Error('Строка пустая.');
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error(`Нужно 8 горизонталей через «/», а здесь ${rows.length}.`);
    rows.forEach((row, r) => {
      let n = 0;
      for (const ch of row) {
        if (/[1-8]/.test(ch)) n += Number(ch);
        else if (/[pnbrqk]/i.test(ch)) n++;
        else throw new Error(`Непонятный символ «${ch}» на ${8 - r}-й горизонтали.`);
      }
      if (n !== 8) throw new Error(`На ${8 - r}-й горизонтали ${n} клеток вместо 8.`);
    });
    const turn = parts[1] || 'w';
    if (!/^[wb]$/.test(turn)) throw new Error('Чей ход: должно быть w (белые) или b (чёрные).');
    const castling = parts[2] || '-';
    if (!/^(-|K?Q?k?q?)$/.test(castling)) throw new Error('Рокировка: допустимы только K, Q, k, q или «-».');
    const ep = parts[3] || '-';
    if (!/^(-|[a-h][36])$/.test(ep)) throw new Error('Взятие на проходе: нужна клетка на 3-й или 6-й горизонтали или «-».');
    const half = parts[4] || '0', full = parts[5] || '1';
    if (!/^\d+$/.test(half) || !/^\d+$/.test(full)) throw new Error('Номера ходов в конце должны быть числами.');
    return [parts[0], turn, castling, ep, half, Math.max(1, Number(full))].join(' ');
  }

  class Chess {
    constructor(fen = START_FEN) {
      this.load(fen);
    }

    load(fen) {
      const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
      this.board = new Array(64).fill(null);
      let i = 0;
      for (const ch of placement) {
        if (ch === '/') continue;
        if (/\d/.test(ch)) i += Number(ch);
        else this.board[i++] = ch;
      }
      this.turn = turn || 'w';
      this.castling = castling && castling !== '-' ? castling : '';
      this.ep = ep && ep !== '-' ? squareIndex(ep) : -1;
      this.halfmove = Number(half) || 0;
      this.fullmove = Number(full) || 1;
      this.history = [];
      this.log = [];
      this.positions = [this.positionKey()];
    }

    // Убирает права на рокировку и взятие на проходе, которые не подходят к расстановке.
    sanitize() {
      const b = this.board;
      const need = { K: [60, 'K', 63, 'R'], Q: [60, 'K', 56, 'R'], k: [4, 'k', 7, 'r'], q: [4, 'k', 0, 'r'] };
      this.castling = [...this.castling].filter((c) => {
        const [ks, k, rs, r] = need[c];
        return b[ks] === k && b[rs] === r;
      }).join('');
      if (this.ep >= 0) {
        // Пешка соперника только что прошла через клетку ep на две клетки вперёд.
        const dir = this.turn === 'w' ? 8 : -8;
        const pawn = this.turn === 'w' ? 'p' : 'P';
        const row = this.ep >> 3;
        if ((this.turn === 'w' ? row !== 2 : row !== 5) || b[this.ep] || b[this.ep - dir] ||
            b[this.ep + dir] !== pawn) this.ep = -1;
      }
      this.positions = [this.positionKey()];
    }

    // Почему по этой позиции нельзя играть; пустой список — всё в порядке.
    problems() {
      const list = [];
      const count = (p) => this.board.filter((x) => x === p).length;
      if (count('K') !== 1) list.push('Нужен ровно один белый король.');
      if (count('k') !== 1) list.push('Нужен ровно один чёрный король.');
      if (this.board.some((p, i) => p && typeOf(p) === 'p' && (i < 8 || i >= 56))) {
        list.push('Пешки не могут стоять на первой и последней горизонтали.');
      }
      if (!list.length && this.inCheck(other(this.turn))) {
        list.push(`Королю ${this.turn === 'w' ? 'чёрных' : 'белых'} шах, а ходят ${this.turn === 'w' ? 'белые' : 'чёрные'} — так не бывает.`);
      }
      return list;
    }

    clone() {
      const g = Object.create(Chess.prototype);
      g.board = this.board.slice();
      g.turn = this.turn;
      g.castling = this.castling;
      g.ep = this.ep;
      g.halfmove = this.halfmove;
      g.fullmove = this.fullmove;
      g.history = this.history.slice();
      g.log = this.log.slice();
      g.positions = this.positions.slice();
      return g;
    }

    fen() {
      let s = '';
      for (let r = 0; r < 8; r++) {
        let empty = 0;
        for (let c = 0; c < 8; c++) {
          const p = this.board[r * 8 + c];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          s += p;
        }
        if (empty) s += empty;
        if (r < 7) s += '/';
      }
      return [s, this.turn, this.castling || '-', this.ep >= 0 ? squareName(this.ep) : '-',
        this.halfmove, this.fullmove].join(' ');
    }

    positionKey() {
      return this.board.map((p) => p || '.').join('') + this.turn + this.castling + this.ep;
    }

    kingSquare(color) {
      const k = color === 'w' ? 'K' : 'k';
      return this.board.indexOf(k);
    }

    // Бьёт ли сторона `by` клетку `sq`.
    isAttacked(sq, by) {
      const r = sq >> 3, c = sq & 7, b = this.board;
      const is = (rr, cc, types) => {
        if (!onBoard(rr, cc)) return false;
        const p = b[rr * 8 + cc];
        return !!p && colorOf(p) === by && types.includes(typeOf(p));
      };
      // Пешки: белая пешка бьёт вверх (к меньшему номеру строки).
      const pr = by === 'w' ? r + 1 : r - 1;
      if (is(pr, c - 1, 'p') || is(pr, c + 1, 'p')) return true;
      for (const [dr, dc] of KNIGHT) if (is(r + dr, c + dc, 'n')) return true;
      for (const [dr, dc] of KING) if (is(r + dr, c + dc, 'k')) return true;
      const ray = (dirs, types) => {
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (onBoard(rr, cc)) {
            const p = b[rr * 8 + cc];
            if (p) {
              if (colorOf(p) === by && types.includes(typeOf(p))) return true;
              break;
            }
            rr += dr; cc += dc;
          }
        }
        return false;
      };
      return ray(DIAG, 'bq') || ray(ORTHO, 'rq');
    }

    inCheck(color = this.turn) {
      const k = this.kingSquare(color);
      return k >= 0 && this.isAttacked(k, other(color));
    }

    // Все ходы по правилам перемещения фигур, без проверки собственного короля.
    pseudoMoves(color = this.turn, only = -1) {
      const moves = [], b = this.board;
      const add = (from, to, flag) => {
        const piece = b[from];
        const captured = flag === 'e' ? (color === 'w' ? 'p' : 'P') : b[to];
        const toRow = to >> 3;
        if (typeOf(piece) === 'p' && (toRow === 0 || toRow === 7)) {
          for (const promo of 'qrbn') moves.push({ from, to, piece, captured, promotion: promo, flag });
        } else {
          moves.push({ from, to, piece, captured, flag });
        }
      };
      for (let from = 0; from < 64; from++) {
        if (only >= 0 && from !== only) continue;
        const p = b[from];
        if (!p || colorOf(p) !== color) continue;
        const r = from >> 3, c = from & 7, t = typeOf(p);
        const enemyAt = (i) => b[i] && colorOf(b[i]) !== color;

        if (t === 'p') {
          const dir = color === 'w' ? -1 : 1;
          const startRow = color === 'w' ? 6 : 1;
          const one = from + dir * 8;
          if (onBoard(r + dir, c) && !b[one]) {
            add(from, one);
            const two = one + dir * 8;
            if (r === startRow && !b[two]) add(from, two, 'b');
          }
          for (const dc of [-1, 1]) {
            if (!onBoard(r + dir, c + dc)) continue;
            const to = (r + dir) * 8 + c + dc;
            if (enemyAt(to)) add(from, to);
            else if (to === this.ep) add(from, to, 'e');
          }
        } else if (t === 'n' || t === 'k') {
          for (const [dr, dc] of t === 'n' ? KNIGHT : KING) {
            if (!onBoard(r + dr, c + dc)) continue;
            const to = (r + dr) * 8 + c + dc;
            if (!b[to] || enemyAt(to)) add(from, to);
          }
          if (t === 'k') this.addCastling(from, color, add);
        } else {
          const dirs = t === 'b' ? DIAG : t === 'r' ? ORTHO : DIAG.concat(ORTHO);
          for (const [dr, dc] of dirs) {
            let rr = r + dr, cc = c + dc;
            while (onBoard(rr, cc)) {
              const to = rr * 8 + cc;
              if (b[to]) {
                if (enemyAt(to)) add(from, to);
                break;
              }
              add(from, to);
              rr += dr; cc += dc;
            }
          }
        }
      }
      return moves;
    }

    addCastling(from, color, add) {
      const home = color === 'w' ? 60 : 4;
      if (from !== home) return;
      const [kSide, qSide] = color === 'w' ? ['K', 'Q'] : ['k', 'q'];
      const enemy = other(color), b = this.board;
      if (!this.castling.includes(kSide) && !this.castling.includes(qSide)) return;
      if (this.isAttacked(home, enemy)) return;
      if (this.castling.includes(kSide) && !b[home + 1] && !b[home + 2] &&
          !this.isAttacked(home + 1, enemy) && !this.isAttacked(home + 2, enemy)) {
        add(home, home + 2, 'k');
      }
      if (this.castling.includes(qSide) && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
          !this.isAttacked(home - 1, enemy) && !this.isAttacked(home - 2, enemy)) {
        add(home, home - 2, 'q');
      }
    }

    // Разрешённые ходы. square — имя клетки ('e2') или индекс, чтобы получить ходы одной фигуры.
    moves(square) {
      const only = square === undefined ? -1 : typeof square === 'string' ? squareIndex(square) : square;
      const color = this.turn;
      return this.pseudoMoves(color, only).filter((m) => {
        this.makeMove(m);
        const ok = !this.inCheck(color);
        this.undo();
        return ok;
      });
    }

    makeMove(m) {
      const b = this.board;
      this.history.push({
        board: b.slice(), turn: this.turn, castling: this.castling, ep: this.ep,
        halfmove: this.halfmove, fullmove: this.fullmove,
      });
      this.log.push(m);

      const color = this.turn;
      b[m.to] = m.promotion ? (color === 'w' ? m.promotion.toUpperCase() : m.promotion) : m.piece;
      b[m.from] = null;
      if (m.flag === 'e') b[m.to + (color === 'w' ? 8 : -8)] = null;
      if (m.flag === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
      if (m.flag === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }

      for (const sq of [m.from, m.to]) {
        const lost = CASTLE_SQUARES[sq];
        if (lost) for (const ch of lost) this.castling = this.castling.replace(ch, '');
      }
      this.ep = m.flag === 'b' ? (m.from + m.to) / 2 : -1;
      this.halfmove = typeOf(m.piece) === 'p' || m.captured ? 0 : this.halfmove + 1;
      if (color === 'b') this.fullmove++;
      this.turn = other(color);
      this.positions.push(this.positionKey());
    }

    undo() {
      const s = this.history.pop();
      if (!s) return null;
      this.board = s.board;
      this.turn = s.turn;
      this.castling = s.castling;
      this.ep = s.ep;
      this.halfmove = s.halfmove;
      this.fullmove = s.fullmove;
      this.positions.pop();
      return this.log.pop();
    }

    insufficientMaterial() {
      const rest = this.board.filter((p) => p && typeOf(p) !== 'k');
      if (rest.length === 0) return true;
      return rest.length === 1 && 'nb'.includes(typeOf(rest[0]));
    }

    repetition() {
      const key = this.positions[this.positions.length - 1];
      return this.positions.filter((k) => k === key).length >= 3;
    }

    // null — игра идёт; иначе { result: 'w' | 'b' | 'draw', reason }.
    outcome() {
      if (this.moves().length === 0) {
        return this.inCheck()
          ? { result: other(this.turn), reason: 'checkmate' }
          : { result: 'draw', reason: 'stalemate' };
      }
      if (this.insufficientMaterial()) return { result: 'draw', reason: 'material' };
      if (this.halfmove >= 100) return { result: 'draw', reason: 'fifty' };
      if (this.repetition()) return { result: 'draw', reason: 'repetition' };
      return null;
    }

    // Материальный баланс в пользу белых.
    material() {
      let s = 0;
      for (const p of this.board) {
        if (p) s += colorOf(p) === 'w' ? VALUE[typeOf(p)] : -VALUE[typeOf(p)];
      }
      return s;
    }
  }

  const api = { Chess, START_FEN, VALUE, colorOf, typeOf, other, squareName, squareIndex, normalizeFen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(this);
