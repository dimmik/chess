// Интерфейс игры: доска, подсказки, ходы компьютера.
(function () {
  'use strict';

  const { Chess, START_FEN, colorOf, typeOf, other, squareName, normalizeFen } = window.ChessEngine;
  const { chooseMove, hintMove, matingMoves, forcedMate } = window.ChessAI;

  const NAMES = {
    p: { nom: 'пешка', acc: 'пешку', ins: 'пешкой' },
    n: { nom: 'конь', acc: 'коня', ins: 'конём' },
    b: { nom: 'слон', acc: 'слона', ins: 'слоном' },
    r: { nom: 'ладья', acc: 'ладью', ins: 'ладьёй' },
    q: { nom: 'ферзь', acc: 'ферзя', ins: 'ферзём' },
    k: { nom: 'король', acc: 'короля', ins: 'королём' },
  };

  const HOW_MOVES = {
    p: 'Пешка ходит вперёд на одну клетку (с самого начала — можно на две), а ест наискосок. Дойдёт до конца — превратится в другую фигуру.',
    n: 'Конь ходит буквой «Г» и умеет перепрыгивать через другие фигуры.',
    b: 'Слон ходит по диагонали на сколько угодно клеток — всегда по клеткам одного цвета.',
    r: 'Ладья ходит по прямой: вперёд, назад, вправо и влево на сколько угодно клеток.',
    q: 'Ферзь — самая сильная фигура! Ходит и как ладья, и как слон.',
    k: 'Король ходит на одну клетку в любую сторону. Его нельзя ставить туда, где его могут съесть!',
  };

  const LEVEL_NAMES = { baby: 'Малыш 🐣', easy: 'Новичок 🐰', medium: 'Хитрый 🦊' };
  const SIDE = {
    w: { nom: 'белые', gen: 'белых', dat: 'белому', icon: '⚪' },
    b: { nom: 'чёрные', gen: 'чёрных', dat: 'чёрному', icon: '⚫' },
  };

  // ---------- Настройки ----------

  // mode/color/level/fen — настройки последней новой партии, с ними «Новая» начинает игру сразу.
  const DEFAULTS = { mode: 'computer', color: 'w', level: 'baby', fen: null, movable: true, moves: true, danger: true, sound: true };
  const settings = { ...DEFAULTS };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem('kids-chess-settings') || '{}'));
  } catch (e) { /* хранилище недоступно — играем с настройками по умолчанию */ }
  const saveSettings = () => {
    try { localStorage.setItem('kids-chess-settings', JSON.stringify(settings)); } catch (e) { /* ничего */ }
  };

  // ---------- Состояние ----------

  let game = new Chess();
  let mode = settings.mode;      // 'computer' — против компьютера, 'both' — ребёнок ходит за обе стороны
  let player = settings.color;   // за кого играет ребёнок против компьютера
  let level = settings.level;
  let orientation = player;      // чьи фигуры внизу доски
  let startFen = START_FEN;      // с какой позиции началась партия
  let setupFen = null;           // своя позиция для следующей партии (null — обычная расстановка)
  let editing = null;            // редактор позиции: { game, tool, castling, ep }
  let puzzle = null;             // задача: { set: 'm1' | 'm2', index } (mode = 'puzzle')
  let selected = -1;
  let targets = [];        // разрешённые ходы выбранной фигуры
  let hint = null;         // { from, to }
  let thinking = false;
  let aiTimer = null;
  let over = null;
  let drag = null;

  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const squares = [];

  // ---------- Рисование ----------

  function pieceSvg(p, cls = 'piece') {
    const c = colorOf(p);
    return `<svg class="${cls} ${c}" viewBox="0 0 100 100" aria-hidden="true"><path d="${PIECE_PATHS[typeOf(p)]}"/></svg>`;
  }

  // Кто ходит сам, а за кого ходит компьютер.
  // В задачах ребёнок ходит и за соперника (или просит «Ответ»).
  const isHuman = (c) => mode === 'both' || mode === 'puzzle' || c === player;

  const flipped = () => orientation === 'b';
  // Индекс клетки по её месту на экране (0 — левый верхний угол) и обратно.
  const squareAt = (d) => (flipped() ? 63 - d : d);
  const displayRow = (i) => (flipped() ? 7 - (i >> 3) : i >> 3);
  const displayCol = (i) => (flipped() ? 7 - (i & 7) : i & 7);

  // Планки над и под доской показывают, с какой стороны белые, а с какой чёрные.
  function renderEdges() {
    for (const [id, side] of [['edge-top', other(orientation)], ['edge-bottom', orientation]]) {
      const el = $(id);
      el.className = `edge ${id === 'edge-top' ? 'at-top' : 'at-bottom'} ${side}`;
      el.textContent = SIDE[side].nom;
    }
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    for (let d = 0; d < 64; d++) {
      const el = document.createElement('div');
      el.className = 'sq';
      el.dataset.d = d;
      boardEl.appendChild(el);
      squares[d] = el;
    }
    // Стрелка подсказки поверх доски.
    boardEl.insertAdjacentHTML('beforeend',
      '<svg class="hint-arrow" id="hint-arrow" viewBox="0 0 8 8" aria-hidden="true" hidden>' +
      '<defs><marker id="arrow-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto">' +
      '<path d="M0 0 L10 5 L0 10 z"/></marker></defs><line marker-end="url(#arrow-head)"/></svg>');
  }

  function renderHintArrow() {
    const svg = $('hint-arrow');
    // У SVG нет свойства hidden — переключаем атрибут.
    if (!hint || editing) { svg.setAttribute('hidden', ''); return; }
    const x1 = displayCol(hint.from) + 0.5, y1 = displayRow(hint.from) + 0.5;
    let x2 = displayCol(hint.to) + 0.5, y2 = displayRow(hint.to) + 0.5;
    // Укорачиваем линию, чтобы наконечник указывал в центр клетки, а не заходил за неё.
    const len = Math.hypot(x2 - x1, y2 - y1);
    x2 -= (x2 - x1) / len * 0.32;
    y2 -= (y2 - y1) / len * 0.32;
    const line = svg.querySelector('line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    svg.removeAttribute('hidden');
  }

  function render(anim) {
    renderEdges();
    if (editing) { renderEditor(); return; }
    const myTurn = !over && !thinking && isHuman(game.turn);
    const myMoves = myTurn ? game.moves() : [];
    const movableFrom = new Set(myMoves.map((m) => m.from));
    const checkSq = game.inCheck() ? game.kingSquare(game.turn) : -1;
    const last = game.log[game.log.length - 1];
    const targetBySq = new Map(targets.map((m) => [m.to, m]));

    for (let d = 0; d < 64; d++) {
      const i = squareAt(d);
      const el = squares[d];
      const p = game.board[i];
      const r = displayRow(i), c = displayCol(i);
      const cls = ['sq', (r + c) % 2 ? 'dark' : 'light'];
      if (last && (i === last.from || i === last.to)) cls.push('last');
      if (i === selected) cls.push('selected');
      if (i === checkSq) cls.push('check');
      if (settings.movable && movableFrom.has(i) && selected < 0) cls.push('movable');
      if (movableFrom.has(i) || (p && myTurn)) cls.push('clickable');
      if (hint && (i === hint.from || i === hint.to)) cls.push(i === hint.from ? 'hint-from' : 'hint-to');
      let t = targetBySq.get(i);
      // Пока показана подсказка, у фигуры отмечена только подсказанная клетка — чтобы не перепутать.
      if (t && hint && selected === hint.from && i !== hint.to) t = null;
      if (t && settings.moves) cls.push('target');
      el.className = cls.join(' ');

      let html = '';
      if (c === 0) html += `<span class="coord rank">${8 - (i >> 3)}</span>`;
      if (r === 7) html += `<span class="coord file">${'abcdefgh'[i & 7]}</span>`;
      if (p) html += pieceSvg(p);
      if (t && settings.moves) {
        const mcls = ['marker'];
        if (t.captured) mcls.push('capture');
        if (settings.danger && t.danger) mcls.push('danger');
        html += `<span class="${mcls.join(' ')}"></span>`;
      }
      if (settings.danger && myTurn && p && colorOf(p) === game.turn && typeOf(p) !== 'k' &&
          game.isAttacked(i, other(game.turn))) {
        html += '<span class="attacked-badge" title="Эту фигуру могут съесть">!</span>';
      }
      el.innerHTML = html;
    }

    if (anim) animateMove(anim);
    renderHintArrow();
    renderBars();
    saveGame();
    // В задачах вместо «Назад» и «Новая» — «Заново» и «Проверить».
    const pz = mode === 'puzzle';
    $('btn-undo').hidden = false;
    document.querySelector('.toolbar').classList.toggle('six', pz);
    $('btn-new').hidden = pz;
    $('btn-restart').hidden = !pz;
    $('btn-check').hidden = !pz;
    $('btn-undo').disabled = !canUndo();
    $('btn-restart').disabled = thinking || game.log.length === 0;
    $('btn-check').disabled = thinking;
    $('btn-hint').disabled = !myTurn;
    const defend = pz && !over && game.turn !== player;
    $('btn-hint').querySelector('.ico').textContent = defend ? '🛡️' : '💡';
    $('btn-hint').querySelector('.lbl').textContent = defend ? 'Ответ' : 'Подсказка';
    $('btn-hint').title = defend ? 'Предложить ответный ход соперника' : 'Подсказка';
  }

  function animateMove(m) {
    const toEl = squares[displayIndex(m.to)].querySelector('.piece');
    if (!toEl) return;
    const dx = displayCol(m.from) - displayCol(m.to);
    const dy = displayRow(m.from) - displayRow(m.to);
    toEl.classList.add('moving');
    toEl.style.transition = 'none';
    toEl.style.transform = `translate(${dx * 108.7}%, ${dy * 108.7}%)`;
    toEl.getBoundingClientRect();
    toEl.style.transition = 'transform 0.28s ease-out';
    toEl.style.transform = '';
    setTimeout(() => toEl.classList.remove('moving'), 300);
  }

  const displayIndex = (i) => (flipped() ? 63 - i : i);

  function sideInfo(side) {
    if (mode === 'puzzle') {
      if (side === player) return { avatar: '🧒', name: 'Ты' };
      const set = PUZZLES[puzzle.set];
      return { avatar: '🧩', name: `${set.title} · ${puzzle.index + 1} из ${set.list.length}` };
    }
    if (mode === 'both') return { avatar: SIDE[side].icon, name: cap(SIDE[side].nom) };
    if (side === player) return { avatar: '🧒', name: 'Ты' };
    return { avatar: '🤖', name: `Компьютер · ${LEVEL_NAMES[level]}` };
  }

  function renderBars() {
    // Съеденные фигуры показываем у того, кто их съел.
    const eaten = { w: [], b: [] };
    for (const m of game.log) if (m.captured) eaten[colorOf(m.piece)].push(m.captured);
    const order = 'qrbnp';

    for (const [pos, side] of [['top', other(orientation)], ['bottom', orientation]]) {
      const info = sideInfo(side);
      $(`avatar-${pos}`).textContent = info.avatar;
      $(`name-${pos}`).textContent = info.name;
      const list = eaten[side].slice().sort((a, b) => order.indexOf(typeOf(a)) - order.indexOf(typeOf(b)));
      let html = list.map((p) => pieceSvg(p, 'cap')).join('');
      const adv = game.material() * (side === 'w' ? 1 : -1);
      if (adv > 0 && mode !== 'puzzle') html += `<span class="adv">+${adv}</span>`;
      $(`captured-${pos}`).innerHTML = html;
      $(`bar-${pos}`).classList.toggle('active', !over && game.turn === side);
      $(`bar-${pos}`).classList.toggle('side-b', side === 'b');
    }
  }

  function setStatus(text, mood) {
    const el = $('status');
    el.textContent = text;
    el.className = 'status' + (mood ? ' ' + mood : '');
  }

  function setExplain(text) {
    $('explain').textContent = text || '';
  }

  // Сколько ходов осталось до мата в задаче.
  function puzzleMovesLeft() {
    return PUZZLES[puzzle.set].n - game.log.filter((m) => colorOf(m.piece) === player).length;
  }

  function idleStatus() {
    if (puzzleSpent()) {
      setStatus(`Ход ${SIDE[game.turn].gen} ${SIDE[game.turn].icon}`);
      if (!$('explain').textContent) setExplain('Ходы задачи закончились — можно доиграть позицию, «Назад» или «Заново».');
      return;
    }
    if (mode === 'puzzle' && game.turn !== player) {
      setStatus(`Ход соперника: за ${SIDE[game.turn].gen} ${SIDE[game.turn].icon}`);
      if (!$('explain').textContent) {
        setExplain(`Сходи за ${SIDE[game.turn].gen} сам — или нажми «🛡️ Ответ», и я предложу самую упорную защиту.`);
      }
      return;
    }
    if (mode === 'puzzle') {
      const left = puzzleMovesLeft();
      setStatus(left === 1 ? 'Поставь мат одним ходом! 🎯' : `Мат в ${left} хода: твой ход 🎯`);
      if (!$('explain').textContent) {
        setExplain(left === 1
          ? `Ходят ${SIDE[player].nom}. Найди ход, после которого королю ${SIDE[other(player)].gen} некуда деться.`
          : `Ходят ${SIDE[player].nom}. Найди ход, после которого мат будет при любом ответе соперника.`);
      }
      return;
    }
    if (mode === 'both') {
      if (game.inCheck()) {
        setStatus(`Шах ${SIDE[game.turn].dat} королю! ⚠️`, 'alert');
        setExplain(`Короля ${SIDE[game.turn].gen} хотят съесть. Уведи его, закрой другой фигурой или съешь того, кто нападает.`);
      } else {
        setStatus(`Ход ${SIDE[game.turn].gen} ${SIDE[game.turn].icon}`);
        if (!$('explain').textContent) {
          setExplain('Ты ходишь и за белых, и за чёрных. Нажми на фигуру, которая светится зелёным.');
        }
      }
      return;
    }
    if (game.inCheck()) {
      setStatus('Шах! ⚠️ Спаси своего короля!', 'alert');
      setExplain('Твоего короля хотят съесть. Убери его в безопасное место, закрой другой фигурой или съешь того, кто нападает.');
    } else {
      setStatus('Твой ход! 🙂');
      if (!$('explain').textContent) {
        setExplain(settings.movable
          ? 'Нажми на фигуру, которая светится зелёным, — и увидишь, куда она может пойти.'
          : 'Нажми на свою фигуру, чтобы её выбрать.');
      }
    }
  }

  // ---------- Действия игрока ----------

  function select(i) {
    selected = i;
    hint = hint && hint.from === i ? hint : null;
    targets = game.moves(i).filter((m) => !m.promotion || m.promotion === 'q');
    const me = game.turn;
    for (const m of targets) {
      game.makeMove(m);
      m.danger = game.isAttacked(m.to, other(me));
      game.undo();
    }
    setExplain(HOW_MOVES[typeOf(game.board[i])]);
  }

  function deselect() {
    selected = -1;
    targets = [];
  }

  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  function onSquarePress(i) {
    if (over || thinking || !isHuman(game.turn)) return false;
    const p = game.board[i];
    const target = targets.find((m) => m.to === i);
    if (selected >= 0 && target) {
      requestMove(target);
      return false;
    }
    if (p && colorOf(p) === game.turn) {
      if (game.moves(i).length === 0) {
        deselect();
        setExplain(`${cap(NAMES[typeOf(p)].nom)}: сейчас этой фигуре некуда ходить. Выбери другую!`);
        render();
        shake(i);
        return false;
      }
      // Повторное касание выбранной фигуры выбор не снимает: дети часто сначала «берут» фигуру,
      // даже если она уже выбрана (например, подсказкой). Снять выбор — касанием пустой клетки.
      if (selected !== i) {
        select(i);
        render();
      }
      return true;
    }
    if (p) {
      const whose = mode === 'both' ? `Сейчас ход ${SIDE[game.turn].gen}, а это` : 'Это фигура компьютера —';
      setExplain(`${whose} ${NAMES[typeOf(p)].nom}. ${HOW_MOVES[typeOf(p)]}`);
    }
    deselect();
    render();
    return false;
  }

  function shake(i) {
    const el = squares[displayIndex(i)];
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 400);
  }

  // Ход игрока; если пешка дошла до конца — сначала спрашиваем, во что она превратится.
  function requestMove(m, animate = true) {
    if (!m.promotion) { playerMove(m, animate); return; }
    choosePromotion(m.piece).then((promo) => {
      if (!promo) { deselect(); render(); return; }
      playerMove(game.moves(m.from).find((x) => x.to === m.to && x.promotion === promo), animate);
    });
  }

  function choosePromotion(pawn) {
    return new Promise((resolve) => {
      const box = $('promo');
      $('promo-choices').innerHTML = [...'qrbn'].map((t) => {
        const p = colorOf(pawn) === 'w' ? t.toUpperCase() : t;
        return `<button class="choice" data-promo="${t}"><span class="choice-piece">${pieceSvg(p, 'big')}</span>` +
          `<span>${cap(NAMES[t].nom)}</span></button>`;
      }).join('');
      const done = (v) => { box.hidden = true; box.onclick = null; resolve(v); };
      // Клик мимо окна — передумали ходить.
      box.onclick = (e) => {
        const b = e.target.closest('[data-promo]');
        if (b) done(b.dataset.promo);
        else if (e.target === box || e.target.id === 'promo-cancel') done(null);
      };
      box.hidden = false;
    });
  }

  function playerMove(m, animate = true) {
    deselect();
    hint = null;
    const who = mode === 'both' || (mode === 'puzzle' && game.turn !== player) ? cap(SIDE[game.turn].nom) : 'Ты';
    game.makeMove(m);
    sound(m.captured ? 'capture' : 'move');
    let text = '';
    if (m.captured) text = `${who === 'Ты' ? 'Здорово! Ты съел' : `${who} съели`} ${NAMES[typeOf(m.captured)].acc}!${who === 'Ты' ? ' 🎉' : ''}`;
    if (m.promotion) text = `Ура! Пешка дошла до конца доски и стала ${NAMES[m.promotion].ins}! 👑`;
    if (m.flag === 'k' || m.flag === 'q') text = 'Это рокировка: король спрятался, а ладья вышла в игру. 🏰';
    setExplain(text);
    afterMove(animate ? m : null);
  }

  // ---------- Задачи ----------

  // Ходы задачи закончились, а мата нет. Играть дальше можно — просто задача уже не решена.
  const puzzleSpent = () => mode === 'puzzle' && !over && puzzleMovesLeft() <= 0;

  // «Проверить»: получилось ли решение (или можно ли ещё поставить мат).
  function checkPuzzle() {
    if (mode !== 'puzzle' || thinking) return;
    const P = PUZZLES[puzzle.set];
    const made = P.n - puzzleMovesLeft();
    if (over && over.result === player && made <= P.n) {
      setStatus('Задача решена! 🏆', 'good');
      setExplain('Это мат — всё верно!');
    } else if (over && over.result === player) {
      setStatus(`Мат, но дольше, чем за ${P.n === 1 ? '1 ход' : `${P.n} хода`} 🙂`);
      setExplain('Нажми «Заново» и попробуй найти мат быстрее.');
    } else if (over && over.result !== 'draw') {
      setStatus('Это мат тебе 😮', 'alert');
      setExplain('Нажми «Назад» или «Заново» и попробуй другой путь.');
    } else if (over) {
      setStatus('Это пат, а не мат 😕', 'alert');
      setExplain('Королю некуда ходить, но шаха нет — это ничья. Нажми «Заново» и попробуй другой ход.');
    } else if (made === 0) {
      setStatus('Сначала сделай ход 🙂');
      setExplain('Сделай ход на доске, а потом нажми «Проверить».');
    } else if (puzzleSpent()) {
      setStatus('Мата нет 😕', 'alert');
      setExplain(`За ${P.n === 1 ? '1 ход' : `${P.n} хода`} мат не получился. Нажми «Назад» или «Заново» и попробуй другой ход.`);
    } else if (game.turn !== player ? forcedMate(game, puzzleMovesLeft()) : matingMoves(game, puzzleMovesLeft(), true).length) {
      setStatus('Пока всё верно! 👍', 'good');
      setExplain(`Мат ещё можно поставить — найди ${puzzleMovesLeft() === 1 ? 'последний ход' : 'следующий ход'}.`);
    } else {
      setStatus('Так мат уже не получится 😕', 'alert');
      setExplain('Соперник нашёл защиту. Нажми «Заново» и попробуй с изначальной позиции другой ход.');
    }
  }

  function restartPuzzle() {
    if (mode === 'puzzle') startPuzzle(puzzle.set, puzzle.index);
  }

  // Ответ соперника в задаче: защита, после которой у ребёнка меньше всего матующих ходов
  // (если ход был неверным — такая, после которой мата нет вовсе).
  function puzzleReply() {
    const left = puzzleMovesLeft();
    let best = [], fewest = Infinity;
    for (const r of game.moves()) {
      game.makeMove(r);
      const n = matingMoves(game, left).length;
      game.undo();
      if (n < fewest) { fewest = n; best = [r]; } else if (n === fewest) best.push(r);
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  function startPuzzle(set, index) {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    if (editing) closeEditor();
    closeOverlays();
    mode = 'puzzle';
    puzzle = { set, index };
    startFen = PUZZLES[set].list[index].fen;
    game = new Chess(startFen);
    player = game.turn;
    orientation = player;
    over = null;
    thinking = false;
    hint = null;
    deselect();
    const name = PUZZLES[set].list[index].name;
    render();
    setExplain('');
    idleStatus();
    if (name) setExplain(`«${name}». ${$('explain').textContent}`);
  }

  function solvedList() {
    try { return JSON.parse(localStorage.getItem('kids-chess-solved') || '{}'); } catch (e) { return {}; }
  }

  function markSolved() {
    const solved = solvedList();
    const list = solved[puzzle.set] || [];
    if (!list.includes(puzzle.index)) list.push(puzzle.index);
    solved[puzzle.set] = list;
    try { localStorage.setItem('kids-chess-solved', JSON.stringify(solved)); } catch (e) { /* ничего */ }
  }

  let puzzleTab = 'm1';
  function openPuzzles() {
    closeOverlays();
    if (puzzle) puzzleTab = puzzle.set;
    renderPuzzleList();
    $('puzzles').hidden = false;
  }

  function renderPuzzleList() {
    const set = PUZZLES[puzzleTab];
    const solved = solvedList()[puzzleTab] || [];
    document.querySelectorAll('#puzzle-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.set === puzzleTab));
    $('puzzle-note').textContent = `${set.about} Решено: ${solved.length} из ${set.list.length}.`;
    $('puzzle-grid').innerHTML = set.list.map((p, i) => {
      const cls = ['pz'];
      if (solved.includes(i)) cls.push('solved');
      if (mode === 'puzzle' && puzzle.set === puzzleTab && puzzle.index === i) cls.push('current');
      const title = (p.name ? p.name + ' · ' : '') + (p.fen.split(' ')[1] === 'w' ? 'ходят белые' : 'ходят чёрные');
      return `<button class="${cls.join(' ')}" data-i="${i}" title="${title}">${i + 1}</button>`;
    }).join('');
  }

  function afterMove(anim) {
    over = game.outcome();
    if (over) {
      render(anim);
      finish();
      return;
    }
    // Только что закончились ходы задачи — спокойно сообщаем, ходить дальше можно.
    if (puzzleSpent() && puzzleMovesLeft() === 0 && game.turn !== player) {
      render(anim);
      setStatus('Ходы задачи закончились 🤔');
      setExplain('Нажми «Проверить», чтобы узнать, получилось ли. Можно ходить дальше, «Назад» или «Заново».');
      return;
    }
    if (!isHuman(game.turn)) {
      thinking = true;
      render(anim);
      setStatus(mode === 'puzzle' ? 'Соперник думает… 🤔' : 'Компьютер думает… 🤔');
      if (game.inCheck() && mode !== 'puzzle') {
        setStatus('Шах компьютеру! 😮', 'good');
        sound('check');
      }
      aiTimer = setTimeout(computerMove, 650 + Math.random() * 400);
    } else {
      render(anim);
      idleStatus();
    }
  }

  function computerMove() {
    aiTimer = null;
    const m = mode === 'puzzle' ? puzzleReply() : chooseMove(game, level);
    thinking = false;
    game.makeMove(m);
    let text = '';
    const t = NAMES[typeOf(m.piece)].nom;
    text = `Компьютер пошёл: ${t} ${squareName(m.from)} → ${squareName(m.to)}.`;
    if (mode === 'puzzle') text = `Соперник ответил: ${t} ${squareName(m.from)} → ${squareName(m.to)}.`;
    if (m.captured) text = `Ой! ${mode === 'puzzle' ? 'Соперник' : 'Компьютер'} съел твою фигуру — ${NAMES[typeOf(m.captured)].acc}. 😯`;
    if (m.promotion) text = `Пешка компьютера дошла до конца и стала ${NAMES[m.promotion].ins}!`;
    sound(game.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
    over = game.outcome();
    render(m);
    if (over) { finish(); return; }
    setExplain(text);
    idleStatus();
    if (game.inCheck()) setExplain(text + ' Твоему королю шах — защити его!');
  }

  function canUndo() {
    if (mode === 'both' || mode === 'puzzle') return game.log.length > 0;
    return game.log.some((m) => colorOf(m.piece) === player);
  }

  function undoMove() {
    if (!canUndo()) return;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    thinking = false;
    // Откатываем до последнего хода игрока включительно (вдвоём — ровно один ход).
    let m;
    do { m = game.undo(); } while (m && mode === 'computer' && colorOf(m.piece) !== player);
    over = null;
    deselect();
    hint = null;
    $('gameover').hidden = true;
    setExplain('Ход отменён. Подумай ещё раз! 🤗');
    render();
    idleStatus();
  }

  function showHint() {
    if (over || thinking || !isHuman(game.turn)) return;
    // В задаче на ходу соперника — «Ответ»: самая упорная защита.
    const inPuzzle = mode === 'puzzle' && !puzzleSpent();
    const defend = inPuzzle && game.turn !== player;
    const m = defend ? puzzleReply()
      : inPuzzle ? matingMoves(game, puzzleMovesLeft(), true)[0] : hintMove(game);
    if (!m) {
      if (inPuzzle) setExplain('Отсюда мат уже не поставить — нажми «Заново» и начни с изначальной позиции. 💡');
      return;
    }
    select(m.from);
    hint = { from: m.from, to: m.to };
    const where = `${NAMES[typeOf(m.piece)].nom} с ${squareName(m.from)} на ${squareName(m.to)}`;
    const promo = m.promotion ? ` и преврати пешку: ${NAMES[m.promotion].nom}` : '';
    let text;
    if (defend) {
      text = `Самая упорная защита: ${where}${promo}. Можешь сходить так — или по-своему. 🛡️`;
    } else {
      text = `Попробуй так: ${where}${promo}.`;
      if (m.mateIn === 1) text = `Здесь можно поставить мат! Ход: ${where}${promo}.`;
      if (m.mateIn === 2) text = `Есть мат в 2 хода! Начни так: ${where}${promo}.`;
      if (m.captured && !m.mateIn) text += ` Так можно съесть ${NAMES[typeOf(m.captured)].acc}!`;
      text += ' 💡';
    }
    setExplain(text);
    render();
  }

  // ---------- Конец игры ----------

  // quiet — партия восстановлена после перезапуска: только надпись, без окна, звука и конфетти.
  function finish(quiet = false) {
    const both = mode === 'both';
    const won = over.result === player || (both && over.result !== 'draw');
    const lost = !both && over.result === other(player);
    let emoji, title, text;
    const solvedPuzzle = mode === 'puzzle' && over.result === player && puzzleMovesLeft() >= 0;
    const nextPuzzle = solvedPuzzle && puzzle.index + 1 < PUZZLES[puzzle.set].list.length;
    if (solvedPuzzle) {
      emoji = '🏆'; title = 'Задача решена!';
      text = nextPuzzle ? 'Мат! Отлично получилось. Переходим к следующей задаче?' : 'Мат! Это была последняя задача в этом наборе — ты молодец!';
      if (!quiet) { markSolved(); confetti(); sound('win'); }
    } else if (won && both) {
      emoji = '🏆'; title = `Мат! Победили ${SIDE[over.result].nom}`;
      text = `Королю ${SIDE[other(over.result)].gen} некуда деться. Можно вернуть ход и поискать другое решение.`;
      confetti();
      sound('win');
    } else if (won) {
      emoji = '🏆'; title = 'Ты победил!';
      text = 'Мат! Королю компьютера некуда деться. Ты настоящий шахматист!';
      confetti();
      sound('win');
    } else if (lost) {
      emoji = '🤖'; title = 'Компьютер выиграл';
      text = 'Мат твоему королю. Не беда — можно вернуть ход и попробовать ещё!';
      sound('lose');
    } else {
      emoji = '🤝'; title = 'Ничья';
      text = {
        stalemate: 'Пат: ходить некуда, но шаха нет. Так бывает!',
        material: 'Ни у кого не осталось фигур, чтобы поставить мат.',
        fifty: 'Очень долго никто никого не ел — это ничья.',
        repetition: 'Одна и та же позиция повторилась три раза.',
      }[over.reason];
      sound('move');
    }
    setStatus(`${title} ${emoji}`, won ? 'good' : lost ? 'alert' : '');
    setExplain(text);
    if (mode === 'puzzle' && !solvedPuzzle) {
      // Пат или мат «не вовремя» в задаче — без окна: ребёнок сам нажмёт «Проверить», «Назад» или «Заново».
      setStatus('Партия закончилась 🤔');
      setExplain('Нажми «Проверить», чтобы узнать, получилось ли, или «Назад» / «Заново».');
      return;
    }
    if (quiet) return;
    $('go-emoji').textContent = emoji;
    $('go-title').textContent = title;
    $('go-text').textContent = text;
    $('btn-go-undo').hidden = !canUndo() || solvedPuzzle;
    $('btn-go-list').hidden = !solvedPuzzle;
    $('btn-again').textContent = !solvedPuzzle ? 'Сыграть ещё' : nextPuzzle ? 'Следующая задача ▶' : 'Все задачи';
    setTimeout(() => { if (over) $('gameover').hidden = false; }, 700);
  }

  // «Сыграть ещё» в окне конца игры.
  function playAgain() {
    if (mode !== 'puzzle') { quickNewGame(); return; }
    if (over && over.result === player && puzzle.index + 1 < PUZZLES[puzzle.set].list.length) {
      startPuzzle(puzzle.set, puzzle.index + 1);
    } else {
      openPuzzles();
    }
  }

  function confetti() {
    const box = $('confetti');
    const bits = ['🎉', '⭐', '🎈', '🌟', '🏆', '✨', '🍭'];
    for (let k = 0; k < 40; k++) {
      const s = document.createElement('span');
      s.textContent = bits[k % bits.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = 2.5 + Math.random() * 2.5 + 's';
      s.style.animationDelay = Math.random() * 1.2 + 's';
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 6500);
  }

  // ---------- Новая игра ----------

  function newGame(m, color, lvl, fen) {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    if (editing) closeEditor();
    closeOverlays();
    mode = m;
    player = color;
    level = lvl;
    puzzle = null;
    Object.assign(settings, { mode, color, level, fen: fen || null });
    saveSettings();
    startFen = fen || START_FEN;
    game = new Chess(startFen);
    orientation = mode === 'both' ? game.turn : player;
    over = null;
    thinking = false;
    hint = null;
    deselect();
    $('gameover').hidden = true;
    setExplain('');
    if (!isHuman(game.turn)) {
      setExplain(`Сейчас ходят ${SIDE[game.turn].nom} — первым ходит компьютер.`);
    }
    afterMove(null);
  }

  function openSetup() {
    closeOverlays();
    let m = settings.mode, color = settings.color, lvl = settings.level;
    const sync = () => {
      document.querySelectorAll('#choose-mode .level').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
      document.querySelectorAll('#choose-color .choice').forEach((b) => b.classList.toggle('on', b.dataset.color === color));
      document.querySelectorAll('#choose-level .level').forEach((b) => b.classList.toggle('on', b.dataset.level === lvl));
      $('computer-options').hidden = m === 'both';
      $('pos-name').textContent = setupFen ? 'своя ✏️' : 'обычная';
      $('btn-pos-reset').hidden = !setupFen;
      const first = setupFen ? setupFen.split(' ')[1] : 'w';
      document.querySelectorAll('#choose-color small').forEach((el) => {
        const now = el.dataset.first === first;
        el.textContent = setupFen ? (now ? 'ходят сейчас' : 'ходят следом') : (now ? 'ходят первыми' : 'ходят вторыми');
      });
    };
    document.querySelectorAll('#choose-mode .level').forEach((b) => {
      b.onclick = () => { m = b.dataset.mode; sync(); };
    });
    document.querySelectorAll('#choose-color .choice').forEach((b) => {
      b.onclick = () => { color = b.dataset.color; sync(); };
    });
    document.querySelectorAll('#choose-level .level').forEach((b) => {
      b.onclick = () => { lvl = b.dataset.level; sync(); };
    });
    $('btn-pos-reset').onclick = () => { setupFen = null; sync(); };
    $('btn-pos-edit').onclick = () => openEditor(setupFen || game.fen());
    $('btn-start').onclick = () => {
      $('setup').hidden = true;
      unlockAudio();
      newGame(m, color, lvl, setupFen);
    };
    $('btn-continue').hidden = !(game.log.length && !over);
    $('btn-continue').onclick = () => { $('setup').hidden = true; };
    sync();
    $('setup').hidden = false;
  }

  // «Настройки игры»: открываются с настройками последней новой партии.
  function openSettings() {
    setupFen = settings.fen;
    openSetup();
  }

  // «Новая»: сразу новая партия с прошлыми настройками; если партия идёт — спрашиваем.
  // fromStart — с начальной расстановки, даже если прошлая партия была со своей позиции.
  function quickNewGame(fromStart = false) {
    const go = () => newGame(settings.mode, settings.color, settings.level, fromStart ? null : settings.fen);
    if (mode !== 'puzzle' && !over && game.log.length > 1) {
      askConfirm('Начать новую партию?', 'Эта партия закончится. Настройки — как в прошлый раз.', go);
    } else {
      go();
    }
  }

  function askConfirm(title, text, onYes) {
    closeOverlays();
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm').hidden = false;
    $('confirm-yes').onclick = () => { $('confirm').hidden = true; onYes(); };
    $('confirm-no').onclick = () => { $('confirm').hidden = true; };
  }

  const OVERLAYS = ['setup', 'gameover', 'menu', 'puzzles', 'history', 'confirm', 'install-help'];
  function closeOverlays() {
    for (const id of OVERLAYS) $(id).hidden = true;
  }

  // ---------- Мои позиции и ссылки ----------

  const HISTORY_KEY = 'kids-chess-positions';

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (e) { return []; }
  }

  function storeHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ничего */ }
  }

  // Запоминаем свою позицию (начальную расстановку не храним).
  function rememberPosition(fen) {
    if (!fen || fen.split(' ')[0] === START_FEN.split(' ')[0]) return;
    const list = loadHistory().filter((x) => x.fen !== fen);
    list.unshift({ fen, t: Date.now() });
    storeHistory(list.slice(0, 40));
  }

  // Маленькая картинка позиции; фигуры берутся из общего спрайта (см. buildSprite).
  function miniBoard(fen) {
    const b = new Chess(fen).board;
    let out = '<rect width="800" height="800" class="mb-l"/>';
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      if ((r + c) % 2) out += `<rect x="${c * 100}" y="${r * 100}" width="100" height="100" class="mb-d"/>`;
      if (b[i]) out += `<use href="#pc-${typeOf(b[i])}" x="${c * 100}" y="${r * 100}" class="mb-${colorOf(b[i])}"/>`;
    }
    return `<svg class="mini-board" viewBox="0 0 800 800" aria-hidden="true">${out}</svg>`;
  }

  function buildSprite() {
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    sprite.innerHTML = Object.entries(PIECE_PATHS)
      .map(([t, d]) => `<symbol id="pc-${t}" viewBox="0 0 100 100" width="100" height="100"><path d="${d}"/></symbol>`).join('');
    document.body.prepend(sprite);
  }

  function openHistory() {
    closeOverlays();
    renderHistory();
    $('history').hidden = false;
  }

  function renderHistory() {
    const list = loadHistory();
    $('history-empty').hidden = list.length > 0;
    $('history-list').innerHTML = list.map((x) => {
      const date = new Date(x.t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      const who = x.fen.split(' ')[1] === 'w' ? 'ходят белые' : 'ходят чёрные';
      return `<div class="hist-item"><button class="hist-load" data-fen="${x.fen}" title="${x.fen}">${miniBoard(x.fen)}` +
        `<small>${date} · ${who}</small></button>` +
        `<button class="hist-del" data-del="${x.fen}" title="Удалить" aria-label="Удалить">🗑️</button></div>`;
    }).join('');
  }

  // Ссылка вида …/chess/?fen=4k3/P7/8/8/8/8/8/4K3_w_-_-_0_1 — пробелы заменены на «_», чтобы читалась.
  function shareUrl(fen) {
    return `${location.origin}${location.pathname}?fen=${fen.replace(/ /g, '_')}`;
  }

  // Делимся ссылкой на позицию: системным меню «Поделиться», а если его нет — копируем ссылку.
  async function sharePosition(fen) {
    rememberPosition(fen);
    const url = shareUrl(fen);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Шахматы для малышей', text: `Шахматная позиция (FEN): ${fen}`, url });
        return 'Ссылка отправлена 🔗';
      } catch (e) {
        if (e.name === 'AbortError') return '';
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'Ссылка на позицию скопирована 🔗';
    } catch (e) {
      window.prompt('Скопируй ссылку на позицию:', url);
      return '';
    }
  }

  // Позиция из присланной ссылки (?fen=...). Адрес очищаем, чтобы перезагрузка вернула обычную игру.
  function fenFromUrl() {
    const raw = new URLSearchParams(location.search).get('fen');
    if (!raw) return null;
    history.replaceState(null, '', location.pathname);
    try {
      return normalizeFen(raw.replace(/_/g, ' '));
    } catch (e) {
      return null;
    }
  }

  // ---------- Сохранение партии ----------

  function saveGame() {
    if (editing) return;
    const data = {
      mode, player, level, orientation, startFen, puzzle,
      moves: game.log.map((m) => [m.from, m.to, m.promotion || '']),
    };
    try { localStorage.setItem('kids-chess-game', JSON.stringify(data)); } catch (e) { /* ничего */ }
  }

  // Открываем ту партию, на которой остановились.
  function restoreGame() {
    let s;
    try { s = JSON.parse(localStorage.getItem('kids-chess-game')); } catch (e) { return false; }
    if (!s || !s.startFen) return false;
    try {
      if (s.mode === 'puzzle' && !(s.puzzle && PUZZLES[s.puzzle.set] && PUZZLES[s.puzzle.set].list[s.puzzle.index])) return false;
      const g = new Chess(s.startFen);
      for (const [from, to, promo] of s.moves) {
        const m = g.moves(from).find((x) => x.to === to && (x.promotion || '') === promo);
        if (!m) return false;
        g.makeMove(m);
      }
      game = g;
    } catch (e) {
      return false;
    }
    ({ mode, player, level, orientation, startFen, puzzle } = s);
    over = game.outcome();
    if (over) {
      render();
      finish(true);
    } else {
      if (mode === 'puzzle') setExplain('');
      afterMove(null);
    }
    return true;
  }

  // ---------- Редактор позиции ----------

  const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'x', 'k', 'q', 'r', 'b', 'n', 'p'];

  function openEditor(fen) {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    thinking = false;
    closeOverlays();
    const g = new Chess(fen);
    editing = { game: g, tool: editing ? editing.tool : 'P', castling: g.castling, ep: g.ep };
    deselect();
    hint = null;
    $('play-ui').hidden = true;
    $('edit-ui').hidden = false;
    boardEl.classList.add('editing');
    document.body.classList.add('editing');
    setStatus('✏️ Расставь фигуры');
    setExplain('Выбери фигуру и нажимай на клетки доски. Нажмёшь ещё раз — фигура исчезнет. ' +
      'Фигуры на доске можно перетаскивать, а если утащить за доску — они уберутся.');
    renderPalette();
    editChanged();
  }

  function closeEditor() {
    editing = null;
    $('play-ui').hidden = false;
    $('edit-ui').hidden = true;
    boardEl.classList.remove('editing');
    document.body.classList.remove('editing');
  }

  function renderPalette() {
    $('palette').innerHTML = PALETTE.map((t) => {
      if (t === 'x') return '<button class="tool eraser" data-tool="x" title="Ластик">🧽<small>убрать</small></button>';
      const name = `${colorOf(t) === 'w' ? 'Белый' : 'Чёрный'} ${NAMES[typeOf(t)].nom}`;
      return `<button class="tool${colorOf(t) === 'b' ? ' dark-bg' : ''}" data-tool="${t}" title="${name}" aria-label="${name}">` +
        `${pieceSvg(t, 'pal')}</button>`;
    }).join('');
    syncPalette();
  }

  function syncPalette() {
    document.querySelectorAll('#palette .tool').forEach((b) => {
      const on = b.dataset.tool === editing.tool;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  // FEN позиции в редакторе: права на рокировку и взятие на проходе — только если подходят к расстановке.
  function editFen() {
    const g = editing.game;
    g.castling = editing.castling;
    g.ep = editing.ep;
    g.sanitize();
    return g.fen();
  }

  function editChanged(syncInput = true) {
    const fen = editFen();
    if (syncInput) {
      $('fen-input').value = fen;
      setFenMsg('');
    }
    const g = editing.game;
    const problems = g.problems();
    if (!problems.length) {
      const o = g.outcome();
      if (o && o.reason === 'checkmate') problems.push(`Здесь уже мат ${SIDE[g.turn].dat} королю — ходить некуда.`);
      else if (o && o.reason === 'stalemate') problems.push(`Здесь пат: ${SIDE[g.turn].dat} королю некуда ходить.`);
      else if (o) problems.push('Здесь уже ничья — слишком мало фигур.');
    }
    $('edit-problems').innerHTML = problems.map((t) => `<li>${t}</li>`).join('');
    $('edit-done').disabled = problems.length > 0;
    document.querySelectorAll('#edit-turn button').forEach((b) => b.classList.toggle('on', b.dataset.turn === g.turn));
    renderEditor();
  }

  function renderEditor() {
    renderEdges();
    const b = editing.game.board;
    for (let d = 0; d < 64; d++) {
      const i = squareAt(d);
      const r = displayRow(i), c = displayCol(i);
      squares[d].className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');
      let html = '';
      if (c === 0) html += `<span class="coord rank">${8 - (i >> 3)}</span>`;
      if (r === 7) html += `<span class="coord file">${'abcdefgh'[i & 7]}</span>`;
      if (b[i]) html += pieceSvg(b[i]);
      squares[d].innerHTML = html;
    }
    for (const [pos, side] of [['top', other(orientation)], ['bottom', orientation]]) {
      $(`avatar-${pos}`).textContent = SIDE[side].icon;
      $(`name-${pos}`).textContent = cap(SIDE[side].nom);
      $(`captured-${pos}`).innerHTML = '';
      $(`bar-${pos}`).classList.toggle('active', editing.game.turn === side);
      $(`bar-${pos}`).classList.toggle('side-b', side === 'b');
    }
  }

  function applyTool(i) {
    const b = editing.game.board, t = editing.tool;
    if (t === 'x' || b[i] === t) {
      b[i] = null;
    } else {
      // Король может быть только один — переставляем его.
      if (t === 'K' || t === 'k') {
        const old = b.indexOf(t);
        if (old >= 0) b[old] = null;
      }
      b[i] = t;
    }
    editing.ep = -1;
    editChanged();
  }

  function moveEditPiece(from, to) {
    const b = editing.game.board;
    const p = b[from];
    b[from] = null;
    if (to >= 0) b[to] = p;
    editing.ep = -1;
    editChanged();
  }

  function setFenMsg(text, bad) {
    $('fen-msg').textContent = text;
    $('fen-msg').classList.toggle('bad', !!bad);
    $('fen-input').classList.toggle('bad', !!bad);
  }

  function loadFenText(text) {
    if (!text.trim()) { setFenMsg(''); return false; }
    try {
      const g = new Chess(normalizeFen(text));
      editing.game = g;
      editing.castling = g.castling;
      editing.ep = g.ep;
      editChanged(false);
      setFenMsg('✓ Позиция загружена');
      return true;
    } catch (err) {
      setFenMsg(err.message, true);
      return false;
    }
  }

  function setupEditorControls() {
    $('palette').onclick = (e) => {
      const b = e.target.closest('.tool');
      if (!b) return;
      editing.tool = b.dataset.tool;
      syncPalette();
    };
    document.querySelectorAll('#edit-turn button').forEach((b) => {
      b.onclick = () => { editing.game.turn = b.dataset.turn; editChanged(); };
    });
    $('edit-start').onclick = () => {
      editing.game = new Chess(START_FEN);
      editing.castling = 'KQkq';
      editing.ep = -1;
      editChanged();
    };
    $('edit-clear').onclick = () => {
      // Короли остаются: без них играть нельзя.
      const old = editing.game.board;
      const g = new Chess('8/8/8/8/8/8/8/8 ' + editing.game.turn);
      for (const k of ['K', 'k']) {
        const at = old.indexOf(k);
        const home = k === 'K' ? 60 : 4;
        g.board[at >= 0 ? at : g.board[home] ? g.board.indexOf(null) : home] = k;
      }
      editing.game = g;
      editing.ep = -1;
      editChanged();
    };
    $('edit-flip').onclick = () => { orientation = other(orientation); renderEditor(); };

    let fenTimer = null;
    $('fen-input').addEventListener('input', () => {
      clearTimeout(fenTimer);
      fenTimer = setTimeout(() => loadFenText($('fen-input').value), 350);
    });
    $('fen-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(fenTimer); loadFenText($('fen-input').value); }
    });
    $('fen-input').addEventListener('focus', () => $('fen-input').select());

    if (navigator.clipboard && navigator.clipboard.readText) {
      $('fen-paste').hidden = false;
      $('fen-paste').onclick = async () => {
        try {
          const text = await navigator.clipboard.readText();
          $('fen-input').value = text.trim();
          loadFenText(text);
        } catch (e) {
          setFenMsg('Не получилось прочитать буфер обмена — вставь позицию в поле вручную.', true);
        }
      };
    }
    $('fen-copy').onclick = async () => {
      const fen = editFen();
      $('fen-input').value = fen;
      try {
        await navigator.clipboard.writeText(fen);
      } catch (e) {
        $('fen-input').select();
        document.execCommand('copy');
      }
      setFenMsg('📋 Скопировано');
    };

    $('edit-cancel').onclick = () => {
      closeEditor();
      over = null;
      setExplain('');
      afterMove(null);
    };
    $('fen-share').onclick = async () => {
      const msg = await sharePosition(editFen());
      if (msg) setFenMsg(msg);
    };
    $('fen-history').onclick = openHistory;
    $('edit-done').onclick = () => {
      if ($('edit-done').disabled) return;
      setupFen = editFen();
      rememberPosition(setupFen);
      closeEditor();
      render();
      openSetup();
    };
  }

  // ---------- Звук ----------

  let audio = null;
  function unlockAudio() {
    if (audio || !settings.sound) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }

  function tone(freq, start, dur, type = 'sine', vol = 0.15) {
    const t0 = audio.currentTime + start;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(audio.destination);
    o.start(t0);
    o.stop(t0 + dur);
  }

  function sound(kind) {
    if (!settings.sound) return;
    unlockAudio();
    if (!audio) return;
    if (audio.state === 'suspended') audio.resume();
    if (kind === 'move') tone(520, 0, 0.09, 'triangle');
    if (kind === 'capture') { tone(330, 0, 0.12, 'triangle', 0.2); tone(220, 0.06, 0.15, 'triangle', 0.15); }
    if (kind === 'check') { tone(660, 0, 0.12, 'square', 0.06); tone(880, 0.12, 0.16, 'square', 0.06); }
    if (kind === 'win') [523, 659, 784, 1047].forEach((f, k) => tone(f, k * 0.14, 0.25, 'triangle', 0.18));
    if (kind === 'lose') [392, 330, 262].forEach((f, k) => tone(f, k * 0.18, 0.3, 'sine', 0.15));
  }

  // ---------- Мышь и пальцы (нажатие и перетаскивание) ----------

  function squareFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const sq = el && el.closest('.sq');
    return sq ? squareAt(Number(sq.dataset.d)) : -1;
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const sq = e.target.closest('.sq');
    if (!sq) return;
    unlockAudio();
    const i = squareAt(Number(sq.dataset.d));
    if (editing) {
      drag = { from: i, x: e.clientX, y: e.clientY, ghost: null, pointer: e.pointerId, edit: true };
      boardEl.setPointerCapture(e.pointerId);
      return;
    }
    const res = onSquarePress(i);
    if (res) {
      drag = { from: i, x: e.clientX, y: e.clientY, ghost: null, pointer: e.pointerId };
      boardEl.setPointerCapture(e.pointerId);
    }
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      const piece = (editing ? editing.game : game).board[drag.from];
      if (!piece) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = pieceSvg(piece, 'drag-ghost');
      drag.ghost = wrap.firstChild;
      document.body.appendChild(drag.ghost);
      const src = squares[displayIndex(drag.from)].querySelector('.piece');
      if (src) src.classList.add('ghost-source');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
  });

  function endDrag(e, cancelled) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    if (d.edit) {
      if (!editing) { if (d.ghost) d.ghost.remove(); return; }
      if (d.ghost) {
        d.ghost.remove();
        // Утащили за доску — фигура убирается; отмена жеста — возвращается на место.
        moveEditPiece(d.from, cancelled ? d.from : squareFromPoint(e.clientX, e.clientY));
      } else if (!cancelled) {
        applyTool(d.from);
      }
      return;
    }
    if (d.ghost) {
      d.ghost.remove();
      const to = cancelled ? -1 : squareFromPoint(e.clientX, e.clientY);
      const m = targets.find((t) => t.to === to);
      if (m) requestMove(m, false);
      else render();
    }
  }

  boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
  boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---------- Кнопки и настройки ----------

  $('btn-undo').onclick = undoMove;
  $('btn-go-undo').onclick = undoMove;
  $('btn-hint').onclick = showHint;
  $('btn-new').onclick = () => quickNewGame();
  $('btn-again').onclick = playAgain;
  $('btn-go-list').onclick = openPuzzles;
  $('btn-menu').onclick = () => { closeOverlays(); $('menu').hidden = false; };
  $('btn-menu-close').onclick = () => { $('menu').hidden = true; };
  $('btn-settings').onclick = openSettings;
  $('btn-edit').onclick = () => openEditor(game.fen());
  $('btn-flip').onclick = () => { $('menu').hidden = true; orientation = other(orientation); render(); };
  // Полный экран и установка обрабатываются в pwa.js — здесь только закрываем меню.
  $('btn-fullscreen').addEventListener('click', () => { $('menu').hidden = true; });
  $('btn-install').addEventListener('click', () => { $('menu').hidden = true; });
  $('btn-puzzles').onclick = openPuzzles;
  $('btn-check').onclick = checkPuzzle;
  $('btn-restart').onclick = restartPuzzle;
  $('btn-menu-new').onclick = () => { $('menu').hidden = true; quickNewGame(); };
  $('btn-menu-start').onclick = () => { $('menu').hidden = true; quickNewGame(true); };
  $('btn-history').onclick = openHistory;
  $('btn-history-close').onclick = () => { $('history').hidden = true; };
  $('btn-share').onclick = async () => {
    $('menu').hidden = true;
    const msg = await sharePosition(game.fen());
    if (msg) setExplain(msg);
  };
  $('history-list').onclick = (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      storeHistory(loadHistory().filter((x) => x.fen !== del.dataset.del));
      renderHistory();
      return;
    }
    const b = e.target.closest('[data-fen]');
    if (!b) return;
    if (editing) {
      $('history').hidden = true;
      $('fen-input').value = b.dataset.fen;
      loadFenText(b.dataset.fen);
    } else {
      openEditor(b.dataset.fen);
    }
  };
  $('btn-puzzles-close').onclick = () => { $('puzzles').hidden = true; };
  $('puzzle-tabs').onclick = (e) => {
    const b = e.target.closest('[data-set]');
    if (b) { puzzleTab = b.dataset.set; renderPuzzleList(); }
  };
  $('puzzle-grid').onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (b) { unlockAudio(); startPuzzle(puzzleTab, Number(b.dataset.i)); }
  };
  // Клик мимо окна закрывает меню, список задач и вопрос.
  for (const id of ['menu', 'puzzles', 'history', 'confirm']) {
    $(id).addEventListener('click', (e) => { if (e.target === $(id)) $(id).hidden = true; });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') for (const id of ['menu', 'puzzles', 'history', 'confirm', 'gameover']) $(id).hidden = true;
  });
  setupEditorControls();
  // Клик мимо окна «конец игры» закрывает его, чтобы посмотреть на доску.
  $('gameover').onclick = (e) => { if (e.target === $('gameover')) $('gameover').hidden = true; };

  for (const key of ['movable', 'moves', 'danger', 'sound']) {
    const box = $(`opt-${key}`);
    box.checked = settings[key];
    box.onchange = () => {
      settings[key] = box.checked;
      saveSettings();
      if (selected >= 0) select(selected);
      render();
      if (!editing && !over && !thinking && isHuman(game.turn)) idleStatus();
    };
  }

  document.querySelectorAll('.choice-piece').forEach((el) => {
    el.innerHTML = pieceSvg(el.dataset.piece, 'big');
  });

  // На телефоне касание, которое открыло окно (например, ход пешкой на последнюю горизонталь),
  // досылает click уже в это окно — и оно тут же закрывалось. Окно слушает только нажатия,
  // начавшиеся в нём самом (клики с клавиатуры, detail === 0, пропускаем как есть).
  function guardOverlay(box) {
    let armed = false;
    box.addEventListener('pointerdown', () => { armed = true; }, true);
    box.addEventListener('click', (e) => {
      if (!armed && e.detail !== 0) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);
    new MutationObserver(() => { if (box.hidden) armed = false; })
      .observe(box, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.querySelectorAll('.overlay').forEach(guardOverlay);

  buildBoard();
  buildSprite();
  const shared = fenFromUrl();
  if (shared) {
    // Открыли присланную ссылку: показываем позицию в редакторе — там видно, всё ли в ней в порядке.
    rememberPosition(shared);
    restoreGame();
    openEditor(shared);
    setFenMsg('📩 Тебе прислали эту позицию — нажми «Играть»!');
  } else if (!restoreGame()) {
    render();
    setStatus('Давай сыграем! ♟️');
    openSetup();
  }
})();
