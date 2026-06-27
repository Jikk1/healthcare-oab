/**
 * ============================================================
 * Cox PH — небольшая численная библиотека
 * ============================================================
 * Самодостаточные примитивы линейной алгебры и статистики для модуля Кокса.
 * Размерности малы (число ковариат k обычно < 20), поэтому простые O(k³)
 * реализации полностью оправданы и легко проверяемы.
 *
 * Под `noUncheckedIndexedAccess` индексный доступ даёт `T | undefined`; в горячих
 * числовых циклах границы гарантированы, поэтому читаем через `!`, а строки
 * матриц захватываем в локальные переменные для читаемости.
 */

export type Matrix = number[][];

/** Скалярное произведение векторов одинаковой длины. */
export function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Создать нулевую матрицу n×m. */
export function zeros(n: number, m: number): Matrix {
  return Array.from({ length: n }, () => new Array<number>(m).fill(0));
}

/**
 * Обращение квадратной матрицы методом Гаусса–Жордана с частичным выбором
 * ведущего элемента. Бросает, если матрица вырождена.
 */
export function invert(A: Matrix): Matrix {
  const n = A.length;
  // Расширенная матрица [A | I].
  const M: Matrix = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

  for (let col = 0; col < n; col++) {
    // Выбор ведущего элемента по максимуму модуля в столбце.
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-12) throw new Error('Матрица вырождена — обращение невозможно');
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }

    const prow = M[col]!;
    const pv = prow[col]!;
    for (let j = 0; j < 2 * n; j++) prow[j] = prow[j]! / pv;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const rrow = M[r]!;
      const f = rrow[col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) rrow[j] = rrow[j]! - f * prow[j]!;
    }
  }
  return M.map((row) => row.slice(n));
}

/** Матрично-векторное произведение A·v. */
export function matVec(A: Matrix, v: readonly number[]): number[] {
  return A.map((row) => dot(row, v));
}

/**
 * Функция ошибок erf(x) — аппроксимация Абрамовица–Стегуна (7.1.26),
 * абсолютная погрешность < 1.5·10⁻⁷.
 */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Функция распределения стандартного нормального закона Φ(z). */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Двусторонний p-value по нормальному приближению для z-статистики. */
export function twoSidedP(z: number): number {
  return 2 * (1 - normalCdf(Math.abs(z)));
}
