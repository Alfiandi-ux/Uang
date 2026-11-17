/* UANG — utilitas format & tanggal (locale Indonesia) */

const NF0 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
export const DAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const pad2 = (n) => String(n).padStart(2, '0');

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function currentMonthKey() {
  return todayISO().slice(0, 7);
}

export function monthKeyOf(iso) {
  return String(iso || '').slice(0, 7);
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function parseMonthKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return { year: y, month: m };
}

export function addMonths(key, delta) {
  const { year, month } = parseMonthKey(key);
  const d = new Date(year, month - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthLabel(key, long = true) {
  const { year, month } = parseMonthKey(key);
  const names = long ? MONTHS_LONG : MONTHS_SHORT;
  return `${names[(month - 1 + 12) % 12]} ${year}`;
}

export function monthShort(key) {
  const { month } = parseMonthKey(key);
  return MONTHS_SHORT[(month - 1 + 12) % 12];
}

export function monthShortYear(key) {
  const { year } = parseMonthKey(key);
  return `${monthShort(key)} '${String(year).slice(-2)}`;
}

export function daysInMonth(key) {
  const { year, month } = parseMonthKey(key);
  return new Date(year, month, 0).getDate();
}

export function endOfMonthISO(key) {
  return `${key}-${pad2(daysInMonth(key))}`;
}

export function isCurrentMonth(key) {
  return key === currentMonthKey();
}

export function formatNumber(n) {
  return NF0.format(Math.round(Number(n) || 0));
}

export function formatIDR(value, { sign = false } = {}) {
  const n = Math.round(Number(value) || 0);
  const abs = Math.abs(n);
  const body = `Rp ${NF0.format(abs)}`;
  if (n < 0) return `\u2212${body}`;
  if (sign && n > 0) return `+${body}`;
  return body;
}

export function compactNumber(value) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const prefix = n < 0 ? '\u2212' : '';
  if (abs >= 1e9) return `${prefix}${NF1.format(abs / 1e9).replace(',0', '')} M`;
  if (abs >= 1e6) return `${prefix}${NF1.format(abs / 1e6).replace(',0', '')} jt`;
  if (abs >= 1e4) return `${prefix}${NF1.format(abs / 1e3).replace(',0', '')} rb`;
  return `${prefix}${NF0.format(abs)}`;
}

export function formatCompactIDR(value) {
  return `Rp ${compactNumber(value)}`;
}

export function formatDate(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDateLong(iso) {
  const d = parseISO(iso);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function dayHeading(iso) {
  const today = todayISO();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = todayISO(yesterday);
  const d = parseISO(iso);
  let main = `${DAYS_LONG[d.getDay()]}, ${formatDate(iso)}`;
  if (iso === today) main = 'Hari ini';
  else if (iso === y) main = 'Kemarin';
  return { main, sub: formatDate(iso) };
}

export function dayIndex(iso) {
  return parseISO(iso).getDate();
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function percent(part, total) {
  if (!total) return 0;
  return (Number(part) || 0) / total;
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHTML(value).replace(/`/g, '&#96;');
}

export function signedPercent(n) {
  const rounded = Math.round(Number(n) || 0);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '\u2212'}${Math.abs(rounded)}%`;
}

/** Angka "cantik" untuk sumbu grafik: 5.7 jt -> 6 jt */
export function niceMax(value) {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / power;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const step = steps.find((s) => n <= s) || 10;
  return step * power;
}
