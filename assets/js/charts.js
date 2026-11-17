/* UANG — grafik SVG tanpa dependensi */

import { compactNumber, escapeHTML, monthShort, niceMax } from './format.js';

const INK = 'var(--ink)';
const GRID = 'var(--chart-grid)';
const MUTED = 'var(--muted)';

export function barChartSVG(series, { width = 720, height = 250 } = {}) {
  const pad = { top: 18, right: 6, bottom: 34, left: 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = niceMax(Math.max(0, ...series.flatMap((p) => [p.income, p.expense])));
  const groupW = innerW / Math.max(1, series.length);
  const barW = Math.min(30, groupW * 0.27);
  const gap = Math.min(8, groupW * 0.04);

  const gridLines = [0, 1 / 3, 2 / 3, 1].map((fraction) => {
    const value = maxValue * fraction;
    const y = pad.top + innerH - innerH * fraction;
    return `
      <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1.5" ${fraction === 0 ? '' : 'stroke-dasharray="3 5"'} />
      <text x="${pad.left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="chart-axis">${fraction === 0 ? '0' : compactNumber(value)}</text>
    `;
  }).join('');

  const groups = series.map((point, index) => {
    const center = pad.left + groupW * index + groupW / 2;
    const incomeH = (point.income / maxValue) * innerH;
    const expenseH = (point.expense / maxValue) * innerH;
    const baseY = pad.top + innerH;
    const delay = `${(index * 60).toFixed(0)}ms`;
    const bars = [
      point.income > 0 ? `
        <rect class="chart-bar chart-bar--income" x="${(center - barW - gap / 2).toFixed(1)}" y="${(baseY - incomeH).toFixed(1)}"
          width="${barW.toFixed(1)}" height="${Math.max(2, incomeH).toFixed(1)}" style="animation-delay:${delay}">
          <title>Pemasukan ${monthShort(point.key)}: ${compactNumber(point.income)}</title>
        </rect>` : '',
      point.expense > 0 ? `
        <rect class="chart-bar chart-bar--expense" x="${(center + gap / 2).toFixed(1)}" y="${(baseY - expenseH).toFixed(1)}"
          width="${barW.toFixed(1)}" height="${Math.max(2, expenseH).toFixed(1)}" style="animation-delay:${delay}">
          <title>Pengeluaran ${monthShort(point.key)}: ${compactNumber(point.expense)}</title>
        </rect>` : '',
    ].join('');

    return `<g>
      ${bars}
      <text x="${center.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="chart-label">${monthShort(point.key)}</text>
    </g>`;
  }).join('');

  return `
    <svg class="chart chart--bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik pemasukan dan pengeluaran enam bulan terakhir">
      <g>${gridLines}</g>
      <g>${groups}</g>
    </svg>`;
}

export function donutSVG(slices, { size = 188, thickness = 36 } = {}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) {
    return `
      <div class="donut-wrap donut-wrap--empty">
        <svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="Belum ada pengeluaran">
          <circle cx="${size / 2}" cy="${size / 2}" r="${(size - thickness) / 2 - 8}" fill="none" stroke="var(--surface-2)" stroke-width="${thickness}" />
          <circle cx="${size / 2}" cy="${size / 2}" r="${(size - thickness) / 2 - 8}" fill="none" stroke="${INK}" stroke-width="2.5" />
          <circle cx="${size / 2}" cy="${size / 2}" r="${(size + thickness) / 2 - 8}" fill="none" stroke="${INK}" stroke-width="2.5" />
          <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" class="donut-total" style="font-size:30px">—</text>
          <text x="${size / 2}" y="${size / 2 + 22}" text-anchor="middle" class="donut-sub">TOTAL</text>
        </svg>
      </div>`;
  }

  const radius = (size - thickness) / 2 - 8;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  const segments = slices.map((slice) => {
    const fraction = slice.value / total;
    const length = Math.max(0, fraction * circumference - 4);
    const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`;
    const offset = -accumulated * circumference;
    accumulated += fraction;
    return `<circle cx="${center}" cy="${center}" r="${radius}" fill="none"
      stroke="${slice.color}" stroke-width="${thickness}" stroke-dasharray="${dash}"
      stroke-dashoffset="${offset.toFixed(2)}"><title>${escapeHTML(slice.label)}: ${compactNumber(slice.value)}</title></circle>`;
  }).join('');

  return `
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="Komposisi pengeluaran per kategori">
        <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--surface-2)" stroke-width="${thickness}" />
        <g transform="rotate(-90 ${center} ${center})">${segments}</g>
        <circle cx="${center}" cy="${center}" r="${radius + thickness / 2}" fill="none" stroke="${INK}" stroke-width="2.5" />
        <circle cx="${center}" cy="${center}" r="${radius - thickness / 2}" fill="none" stroke="${INK}" stroke-width="2.5" />
        <text x="${center}" y="${center + 1}" text-anchor="middle" class="donut-total amount">${compactNumber(total)}</text>
        <text x="${center}" y="${center + 22}" text-anchor="middle" class="donut-sub">TOTAL</text>
      </svg>
    </div>`;
}

export function sparklineSVG(values, { width = 320, height = 68 } = {}) {
  const list = values.length ? values : [0, 0];
  const points = list.length === 1 ? [list[0], list[0]] : list;
  const pad = 4;
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = (width - pad * 2) / (points.length - 1);
  const coords = points.map((value, index) => {
    const x = pad + index * step;
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(width - pad).toFixed(1)} ${height - pad} L${pad} ${height - pad} Z`;
  const last = coords[coords.length - 1];

  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Tren pengeluaran kumulatif">
      <path class="spark-area" d="${area}" fill="var(--spark-fill)" stroke="none" />
      <path class="spark-line" d="${line}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
      <circle class="spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4.2" fill="var(--yellow)" stroke="${INK}" stroke-width="2.4" />
    </svg>`;
}

export { INK, MUTED };
