import { PNG } from 'pngjs';
import type { DonutReport } from './reports.domain.js';

/**
 * Рендер кольцевой диаграммы в PNG **без нативных зависимостей** (pngjs, чистый JS).
 * ТЗ предлагал chartjs-node-canvas, но он тянет нативный node-canvas (Cairo),
 * который не собирается без build-тулчейна и конфликтует с «лёгкой» установкой.
 * Здесь — растеризация кольца по пикселям с суперсэмплингом (сглаживание) и
 * встроенным 5×7 битмап-шрифтом для значения в центре.
 */

interface RenderOpts {
  /** Итоговый размер PNG (квадрат), px. */
  size?: number;
  /** Толщина кольца как доля радиуса (0..1). */
  thickness?: number;
  /** Коэффициент суперсэмплинга (сглаживание краёв). */
  supersample?: number;
}

type RGB = { r: number; g: number; b: number };

const TRACK: RGB = { r: 230, g: 233, b: 240 };
const TEXT: RGB = { r: 27, g: 34, b: 51 };

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// 5×7 битмап-шрифт: цифры, точка, процент (строки по 5 бит, MSB слева).
const FONT: Record<string, number[]> = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  '.': [0, 0, 0, 0, 0, 0b00110, 0b00110],
  '%': [0b11001, 0b11010, 0b00100, 0b01011, 0b10011, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

/** Рисует строку 5×7-шрифтом по центру (cx,cy) с масштабом scale (в супер-пикселях). */
function drawText(px: Buffer, W: number, text: string, cx: number, cy: number, scale: number): void {
  const glyphW = 5 * scale;
  const gap = scale;
  const advance = glyphW + gap;
  const totalW = text.length * advance - gap;
  const totalH = 7 * scale;
  let x0 = Math.round(cx - totalW / 2);
  const y0 = Math.round(cy - totalH / 2);
  for (const ch of text) {
    const glyph = (FONT[ch] ?? FONT[' '])!;
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row]!;
      for (let col = 0; col < 5; col++) {
        if ((bits >> (4 - col)) & 1) {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) {
              const x = x0 + col * scale + sx;
              const y = y0 + row * scale + sy;
              if (x < 0 || y < 0 || x >= W || y >= W) continue;
              const i = (y * W + x) * 4;
              px[i] = TEXT.r;
              px[i + 1] = TEXT.g;
              px[i + 2] = TEXT.b;
              px[i + 3] = 255;
            }
        }
      }
    }
    x0 += advance;
  }
}

/** Рендерит кольцевую диаграмму отчёта в PNG-буфер. */
export function renderDonutPng(report: DonutReport, opts: RenderOpts = {}): Buffer {
  const size = opts.size ?? 440;
  const ss = opts.supersample ?? 3;
  const thickness = opts.thickness ?? 0.34;
  const N = size * ss;

  const big = Buffer.alloc(N * N * 4, 0); // RGBA, прозрачный фон
  const cx = N / 2;
  const cy = N / 2;
  const outerR = N * 0.46;
  const innerR = outerR * (1 - thickness);

  // Угловые диапазоны сегментов (старт сверху, по часовой).
  const segs = report.segments.filter((s) => s.value > 0);
  const totalShare = segs.reduce((a, s) => a + s.share, 0) || 1;
  let acc = -Math.PI / 2;
  const ranges = segs.map((s) => {
    const ang = (s.share / totalShare) * Math.PI * 2;
    const r = { color: hexToRgb(s.color), a0: acc, a1: acc + ang };
    acc += ang;
    return r;
  });

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const rr = Math.hypot(dx, dy);
      if (rr < innerR || rr > outerR) continue;
      let ang = Math.atan2(dy, dx);
      if (ang < -Math.PI / 2) ang += Math.PI * 2; // нормируем старт к -90°
      let col: RGB = TRACK;
      for (const rg of ranges) {
        if (ang >= rg.a0 && ang < rg.a1) {
          col = rg.color;
          break;
        }
      }
      const i = (y * N + x) * 4;
      big[i] = col.r;
      big[i + 1] = col.g;
      big[i + 2] = col.b;
      big[i + 3] = 255;
    }
  }

  // Значение в центре кольца.
  const textScale = Math.max(2, Math.round((innerR * 1.3) / (report.centerValue.length * 6)));
  drawText(big, N, report.centerValue, cx, cy, textScale);

  // Даунсэмплинг ss×ss (box-фильтр) → сглаживание краёв.
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const i = ((y * ss + sy) * N + (x * ss + sx)) * 4;
          const al = big[i + 3]!;
          r += big[i]! * al;
          g += big[i + 1]! * al;
          b += big[i + 2]! * al;
          a += al;
        }
      }
      const o = (y * size + x) * 4;
      const denom = a || 1;
      png.data[o] = Math.round(r / denom);
      png.data[o + 1] = Math.round(g / denom);
      png.data[o + 2] = Math.round(b / denom);
      png.data[o + 3] = Math.round(a / (ss * ss));
    }
  }
  return PNG.sync.write(png);
}
