// Игра «Дом»: питомец, его желания, грязь и дорога по дому. Здесь только логика без рисования — её проверяют тесты.
(function (root) {
  'use strict';

  // Геометрия дома в единицах SVG (viewBox 0 0 760 640): два этажа по две комнаты,
  // в левых комнатах — стремянка между этажами.
  const FLOOR_Y = { 1: 604, 2: 370 };   // пол
  const CEIL_Y = { 1: 384, 2: 150 };    // потолок
  const LADDER_X = 345;
  const X_MIN = 70, X_MAX = 690;        // куда может встать питомец (центр)
  const ROOMS = [
    { id: 'bedroom', name: 'спальня', floor: 2, x0: 32, x1: 374 },
    { id: 'bath', name: 'ванная', floor: 2, x0: 386, x1: 728 },
    { id: 'living', name: 'гостиная', floor: 1, x0: 32, x1: 374 },
    { id: 'kitchen', name: 'кухня', floor: 1, x0: 386, x1: 728 },
  ];
  const clampX = (x) => Math.max(X_MIN, Math.min(X_MAX, x));
  const floorAt = (y) => (y < FLOOR_Y[2] + 7 ? 2 : 1);

  // Путь: на другой этаж — через стремянку. Точки { x, y, climb } по порядку.
  function path(from, to) {
    const pts = [];
    if (from.floor !== to.floor) {
      pts.push({ x: LADDER_X, y: FLOOR_Y[from.floor] }, { x: LADDER_X, y: FLOOR_Y[to.floor], climb: true });
    }
    pts.push({ x: clampX(to.x), y: FLOOR_Y[to.floor] });
    return pts;
  }

  // Питомцы: эмодзи, голос, игрушка, еда (эмодзи и «кого покормить чем» — винительный падеж), имена с родом.
  const PETS = [
    { type: 'dog', emoji: '🐶', who: 'щенок', voice: 'Гав!', toy: '⚽', foods: [['🦴', 'косточку'], ['🍖', 'мясо'], ['🥕', 'морковку']], names: [['Шарик', 'm'], ['Бобик', 'm'], ['Тузик', 'm'], ['Жучка', 'f'], ['Найда', 'f']] },
    { type: 'cat', emoji: '🐱', who: 'котёнок', voice: 'Мяу!', toy: '🧶', foods: [['🐟', 'рыбку'], ['🥛', 'молоко'], ['🧀', 'сыр']], names: [['Мурзик', 'm'], ['Барсик', 'm'], ['Васька', 'm'], ['Мурка', 'f'], ['Пушинка', 'f']] },
    { type: 'rabbit', emoji: '🐰', who: 'зайчик', voice: 'Фыр-фыр!', toy: '🎾', foods: [['🥕', 'морковку'], ['🥬', 'капусту'], ['🍎', 'яблоко']], names: [['Пушок', 'm'], ['Ушастик', 'm'], ['Зайка', 'f'], ['Снежинка', 'f']] },
    { type: 'hamster', emoji: '🐹', who: 'хомячок', voice: 'Пи-пи!', toy: '🎾', foods: [['🌻', 'семечки'], ['🥜', 'орешки'], ['🍓', 'клубнику']], names: [['Хома', 'm'], ['Пончик', 'm'], ['Булочка', 'f'], ['Плюшка', 'f']] },
    { type: 'fox', emoji: '🦊', who: 'лисёнок', voice: 'Тяв!', toy: '⚽', foods: [['🍗', 'курочку'], ['🫐', 'ягоды'], ['🥚', 'яичко']], names: [['Рыжик', 'm'], ['Огонёк', 'm'], ['Алиса', 'f'], ['Лисичка', 'f']] },
    { type: 'panda', emoji: '🐼', who: 'панда', voice: 'Ур-р!', toy: '⚽', foods: [['🎋', 'бамбук'], ['🍎', 'яблоко'], ['🍪', 'печенье']], names: [['Бамбук', 'm'], ['Пандик', 'm'], ['Маша', 'f'], ['Тюпа', 'f']] },
    { type: 'pig', emoji: '🐷', who: 'поросёнок', voice: 'Хрю!', toy: '⚽', foods: [['🍎', 'яблоко'], ['🌽', 'кукурузу'], ['🥔', 'картошку']], names: [['Хрюша', 'm'], ['Пятачок', 'm'], ['Хрюня', 'f'], ['Пеппа', 'f']] },
  ];
  const petInfo = (type) => PETS.find((p) => p.type === type) || PETS[0];
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length) % arr.length];

  // Новый питомец (не того же вида, что был).
  function newPet(rnd = Math.random, exceptType = null) {
    const p = pick(PETS.filter((x) => x.type !== exceptType), rnd);
    const [name, g] = pick(p.names, rnd);
    return { type: p.type, name, g };
  }

  // Сытость и веселье (0–100) понемногу убывают; чистота — от количества грязи.
  const RATE = { food: 1 / 5, fun: 1 / 4 }; // очков в секунду
  function decay(st, sec) {
    st.food = Math.max(0, st.food - sec * RATE.food);
    st.fun = Math.max(0, st.fun - sec * RATE.fun);
  }
  const MAX_DIRT = 6;
  const cleanliness = (dirtCount) => Math.max(0, 100 - dirtCount * 16);

  // О чём питомец попросит: чем голоднее/скучнее/грязнее, тем вероятнее; иногда — спрятаться.
  function chooseRequest(st, rnd = Math.random) {
    const w = {
      feed: st.food < 70 ? 110 - st.food : 0,
      clean: st.dirt >= 2 ? st.dirt * 14 : 0,
      play: st.fun < 70 ? 110 - st.fun : 0,
      hide: 30,
    };
    const total = w.feed + w.clean + w.play + w.hide;
    let r = rnd() * total;
    for (const k of ['feed', 'clean', 'play', 'hide']) {
      r -= w[k];
      if (r < 0) return k;
    }
    return 'hide';
  }

  // Где можно спрятаться: за / под / в мебели. y0 — насколько выше пола сидит (по умолчанию −4, чтобы
  // не торчали лапы под мебелью), peek — насколько высунуться, если долго не могут найти.
  const SPOTS = [
    { id: 'sofa', where: 'за диваном', x: 135, floor: 1, y0: -14, peek: { dx: 0, dy: -34 } },
    { id: 'table', where: 'под столом', x: 540, floor: 1, peek: { dx: 50, dy: 0 } },
    { id: 'fridge', where: 'за холодильником', x: 681, floor: 1, peek: { dx: -48, dy: 0 } },
    { id: 'bed', where: 'под одеялом', x: 140, floor: 2, peek: { dx: 0, dy: -30 } },
    { id: 'wardrobe', where: 'в шкафу', x: 285, floor: 2, peek: { dx: -44, dy: 0 } },
    { id: 'basket', where: 'в корзине для белья', x: 515, floor: 2, peek: { dx: 0, dy: -30 } },
    { id: 'tub', where: 'в ванне', x: 636, floor: 2, y0: -16, peek: { dx: 0, dy: -32 } },
  ];
  const pickSpot = (rnd = Math.random, exceptId = null) => pick(SPOTS.filter((s) => s.id !== exceptId), rnd);
  // Где стоит спрятавшийся питомец; peeking — высунулся.
  const spotPos = (s, peeking) => ({
    x: s.x + (peeking ? s.peek.dx : 0),
    y: FLOOR_Y[s.floor] + (s.y0 !== undefined ? s.y0 : -4) + (peeking ? s.peek.dy : 0),
  });

  // Грязь: на полу (лужа, следы, крошки, носок, пыль) или паутина в углу у потолка. hp — сколько раз потереть.
  const DIRT = {
    puddle: { hp: 2, floor: true }, paws: { hp: 2, floor: true }, crumbs: { hp: 2, floor: true },
    sock: { hp: 1, floor: true }, dust: { hp: 3, floor: true }, web: { hp: 2, floor: false },
  };
  let dirtSeq = 0;
  // Новая грязь в случайном месте, не вплотную к уже существующей. type/room — если нужно конкретное.
  function randomDirt(existing, rnd = Math.random, type = null, room = null) {
    type = type || pick(Object.keys(DIRT), rnd);
    for (let tries = 0; tries < 40; tries++) {
      const r = room ? ROOMS.find((x) => x.id === room) : pick(ROOMS, rnd);
      let x, y, side = 1;
      if (DIRT[type].floor) {
        x = Math.round(r.x0 + 40 + rnd() * (r.x1 - r.x0 - 80));
        y = FLOOR_Y[r.floor];
      } else {
        side = rnd() < 0.5 ? 1 : -1;
        x = side === 1 ? r.x0 : r.x1;
        y = CEIL_Y[r.floor];
      }
      if (existing.some((d) => Math.hypot(d.x - x, d.y - y) < 70)) continue;
      return { id: Date.now().toString(36) + (dirtSeq++), type, x, y, side, hp: DIRT[type].hp };
    }
    return null;
  }

  const api = {
    FLOOR_Y, CEIL_Y, LADDER_X, X_MIN, X_MAX, ROOMS, PETS, SPOTS, DIRT, RATE, MAX_DIRT,
    clampX, floorAt, path, petInfo, newPet, decay, cleanliness, chooseRequest, pickSpot, spotPos, randomDirt,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.House = api;
})(this);
