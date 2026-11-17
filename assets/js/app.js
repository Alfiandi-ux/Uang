/* UANG — aplikasi pencatatan keuangan pribadi */

import {
  addMonths, currentMonthKey, daysInMonth, endOfMonthISO, escapeHTML as esc,
  formatCompactIDR, formatDate, formatDateShort, formatIDR, formatNumber,
  isCurrentMonth, monthKeyOf, monthLabel, monthShort, monthShortYear,
  signedPercent, todayISO,
} from './format.js';
import * as store from './store.js';
import { barChartSVG, donutSVG, sparklineSVG } from './charts.js';

/* -------------------------------------------------------------------------- */
/* Konstanta & state UI                                                       */
/* -------------------------------------------------------------------------- */

const ROUTES = {
  ringkasan: { label: 'Ringkasan', sub: 'Pantau arus kas dan sisa anggaranmu.' },
  transaksi: { label: 'Transaksi', sub: 'Semua catatan uang masuk dan keluar.' },
  anggaran: { label: 'Anggaran', sub: 'Batas pengeluaran per kategori, tiap bulan.' },
  laporan: { label: 'Laporan', sub: 'Lihat pola pengeluaran dan ambil keputusan.' },
  dompet: { label: 'Dompet', sub: 'Saldo dari semua tempat uangmu disimpan.' },
  pengaturan: { label: 'Pengaturan', sub: 'Tampilan, kategori, dan cadangan data.' },
  lainnya: { label: 'Lainnya', sub: 'Dompet, pengaturan, dan cadangan data.' },
};

const MONTH_SCOPED = new Set(['ringkasan', 'transaksi', 'anggaran', 'laporan']);
const FILTERS = [
  ['all', 'Semua'],
  ['expense', 'Pengeluaran'],
  ['income', 'Pemasukan'],
  ['transfer', 'Transfer'],
];

const ui = {
  route: 'ringkasan',
  month: currentMonthKey(),
  txnFilter: 'all',
  txnQuery: '',
};

let deferredInstallPrompt = null;

/* -------------------------------------------------------------------------- */
/* Utilitas tampilan                                                          */
/* -------------------------------------------------------------------------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const money = (value) => `<span class="amount">${formatIDR(value)}</span>`;
const amountSpan = (type, value, cls = '') => {
  const sign = type === 'expense' ? '\u2212' : type === 'income' ? '+' : '';
  return `<span class="amount ${cls}">${sign}${formatIDR(Math.abs(value))}</span>`;
};

function lookup() {
  const state = store.getState();
  return {
    cats: new Map(state.categories.map((category) => [category.id, category])),
    accs: new Map(state.accounts.map((account) => [account.id, account])),
  };
}

function scopeEndDate() {
  return isCurrentMonth(ui.month) ? null : endOfMonthISO(ui.month);
}

function daysElapsed() {
  return isCurrentMonth(ui.month) ? Number(todayISO().slice(8, 10)) : daysInMonth(ui.month);
}

function defaultTxnDate() {
  return isCurrentMonth(ui.month) ? todayISO() : `${ui.month}-15`;
}

function budgetTone(ratio) {
  if (ratio >= 1) return 'var(--red)';
  if (ratio >= 0.8) return 'var(--orange)';
  return 'var(--green)';
}

function ratioWidth(ratio) {
  return `${Math.max(0, Math.min(100, ratio * 100)).toFixed(1)}%`;
}

function deltaFor(current, previous) {
  if (previous <= 0) {
    return current > 0 ? { text: 'Baru', dir: 'up', pct: null } : null;
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { text: '0%', dir: 'flat', pct: 0 };
  return { text: signedPercent(pct), dir: pct > 0 ? 'up' : 'down', pct };
}

function deltaHTML(current, previous, goodWhenUp = true) {
  const delta = deltaFor(current, previous);
  if (!delta) return '<span class="muted">—</span>';
  const arrow = delta.dir === 'up' ? 'up' : delta.dir === 'down' ? 'down' : 'right';
  let tone = '';
  if (delta.dir !== 'flat' && delta.pct !== null) {
    const good = (delta.dir === 'up') === goodWhenUp;
    tone = good ? 'delta--good' : 'delta--bad';
  }
  return `<span class="delta ${tone}">${icon(arrow, 'icon--xs')}${esc(delta.text)}</span>`;
}

function emptyBlock(emoji, title, text, extra = '') {
  return `
    <div class="empty">
      <span class="empty__icon" aria-hidden="true">${esc(emoji)}</span>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${extra}
    </div>`;
}

function emptyChart(text) {
  return emptyBlock('📉', 'Belum ada data', text,
    '<button type="button" class="btn btn--primary btn--sm" data-action="new-txn">' + icon('plus', 'icon--sm') + ' Catat transaksi</button>');
}

function txnRowHTML(txn, maps, { showDate = false } = {}) {
  const cat = maps.cats.get(txn.categoryId);
  const acc = maps.accs.get(txn.accountId);
  const to = maps.accs.get(txn.toAccountId);
  const isTransfer = txn.type === 'transfer';
  const title = txn.note || (isTransfer ? 'Transfer antar dompet' : cat?.name || 'Transaksi');
  const meta = isTransfer
    ? `${acc?.name || 'Dompet'} \u2192 ${to?.name || 'Dompet'}`
    : `${cat?.name || 'Tanpa kategori'} \u00b7 ${acc?.name || 'Dompet'}`;
  const metaFinal = showDate ? `${meta} \u00b7 ${formatDateShort(txn.date)}` : meta;
  const tile = isTransfer ? icon('transfer') : esc(cat?.icon || '\u2022');
  const tone = isTransfer ? 'var(--blue-soft)' : cat?.color || 'var(--surface-2)';
  const amountClass = txn.type === 'income' ? 'txn__amount--income' : isTransfer ? 'txn__amount--transfer' : '';

  return `
    <li class="txn" data-action="edit-txn" data-id="${esc(txn.id)}" role="button" tabindex="0">
      <span class="txn__icon" style="--c:${tone}" aria-hidden="true">${tile}</span>
      <span class="txn__main">
        <strong class="txn__title">${esc(title)}</strong>
        <span class="txn__meta">${esc(metaFinal)}</span>
      </span>
      <span class="txn__amount ${amountClass}">${amountSpan(txn.type, txn.amount)}</span>
      <button type="button" class="txn__del" data-action="delete-txn" data-id="${esc(txn.id)}" aria-label="Hapus transaksi" title="Hapus transaksi">
        ${icon('trash')}
      </button>
    </li>`;
}

/* -------------------------------------------------------------------------- */
/* Modal, toast, unduhan                                                      */
/* -------------------------------------------------------------------------- */

function openModal({
  title, kicker = '', body, footer = '', size = 'md', closable = true, onMount, onClose,
}) {
  const root = $('#modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--${esc(size)}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal__head">
        <div>
          ${kicker ? `<p class="modal__kicker">${esc(kicker)}</p>` : ''}
          <h2 class="modal__title" id="modal-title">${esc(title)}</h2>
        </div>
        ${closable ? `<button type="button" class="modal__close" data-modal-close aria-label="Tutup">${icon('close')}</button>` : ''}
      </div>
      <div class="modal__body">${body}</div>
      ${footer ? `<div class="modal__foot">${footer}</div>` : ''}
    </div>`;

  const previousFocus = document.activeElement;
  root.append(overlay);
  document.body.classList.add('modal-open');
  const modal = $('.modal', overlay);

  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      overlay.remove();
      if (!document.querySelector('.modal-overlay')) {
        document.body.classList.remove('modal-open');
        if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
      }
    }, 180);
    onClose?.(result);
  };

  function onKey(event) {
    const overlays = $$('.modal-overlay');
    if (overlays[overlays.length - 1] !== overlay) return;
    if (event.key === 'Escape' && closable) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = $$('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href]', overlay)
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', onKey);

  overlay.addEventListener('click', (event) => {
    if (!closable) return;
    if (event.target === overlay || event.target.closest('[data-modal-close]')) close();
  });

  requestAnimationFrame(() => overlay.classList.add('is-open'));
  onMount?.(modal, close);
  setTimeout(() => {
    if (closed) return;
    const target = $('input:not([type="hidden"]), select, textarea, button', modal);
    target?.focus({ preventScroll: true });
  }, 80);

  return { el: modal, close };
}

function confirmDialog({ title, message, confirm = 'Ya, lanjutkan', danger = false, kicker = 'Konfirmasi' }) {
  return new Promise((resolve) => {
    let settled = false;
    openModal({
      title,
      kicker,
      size: 'sm',
      body: `<p class="modal__text">${message}</p>`,
      footer: `
        <button type="button" class="btn" data-modal-close>Batal</button>
        <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm>${esc(confirm)}</button>`,
      onMount(el, close) {
        $('[data-confirm]', el).addEventListener('click', () => {
          settled = true;
          close();
          resolve(true);
        });
      },
      onClose() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    });
  });
}

function toast(message, kind = 'ok') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  const iconName = kind === 'error' ? 'alert' : kind === 'warn' ? 'info' : 'check';
  el.innerHTML = `<span class="toast__icon">${icon(iconName)}</span><span>${esc(message)}</span>`;
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 230);
  }, 3200);
}

function showFormError(form, message) {
  const box = $('.form-error', form);
  if (!box) {
    toast(message, 'error');
    return;
  }
  box.textContent = message;
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function clearFormError(form) {
  const box = $('.form-error', form);
  if (box) {
    box.hidden = true;
    box.textContent = '';
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/* -------------------------------------------------------------------------- */
/* Tema & privasi                                                             */
/* -------------------------------------------------------------------------- */

function resolvedTheme() {
  const theme = store.getSettings().theme;
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#14120F' : '#F2EEE3';
}

function applyPrivacy() {
  const privateMode = Boolean(store.getSettings().privacy);
  document.body.classList.toggle('is-private', privateMode);
  const button = $('#privacy-btn');
  if (button) {
    button.setAttribute('aria-pressed', String(privateMode));
    const label = privateMode ? 'Tampilkan nominal' : 'Sembunyikan nominal';
    button.setAttribute('aria-label', label);
    button.title = label;
  }
}

/* -------------------------------------------------------------------------- */
/* Halaman: Ringkasan                                                         */
/* -------------------------------------------------------------------------- */

function viewRingkasan() {
  const month = ui.month;
  const totals = store.monthTotals(month);
  const previousKey = addMonths(month, -1);
  const previous = store.monthTotals(previousKey);
  const accounts = store.accountsWithBalance(scopeEndDate());
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const budget = store.budgetSummary(month);
  const categoryRows = store.categoryTotals(month, 'expense');
  const expenseTotal = categoryRows.reduce((sum, row) => sum + row.total, 0);
  const recent = store.recentTransactions(month, 5);
  const series = store.monthSeries(month, 6);
  const spark = store.cumulativeSpendSeries(month);
  const maps = lookup();
  const elapsed = daysElapsed();
  const overBudget = budget.remaining < 0;
  const budgetHeadline = overBudget ? Math.abs(budget.remaining) : Math.max(0, budget.remaining);
  const budgetPct = Math.round(budget.ratio * 100);
  const hasChartData = series.some((point) => point.income > 0 || point.expense > 0);

  const slices = categoryRows.slice(0, 5).map((row) => ({
    label: row.category.name,
    value: row.total,
    color: row.category.color,
  }));
  const rest = categoryRows.slice(5).reduce((sum, row) => sum + row.total, 0);
  if (rest > 0) slices.push({ label: 'Kategori lain', value: rest, color: '#8B8375' });
  const donutLegend = slices.map((slice) => {
    const pct = expenseTotal ? Math.round((slice.value / expenseTotal) * 100) : 0;
    return `<div class="donut-legend__row">
      <i style="background:${slice.color}" aria-hidden="true"></i>
      <span class="donut-legend__name">${esc(slice.label)}</span>
      <span class="donut-legend__val amount">${pct}% \u00b7 ${esc(formatCompactIDR(slice.value))}</span>
    </div>`;
  }).join('');

  const netText = `${totals.net >= 0 ? '+' : ''}${formatIDR(totals.net)}`;
  const accountChips = accounts.map((account) => `
    <span class="hero__account">
      <i style="--dot-color:${account.color}" aria-hidden="true"></i>
      ${esc(account.name)}
      <span class="amount">${formatIDR(account.balance)}</span>
    </span>`).join('');

  const overview = `
    <section class="overview" aria-label="Ringkasan saldo">
      <article class="card card--accent hero">
        <div class="hero__watermark" aria-hidden="true">Rp</div>
        <div class="hero__head">
          <span class="hero__label">${icon('wallet', 'icon--xs')} ${isCurrentMonth(month) ? 'Total saldo' : `Saldo akhir ${esc(monthLabel(month))}`}</span>
          <span class="sticker">${esc(monthShortYear(month))}</span>
        </div>
        <p class="hero__amount amount">${formatIDR(totalBalance)}</p>
        <div class="hero__meta">
          <span class="chip">${icon(totals.net >= 0 ? 'up' : 'down', 'icon--xs')} <span class="amount">${netText}</span></span>
          <span>arus kas \u00b7 ${totals.count} transaksi</span>
        </div>
        <div class="hero__accounts">${accountChips || '<span class="small">Belum ada dompet.</span>'}</div>
        <div class="hero__spark">
          <div class="hero__spark-top"><span>Tren pengeluaran</span><span>${elapsed} hari</span></div>
          ${sparklineSVG(spark)}
        </div>
      </article>

      <div class="overview__stats">
        <article class="card card--green stat">
          <div class="stat__top">
            <span class="stat__label">Pemasukan</span>
            <span class="stat__icon">${icon('up')}</span>
          </div>
          <p class="stat__value amount">${formatIDR(totals.income)}</p>
          <div class="stat__foot">${deltaHTML(totals.income, previous.income, true)}<span>vs ${esc(monthShort(previousKey))}</span></div>
        </article>
        <article class="card card--red stat">
          <div class="stat__top">
            <span class="stat__label">Pengeluaran</span>
            <span class="stat__icon">${icon('down')}</span>
          </div>
          <p class="stat__value amount">${formatIDR(totals.expense)}</p>
          <div class="stat__foot">${deltaHTML(totals.expense, previous.expense, false)}<span>vs ${esc(monthShort(previousKey))}</span></div>
        </article>
      </div>
    </section>`;

  const chartCard = `
    <section class="card span-7 chart-card">
      <div class="card-head">
        <div>
          <span class="card-kicker">Arus kas</span>
          <h2 class="card-title">Enam bulan terakhir</h2>
        </div>
        <div class="legend">
          <span class="legend__item"><i class="legend__swatch legend__swatch--income"></i>Masuk</span>
          <span class="legend__item"><i class="legend__swatch legend__swatch--expense"></i>Keluar</span>
        </div>
      </div>
      ${hasChartData ? barChartSVG(series) : emptyChart('Mulai catat transaksi untuk melihat grafik arus kas.')}
    </section>`;

  const budgetMini = budget.items.length ? `
      <div class="budget-mini__amount">
        <strong class="amount">${formatIDR(budgetHeadline)}</strong>
        <span>${budgetPct}% terpakai</span>
      </div>
      <div class="progress progress--lg" role="img" aria-label="${budgetPct}% anggaran terpakai">
        <span style="width:${ratioWidth(budget.ratio)};background:${budgetTone(budget.ratio)}"></span>
      </div>
      <p class="card-sub">${overBudget ? 'Lewat dari total anggaran' : 'Sisa dari total anggaran'} \u00b7 <span class="amount">${formatIDR(budget.spent)}</span> dari <span class="amount">${formatIDR(budget.total)}</span></p>
      <div class="mini-bars">
        ${budget.items.slice(0, 3).map((item) => `
          <div class="mini-bar">
            <div class="mini-bar__top">
              <span class="mini-bar__name"><i style="background:${item.category.color}"></i>${esc(item.category.name)}</span>
              <span class="mini-bar__num">${Math.round(item.ratio * 100)}%</span>
            </div>
            <div class="progress progress--thin"><span style="width:${ratioWidth(item.ratio)};background:${budgetTone(item.ratio)}"></span></div>
          </div>`).join('')}
      </div>
      <div class="card-head" style="margin:14px 0 0">
        <a class="link-more" href="#/anggaran">Kelola anggaran ${icon('arrow-right')}</a>
      </div>`
    : emptyBlock('🎯', 'Belum ada anggaran', 'Tentukan batas pengeluaran bulanan agar lebih terkendali.',
      '<a class="btn btn--primary btn--sm" href="#/anggaran">Atur anggaran</a>');

  const budgetCard = `
    <section class="card span-5">
      <div class="card-head">
        <div>
          <span class="card-kicker">Anggaran</span>
          <h2 class="card-title">${overBudget ? 'Lewat anggaran' : 'Sisa bulan ini'}</h2>
        </div>
        <span class="badge ${overBudget ? 'badge--red' : budgetPct >= 80 ? 'badge--yellow' : 'badge--green'}">${budget.items.length ? `${budgetPct}%` : 'Kosong'}</span>
      </div>
      ${budgetMini}
    </section>`;

  const donutCard = `
    <section class="card span-5">
      <div class="card-head">
        <div>
          <span class="card-kicker">Komposisi</span>
          <h2 class="card-title">Ke mana uang pergi</h2>
        </div>
      </div>
      ${expenseTotal > 0 ? `
        <div class="donut-layout">
          ${donutSVG(slices)}
          <div class="donut-legend">${donutLegend}</div>
        </div>` : emptyBlock('🧾', 'Belum ada pengeluaran', 'Pengeluaran bulan ini akan tampil di sini.')}
    </section>`;

  const recentCard = `
    <section class="card card--list span-7">
      <div class="card-head" style="padding:18px 18px 0; margin-bottom:10px">
        <div>
          <span class="card-kicker">Terbaru</span>
          <h2 class="card-title">Transaksi ${esc(monthShort(month))}</h2>
        </div>
        <a class="link-more" href="#/transaksi">Lihat semua ${icon('arrow-right')}</a>
      </div>
      ${recent.length
        ? `<ul class="txn-list">${recent.map((txn) => txnRowHTML(txn, maps, { showDate: true })).join('')}</ul>`
        : `<div style="padding:0 18px 18px">${emptyBlock('🧾', `Belum ada transaksi di ${monthLabel(month)}`, 'Catat pengeluaran atau pemasukan pertamamu bulan ini.',
          '<button type="button" class="btn btn--primary btn--sm" data-action="new-txn">' + icon('plus', 'icon--sm') + ' Catat transaksi</button>')}</div>`}
    </section>`;

  return `<div class="stack" style="gap:20px">
    ${overview}
    <div class="dash-grid" style="margin-top:0">
      ${chartCard}
      ${budgetCard}
      ${recentCard}
      ${donutCard}
    </div>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Halaman: Transaksi                                                         */
/* -------------------------------------------------------------------------- */

function yesterdayISO() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return todayISO(date);
}

function filteredTransactions() {
  const query = ui.txnQuery.trim().toLowerCase();
  const maps = lookup();
  return store.getState().transactions
    .filter((txn) => monthKeyOf(txn.date) === ui.month)
    .filter((txn) => ui.txnFilter === 'all' || txn.type === ui.txnFilter)
    .filter((txn) => {
      if (!query) return true;
      const cat = maps.cats.get(txn.categoryId);
      const acc = maps.accs.get(txn.accountId);
      const to = maps.accs.get(txn.toAccountId);
      return [txn.note, cat?.name, acc?.name, to?.name, txn.date, txn.amount]
        .some((value) => String(value ?? '').toLowerCase().includes(query));
    })
    .sort((a, b) => (
      a.date === b.date
        ? String(b.createdAt).localeCompare(String(a.createdAt))
        : b.date.localeCompare(a.date)
    ));
}

function txnResultsHTML() {
  const list = filteredTransactions();
  const maps = lookup();
  const hasFilters = ui.txnFilter !== 'all' || ui.txnQuery.trim() !== '';

  if (!list.length) {
    const anyInMonth = store.getState().transactions.some((txn) => monthKeyOf(txn.date) === ui.month);
    if (hasFilters) {
      return emptyBlock('🔎', 'Tidak ada yang cocok', 'Coba kata kunci lain atau ubah filter jenis transaksi.',
        '<button type="button" class="btn btn--sm" data-action="clear-filters">Hapus filter</button>');
    }
    if (!anyInMonth) {
      return emptyBlock('🧾', `Belum ada transaksi di ${monthLabel(ui.month)}`, 'Mulai dari pengeluaran kecil hari ini. Setiap catatan membantu.',
        '<button type="button" class="btn btn--primary btn--sm" data-action="new-txn">' + icon('plus', 'icon--sm') + ' Catat transaksi</button>');
    }
    return emptyBlock('🧾', 'Tidak ada transaksi', 'Coba pilih bulan lain.');
  }

  const income = list.filter((txn) => txn.type === 'income').reduce((sum, txn) => sum + txn.amount, 0);
  const expense = list.filter((txn) => txn.type === 'expense').reduce((sum, txn) => sum + txn.amount, 0);
  const groups = new Map();
  for (const txn of list) {
    if (!groups.has(txn.date)) groups.set(txn.date, []);
    groups.get(txn.date).push(txn);
  }

  const groupsHTML = Array.from(groups.entries()).map(([date, txns]) => {
    const net = txns.reduce((sum, txn) => {
      if (txn.type === 'income') return sum + txn.amount;
      if (txn.type === 'expense') return sum - txn.amount;
      return sum;
    }, 0);
    const isToday = date === todayISO();
    const isYesterday = date === yesterdayISO();
    const main = isToday ? 'Hari ini' : isYesterday ? 'Kemarin' : formatDate(date);
    const sub = isToday || isYesterday ? formatDate(date) : '';
    const netText = net === 0 ? '' : `${net > 0 ? '+' : '\u2212'}${formatIDR(Math.abs(net))}`;
    return `
      <div class="day-group">
        <div class="day-head">
          <span>${esc(main)}</span>
          ${sub ? `<span class="day-head__date">${esc(sub)}</span>` : ''}
          ${netText ? `<span class="day-head__net amount ${net > 0 ? 'text-green' : 'text-red'}">${esc(netText)}</span>` : ''}
        </div>
        <ul class="txn-list">${txns.map((txn) => txnRowHTML(txn, maps)).join('')}</ul>
      </div>`;
  }).join('');

  return `
    <div class="list-meta">
      <span>${list.length} transaksi${hasFilters ? ' \u00b7 terfilter' : ''}</span>
      <span>Masuk <span class="amount">${formatIDR(income)}</span> \u00b7 Keluar <span class="amount">${formatIDR(expense)}</span></span>
    </div>
    <section class="card card--list" aria-label="Daftar transaksi">${groupsHTML}</section>`;
}

function viewTransaksi() {
  return `
    <div class="stack" style="gap:16px">
      <section class="card toolbar-card" aria-label="Cari dan filter transaksi">
        <label class="search" for="txn-search">
          ${icon('search')}
          <input id="txn-search" type="search" autocomplete="off" placeholder="Cari catatan, kategori, dompet..." value="${esc(ui.txnQuery)}" aria-label="Cari transaksi">
        </label>
        <div class="filter-chips" role="group" aria-label="Filter jenis transaksi">
          ${FILTERS.map(([value, label]) => `
            <button type="button" class="chip ${ui.txnFilter === value ? 'is-active' : ''}" data-action="filter-txn" data-value="${value}" aria-pressed="${ui.txnFilter === value}">${label}</button>`).join('')}
        </div>
        <button type="button" class="btn btn--primary toolbar-add" data-action="new-txn">${icon('plus', 'icon--sm')} Catat</button>
      </section>
      <div id="txn-results">${txnResultsHTML()}</div>
    </div>`;
}

function renderTxnResults() {
  const container = $('#txn-results');
  if (container) container.innerHTML = txnResultsHTML();
}

function syncTxnFilter() {
  $$('[data-action="filter-txn"]').forEach((button) => {
    const active = button.dataset.value === ui.txnFilter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderTxnResults();
}

/* -------------------------------------------------------------------------- */
/* Halaman: Anggaran                                                          */
/* -------------------------------------------------------------------------- */

function viewAnggaran() {
  const month = ui.month;
  const summary = store.budgetSummary(month);
  const spentMap = new Map(store.categoryTotals(month, 'expense').map((row) => [row.category.id, row.total]));
  const budgets = store.getBudgets();
  const unbudgeted = store.getCategories('expense').filter((category) => !budgets[category.id]);
  const pct = Math.round(summary.ratio * 100);
  const over = summary.remaining < 0;

  const hero = summary.items.length
    ? `<section class="card card--accent budget-hero">
        <div class="budget-hero__main">
          <div class="budget-hero__label">${icon('target', 'icon--sm')} Anggaran ${esc(monthLabel(month))}</div>
          <div class="budget-hero__amount amount">${formatIDR(Math.abs(summary.remaining))}</div>
          <p class="budget-hero__sub">${over ? 'Kelebihan dari total anggaran' : 'Sisa dari total anggaran bulan ini'}</p>
        </div>
        <div class="budget-hero__side">
          <div class="budget-hero__pct">${pct}<span style="font-size:.48em">%</span></div>
          <div class="budget-hero__pct-label">terpakai</div>
        </div>
        <div class="progress" role="img" aria-label="${pct}% anggaran terpakai">
          <span style="width:${ratioWidth(summary.ratio)};background:${budgetTone(summary.ratio)}"></span>
        </div>
        <div class="budget-hero__foot">
          <span><span class="amount">${formatIDR(summary.spent)}</span> terpakai</span>
          <span>Total anggaran <span class="amount">${formatIDR(summary.total)}</span></span>
        </div>
      </section>`
    : emptyBlock('🎯', 'Belum ada anggaran', 'Tentukan batas pengeluaran tiap kategori. Anggaran berlaku otomatis setiap bulan.',
      `<button type="button" class="btn btn--primary btn--sm" data-action="set-budget-first">${icon('plus', 'icon--sm')} Atur anggaran pertama</button>`);

  const cards = summary.items.map((item) => {
    const itemPct = Math.round(item.ratio * 100);
    const itemOver = item.spent > item.budget;
    const almost = !itemOver && item.ratio >= 0.8;
    return `
      <article class="card budget-card">
        <div class="budget-card__head">
          <span class="cat-mark" style="--c:${item.category.color}" aria-hidden="true">${esc(item.category.icon)}</span>
          <div>
            <h3>${esc(item.category.name)}</h3>
            <p>${itemOver ? `Lewat <span class="amount">${formatIDR(item.spent - item.budget)}</span>` : `Sisa <span class="amount">${formatIDR(item.budget - item.spent)}</span>`}</p>
          </div>
          <button type="button" class="icon-btn icon-btn--sm" data-action="set-budget" data-id="${esc(item.category.id)}" aria-label="Ubah anggaran ${esc(item.category.name)}" title="Ubah anggaran">
            ${icon('edit')}
          </button>
        </div>
        <div class="budget-card__nums">
          <strong class="amount">${formatIDR(item.spent)}</strong>
          <span>dari <span class="amount">${formatIDR(item.budget)}</span></span>
        </div>
        <div class="progress" role="img" aria-label="${itemPct}% dari anggaran ${esc(item.category.name)} terpakai">
          <span style="width:${ratioWidth(item.ratio)};background:${budgetTone(item.ratio)}"></span>
        </div>
        <div class="budget-card__foot">
          <span>${itemPct}% terpakai</span>
          <span class="badge ${itemOver ? 'badge--red' : almost ? 'badge--yellow' : 'badge--green'}">${itemOver ? 'Lewat' : almost ? 'Hampir' : 'Aman'}</span>
        </div>
      </article>`;
  }).join('');

  const unbudgetedCard = unbudgeted.length
    ? `<section class="card span-12">
        <div class="card-head">
          <div>
            <span class="card-kicker">Tanpa batas</span>
            <h2 class="card-title">Kategori belum dianggarkan</h2>
          </div>
          <span class="badge badge--muted">${unbudgeted.length} kategori</span>
        </div>
        ${unbudgeted.map((category) => {
          const spent = spentMap.get(category.id) || 0;
          return `<div class="unbudgeted-row">
            <span class="cat-mark" style="--c:${category.color}" aria-hidden="true">${esc(category.icon)}</span>
            <span class="unbudgeted-row__name">${esc(category.name)}</span>
            <span class="unbudgeted-row__spent">${spent > 0 ? `<span class="amount">${formatIDR(spent)}</span> keluar` : 'belum ada pengeluaran'}</span>
            <button type="button" class="btn btn--sm" data-action="set-budget" data-id="${esc(category.id)}">Atur</button>
          </div>`;
        }).join('')}
      </section>`
    : '';

  return `<div class="stack" style="gap:20px">
    ${hero}
    ${summary.items.length ? `<div class="budget-grid">${cards}</div>` : ''}
    ${unbudgetedCard}
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Halaman: Laporan                                                           */
/* -------------------------------------------------------------------------- */

function viewLaporan() {
  const month = ui.month;
  const totals = store.monthTotals(month);
  const previousKey = addMonths(month, -1);
  const previous = store.monthTotals(previousKey);
  const categories = store.categoryTotals(month, 'expense');
  const expenseTotal = categories.reduce((sum, row) => sum + row.total, 0);
  const series = store.monthSeries(month, 6);
  const maps = lookup();
  const elapsed = daysElapsed();
  const average = totals.expense / Math.max(1, elapsed);
  const budget = store.budgetSummary(month);
  const overCount = budget.items.filter((item) => item.ratio >= 1).length;
  const savingRate = totals.income > 0 ? totals.net / totals.income : null;
  const topExpenses = store.getState().transactions
    .filter((txn) => monthKeyOf(txn.date) === month && txn.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const hasChartData = series.some((point) => point.income > 0 || point.expense > 0);

  const insights = [];
  if (categories[0] && expenseTotal > 0) {
    const pct = Math.round((categories[0].total / expenseTotal) * 100);
    insights.push(`Pengeluaran terbesar ada di <strong>${esc(categories[0].category.name)}</strong> (${pct}% dari total).`);
  }
  if (overCount > 0) {
    insights.push(`<strong>${overCount} kategori</strong> melewati anggaran bulan ini. Tinjau lagi di halaman Anggaran.`);
  }
  if (savingRate !== null) {
    const pct = Math.round(savingRate * 100);
    if (pct >= 20) insights.push(`Kamu menyisihkan <strong>${pct}%</strong> dari pemasukan bulan ini. Pertahankan!`);
    else if (pct < 0) insights.push(`Pengeluaran lebih besar <strong>${Math.abs(pct)}%</strong> dari pemasukan bulan ini.`);
  }
  if (totals.count > 0) {
    insights.push(`Tercatat <strong>${totals.count} transaksi</strong>, rata-rata keluar <strong class="amount">${formatIDR(average)}</strong> per hari.`);
  }

  const statGrid = `
    <div class="stat-grid">
      <article class="card stat-mini">
        <div class="stat-mini__top"><span class="stat-mini__label">Pemasukan</span><span class="stat-mini__icon">${icon('up')}</span></div>
        <div class="stat-mini__value amount text-green">${formatIDR(totals.income)}</div>
        <div class="stat-mini__sub">${deltaHTML(totals.income, previous.income, true)} vs ${esc(monthShort(previousKey))}</div>
      </article>
      <article class="card stat-mini">
        <div class="stat-mini__top"><span class="stat-mini__label">Pengeluaran</span><span class="stat-mini__icon">${icon('down')}</span></div>
        <div class="stat-mini__value amount text-red">${formatIDR(totals.expense)}</div>
        <div class="stat-mini__sub">${deltaHTML(totals.expense, previous.expense, false)} vs ${esc(monthShort(previousKey))}</div>
      </article>
      <article class="card stat-mini">
        <div class="stat-mini__top"><span class="stat-mini__label">Arus kas</span><span class="stat-mini__icon">${icon('transfer')}</span></div>
        <div class="stat-mini__value amount ${totals.net < 0 ? 'text-red' : ''}">${formatIDR(totals.net)}</div>
        <div class="stat-mini__sub">${totals.net >= 0 ? 'Surplus' : 'Defisit'} bulan ini</div>
      </article>
      <article class="card stat-mini">
        <div class="stat-mini__top"><span class="stat-mini__label">Rata-rata/hari</span><span class="stat-mini__icon">${icon('chart')}</span></div>
        <div class="stat-mini__value amount">${formatIDR(average)}</div>
        <div class="stat-mini__sub">dari ${elapsed} hari berjalan</div>
      </article>
    </div>`;

  const insightCard = `
    <section class="card card--accent insight">
      <span class="insight__icon">${icon('sparkles')}</span>
      <div>
        <h3>Catatan bulan ini</h3>
        ${insights.length
          ? `<ul>${insights.slice(0, 3).map((item) => `<li>${item}</li>`).join('')}</ul>`
          : '<p>Belum ada cukup data. Catat transaksi agar laporan ini bisa memberi gambaran.</p>'}
      </div>
    </section>`;

  const chartCard = `
    <section class="card span-7 chart-card">
      <div class="card-head">
        <div>
          <span class="card-kicker">Tren</span>
          <h2 class="card-title">Pemasukan vs pengeluaran</h2>
        </div>
        <button type="button" class="btn btn--sm" data-action="export-month-csv">${icon('download', 'icon--sm')} CSV</button>
      </div>
      ${hasChartData ? barChartSVG(series) : emptyChart('Grafik muncul setelah ada transaksi.')}
      <div class="legend">
        <span class="legend__item"><i class="legend__swatch legend__swatch--income"></i>Pemasukan</span>
        <span class="legend__item"><i class="legend__swatch legend__swatch--expense"></i>Pengeluaran</span>
      </div>
    </section>`;

  const breakdown = categories.length
    ? `<div class="cat-breakdown">${categories.map((row) => {
      const pct = expenseTotal ? (row.total / expenseTotal) * 100 : 0;
      return `<div class="cat-row">
          <div class="cat-row__top">
            <i class="cat-row__dot" style="background:${row.category.color}" aria-hidden="true"></i>
            <span class="cat-row__name">${esc(row.category.name)}</span>
            <span class="cat-row__amount amount">${formatIDR(row.total)}</span>
            <span class="cat-row__pct">${Math.round(pct)}%</span>
          </div>
          <div class="progress progress--thin"><span style="width:${Math.max(2, Math.min(100, pct))}%;background:${row.category.color}"></span></div>
        </div>`;
    }).join('')}</div>`
    : emptyBlock('🧾', 'Belum ada pengeluaran', 'Rincian kategori akan muncul di sini.');

  const topCard = topExpenses.length
    ? `<div class="top-txn">${topExpenses.map((txn, index) => {
      const cat = maps.cats.get(txn.categoryId);
      return `<div class="top-txn__row" data-action="edit-txn" data-id="${esc(txn.id)}" role="button" tabindex="0">
          <span class="top-txn__rank">${String(index + 1).padStart(2, '0')}</span>
          <span class="txn__icon" style="--c:${cat?.color || 'var(--surface-2)'}; width:34px; height:34px; font-size:15px" aria-hidden="true">${esc(cat?.icon || '\u2022')}</span>
          <div class="top-txn__body">
            <div class="top-txn__title">${esc(txn.note || cat?.name || 'Pengeluaran')}</div>
            <div class="top-txn__meta">${esc(cat?.name || 'Tanpa kategori')} \u00b7 ${esc(formatDate(txn.date))}</div>
          </div>
          <span class="top-txn__amount amount">${formatIDR(txn.amount)}</span>
        </div>`;
    }).join('')}</div>`
    : emptyBlock('🏆', 'Belum ada pengeluaran', 'Transaksi terbesar bulan ini akan tampil di sini.');

  return `<div class="stack" style="gap:20px">
    ${statGrid}
    ${insightCard}
    <div class="dash-grid" style="margin-top:0">
      ${chartCard}
      <section class="card span-5">
        <div class="card-head">
          <div>
            <span class="card-kicker">Rincian</span>
            <h2 class="card-title">Per kategori</h2>
          </div>
          <span class="badge badge--muted">${categories.length} kategori</span>
        </div>
        ${breakdown}
      </section>
      <section class="card span-12">
        <div class="card-head">
          <div>
            <span class="card-kicker">Paling besar</span>
            <h2 class="card-title">Pengeluaran teratas</h2>
          </div>
          <a class="link-more" href="#/transaksi">Lihat transaksi ${icon('arrow-right')}</a>
        </div>
        ${topCard}
      </section>
    </div>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Halaman: Dompet                                                            */
/* -------------------------------------------------------------------------- */

function accountTypeMeta(type) {
  return store.ACCOUNT_TYPES[type] || store.ACCOUNT_TYPES.other;
}

function viewDompet() {
  const accounts = store.accountsWithBalance();
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  const cards = accounts.map((account) => {
    const meta = accountTypeMeta(account.type);
    const share = total > 0 ? Math.max(0, (account.balance / total) * 100) : 0;
    return `
      <article class="card account-card" style="--accent:${account.color}">
        <div class="account-card__head">
          <span class="account-card__mark" aria-hidden="true">${meta.icon}</span>
          <div class="account-card__title">
            <h3>${esc(account.name)}</h3>
            <span class="badge badge--muted">${esc(meta.label)}</span>
          </div>
          <div class="account-card__actions">
            <button type="button" class="icon-btn icon-btn--sm" data-action="edit-account" data-id="${esc(account.id)}" aria-label="Ubah dompet ${esc(account.name)}" title="Ubah dompet">${icon('edit')}</button>
            <button type="button" class="icon-btn icon-btn--sm" data-action="delete-account" data-id="${esc(account.id)}" aria-label="Hapus dompet ${esc(account.name)}" title="Hapus dompet">${icon('trash')}</button>
          </div>
        </div>
        <p class="account-card__balance amount ${account.balance < 0 ? 'is-negative' : ''}">${formatIDR(account.balance)}</p>
        <div class="progress progress--thin" role="img" aria-label="${Math.round(share)}% dari total saldo">
          <span style="width:${Math.max(2, Math.min(100, share))}%;background:${account.color}"></span>
        </div>
        <div class="account-card__foot">
          <span>${Math.round(share)}% dari total</span>
          <span>${account.usage} transaksi</span>
        </div>
      </article>`;
  }).join('');

  return `<div class="stack" style="gap:20px">
    <section class="card card--accent accounts-total">
      <div>
        <span class="card-kicker">Total saldo</span>
        <div class="accounts-total__amount amount">${formatIDR(total)}</div>
        <p class="small" style="color:#5c5344; margin-top:3px">Gabungan dari ${accounts.length} dompet. ${accounts.some((a) => a.balance < 0) ? 'Ada saldo minus yang perlu dicek.' : ''}</p>
      </div>
      <button type="button" class="btn" data-action="add-account">${icon('plus', 'icon--sm')} Tambah dompet</button>
    </section>

    <div class="section-head">
      <h2>Daftar dompet</h2>
      <p>Saldo awal + transaksi</p>
    </div>

    <div class="account-grid">
      ${cards}
      <button type="button" class="account-add" data-action="add-account">
        ${icon('plus')}
        <span>Tambah dompet</span>
        <small>Tunai, bank, atau e-wallet</small>
      </button>
    </div>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Halaman: Pengaturan                                                        */
/* -------------------------------------------------------------------------- */

function categoryItemHTML(category) {
  const usage = store.categoryUsage(category.id);
  return `
    <div class="cat-item">
      <span class="cat-item__emoji" style="--c:${category.color}" aria-hidden="true">${esc(category.icon)}</span>
      <span class="cat-item__name">${esc(category.name)}</span>
      <span class="cat-item__count" title="${usage} transaksi">${usage}x</span>
      <button type="button" class="btn btn--ghost cat-item__btn" data-action="edit-category" data-id="${esc(category.id)}" aria-label="Ubah kategori ${esc(category.name)}" title="Ubah kategori">${icon('edit')}</button>
      <button type="button" class="btn btn--ghost cat-item__btn" data-action="delete-category" data-id="${esc(category.id)}" aria-label="Hapus kategori ${esc(category.name)}" title="Hapus kategori">${icon('trash')}</button>
    </div>`;
}

function viewPengaturan() {
  const state = store.getState();
  const theme = state.settings.theme;
  const privacy = Boolean(state.settings.privacy);
  const expenseCats = state.categories.filter((category) => category.kind === 'expense');
  const incomeCats = state.categories.filter((category) => category.kind === 'income');

  const themeSeg = `
    <div class="seg" role="group" aria-label="Tema tampilan">
      ${[['light', 'Terang'], ['dark', 'Gelap'], ['auto', 'Auto']].map(([value, label]) => `
        <button type="button" class="seg__btn ${theme === value ? 'is-active' : ''}" data-action="set-theme" data-value="${value}" aria-pressed="${theme === value}">${label}</button>`).join('')}
    </div>`;

  const categoryColumns = `
    <div class="cat-columns">
      <div class="cat-column">
        <h3>Pengeluaran <button type="button" class="btn btn--sm" data-action="add-category" data-kind="expense" aria-label="Tambah kategori pengeluaran">${icon('plus', 'icon--sm')} Tambah</button></h3>
        <div class="cat-column__list">${expenseCats.map(categoryItemHTML).join('') || '<p class="small muted">Belum ada kategori.</p>'}</div>
      </div>
      <div class="cat-column">
        <h3>Pemasukan <button type="button" class="btn btn--sm" data-action="add-category" data-kind="income" aria-label="Tambah kategori pemasukan">${icon('plus', 'icon--sm')} Tambah</button></h3>
        <div class="cat-column__list">${incomeCats.map(categoryItemHTML).join('') || '<p class="small muted">Belum ada kategori.</p>'}</div>
      </div>
    </div>`;

  return `<div class="settings-grid">
    <section class="card">
      <div class="card-head">
        <div><span class="card-kicker">Preferensi</span><h2 class="card-title">Tampilan</h2></div>
      </div>
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>Tema</strong>
          <span>Terang, gelap, atau ikuti pengaturan sistem.</span>
        </div>
        <div class="setting-row__control">${themeSeg}</div>
      </div>
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>Mode privat</strong>
          <span>Samarkan semua nominal agar aman dilihat orang lain.</span>
        </div>
        <button type="button" class="switch ${privacy ? 'is-on' : ''}" role="switch" aria-checked="${privacy}" aria-label="Mode privat" data-action="toggle-privacy">
          <span class="switch__dot"></span>
        </button>
      </div>
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>Pemasangan</strong>
          <span>Pasang UANG ke layar utama agar seperti aplikasi.</span>
        </div>
        <button type="button" class="btn btn--sm" data-action="install">${icon('install', 'icon--sm')} Pasang</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div><span class="card-kicker">Tentang</span><h2 class="card-title">UANG v1.0</h2></div>
        <span class="badge badge--green">Offline</span>
      </div>
      <ul class="about-list">
        <li>${icon('shield')}<span>Semua data tersimpan di perangkat ini. Tidak ada akun, server, atau pelacakan.</span></li>
        <li>${icon('check')}<span>Bisa dipakai tanpa internet setelah dibuka sekali.</span></li>
        <li>${icon('download')}<span>Lakukan ekspor cadangan JSON secara berkala.</span></li>
      </ul>
      <div class="hint-box" style="margin-top:14px">
        <strong>Pintasan:</strong><br>
        <span class="kbd">N</span> catat transaksi &nbsp; <span class="kbd">/</span> cari transaksi &nbsp; <span class="kbd">Esc</span> tutup dialog
      </div>
    </section>

    <section class="card span-2">
      <div class="card-head">
        <div><span class="card-kicker">${state.categories.length} kategori</span><h2 class="card-title">Kategori</h2></div>
        <span class="badge badge--muted">${state.categories.length} total</span>
      </div>
      ${categoryColumns}
    </section>

    <section class="card span-2">
      <div class="card-head">
        <div><span class="card-kicker">Penyimpanan lokal</span><h2 class="card-title">Data &amp; cadangan</h2></div>
        <span class="badge ${store.storageAvailable ? 'badge--green' : 'badge--red'}">${store.storageAvailable ? 'Aktif' : 'Terbatas'}</span>
      </div>
      <p class="hint-box">
        ${store.storageAvailable
          ? `<strong>${state.transactions.length} transaksi</strong>, ${state.accounts.length} dompet, dan ${state.categories.length} kategori tersimpan di browser perangkat ini. Jangan hapus data situs, dan unduh cadangan secara berkala.`
          : '<strong>Penyimpanan browser tidak tersedia.</strong> Data hanya bertahan selama halaman terbuka. Jangan tutup aplikasi sebelum mengekspor cadangan.'}
      </p>
      <div class="data-actions" style="margin-top:14px">
        <button type="button" class="btn" data-action="export-json">${icon('download', 'icon--sm')} Unduh cadangan JSON</button>
        <button type="button" class="btn" data-action="import-json">${icon('upload', 'icon--sm')} Pulihkan cadangan</button>
        <button type="button" class="btn" data-action="export-csv">${icon('download', 'icon--sm')} Ekspor CSV</button>
      </div>
      <div class="danger-zone">
        <button type="button" class="btn" data-action="load-demo">${icon('sparkles', 'icon--sm')} Muat data contoh</button>
        <button type="button" class="btn btn--danger" data-action="reset-data">${icon('trash', 'icon--sm')} Hapus semua data</button>
      </div>
    </section>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Halaman: Lainnya                                                           */
/* -------------------------------------------------------------------------- */

function viewLainnya() {
  const accounts = store.accountsWithBalance();
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const budget = store.budgetSummary(currentMonthKey());
  const remaining = budget.total > 0 ? budget.remaining : 0;

  return `<div class="stack" style="gap:20px">
    <section class="card card--accent accounts-total">
      <div>
        <span class="card-kicker">Total saldo</span>
        <div class="accounts-total__amount amount">${formatIDR(total)}</div>
        <p class="small" style="color:#5c5344; margin-top:3px">${accounts.length} dompet aktif \u00b7 data lokal</p>
      </div>
      <a class="btn" href="#/dompet">${icon('wallet', 'icon--sm')} Kelola dompet</a>
    </section>

    <div class="menu-grid">
      <a class="card card--link menu-link" href="#/dompet">
        <span class="menu-link__icon menu-link__icon--green">${icon('wallet')}</span>
        <span class="menu-link__body"><strong>Dompet</strong><span>${accounts.length} dompet \u00b7 <span class="amount">${formatIDR(total)}</span></span></span>
        ${icon('arrow-right', 'icon--arrow')}
      </a>
      <a class="card card--link menu-link" href="#/anggaran">
        <span class="menu-link__icon">${icon('target')}</span>
        <span class="menu-link__body"><strong>Anggaran</strong><span>${budget.total > 0 ? `Sisa <span class="amount">${formatIDR(Math.max(0, remaining))}</span> bulan ini` : 'Belum diatur'}</span></span>
        ${icon('arrow-right', 'icon--arrow')}
      </a>
      <a class="card card--link menu-link" href="#/pengaturan">
        <span class="menu-link__icon menu-link__icon--blue">${icon('settings')}</span>
        <span class="menu-link__body"><strong>Pengaturan</strong><span>Tema, kategori, dan cadangan</span></span>
        ${icon('arrow-right', 'icon--arrow')}
      </a>
      <button type="button" class="card card--link menu-link menu-link--btn" data-action="export-json">
        <span class="menu-link__icon menu-link__icon--green">${icon('download')}</span>
        <span class="menu-link__body"><strong>Cadangkan data</strong><span>Unduh semua data sebagai JSON</span></span>
        ${icon('arrow-right', 'icon--arrow')}
      </button>
    </div>

    <section class="card">
      <div class="card-head">
        <div><span class="card-kicker">Tentang</span><h2 class="card-title">Dibuat untuk dipakai</h2></div>
        <span class="badge badge--green">v1.0</span>
      </div>
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>Pasang di layar utama</strong>
          <span>Buka seperti aplikasi biasa, tetap bisa offline.</span>
        </div>
        <button type="button" class="btn btn--sm" data-action="install">${icon('install', 'icon--sm')} Pasang</button>
      </div>
      <div class="setting-row">
        <div class="setting-row__text">
          <strong>Privasi</strong>
          <span>Tanpa akun, iklan, atau pengiriman data keluar perangkat.</span>
        </div>
        <span class="badge badge--muted">Lokal</span>
      </div>
      <p class="small muted" style="margin-top:12px">UANG menggunakan penyimpanan browser. Ekspor cadangan sebelum mengganti perangkat atau membersihkan data situs.</p>
    </section>
  </div>`;
}

/* -------------------------------------------------------------------------- */
/* Selamat datang                                                             */
/* -------------------------------------------------------------------------- */

function showWelcome() {
  openModal({
    title: 'Selamat datang',
    kicker: 'Mulai dalam 10 detik',
    size: 'md',
    body: `
      <div class="welcome">
        <div class="welcome__sticker-row"><span class="sticker">UANG v1.0 \u00b7 offline</span></div>
        <h2>Uangmu, <span>rapi.</span></h2>
        <p>Catat pemasukan dan pengeluaran, atur anggaran, lalu lihat ke mana uangmu pergi. Semua tanpa akun dan tanpa internet.</p>
        <ul class="welcome__list">
          <li>${icon('check')}<span>Catat transaksi dalam hitungan detik.</span></li>
          <li>${icon('check')}<span>Anggaran per kategori dengan peringatan dini.</span></li>
          <li>${icon('check')}<span>Laporan dan grafik yang mudah dibaca.</span></li>
        </ul>
        <div class="welcome__actions">
          <button type="button" class="btn btn--primary" id="welcome-demo">${icon('sparkles', 'icon--sm')} Coba dengan data contoh</button>
          <button type="button" class="btn" id="welcome-empty">Mulai dari nol</button>
        </div>
        <p class="welcome__note">Data tersimpan di perangkat ini \u00b7 bisa diekspor kapan saja</p>
      </div>`,
    onMount(el, close) {
      $('#welcome-demo', el).addEventListener('click', () => {
        store.seed('demo');
        close();
        render();
        toast('Data contoh siap. Semua bisa diubah atau dihapus di Pengaturan.');
      });
      $('#welcome-empty', el).addEventListener('click', () => {
        store.seed('starter');
        close();
        render();
        toast('Siap. Catat pengeluaran pertamamu lewat tombol Catat.');
      });
    },
    onClose() {
      if (!store.getSettings().onboarded) store.updateSettings({ onboarded: true });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Form: transaksi                                                            */
/* -------------------------------------------------------------------------- */

function firstCategoryId(kind) {
  return store.getCategories(kind)[0]?.id || null;
}

function categoryButtonsHTML(kind, selectedId) {
  const categories = store.getCategories(kind);
  if (!categories.length) {
    return `<p class="hint-box">Belum ada kategori ${kind === 'income' ? 'pemasukan' : 'pengeluaran'}. Tambahkan lewat halaman Pengaturan.</p>`;
  }
  return categories.map((category) => `
    <button type="button" class="cat-btn ${category.id === selectedId ? 'is-active' : ''}" data-cat="${esc(category.id)}" aria-pressed="${category.id === selectedId}">
      <span aria-hidden="true">${esc(category.icon)}</span>
      <small>${esc(category.name)}</small>
    </button>`).join('');
}

function accountOptionsHTML(selectedId, excludeId = null) {
  return store.getState().accounts
    .filter((account) => account.id !== excludeId)
    .map((account) => `<option value="${esc(account.id)}" ${account.id === selectedId ? 'selected' : ''}>${esc(account.name)}</option>`)
    .join('');
}

function openTxnModal(id = null, options = {}) {
  const state = store.getState();
  if (!state.accounts.length) {
    toast('Tambahkan dompet dulu sebelum mencatat.', 'warn');
    openAccountModal();
    return;
  }

  const editing = id ? state.transactions.find((txn) => txn.id === id) : null;
  const quickCategory = options.categoryId ? state.categories.find((cat) => cat.id === options.categoryId) : null;
  const lastUsed = quickCategory
    ? [...state.transactions].filter((txn) => txn.categoryId === quickCategory.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;
  const defaultAccount = editing?.accountId || lastUsed?.accountId || state.accounts[0].id;
  const draft = {
    type: editing?.type || quickCategory?.kind || 'expense',
    date: editing?.date || defaultTxnDate(),
    accountId: defaultAccount,
    toAccountId: editing?.toAccountId || state.accounts.find((account) => account.id !== defaultAccount)?.id || '',
    categoryId: editing?.categoryId || quickCategory?.id || null,
    note: editing?.note || '',
    amount: editing?.amount || 0,
  };
  if (draft.type !== 'transfer' && !draft.categoryId) draft.categoryId = firstCategoryId(draft.type);
  if (draft.type === 'transfer' && !draft.toAccountId) {
    draft.toAccountId = state.accounts.find((account) => account.id !== draft.accountId)?.id || '';
  }

  const typeButtons = [
    ['expense', 'Pengeluaran', 'var(--red)'],
    ['income', 'Pemasukan', 'var(--green)'],
    ['transfer', 'Transfer', 'var(--blue)'],
  ].map(([value, label, color]) => `
    <button type="button" class="type-seg__btn ${draft.type === value ? 'is-active' : ''}" data-type="${value}" aria-pressed="${draft.type === value}">
      <i class="type-seg__dot" style="color:${color}" aria-hidden="true"></i>${label}
    </button>`).join('');

  const body = `
    <form id="txn-form" class="form" novalidate>
      <div class="field">
        <span class="field__label">Jenis transaksi</span>
        <div class="type-seg" id="type-seg" role="group" aria-label="Jenis transaksi">${typeButtons}</div>
      </div>

      <div class="field">
        <label for="f-amount">Jumlah</label>
        <div class="amount-input">
          <span>Rp</span>
          <input id="f-amount" name="amount" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${draft.amount ? formatNumber(draft.amount) : ''}">
        </div>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="f-account" id="from-label">${draft.type === 'transfer' ? 'Dari dompet' : 'Dompet'}</label>
          <div class="select-wrap">
            <select id="f-account" name="account" class="select">${accountOptionsHTML(draft.accountId)}</select>
          </div>
        </div>
        <div class="field" id="to-field" ${draft.type === 'transfer' ? '' : 'hidden'}>
          <label for="f-to">Ke dompet</label>
          <div class="select-wrap">
            <select id="f-to" name="toAccount" class="select">${accountOptionsHTML(draft.toAccountId, draft.accountId)}</select>
          </div>
        </div>
        <div class="field">
          <label for="f-date">Tanggal</label>
          <input id="f-date" name="date" type="date" class="input" value="${esc(draft.date)}" max="${todayISO()}">
        </div>
      </div>

      <div class="field" id="category-field" ${draft.type === 'transfer' ? 'hidden' : ''}>
        <span class="field__label">Kategori</span>
        <div class="cat-grid" id="cat-grid">${categoryButtonsHTML(draft.type === 'transfer' ? 'expense' : draft.type, draft.categoryId)}</div>
      </div>

      <div class="field">
        <label for="f-note">Catatan <span>opsional</span></label>
        <input id="f-note" name="note" class="input" type="text" maxlength="80" autocomplete="off" placeholder="${draft.type === 'transfer' ? 'Contoh: Isi saldo GoPay' : 'Contoh: Makan siang'}" value="${esc(draft.note)}">
      </div>

      <div class="form-error" id="form-error" role="alert" hidden></div>
    </form>`;

  const footer = `
    ${editing ? `<button type="button" class="btn btn--ghost" id="delete-txn">${icon('trash', 'icon--sm')} Hapus</button>` : ''}
    <button type="button" class="btn" data-modal-close>Batal</button>
    <button type="submit" class="btn btn--primary" form="txn-form">${icon('check', 'icon--sm')} ${editing ? 'Simpan' : 'Catat'}</button>`;

  openModal({
    title: editing ? 'Ubah transaksi' : 'Catat transaksi',
    kicker: editing ? 'Perbarui catatan' : 'Baru',
    body,
    footer,
    onMount(el, close) {
      const form = $('#txn-form', el);
      const amountInput = $('#f-amount', form);
      const fromSelect = $('#f-account', form);
      const toSelect = $('#f-to', form);
      const toField = $('#to-field', form);
      const categoryField = $('#category-field', form);
      const categoryGrid = $('#cat-grid', form);
      const fromLabel = $('#from-label', form);
      const noteInput = $('#f-note', form);
      const dateInput = $('#f-date', form);

      function refreshToOptions() {
        const candidates = store.getState().accounts.filter((account) => account.id !== fromSelect.value);
        const selected = candidates.some((account) => account.id === draft.toAccountId)
          ? draft.toAccountId
          : candidates[0]?.id || '';
        toSelect.innerHTML = candidates
          .map((account) => `<option value="${esc(account.id)}" ${account.id === selected ? 'selected' : ''}>${esc(account.name)}</option>`)
          .join('');
        draft.toAccountId = selected;
      }

      function setType(type) {
        draft.type = type;
        $$('#type-seg [data-type]', form).forEach((button) => {
          const active = button.dataset.type === type;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        toField.hidden = type !== 'transfer';
        categoryField.hidden = type === 'transfer';
        fromLabel.textContent = type === 'transfer' ? 'Dari dompet' : 'Dompet';
        noteInput.placeholder = type === 'transfer' ? 'Contoh: Isi saldo GoPay' : type === 'income' ? 'Contoh: Bonus proyek' : 'Contoh: Makan siang';
        if (type === 'transfer') {
          draft.categoryId = null;
          refreshToOptions();
        } else {
          if (!draft.categoryId || !store.getState().categories.some((cat) => cat.id === draft.categoryId && cat.kind === type)) {
            draft.categoryId = firstCategoryId(type);
          }
          categoryGrid.innerHTML = categoryButtonsHTML(type, draft.categoryId);
        }
        clearFormError(form);
      }

      $('#type-seg', form).addEventListener('click', (event) => {
        const button = event.target.closest('[data-type]');
        if (button) setType(button.dataset.type);
      });

      amountInput.addEventListener('input', () => {
        const digits = amountInput.value.replace(/\D/g, '').slice(0, 12);
        amountInput.value = digits ? formatNumber(Number(digits)) : '';
        clearFormError(form);
      });

      categoryGrid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-cat]');
        if (!button) return;
        draft.categoryId = button.dataset.cat;
        $$('.cat-btn', categoryGrid).forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        clearFormError(form);
      });

      fromSelect.addEventListener('change', () => {
        if (draft.type === 'transfer') refreshToOptions();
        clearFormError(form);
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const amount = Number(amountInput.value.replace(/\D/g, ''));
        if (!amount) {
          showFormError(form, 'Jumlah transaksi belum diisi.');
          amountInput.focus();
          return;
        }
        if (draft.type !== 'transfer' && !draft.categoryId) {
          showFormError(form, 'Pilih kategori transaksi.');
          return;
        }
        if (draft.type === 'transfer') {
          if (!toSelect.value) {
            showFormError(form, 'Butuh dompet tujuan. Tambahkan dompet lain dulu.');
            return;
          }
          if (toSelect.value === fromSelect.value) {
            showFormError(form, 'Dompet asal dan tujuan tidak boleh sama.');
            return;
          }
        }
        try {
          store.saveTransaction({
            id: editing?.id,
            type: draft.type,
            amount,
            date: dateInput.value || defaultTxnDate(),
            accountId: fromSelect.value,
            categoryId: draft.type === 'transfer' ? null : draft.categoryId,
            toAccountId: draft.type === 'transfer' ? toSelect.value : null,
            note: noteInput.value.trim(),
          });
          close();
          render();
          toast(editing ? 'Perubahan transaksi disimpan.' : 'Transaksi dicatat.');
        } catch (error) {
          showFormError(form, error.message || 'Transaksi gagal disimpan.');
        }
      });

      const deleteButton = $('#delete-txn', el);
      if (deleteButton && editing) {
        deleteButton.addEventListener('click', async () => {
          const confirmed = await confirmDialog({
            title: 'Hapus transaksi?',
            message: `Transaksi <strong>${esc(editing.note || 'tanpa catatan')}</strong> sebesar <strong>${formatIDR(editing.amount)}</strong> akan dihapus permanen.`,
            confirm: 'Hapus',
            danger: true,
          });
          if (!confirmed) return;
          store.deleteTransaction(editing.id);
          close();
          render();
          toast('Transaksi dihapus.');
        });
      }

      setType(draft.type);
      amountInput.focus();
      amountInput.setSelectionRange(amountInput.value.length, amountInput.value.length);
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Form: anggaran                                                             */
/* -------------------------------------------------------------------------- */

function openBudgetModal(categoryId) {
  const category = store.getCategories().find((cat) => cat.id === categoryId);
  if (!category) return;
  const existing = store.getBudgets()[categoryId] || 0;
  const spent = store.categoryTotals(ui.month, 'expense').find((row) => row.category.id === categoryId)?.total || 0;
  const presets = [250000, 500000, 1000000, 2000000, 5000000];

  openModal({
    title: `Anggaran ${category.name}`,
    kicker: 'Bulanan \u00b7 otomatis tiap bulan',
    size: 'sm',
    body: `
      <form id="budget-form" class="form" novalidate>
        <div class="field">
          <label for="b-amount">Batas pengeluaran per bulan</label>
          <div class="amount-input">
            <span>Rp</span>
            <input id="b-amount" name="amount" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${existing ? formatNumber(existing) : ''}">
          </div>
          <div class="budget-presets">
            ${presets.map((value) => `<button type="button" class="chip" data-preset="${value}">${esc(formatCompactIDR(value))}</button>`).join('')}
          </div>
        </div>
        <p class="hint-box">Pengeluaran <strong>${esc(category.name)}</strong> bulan ${esc(monthLabel(ui.month))}: <strong class="amount">${formatIDR(spent)}</strong>. Anggaran bisa diubah kapan saja.</p>
        <div class="form-error" role="alert" hidden></div>
      </form>`,
    footer: `
      ${existing ? '<button type="button" class="btn btn--ghost" id="remove-budget">Hapus anggaran</button>' : ''}
      <button type="button" class="btn" data-modal-close>Batal</button>
      <button type="submit" class="btn btn--primary" form="budget-form">Simpan</button>`,
    onMount(el, close) {
      const form = $('#budget-form', el);
      const input = $('#b-amount', form);
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 12);
        input.value = digits ? formatNumber(Number(digits)) : '';
        clearFormError(form);
      });
      form.querySelectorAll('[data-preset]').forEach((button) => {
        button.addEventListener('click', () => {
          input.value = formatNumber(Number(button.dataset.preset));
          input.focus();
          clearFormError(form);
        });
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const amount = Number(input.value.replace(/\D/g, ''));
        if (!amount) {
          showFormError(form, 'Isi batas anggaran lebih dari nol.');
          input.focus();
          return;
        }
        store.setBudget(categoryId, amount);
        close();
        render();
        toast(`Anggaran ${category.name} disimpan.`);
      });
      const removeButton = $('#remove-budget', el);
      if (removeButton) {
        removeButton.addEventListener('click', () => {
          store.setBudget(categoryId, 0);
          close();
          render();
          toast(`Anggaran ${category.name} dihapus.`);
        });
      }
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Form: dompet                                                               */
/* -------------------------------------------------------------------------- */

function openAccountModal(id = null) {
  const state = store.getState();
  const editing = id ? state.accounts.find((account) => account.id === id) : null;
  let color = editing?.color || store.PALETTE[0];

  const typeOptions = Object.entries(store.ACCOUNT_TYPES).map(([value, meta]) => `
    <option value="${value}" ${(editing?.type || 'cash') === value ? 'selected' : ''}>${meta.icon} ${esc(meta.label)}</option>`).join('');

  openModal({
    title: editing ? 'Ubah dompet' : 'Dompet baru',
    kicker: editing ? 'Perbarui data dompet' : 'Tempat uang disimpan',
    body: `
      <form id="account-form" class="form" novalidate>
        <div class="field">
          <label for="a-name">Nama dompet</label>
          <input id="a-name" name="name" class="input" type="text" maxlength="40" autocomplete="off" placeholder="Contoh: BCA, Tunai, GoPay" value="${esc(editing?.name || '')}">
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="a-type">Jenis</label>
            <div class="select-wrap"><select id="a-type" name="type" class="select">${typeOptions}</select></div>
          </div>
          <div class="field">
            <label for="a-balance">Saldo awal</label>
            <div class="amount-input">
              <span>Rp</span>
              <input id="a-balance" name="balance" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${editing?.initialBalance ? formatNumber(editing.initialBalance) : ''}">
            </div>
          </div>
        </div>
        <div class="field">
          <span class="field__label">Warna penanda</span>
          <div class="color-row" id="color-row">
            ${store.PALETTE.map((value) => `<button type="button" class="color-swatch ${value === color ? 'is-active' : ''}" style="background:${value}" data-color="${value}" aria-label="Warna ${value}" aria-pressed="${value === color}"></button>`).join('')}
          </div>
        </div>
        <p class="hint-box">Saldo saat ini dihitung dari saldo awal ditambah seluruh transaksi dompet ini.${editing ? ' Mengubah saldo awal akan menggeser saldo saat ini.' : ''}</p>
        <div class="form-error" role="alert" hidden></div>
      </form>`,
    footer: `
      ${editing ? `<button type="button" class="btn btn--ghost" id="delete-account">${icon('trash', 'icon--sm')} Hapus</button>` : ''}
      <button type="button" class="btn" data-modal-close>Batal</button>
      <button type="submit" class="btn btn--primary" form="account-form">Simpan</button>`,
    onMount(el, close) {
      const form = $('#account-form', el);
      const nameInput = $('#a-name', form);
      const balanceInput = $('#a-balance', form);
      const colorRow = $('#color-row', form);

      balanceInput.addEventListener('input', () => {
        const digits = balanceInput.value.replace(/\D/g, '').slice(0, 12);
        balanceInput.value = digits ? formatNumber(Number(digits)) : '';
        clearFormError(form);
      });

      colorRow.addEventListener('click', (event) => {
        const swatch = event.target.closest('[data-color]');
        if (!swatch) return;
        color = swatch.dataset.color;
        $$('.color-swatch', colorRow).forEach((item) => {
          const active = item === swatch;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
          showFormError(form, 'Nama dompet belum diisi.');
          nameInput.focus();
          return;
        }
        try {
          store.saveAccount({
            id: editing?.id,
            name,
            type: $('#a-type', form).value,
            initialBalance: Number(balanceInput.value.replace(/\D/g, '')) || 0,
            color,
          });
          close();
          render();
          toast(editing ? 'Dompet diperbarui.' : 'Dompet ditambahkan.');
        } catch (error) {
          showFormError(form, error.message || 'Dompet gagal disimpan.');
        }
      });

      const deleteButton = $('#delete-account', el);
      if (deleteButton && editing) {
        deleteButton.addEventListener('click', async () => {
          if (store.accountUsage(editing.id) > 0) {
            toast(`Dompet masih dipakai di ${store.accountUsage(editing.id)} transaksi.`, 'warn');
            return;
          }
          if (store.getState().accounts.length <= 1) {
            toast('Minimal satu dompet harus ada.', 'warn');
            return;
          }
          const confirmed = await confirmDialog({
            title: 'Hapus dompet?',
            message: `Dompet <strong>${esc(editing.name)}</strong> akan dihapus. Tindakan ini tidak bisa dibatalkan.`,
            confirm: 'Hapus dompet',
            danger: true,
          });
          if (!confirmed) return;
          try {
            store.deleteAccount(editing.id);
            close();
            render();
            toast('Dompet dihapus.');
          } catch (error) {
            toast(error.message, 'error');
          }
        });
      }
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Form: kategori                                                             */
/* -------------------------------------------------------------------------- */

function openCategoryModal(id = null, defaultKind = 'expense') {
  const editing = id ? store.getState().categories.find((category) => category.id === id) : null;
  const kindLocked = Boolean(editing && store.categoryUsage(editing.id) > 0);
  const draft = {
    kind: editing?.kind || defaultKind,
    icon: editing?.icon || (defaultKind === 'income' ? '💰' : '✳️'),
    color: editing?.color || store.PALETTE[4],
  };

  openModal({
    title: editing ? 'Ubah kategori' : 'Kategori baru',
    kicker: editing ? 'Perbarui kategori' : 'Kelompokkan transaksi',
    body: `
      <form id="category-form" class="form" novalidate>
        <div class="field">
          <label for="c-name">Nama kategori</label>
          <input id="c-name" name="name" class="input" type="text" maxlength="28" autocomplete="off" placeholder="Contoh: Kopi, Langganan, Bonus" value="${esc(editing?.name || '')}">
        </div>
        <div class="field">
          <span class="field__label">Jenis</span>
          <div class="seg" id="kind-seg" role="group" aria-label="Jenis kategori">
            <button type="button" class="seg__btn ${draft.kind === 'expense' ? 'is-active' : ''}" data-kind="expense" aria-pressed="${draft.kind === 'expense'}" ${kindLocked ? 'disabled' : ''}>Pengeluaran</button>
            <button type="button" class="seg__btn ${draft.kind === 'income' ? 'is-active' : ''}" data-kind="income" aria-pressed="${draft.kind === 'income'}" ${kindLocked ? 'disabled' : ''}>Pemasukan</button>
          </div>
          ${kindLocked ? '<p class="small muted">Jenis tidak bisa diubah karena kategori sudah dipakai transaksi.</p>' : ''}
        </div>
        <div class="field">
          <span class="field__label">Ikon</span>
          <div class="emoji-grid" id="emoji-grid">
            ${store.EMOJI_CHOICES.map((emoji) => `<button type="button" class="emoji-btn ${emoji === draft.icon ? 'is-active' : ''}" data-emoji="${emoji}" aria-label="Ikon ${emoji}" aria-pressed="${emoji === draft.icon}">${emoji}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <span class="field__label">Warna</span>
          <div class="color-row" id="category-colors">
            ${store.PALETTE.map((value) => `<button type="button" class="color-swatch ${value === draft.color ? 'is-active' : ''}" style="background:${value}" data-color="${value}" aria-label="Warna ${value}" aria-pressed="${value === draft.color}"></button>`).join('')}
          </div>
        </div>
        <div class="form-error" role="alert" hidden></div>
      </form>`,
    footer: `
      <button type="button" class="btn" data-modal-close>Batal</button>
      <button type="submit" class="btn btn--primary" form="category-form">Simpan</button>`,
    onMount(el, close) {
      const form = $('#category-form', el);
      const nameInput = $('#c-name', form);

      $('#kind-seg', form).addEventListener('click', (event) => {
        if (kindLocked) return;
        const button = event.target.closest('[data-kind]');
        if (!button) return;
        draft.kind = button.dataset.kind;
        $$('#kind-seg [data-kind]', form).forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
      });

      $('#emoji-grid', form).addEventListener('click', (event) => {
        const button = event.target.closest('[data-emoji]');
        if (!button) return;
        draft.icon = button.dataset.emoji;
        $$('.emoji-btn', form).forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
      });

      $('#category-colors', form).addEventListener('click', (event) => {
        const button = event.target.closest('[data-color]');
        if (!button) return;
        draft.color = button.dataset.color;
        $$('#category-colors .color-swatch', form).forEach((item) => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', String(active));
        });
      });

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) {
          showFormError(form, 'Nama kategori belum diisi.');
          nameInput.focus();
          return;
        }
        try {
          store.saveCategory({
            id: editing?.id,
            name,
            kind: draft.kind,
            icon: draft.icon,
            color: draft.color,
          });
          close();
          render();
          toast(editing ? 'Kategori diperbarui.' : 'Kategori ditambahkan.');
        } catch (error) {
          showFormError(form, error.message || 'Kategori gagal disimpan.');
        }
      });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Ekspor, impor, pemasangan                                                  */
/* -------------------------------------------------------------------------- */

function exportJSON() {
  const payload = store.exportPayload();
  downloadFile(`uang-cadangan-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Cadangan JSON diunduh.');
}

function exportCSV(month = null) {
  const state = store.getState();
  const maps = lookup();
  const rows = state.transactions
    .filter((txn) => !month || monthKeyOf(txn.date) === month)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) {
    toast('Belum ada transaksi untuk diekspor.', 'warn');
    return;
  }
  const typeLabel = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer' };
  const header = ['Tanggal', 'Jenis', 'Kategori', 'Dompet', 'Ke dompet', 'Catatan', 'Jumlah'];
  const lines = [header.map(csvCell).join(',')];
  for (const txn of rows) {
    lines.push([
      txn.date,
      typeLabel[txn.type],
      maps.cats.get(txn.categoryId)?.name || '',
      maps.accs.get(txn.accountId)?.name || '',
      maps.accs.get(txn.toAccountId)?.name || '',
      txn.note || '',
      txn.amount,
    ].map(csvCell).join(','));
  }
  const suffix = month ? `-${month}` : '';
  downloadFile(`uang-transaksi${suffix}-${todayISO()}.csv`, `\uFEFF${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  toast('CSV transaksi diunduh.');
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    toast('Berkas cadangan terlalu besar (maks. 8 MB).', 'error');
    return;
  }
  try {
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Berkas JSON tidak bisa dibaca.');
    }
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.accounts) || !Array.isArray(data.categories)) {
      throw new Error('Berkas ini bukan cadangan UANG.');
    }
    const confirmed = await confirmDialog({
      title: 'Pulihkan cadangan?',
      message: `Cadangan berisi <strong>${data.transactions.length} transaksi</strong>, ${data.accounts.length} dompet, dan ${data.categories.length} kategori. <strong>Data saat ini akan diganti.</strong>`,
      confirm: 'Pulihkan',
      danger: true,
    });
    if (!confirmed) return;
    store.importPayload(data);
    resetViewState();
    applyTheme();
    applyPrivacy();
    render();
    toast('Cadangan berhasil dipulihkan.');
  } catch (error) {
    toast(error.message || 'Gagal memulihkan cadangan.', 'error');
  }
}

async function installApp() {
  if (!deferredInstallPrompt) {
    toast('Buka menu browser lalu pilih \u201cTambahkan ke layar utama\u201d.', 'warn');
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferredInstallPrompt = null;
  const button = $('#install-btn');
  if (button) button.hidden = true;
  if (choice.outcome === 'accepted') toast('UANG dipasang. Buka dari layar utama.');
}

/* -------------------------------------------------------------------------- */
/* Aksi                                                                       */
/* -------------------------------------------------------------------------- */

function resetViewState() {
  ui.month = currentMonthKey();
  ui.txnFilter = 'all';
  ui.txnQuery = '';
}

async function handleAction(element) {
  const action = element.dataset.action;
  const id = element.dataset.id;

  switch (action) {
    case 'prev-month':
      ui.month = addMonths(ui.month, -1);
      render();
      break;
    case 'next-month':
      ui.month = addMonths(ui.month, 1);
      render();
      break;
    case 'this-month':
      ui.month = currentMonthKey();
      render();
      break;
    case 'new-txn':
      openTxnModal();
      break;
    case 'new-txn-cat':
      openTxnModal(null, { categoryId: id });
      break;
    case 'edit-txn':
      openTxnModal(id);
      break;
    case 'delete-txn': {
      const txn = store.getState().transactions.find((item) => item.id === id);
      if (!txn) return;
      const maps = lookup();
      const category = maps.cats.get(txn.categoryId);
      const confirmed = await confirmDialog({
        title: 'Hapus transaksi?',
        message: `Transaksi <strong>${esc(txn.note || category?.name || 'tanpa catatan')}</strong> sebesar <strong>${formatIDR(txn.amount)}</strong> akan dihapus permanen.`,
        confirm: 'Hapus',
        danger: true,
      });
      if (!confirmed) return;
      store.deleteTransaction(id);
      render();
      toast('Transaksi dihapus.');
      break;
    }
    case 'toggle-privacy':
      store.updateSettings({ privacy: !store.getSettings().privacy });
      applyPrivacy();
      render();
      break;
    case 'set-theme':
      store.updateSettings({ theme: element.dataset.value });
      applyTheme();
      render();
      break;
    case 'filter-txn':
      ui.txnFilter = element.dataset.value || 'all';
      syncTxnFilter();
      break;
    case 'clear-filters':
      ui.txnFilter = 'all';
      ui.txnQuery = '';
      render();
      break;
    case 'set-budget':
      openBudgetModal(id);
      break;
    case 'set-budget-first': {
      const category = store.getCategories('expense')[0];
      if (category) openBudgetModal(category.id);
      else toast('Tambahkan kategori pengeluaran dulu.', 'warn');
      break;
    }
    case 'add-account':
      openAccountModal();
      break;
    case 'edit-account':
      openAccountModal(id);
      break;
    case 'delete-account': {
      const account = store.getState().accounts.find((item) => item.id === id);
      if (!account) return;
      const usage = store.accountUsage(id);
      if (usage > 0) {
        toast(`Dompet masih dipakai di ${usage} transaksi. Hapus transaksinya dulu.`, 'warn');
        return;
      }
      if (store.getState().accounts.length <= 1) {
        toast('Minimal satu dompet harus ada.', 'warn');
        return;
      }
      const confirmed = await confirmDialog({
        title: 'Hapus dompet?',
        message: `Dompet <strong>${esc(account.name)}</strong> akan dihapus permanen.`,
        confirm: 'Hapus dompet',
        danger: true,
      });
      if (!confirmed) return;
      try {
        store.deleteAccount(id);
        render();
        toast('Dompet dihapus.');
      } catch (error) {
        toast(error.message, 'error');
      }
      break;
    }
    case 'add-category':
      openCategoryModal(null, element.dataset.kind || 'expense');
      break;
    case 'edit-category':
      openCategoryModal(id);
      break;
    case 'delete-category': {
      const category = store.getState().categories.find((item) => item.id === id);
      if (!category) return;
      const usage = store.categoryUsage(id);
      if (usage > 0) {
        toast(`Kategori ini dipakai di ${usage} transaksi. Pindahkan transaksinya dulu.`, 'warn');
        return;
      }
      const confirmed = await confirmDialog({
        title: 'Hapus kategori?',
        message: `Kategori <strong>${esc(category.name)}</strong> akan dihapus. Anggarannya juga ikut terhapus.`,
        confirm: 'Hapus kategori',
        danger: true,
      });
      if (!confirmed) return;
      try {
        store.deleteCategory(id);
        render();
        toast('Kategori dihapus.');
      } catch (error) {
        toast(error.message, 'error');
      }
      break;
    }
    case 'export-json':
      exportJSON();
      break;
    case 'export-csv':
      exportCSV();
      break;
    case 'export-month-csv':
      exportCSV(ui.month);
      break;
    case 'import-json':
      $('#import-file').click();
      break;
    case 'load-demo': {
      const confirmed = await confirmDialog({
        title: 'Muat data contoh?',
        message: 'Data contoh akan <strong>mengganti semua data saat ini</strong>. Cadangkan datamu dulu bila perlu.',
        confirm: 'Muat data contoh',
        danger: true,
      });
      if (!confirmed) return;
      store.seed('demo');
      resetViewState();
      render();
      toast('Data contoh dimuat. Ubah atau hapus kapan saja.');
      break;
    }
    case 'reset-data': {
      const confirmed = await confirmDialog({
        title: 'Hapus semua data?',
        message: 'Semua transaksi, dompet, kategori, dan anggaran di perangkat ini akan <strong>dihapus permanen</strong>. Ekspor cadangan dulu bila perlu.',
        confirm: 'Hapus semua',
        danger: true,
      });
      if (!confirmed) return;
      store.seed('starter');
      resetViewState();
      render();
      toast('Semua data dihapus. Mulai dari awal.');
      break;
    }
    case 'install':
      installApp();
      break;
    default:
      break;
  }
}

/* -------------------------------------------------------------------------- */
/* Render & navigasi                                                          */
/* -------------------------------------------------------------------------- */

const VIEWS = {
  ringkasan: viewRingkasan,
  transaksi: viewTransaksi,
  anggaran: viewAnggaran,
  laporan: viewLaporan,
  dompet: viewDompet,
  pengaturan: viewPengaturan,
  lainnya: viewLainnya,
};

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
  return Object.prototype.hasOwnProperty.call(ROUTES, raw) ? raw : 'ringkasan';
}

function render() {
  const route = parseRoute();
  ui.route = route;
  const meta = ROUTES[route];

  $('#page-title').textContent = meta.label;
  $('#page-sub').textContent = meta.sub;
  document.title = `UANG \u2014 ${meta.label}`;
  $('#month-label').textContent = monthLabel(ui.month, false);
  $('#month-switch').hidden = !MONTH_SCOPED.has(route);

  const activeRoutes = new Set([route]);
  if (route === 'dompet' || route === 'pengaturan') activeRoutes.add('lainnya');
  $$('[data-route]').forEach((element) => {
    const active = activeRoutes.has(element.dataset.route);
    element.classList.toggle('is-active', active);
    if (active) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });

  applyPrivacy();
  const view = $('#view');
  view.innerHTML = VIEWS[route]();
  view.style.animation = 'none';
  void view.offsetWidth;
  view.style.animation = '';
}

/* -------------------------------------------------------------------------- */
/* Event global                                                               */
/* -------------------------------------------------------------------------- */

document.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  handleAction(element).catch((error) => {
    console.error(error);
    toast(error.message || 'Terjadi kesalahan.', 'error');
  });
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'txn-search') {
    ui.txnQuery = event.target.value;
    renderTxnResults();
  }
});

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const tag = target?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
  const modalOpen = Boolean(document.querySelector('.modal-overlay'));

  if ((event.key === 'Enter' || event.key === ' ') && target?.closest?.('[data-action="edit-txn"]') && !target.closest('button')) {
    event.preventDefault();
    openTxnModal(target.closest('[data-action="edit-txn"]').dataset.id);
    return;
  }
  if (typing || modalOpen || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.toLowerCase() === 'n') {
    event.preventDefault();
    openTxnModal();
  } else if (event.key === '/') {
    event.preventDefault();
    if (ui.route !== 'transaksi') {
      location.hash = '#/transaksi';
      setTimeout(() => $('#txn-search')?.focus(), 140);
    } else {
      $('#txn-search')?.focus();
    }
  }
});

function handleShortcutAction() {
  const query = location.hash.split('?')[1] || '';
  if (!query) return;
  const params = new URLSearchParams(query);
  if (params.get('new') !== '1') return;
  const clean = `#/${parseRoute()}`;
  try { history.replaceState(null, '', clean); } catch { location.hash = clean; }
  if (!document.querySelector('.modal-overlay')) openTxnModal();
}

window.addEventListener('hashchange', () => {
  const next = parseRoute();
  const changed = next !== ui.route;
  render();
  if (changed) window.scrollTo(0, 0);
  handleShortcutAction();
});

$('#import-file').addEventListener('change', handleImportFile);

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (store.getSettings().theme === 'auto') applyTheme();
});

/* -------------------------------------------------------------------------- */
/* Inisialisasi                                                               */
/* -------------------------------------------------------------------------- */

function setupInstall() {
  const button = $('#install-btn');
  if (window.matchMedia('(display-mode: standalone)').matches && button) button.hidden = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (button) button.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (button) button.hidden = true;
    toast('UANG dipasang di layar utama.');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function init() {
  if (!location.hash) {
    try {
      history.replaceState(null, '', '#/ringkasan');
    } catch {
      location.hash = '#/ringkasan';
    }
  }
  applyTheme();
  applyPrivacy();

  if (!store.storageAvailable) {
    const status = $('#storage-status');
    if (status) status.textContent = 'mode terbatas';
    setTimeout(() => toast('Penyimpanan browser tidak aktif. Data bisa hilang saat halaman ditutup.', 'error'), 1400);
  }

  render();
  setupInstall();
  registerServiceWorker();
  if (store.isFirstRun) showWelcome();
  else handleShortcutAction();
}

init();
