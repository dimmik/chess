// «Хитрый» компьютер для быстрой партии в Ямб (один свободный столбец): генератор данных.
//
// 1. Точно решает одиночную игру: для каждой позиции (какие строки заполнены, сумма верха до 60,
//    значения «1», «Макс», «Мин», пока разница не посчитана) — ожидаемые очки до конца при лучшей игре.
//    ~25 млн позиций, несколько минут на 8 ядрах, ~300 МБ памяти.
// 2. Сжимает таблицу до трёх маленьких: A0[строки] + C[строки верха][сумма верха] + B[что из 1/Макс/Мин
//    записано][их значения]. Компьютер в игре сам перебирает три броска хода и смотрит в эти таблицы,
//    чтобы оценить позицию после записи.
// 3. Проверяет: сжатая оценка играет почти как точная (средний счёт и победы против простого компьютера).
// 4. Пишет docs/jamb/smart-data.js.
//
// Сборка и запуск (из корня репозитория):
//   gcc -O3 -march=native -fopenmp -o /tmp/jamb-smart tools/jamb-smart.c -lm && /tmp/jamb-smart
// Необязательно: /tmp/jamb-smart <файл-кэш> — сохранить/взять точную таблицу из файла (≈300 МБ).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <math.h>
#include <omp.h>

#define NC 13   // строки: 0..5 = «1»..«6», 6 Макс, 7 Мин, 8 кента, 9 трилинг, 10 фул, 11 покер, 12 ямб
#define ND 252  // наборы из 5 кубиков (без порядка)
#define NK 462  // наборы из 0..5 оставленных кубиков
#define NT 61   // сумма верха 0..60 (дальше бонус уже есть)
#define NDS 156 // состояние разницы, см. ds_*
enum { R1 = 0, RMAX = 6, RMIN = 7, KENTA = 8, TRIL = 9, FUL = 10, POKER = 11, JAMB = 12 };

static int dcnt[ND][7], kcnt[NK][7], kidx[46656], didx[46656];
static int dkeep_n[ND], dkeep[ND][32], ktr_n[NK], *ktr_d[NK];
static double *ktr_p[NK];
static int scoretab[4][NC][ND];

static int code_of(const int *c) { int x = 0; for (int f = 1; f <= 6; f++) x = x * 6 + c[f]; return x; }

// Очки строки — так же, как score() в docs/jamb/jamb.js.
static int score_counts(int row, const int *c, int rollNo) {
  int sum = 0; for (int f = 1; f <= 6; f++) sum += f * c[f];
  if (row <= 5) return c[row + 1] * (row + 1);
  if (row == RMAX || row == RMIN) return sum;
  if (row == KENTA) {
    int distinct = 0; for (int f = 1; f <= 6; f++) distinct += c[f] > 0;
    static const int k[4] = {0, 66, 56, 46};
    return distinct == 5 && !(c[1] && c[6]) ? k[rollNo] : 0;
  }
  if (row == TRIL) { for (int n = 6; n >= 1; n--) if (c[n] >= 3) return 3 * n + 20; return 0; }
  if (row == FUL) { int t = 0, p = 0; for (int f = 1; f <= 6; f++) { t |= c[f] == 3; p |= c[f] == 2; } return t && p ? sum + 30 : 0; }
  if (row == POKER) { for (int n = 6; n >= 1; n--) if (c[n] >= 4) return 4 * n + 40; return 0; }
  for (int n = 6; n >= 1; n--) if (c[n] == 5) return 5 * n + 50;
  return 0;
}

static double fact(int n) { double r = 1; for (int i = 2; i <= n; i++) r *= i; return r; }

static void init_tables(void) {
  int nd = 0, nk = 0, c[7] = {0};
  for (c[1] = 0; c[1] <= 5; c[1]++) for (c[2] = 0; c[2] <= 5; c[2]++) for (c[3] = 0; c[3] <= 5; c[3]++)
  for (c[4] = 0; c[4] <= 5; c[4]++) for (c[5] = 0; c[5] <= 5; c[5]++) for (c[6] = 0; c[6] <= 5; c[6]++) {
    int s = c[1] + c[2] + c[3] + c[4] + c[5] + c[6];
    if (s > 5) continue;
    memcpy(kcnt[nk], c, sizeof c); kidx[code_of(c)] = nk++;
    if (s == 5) { memcpy(dcnt[nd], c, sizeof c); didx[code_of(c)] = nd++; }
  }
  for (int k = 0; k < NK; k++) {
    int ks = 0; for (int f = 1; f <= 6; f++) ks += kcnt[k][f];
    int r = 5 - ks, n = 0;
    ktr_d[k] = malloc(sizeof(int) * ND); ktr_p[k] = malloc(sizeof(double) * ND);
    for (int j = 0; j < NK; j++) {
      int js = 0; for (int f = 1; f <= 6; f++) js += kcnt[j][f];
      if (js != r) continue;
      double p = fact(r) / pow(6, r); int t[7] = {0};
      for (int f = 1; f <= 6; f++) { p /= fact(kcnt[j][f]); t[f] = kcnt[k][f] + kcnt[j][f]; }
      ktr_d[k][n] = didx[code_of(t)]; ktr_p[k][n++] = p;
    }
    ktr_n[k] = n;
  }
  for (int d = 0; d < ND; d++) {
    int n = 0, t[7] = {0};
    for (t[1] = 0; t[1] <= dcnt[d][1]; t[1]++) for (t[2] = 0; t[2] <= dcnt[d][2]; t[2]++) for (t[3] = 0; t[3] <= dcnt[d][3]; t[3]++)
    for (t[4] = 0; t[4] <= dcnt[d][4]; t[4]++) for (t[5] = 0; t[5] <= dcnt[d][5]; t[5]++) for (t[6] = 0; t[6] <= dcnt[d][6]; t[6]++)
      dkeep[d][n++] = kidx[code_of(t)];
    dkeep_n[d] = n;
  }
  for (int r = 1; r <= 3; r++) for (int cat = 0; cat < NC; cat++) for (int d = 0; d < ND; d++) scoretab[r][cat][d] = score_counts(cat, dcnt[d], r);
}

// ---- Состояние «1» / Макс / Мин. pattern: 1 — «1» записана, 2 — Макс, 4 — Мин. ----
// ds: «1» → o (0..5); Макс → M−5; Мин → m−5; «1»+Макс → o·26+M−5; «1»+Мин → o·26+m−5;
// Макс+Мин → max(0, M−m); все три → 0 (разница уже в очках).
static int pattern(int mask) { return (mask & 1) | ((mask >> RMAX & 1) << 1) | ((mask >> RMIN & 1) << 2); }
static int nds_of(int pat) { static const int n[8] = {1, 6, 26, 156, 26, 156, 26, 1}; return n[pat]; }

// Записать v в строку cat: награда (очки, бонус, разница, когда она становится известна) и новое состояние.
// Сами Макс и Мин в итог не входят — только через (Макс − Мин) × «1».
static int transition(int mask, int top, int ds, int cat, int v, int *nmask, int *ntop, int *nds) {
  int reward = cat == RMAX || cat == RMIN ? 0 : v;
  *nmask = mask | 1 << cat; *ntop = top; *nds = ds;
  if (cat <= 5) { int t = top + v; if (top < 60 && t >= 60) reward += 30; *ntop = t > 60 ? 60 : t; }
  if (cat == R1 || cat == RMAX || cat == RMIN) {
    int pat = pattern(mask), o = -1, M = -1, m = -1, dpos = -1;
    switch (pat) {
      case 1: o = ds; break;
      case 2: M = ds + 5; break;
      case 4: m = ds + 5; break;
      case 3: o = ds / 26; M = ds % 26 + 5; break;
      case 5: o = ds / 26; m = ds % 26 + 5; break;
      case 6: dpos = ds; break;
    }
    if (cat == R1) o = v; else if (cat == RMAX) M = v; else m = v;
    switch (pattern(*nmask)) {
      case 1: *nds = o; break;
      case 2: *nds = M - 5; break;
      case 4: *nds = m - 5; break;
      case 3: *nds = o * 26 + M - 5; break;
      case 5: *nds = o * 26 + m - 5; break;
      case 6: *nds = M > m ? M - m : 0; break;
      case 7: if (dpos < 0) dpos = M > m ? M - m : 0; reward += dpos * o; *nds = 0; break;
    }
  }
  return reward;
}

// Оценка позиции: точная таблица или сжатая.
static float *W;  // W[(mask*NT + top)*NDS + ds]
static float A0[1 << NC], C3[64][NT], B3[8][NDS];
static int use_approx;
static inline double value(int mask, int top, int ds) {
  if (mask == (1 << NC) - 1) return 0;
  if (use_approx) return A0[mask] + C3[mask & 63][top] + B3[pattern(mask)][ds];
  return W[((size_t)mask * NT + top) * NDS + ds];
}

static double best_write(int mask, int top, int ds, int r, int d, int *bestcat) {
  double best = -1e18; int bc = -1;
  for (int cat = 0; cat < NC; cat++) {
    if (mask & 1 << cat) continue;
    int nm, nt, nd, rew = transition(mask, top, ds, cat, scoretab[r][cat][d], &nm, &nt, &nd);
    double v = rew + value(nm, nt, nd);
    if (v > best) { best = v; bc = cat; }
  }
  if (bestcat) *bestcat = bc;
  return best;
}

typedef struct { double B3[ND], K3[NK], B2[ND], K2[NK], B1[ND], E; } Turn;
static void expect(const double *B, double *K) {
  for (int k = 0; k < NK; k++) { double s = 0; for (int i = 0; i < ktr_n[k]; i++) s += ktr_p[k][i] * B[ktr_d[k][i]]; K[k] = s; }
}
static void eval_turn(int mask, int top, int ds, Turn *T) {
  for (int d = 0; d < ND; d++) T->B3[d] = best_write(mask, top, ds, 3, d, NULL);
  expect(T->B3, T->K3);
  for (int d = 0; d < ND; d++) {
    double b = best_write(mask, top, ds, 2, d, NULL);
    for (int i = 0; i < dkeep_n[d]; i++) if (T->K3[dkeep[d][i]] > b) b = T->K3[dkeep[d][i]];
    T->B2[d] = b;
  }
  expect(T->B2, T->K2);
  for (int d = 0; d < ND; d++) {
    double b = best_write(mask, top, ds, 1, d, NULL);
    for (int i = 0; i < dkeep_n[d]; i++) if (T->K2[dkeep[d][i]] > b) b = T->K2[dkeep[d][i]];
    T->B1[d] = b;
  }
  int k0 = kidx[0]; double s = 0;
  for (int i = 0; i < ktr_n[k0]; i++) s += ktr_p[k0][i] * T->B1[ktr_d[k0][i]];
  T->E = s;
}

static int maxtop_of(int mask) { int s = 0; for (int i = 0; i < 6; i++) if (mask & 1 << i) s += 5 * (i + 1); return s > 60 ? 60 : s; }

static void solve(void) {
  W = calloc((size_t)(1 << NC) * NT * NDS, sizeof(float));
  for (int pc = NC - 1; pc >= 0; pc--) {
    #pragma omp parallel for schedule(dynamic, 1)
    for (int mask = 0; mask < (1 << NC) - 1; mask++) {
      if (__builtin_popcount(mask) != pc) continue;
      Turn *T = malloc(sizeof(Turn));
      int nds = nds_of(pattern(mask)), mt = maxtop_of(mask);
      for (int top = 0; top <= mt; top++) for (int ds = 0; ds < nds; ds++) {
        eval_turn(mask, top, ds, T);
        W[((size_t)mask * NT + top) * NDS + ds] = (float)T->E;
      }
      free(T);
    }
    fprintf(stderr, "  заполнено строк: %d\n", pc);
  }
}

// Сжатие: A(mask,top) = среднее по ds; A0(mask) = среднее A по сумме верха;
// C(строки верха, сумма) = среднее (A − A0); B(pattern, ds) = среднее (W − A).
static void fit(void) {
  static double Cs[64][NT], Bs[8][NDS]; static long Cn[64][NT], Bn[8][NDS];
  for (int m = 0; m < (1 << NC) - 1; m++) {
    int pat = pattern(m), nds = nds_of(pat), mt = maxtop_of(m);
    double A[NT], a0 = 0;
    for (int t = 0; t <= mt; t++) {
      double s = 0; for (int d = 0; d < nds; d++) s += W[((size_t)m * NT + t) * NDS + d];
      A[t] = s / nds; a0 += A[t];
      for (int d = 0; d < nds; d++) { Bs[pat][d] += W[((size_t)m * NT + t) * NDS + d] - A[t]; Bn[pat][d]++; }
    }
    A0[m] = a0 / (mt + 1);
    for (int t = 0; t <= mt; t++) { Cs[m & 63][t] += A[t] - A0[m]; Cn[m & 63][t]++; }
  }
  for (int a = 0; a < 64; a++) for (int t = 0; t < NT; t++) C3[a][t] = Cn[a][t] ? Cs[a][t] / Cn[a][t] : 0;
  for (int p = 0; p < 8; p++) for (int d = 0; d < NDS; d++) B3[p][d] = Bn[p][d] ? Bs[p][d] / Bn[p][d] : 0;
  // В браузер идут числа с точностью 0,1 — пусть и проверка играет с ними же.
  for (int m = 0; m < 1 << NC; m++) A0[m] = roundf(A0[m] * 10) / 10;
  for (int a = 0; a < 64; a++) for (int t = 0; t < NT; t++) C3[a][t] = roundf(C3[a][t] * 10) / 10;
  for (int p = 0; p < 8; p++) for (int d = 0; d < NDS; d++) B3[p][d] = roundf(B3[p][d] * 10) / 10;
}

// ---- Проверка: партии против простого компьютера (как aiDecide в jamb.js, быстрая партия) ----
typedef struct { uint64_t s[4]; } Rng;
static inline uint64_t rotl(uint64_t x, int k) { return x << k | x >> (64 - k); }
static inline uint64_t rnext(Rng *r) { uint64_t *s = r->s, res = rotl(s[1] * 5, 7) * 9, t = s[1] << 17; s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 45); return res; }
static inline double runif(Rng *r) { return (rnext(r) >> 11) * (1.0 / 9007199254740992.0); }
static inline int rdie(Rng *r) { return 1 + (int)(runif(r) * 6); }
static void rseed(Rng *r, uint64_t seed) { for (int i = 0; i < 4; i++) { seed += 0x9e3779b97f4a7c15ULL; uint64_t z = seed; z = (z ^ z >> 30) * 0xbf58476d1ce4e5b9ULL; z = (z ^ z >> 27) * 0x94d049bb133111ebULL; r->s[i] = z ^ z >> 31; } }

typedef struct { int v[NC], filled; } Sheet;
static int sheet_total(const Sheet *s) {
  int top = 0; for (int i = 0; i < 6; i++) top += s->v[i];
  int diff = (s->v[RMAX] - s->v[RMIN]) * s->v[R1];
  return top + (top >= 60 ? 30 : 0) + (diff > 0 ? diff : 0) + s->v[KENTA] + s->v[TRIL] + s->v[FUL] + s->v[POKER] + s->v[JAMB];
}
static int score_dice(int row, const int *dice, int r) { int c[7] = {0}; for (int i = 0; i < 5; i++) c[dice[i]]++; return score_counts(row, c, r); }
static const int PAR[NC] = {3, 6, 9, 12, 15, 18, 23, 0, 25, 28, 32, 25, 15};
static double utility(int row, int v) {
  if (row == RMIN) return 14 - v;
  if (row == RMAX) return v - PAR[RMAX];
  if (row <= 5) return v - PAR[row] + (v >= 4 * (row + 1) ? 3 : 0);
  return v > 0 ? v - PAR[row] : -PAR[row];
}
static void simple_turn(Sheet *s, Rng *rng) {
  int dice[5] = {0}, hold[5] = {0};
  for (int r = 1; r <= 3; r++) {
    for (int i = 0; i < 5; i++) if (!(hold[i] && dice[i])) dice[i] = rdie(rng);
    int bc = -1; double bu = 0;
    for (int row = 0; row < NC; row++) {
      if (s->filled & 1 << row) continue;
      double u = utility(row, score_dice(row, dice, r)) + (runif(rng) - 0.5) * 4;
      if (bc < 0 || u > bu) { bc = row; bu = u; }
    }
    if (r == 3 || bu >= 12) { s->v[bc] = score_dice(bc, dice, r); s->filled |= 1 << bc; return; }
    int c[7] = {0}, mx = 0; for (int i = 0; i < 5; i++) c[dice[i]]++; for (int f = 1; f <= 6; f++) if (c[f] > mx) mx = c[f];
    int lo = 0, hi = 0; for (int f = 1; f <= 5; f++) lo += c[f] > 0; for (int f = 2; f <= 6; f++) hi += c[f] > 0;
    if (!(s->filled & 1 << KENTA) && (lo > hi ? lo : hi) >= 4) {
      int seen[7] = {0}, low = c[1] > 0 && c[6] == 0;
      for (int i = 0; i < 5; i++) { int d = dice[i], want = low ? d <= 5 : d >= 2; hold[i] = want && !seen[d]; if (hold[i]) seen[d] = 1; }
    } else if (mx <= 1 && !(s->filled & 1 << RMAX)) {
      for (int i = 0; i < 5; i++) hold[i] = dice[i] >= 5;
    } else {
      int v = 6; for (int n = 6; n >= 1; n--) if (c[n] > c[v]) v = n;
      for (int i = 0; i < 5; i++) hold[i] = dice[i] == v;
    }
  }
}
static void smart_turn(Sheet *s, int *top, int *ds, Rng *rng, Turn *T) {
  eval_turn(s->filled, *top, *ds, T);
  int c[7] = {0};
  for (int i = 0; i < 5; i++) c[rdie(rng)]++;
  for (int r = 1; r <= 3; r++) {
    int d = didx[code_of(c)], cat;
    double w = best_write(s->filled, *top, *ds, r, d, &cat), bk = -1e18; int keep = -1;
    if (r < 3) for (int i = 0; i < dkeep_n[d]; i++) { int k = dkeep[d][i]; double v = (r == 1 ? T->K2 : T->K3)[k]; if (v > bk) { bk = v; keep = k; } }
    if (r == 3 || w >= bk) {
      int nm, nt, nd; s->v[cat] = scoretab[r][cat][d];
      transition(s->filled, *top, *ds, cat, s->v[cat], &nm, &nt, &nd);
      s->filled = nm; *top = nt; *ds = nd;
      return;
    }
    memcpy(c, kcnt[keep], sizeof c);
    int ks = 0; for (int f = 1; f <= 6; f++) ks += c[f];
    for (int i = ks; i < 5; i++) c[rdie(rng)]++;
  }
}
static void check(const char *label, long games) {
  double sum = 0; long win = 0, tie = 0;
  #pragma omp parallel reduction(+:sum, win, tie)
  {
    Rng rng; rseed(&rng, 2024 + omp_get_thread_num()); Turn *T = malloc(sizeof(Turn));
    #pragma omp for
    for (long g = 0; g < games; g++) {
      Sheet me = {{0}, 0}, ai = {{0}, 0}; int top = 0, ds = 0;
      for (int t = 0; t < NC; t++) { smart_turn(&me, &top, &ds, &rng, T); simple_turn(&ai, &rng); }
      int a = sheet_total(&me), b = sheet_total(&ai); sum += a; win += a > b; tie += a == b;
    }
    free(T);
  }
  printf("%-28s средний счёт %.1f, победы над простым %.1f%%, ничьи %.1f%%\n", label, sum / games, 100.0 * win / games, 100.0 * tie / games);
}

static void write_js(const char *path) {
  FILE *f = fopen(path, "w");
  if (!f) { perror(path); exit(1); }
  fprintf(f, "// Оценки позиций для «Хитрого» компьютера в быстрой партии. Сгенерировано tools/jamb-smart.c — не править руками.\n");
  fprintf(f, "// Ценность позиции ≈ A0[строки] + C[строки верха][сумма верха] + B[что из «1»/Макс/Мин записано][их значения];\n");
  fprintf(f, "// числа — десятые доли очка.\n");
  fprintf(f, "(function (root) {\n  const D = {\n    a0: [");
  for (int m = 0; m < 1 << NC; m++) fprintf(f, "%s%d", m ? "," : "", (int)lroundf(A0[m] * 10));
  fprintf(f, "],\n    c: [");
  for (int a = 0; a < 64; a++) { int mt = maxtop_of(a); fprintf(f, "%s[", a ? "," : ""); for (int t = 0; t <= mt; t++) fprintf(f, "%s%d", t ? "," : "", (int)lroundf(C3[a][t] * 10)); fprintf(f, "]"); }
  fprintf(f, "],\n    b: [");
  for (int p = 0; p < 8; p++) { fprintf(f, "%s[", p ? "," : ""); for (int d = 0; d < nds_of(p); d++) fprintf(f, "%s%d", d ? "," : "", (int)lroundf(B3[p][d] * 10)); fprintf(f, "]"); }
  fprintf(f, "],\n  };\n  if (typeof module !== 'undefined' && module.exports) module.exports = D;\n  else root.JambSmartData = D;\n})(this);\n");
  fclose(f);
}

int main(int argc, char **argv) {
  init_tables();
  size_t nW = (size_t)(1 << NC) * NT * NDS;
  FILE *cache = argc > 1 ? fopen(argv[1], "rb") : NULL;
  if (cache) { W = malloc(nW * sizeof(float)); if (fread(W, sizeof(float), nW, cache) != nW) { fprintf(stderr, "битый кэш\n"); return 1; } fclose(cache); }
  else {
    fprintf(stderr, "Решаю точную задачу…\n");
    solve();
    if (argc > 1 && (cache = fopen(argv[1], "wb"))) { fwrite(W, sizeof(float), nW, cache); fclose(cache); }
  }
  printf("Точная стратегия: ожидаемый счёт %.2f\n", W[0]);
  fit();
  for (use_approx = 0; use_approx <= 1; use_approx++) check(use_approx ? "Сжатая оценка (в браузере):" : "Точная таблица:", 200000);
  write_js("docs/jamb/smart-data.js");
  printf("Записано docs/jamb/smart-data.js\n");
  return 0;
}
