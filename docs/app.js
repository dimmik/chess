// Интерфейс игры: доска, подсказки, ходы компьютера.
(function () {
  'use strict';

  const { Chess, START_FEN, colorOf, typeOf, other, squareName, normalizeFen } = window.ChessEngine;
  const { chooseMove, hintMove } = window.ChessAI;

  const NAMES = {
    p: { nom: 'пешка', acc: 'пешку', ins: 'пешкой' },
    n: { nom: 'конь', acc: 'коня', ins: 'конём' },
    b: { nom: 'слон', acc: 'слона', ins: 'слоном' },
    r: { nom: 'ладья', acc: 'ладью', ins: 'ладьёй' },
    q: { nom: 'ферзь', acc: 'ферзя', ins: 'ферзём' },
    k: { nom: 'король', acc: 'короля', ins: 'королём' },
  };

  const HOW_MOVES = {
    p: 'Пешка ходит только вперёд на одну клетку. Из начальной позиции может прыгнуть на две. А ест — наискосок! Дошла до конца доски — превращается в любую фигуру, кроме короля.',
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

  const DEFAULTS = { mode: 'computer', color: 'w', level: 'baby', movable: true, moves: true, danger: true, sound: true };
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
  const isHuman = (c) => mode === 'both' || c === player;

  const flipped = () => orientation === 'b';
  // Индекс клетки по её месту на экране (0 — левый верхний угол) и обратно.
  const squareAt = (d) => (flipped() ? 63 - d : d);
  const displayRow = (i) => (flipped() ? 7 - (i >> 3) : i >> 3);
  const displayCol = (i) => (flipped() ? 7 - (i & 7) : i & 7);

  function buildBoard() {
    boardEl.innerHTML = '';
    for (let d = 0; d < 64; d++) {
      const el = document.createElement('div');
      el.className = 'sq';
      el.dataset.d = d;
      boardEl.appendChild(el);
      squares[d] = el;
    }
  }

  function render(anim) {
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
      const t = targetBySq.get(i);
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
    renderBars();
    $('btn-undo').disabled = !canUndo();
    $('btn-hint').disabled = !myTurn;
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
      if (adv > 0) html += `<span class="adv">+${adv}</span>`;
      $(`captured-${pos}`).innerHTML = html;
      $(`bar-${pos}`).classList.toggle('active', !over && game.turn === side);
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

  function idleStatus() {
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
    const t = typeOf(game.board[i]);
    setExplain(`${cap(NAMES[t].nom)}. ${HOW_MOVES[t]}`);
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
      const wasSelected = selected === i;
      select(i);
      render();
      return wasSelected ? 'again' : true;
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
    const who = mode === 'both' ? cap(SIDE[game.turn].nom) : 'Ты';
    game.makeMove(m);
    sound(m.captured ? 'capture' : 'move');
    let text = '';
    if (m.captured) text = `Здорово! ${who} ${mode === 'both' ? 'съели' : 'съел'} ${NAMES[typeOf(m.captured)].acc}! 🎉`;
    if (m.promotion) text = `Ура! Пешка дошла до конца доски и стала ${NAMES[m.promotion].ins}! 👑`;
    if (m.flag === 'k' || m.flag === 'q') text = 'Это рокировка: король спрятался, а ладья вышла в игру. 🏰';
    setExplain(text);
    afterMove(animate ? m : null);
  }

  function afterMove(anim) {
    over = game.outcome();
    if (over) {
      render(anim);
      finish();
      return;
    }
    if (!isHuman(game.turn)) {
      thinking = true;
      render(anim);
      setStatus('Компьютер думает… 🤔');
      if (game.inCheck()) {
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
    const m = chooseMove(game, level);
    thinking = false;
    game.makeMove(m);
    let text = '';
    const t = NAMES[typeOf(m.piece)].nom;
    text = `Компьютер пошёл: ${t} ${squareName(m.from)} → ${squareName(m.to)}.`;
    if (m.captured) text = `Ой! Компьютер съел твою фигуру — ${NAMES[typeOf(m.captured)].acc}. 😯`;
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
    if (mode === 'both') return game.log.length > 0;
    return game.log.some((m) => colorOf(m.piece) === player);
  }

  function undoMove() {
    if (!canUndo()) return;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    thinking = false;
    // Откатываем до последнего хода игрока включительно (вдвоём — ровно один ход).
    let m;
    do { m = game.undo(); } while (m && mode !== 'both' && colorOf(m.piece) !== player);
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
    const m = hintMove(game);
    if (!m) return;
    select(m.from);
    hint = { from: m.from, to: m.to };
    const name = NAMES[typeOf(m.piece)];
    let text = `Попробуй так: ${name.nom} с ${squareName(m.from)} на ${squareName(m.to)}.`;
    if (m.captured) text += ` Так можно съесть ${NAMES[typeOf(m.captured)].acc}!`;
    setExplain(text + ' 💡');
    render();
  }

  // ---------- Конец игры ----------

  function finish() {
    const both = mode === 'both';
    const won = over.result === player || (both && over.result !== 'draw');
    const lost = !both && over.result === other(player);
    let emoji, title, text;
    if (won && both) {
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
    $('go-emoji').textContent = emoji;
    $('go-title').textContent = title;
    $('go-text').textContent = text;
    $('btn-go-undo').hidden = !canUndo();
    setTimeout(() => { if (over) $('gameover').hidden = false; }, 700);
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
    mode = m;
    player = color;
    level = lvl;
    Object.assign(settings, { mode, color, level });
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
    $('gameover').hidden = true;
    let m = mode, color = player, lvl = level;
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

  // Кнопка «Новая игра»: если играли со своей позиции, предлагаем её же.
  function newGameDialog() {
    setupFen = startFen === START_FEN ? null : startFen;
    openSetup();
  }

  // ---------- Редактор позиции ----------

  const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'x', 'k', 'q', 'r', 'b', 'n', 'p'];

  function openEditor(fen) {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    thinking = false;
    $('setup').hidden = true;
    $('gameover').hidden = true;
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
    $('edit-done').onclick = () => {
      if ($('edit-done').disabled) return;
      setupFen = editFen();
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
      drag = { from: i, x: e.clientX, y: e.clientY, again: res === 'again', ghost: null, pointer: e.pointerId };
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
    } else if (d.again) {
      // Повторное нажатие на выбранную фигуру снимает выбор.
      deselect();
      render();
    }
  }

  boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
  boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---------- Кнопки и настройки ----------

  $('btn-undo').onclick = undoMove;
  $('btn-go-undo').onclick = undoMove;
  $('btn-hint').onclick = showHint;
  $('btn-new').onclick = newGameDialog;
  $('btn-again').onclick = newGameDialog;
  $('btn-edit').onclick = () => openEditor(game.fen());
  $('btn-flip').onclick = () => { orientation = other(orientation); render(); };
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

  buildBoard();
  render();
  setStatus('Давай сыграем! ♟️');
  openSetup();
})();
