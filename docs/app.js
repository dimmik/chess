// Интерфейс игры: доска, подсказки, ходы компьютера.
(function () {
  'use strict';

  const { Chess, VALUE, colorOf, typeOf, other, squareName } = window.ChessEngine;
  const { chooseMove, hintMove } = window.ChessAI;

  const NAMES = {
    p: { nom: 'пешка', acc: 'пешку' },
    n: { nom: 'конь', acc: 'коня' },
    b: { nom: 'слон', acc: 'слона' },
    r: { nom: 'ладья', acc: 'ладью' },
    q: { nom: 'ферзь', acc: 'ферзя' },
    k: { nom: 'король', acc: 'короля' },
  };

  const HOW_MOVES = {
    p: 'Пешка ходит только вперёд на одну клетку. Из начальной позиции может прыгнуть на две. А ест — наискосок!',
    n: 'Конь ходит буквой «Г» и умеет перепрыгивать через другие фигуры.',
    b: 'Слон ходит по диагонали на сколько угодно клеток — всегда по клеткам одного цвета.',
    r: 'Ладья ходит по прямой: вперёд, назад, вправо и влево на сколько угодно клеток.',
    q: 'Ферзь — самая сильная фигура! Ходит и как ладья, и как слон.',
    k: 'Король ходит на одну клетку в любую сторону. Его нельзя ставить туда, где его могут съесть!',
  };

  const LEVEL_NAMES = { baby: 'Малыш 🐣', easy: 'Новичок 🐰', medium: 'Хитрый 🦊' };

  // ---------- Настройки ----------

  const DEFAULTS = { color: 'w', level: 'baby', movable: true, moves: true, danger: true, sound: true };
  const settings = { ...DEFAULTS };
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem('kids-chess-settings') || '{}'));
  } catch (e) { /* хранилище недоступно — играем с настройками по умолчанию */ }
  const saveSettings = () => {
    try { localStorage.setItem('kids-chess-settings', JSON.stringify(settings)); } catch (e) { /* ничего */ }
  };

  // ---------- Состояние ----------

  let game = new Chess();
  let player = settings.color;
  let level = settings.level;
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

  const flipped = () => player === 'b';
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
    const myTurn = !over && !thinking && game.turn === player;
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
      if (settings.danger && myTurn && p && colorOf(p) === player && typeOf(p) !== 'k' &&
          game.isAttacked(i, other(player))) {
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

  function renderBars() {
    const comp = other(player);
    const top = { side: comp, avatar: '🤖', name: `Компьютер · ${LEVEL_NAMES[level]}` };
    const bottom = { side: player, avatar: '🧒', name: 'Ты' };
    // Съеденные фигуры показываем у того, кто их съел.
    const eaten = { w: [], b: [] };
    for (const m of game.log) if (m.captured) eaten[colorOf(m.piece)].push(m.captured);
    const order = 'qrbnp';
    const adv = game.material() * (player === 'w' ? 1 : -1);

    for (const [pos, info] of [['top', top], ['bottom', bottom]]) {
      $(`avatar-${pos}`).textContent = info.avatar;
      $(`name-${pos}`).textContent = info.name;
      const list = eaten[info.side].slice().sort((a, b) => order.indexOf(typeOf(a)) - order.indexOf(typeOf(b)));
      let html = list.map((p) => pieceSvg(p, 'cap')).join('');
      const myAdv = info.side === player ? adv : -adv;
      if (myAdv > 0) html += `<span class="adv">+${myAdv}</span>`;
      $(`captured-${pos}`).innerHTML = html;
      $(`bar-${pos}`).classList.toggle('active', !over && game.turn === info.side);
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
    for (const m of targets) {
      game.makeMove(m);
      m.danger = game.isAttacked(m.to, other(player));
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
    if (over || thinking || game.turn !== player) return false;
    const p = game.board[i];
    const target = targets.find((m) => m.to === i);
    if (selected >= 0 && target) {
      playerMove(target);
      return false;
    }
    if (p && colorOf(p) === player) {
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
      setExplain(`Это фигура компьютера — ${NAMES[typeOf(p)].nom}. ${HOW_MOVES[typeOf(p)]}`);
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

  function playerMove(m, animate = true) {
    deselect();
    hint = null;
    game.makeMove(m);
    sound(m.captured ? 'capture' : 'move');
    let text = '';
    if (m.captured) text = `Здорово! Ты съел ${NAMES[typeOf(m.captured)].acc}! 🎉`;
    if (m.promotion) text = 'Ура! Пешка дошла до конца доски и стала ферзём! 👑';
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
    if (game.turn !== player) {
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
    if (m.promotion) text = 'Пешка компьютера дошла до конца и стала ферзём!';
    sound(game.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
    over = game.outcome();
    render(m);
    if (over) { finish(); return; }
    setExplain(text);
    idleStatus();
    if (game.inCheck()) setExplain(text + ' Твоему королю шах — защити его!');
  }

  function canUndo() {
    return game.log.some((m) => colorOf(m.piece) === player);
  }

  function undoMove() {
    if (!canUndo()) return;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    thinking = false;
    // Откатываем до последнего хода игрока включительно.
    let m;
    do { m = game.undo(); } while (m && colorOf(m.piece) !== player);
    over = null;
    deselect();
    hint = null;
    $('gameover').hidden = true;
    setExplain('Ход отменён. Подумай ещё раз! 🤗');
    render();
    idleStatus();
  }

  function showHint() {
    if (over || thinking || game.turn !== player) return;
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
    const won = over.result === player;
    const lost = over.result === other(player);
    let emoji, title, text;
    if (won) {
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

  function newGame(color, lvl) {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    player = color;
    level = lvl;
    settings.color = color;
    settings.level = lvl;
    saveSettings();
    game = new Chess();
    over = null;
    thinking = false;
    hint = null;
    deselect();
    $('gameover').hidden = true;
    setExplain('');
    if (player === 'b') {
      setExplain('Белые ходят первыми. Сейчас ходит компьютер.');
      afterMove(null);
    } else {
      render();
      idleStatus();
    }
  }

  function openSetup() {
    $('gameover').hidden = true;
    let color = player, lvl = level;
    const sync = () => {
      document.querySelectorAll('#choose-color .choice').forEach((b) => b.classList.toggle('on', b.dataset.color === color));
      document.querySelectorAll('#choose-level .level').forEach((b) => b.classList.toggle('on', b.dataset.level === lvl));
    };
    document.querySelectorAll('#choose-color .choice').forEach((b) => {
      b.onclick = () => { color = b.dataset.color; sync(); };
    });
    document.querySelectorAll('#choose-level .level').forEach((b) => {
      b.onclick = () => { lvl = b.dataset.level; sync(); };
    });
    $('btn-start').onclick = () => {
      $('setup').hidden = true;
      unlockAudio();
      newGame(color, lvl);
    };
    $('btn-continue').hidden = !(game.log.length && !over);
    $('btn-continue').onclick = () => { $('setup').hidden = true; };
    sync();
    $('setup').hidden = false;
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
      const wrap = document.createElement('div');
      wrap.innerHTML = pieceSvg(game.board[drag.from], 'drag-ghost');
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
    if (d.ghost) {
      d.ghost.remove();
      const to = cancelled ? -1 : squareFromPoint(e.clientX, e.clientY);
      const m = targets.find((t) => t.to === to);
      if (m) playerMove(m, false);
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
  $('btn-new').onclick = openSetup;
  $('btn-again').onclick = openSetup;
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
      if (!over && !thinking && game.turn === player) idleStatus();
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
