/* UANG — penyimpanan, model data, dan perhitungan */

import {
  addMonths, currentMonthKey, daysInMonth, endOfMonthISO, monthKeyOf,
  todayISO, uid,
} from './format.js';

const STORAGE_KEY = 'uang.v1';
const VERSION = 1;

/* ------------------------------------------------------------------ */
/* Util penyimpanan                                                    */
/* ------------------------------------------------------------------ */

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export const storageAvailable = (() => {
  try {
    const probe = '__uang_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch { return false; }
})();

const firstRaw = safeGet(STORAGE_KEY);
export const isFirstRun = !firstRaw;

/* ------------------------------------------------------------------ */
/* Data awal                                                           */
/* ------------------------------------------------------------------ */

export const ACCOUNT_TYPES = {
  cash: { label: 'Tunai', icon: '💵' },
  bank: { label: 'Bank', icon: '🏦' },
  ewallet: { label: 'E-wallet', icon: '📱' },
  other: { label: 'Lainnya', icon: '🪙' },
};

export const PALETTE = [
  '#C4B5FD', '#86EFAC', '#7DD3FC', '#FDA4AF',
  '#FDE047', '#FDBA74', '#99F6E4', '#F9A8D4',
];

export const EMOJI_CHOICES = [
  '🍜', '🛵', '🛍️', '🧾', '🏠', '🎬', '💊', '📚',
  '✈️', '🎁', '🐾', '💡', '💼', '🧑‍💻', '📈', '💰',
  '☕', '⛽', '🧺', '✳️',
];

function defaultCategories() {
  return [
    { id: 'cat-makan', name: 'Makan & Minum', kind: 'expense', icon: '🍜', color: '#FDBA74' },
    { id: 'cat-transport', name: 'Transportasi', kind: 'expense', icon: '🛵', color: '#7DD3FC' },
    { id: 'cat-belanja', name: 'Belanja', kind: 'expense', icon: '🛍️', color: '#FDA4AF' },
    { id: 'cat-tagihan', name: 'Tagihan', kind: 'expense', icon: '🧾', color: '#C4B5FD' },
    { id: 'cat-tempat', name: 'Tempat Tinggal', kind: 'expense', icon: '🏠', color: '#86EFAC' },
    { id: 'cat-hiburan', name: 'Hiburan', kind: 'expense', icon: '🎬', color: '#F9A8D4' },
    { id: 'cat-kesehatan', name: 'Kesehatan', kind: 'expense', icon: '💊', color: '#99F6E4' },
    { id: 'cat-pendidikan', name: 'Pendidikan', kind: 'expense', icon: '📚', color: '#93C5FD' },
    { id: 'cat-lainnya', name: 'Lainnya', kind: 'expense', icon: '✳️', color: '#94A3B8' },
    { id: 'cat-gaji', name: 'Gaji', kind: 'income', icon: '💼', color: '#86EFAC' },
    { id: 'cat-freelance', name: 'Freelance', kind: 'income', icon: '🧑‍💻', color: '#7DD3FC' },
    { id: 'cat-investasi', name: 'Investasi', kind: 'income', icon: '📈', color: '#C4B5FD' },
    { id: 'cat-pemasukan-lain', name: 'Pemasukan Lain', kind: 'income', icon: '💰', color: '#FDE047' },
  ];
}

function starterAccounts() {
  return [
    { id: 'acc-tunai', name: 'Tunai', type: 'cash', initialBalance: 0, color: '#FDE047' },
    { id: 'acc-bca', name: 'Rekening', type: 'bank', initialBalance: 0, color: '#7DD3FC' },
  ];
}

function demoAccounts() {
  return [
    { id: 'acc-tunai', name: 'Tunai', type: 'cash', initialBalance: 350000, color: '#FDE047' },
    { id: 'acc-bca', name: 'BCA', type: 'bank', initialBalance: 4250000, color: '#7DD3FC' },
    { id: 'acc-gopay', name: 'GoPay', type: 'ewallet', initialBalance: 225000, color: '#86EFAC' },
  ];
}

function demoBudgets() {
  return {
    'cat-makan': 1600000,
    'cat-transport': 450000,
    'cat-belanja': 1000000,
    'cat-tagihan': 1100000,
    'cat-tempat': 2600000,
    'cat-hiburan': 180000,
    'cat-kesehatan': 150000,
  };
}

function freshState() {
  return {
    version: VERSION,
    createdAt: new Date().toISOString(),
    settings: { theme: 'auto', privacy: false, onboarded: false },
    accounts: starterAccounts(),
    categories: defaultCategories(),
    transactions: [],
    budgets: {},
  };
}

/* ------------------------------------------------------------------ */
/* Sanitasi & normalisasi                                              */
/* ------------------------------------------------------------------ */

const TXN_TYPES = ['expense', 'income', 'transfer'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeAccount(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 40);
  if (!name) return null;
  const type = ACCOUNT_TYPES[raw.type] ? raw.type : 'cash';
  const color = /^#[0-9a-fA-F]{6}$/.test(String(raw.color)) ? raw.color : PALETTE[index % PALETTE.length];
  return {
    id: String(raw.id || uid('acc')),
    name,
    type,
    initialBalance: Math.round(num(raw.initialBalance)),
    color,
  };
}

function sanitizeCategory(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim().slice(0, 28);
  if (!name) return null;
  const kind = raw.kind === 'income' ? 'income' : 'expense';
  const color = /^#[0-9a-fA-F]{6}$/.test(String(raw.color)) ? raw.color : PALETTE[index % PALETTE.length];
  return {
    id: String(raw.id || uid('cat')),
    name,
    kind,
    icon: String(raw.icon || (kind === 'income' ? '💰' : '✳️')).slice(0, 4),
    color,
  };
}

function sanitizeTransaction(raw, { lenient = false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const type = TXN_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;
  const amount = Math.round(num(raw.amount));
  if (!(amount > 0) || amount > 999999999999) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date))) return null;
  const date = String(raw.date);
  if (Number.isNaN(new Date(`${date}T12:00:00`).getTime())) return null;

  const accountId = String(raw.accountId || '');
  const toAccountId = raw.toAccountId ? String(raw.toAccountId) : null;
  const categoryId = raw.categoryId ? String(raw.categoryId) : null;

  if (!lenient) {
    if (!state.accounts.some((a) => a.id === accountId)) {
      throw new Error('Dompet tidak ditemukan.');
    }
    if (type === 'transfer') {
      if (!toAccountId || !state.accounts.some((a) => a.id === toAccountId)) {
        throw new Error('Dompet tujuan tidak ditemukan.');
      }
      if (toAccountId === accountId) throw new Error('Dompet asal dan tujuan tidak boleh sama.');
    } else {
      const cat = state.categories.find((c) => c.id === categoryId);
      if (!cat || cat.kind !== type) throw new Error('Pilih kategori yang sesuai.');
    }
  }

  const out = {
    id: String(raw.id || uid('trx')),
    type,
    amount,
    date,
    accountId,
    categoryId: type === 'transfer' ? null : categoryId,
    note: String(raw.note || '').trim().slice(0, 120),
    createdAt: String(raw.createdAt || `${date}T12:00:00`),
  };
  if (type === 'transfer') out.toAccountId = toAccountId;
  return out;
}

function normalize(raw) {
  const base = freshState();
  const data = raw && typeof raw === 'object' ? raw : {};

  const settings = {
    theme: ['light', 'dark', 'auto'].includes(data.settings?.theme) ? data.settings.theme : 'auto',
    privacy: Boolean(data.settings?.privacy),
    onboarded: Boolean(data.settings?.onboarded),
  };

  let accounts = Array.isArray(data.accounts)
    ? data.accounts.map(sanitizeAccount).filter(Boolean)
    : base.accounts;
  if (!accounts.length) accounts = base.accounts;

  let categories = Array.isArray(data.categories)
    ? data.categories.map(sanitizeCategory).filter(Boolean)
    : base.categories;
  if (!categories.length) categories = base.categories;

  const accountIds = new Set(accounts.map((a) => a.id));
  const transactions = (Array.isArray(data.transactions) ? data.transactions : [])
    .map((t) => sanitizeTransaction(t, { lenient: true }))
    .filter((t) => t && accountIds.has(t.accountId) && (t.type !== 'transfer' || accountIds.has(t.toAccountId)));

  const budgets = {};
  if (data.budgets && typeof data.budgets === 'object') {
    for (const [key, value] of Object.entries(data.budgets)) {
      const amount = Math.round(num(value));
      if (amount > 0) budgets[String(key)] = amount;
    }
  }

  return {
    version: VERSION,
    createdAt: data.createdAt || base.createdAt,
    settings,
    accounts,
    categories,
    transactions,
    budgets,
  };
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function load() {
  if (!firstRaw) return freshState();
  try {
    return normalize(JSON.parse(firstRaw));
  } catch {
    return freshState();
  }
}

let state = load();

function save() {
  safeSet(STORAGE_KEY, JSON.stringify(state));
}

export function getState() {
  return state;
}

export function getSettings() {
  return state.settings;
}

export function updateSettings(patch) {
  const allowed = ['theme', 'privacy', 'onboarded'];
  for (const key of allowed) {
    if (key in patch) state.settings[key] = patch[key];
  }
  save();
}

/* ------------------------------------------------------------------ */
/* Mutasi transaksi                                                    */
/* ------------------------------------------------------------------ */

export function saveTransaction(input) {
  const clean = sanitizeTransaction(input);
  if (!clean) throw new Error('Data transaksi tidak valid.');
  const index = state.transactions.findIndex((t) => t.id === clean.id);
  if (index >= 0) {
    state.transactions[index] = {
      ...state.transactions[index],
      ...clean,
      updatedAt: new Date().toISOString(),
    };
  } else {
    state.transactions.push({ ...clean, createdAt: new Date().toISOString() });
  }
  save();
  return clean;
}

export function deleteTransaction(id) {
  const before = state.transactions.length;
  state.transactions = state.transactions.filter((t) => t.id !== id);
  if (state.transactions.length !== before) save();
}

/* ------------------------------------------------------------------ */
/* Mutasi dompet                                                       */
/* ------------------------------------------------------------------ */

export function accountUsage(accountId) {
  return state.transactions.filter((t) => t.accountId === accountId || t.toAccountId === accountId).length;
}

export function saveAccount(input) {
  const account = sanitizeAccount(input, state.accounts.length);
  if (!account) throw new Error('Nama dompet wajib diisi.');
  if (input.id && state.accounts.some((a) => a.id === input.id)) {
    const index = state.accounts.findIndex((a) => a.id === input.id);
    state.accounts[index] = account;
  } else {
    if (state.accounts.some((a) => a.id === account.id)) account.id = uid('acc');
    state.accounts.push(account);
  }
  save();
  return account;
}

export function deleteAccount(id) {
  if (state.accounts.length <= 1) throw new Error('Minimal satu dompet harus ada.');
  const usage = accountUsage(id);
  if (usage > 0) throw new Error(`Dompet ini dipakai di ${usage} transaksi. Hapus transaksinya lebih dulu.`);
  state.accounts = state.accounts.filter((a) => a.id !== id);
  save();
}

/* ------------------------------------------------------------------ */
/* Mutasi kategori & anggaran                                          */
/* ------------------------------------------------------------------ */

export function categoryUsage(categoryId) {
  return state.transactions.filter((t) => t.categoryId === categoryId).length;
}

export function saveCategory(input) {
  const category = sanitizeCategory(input, state.categories.length);
  if (!category) throw new Error('Nama kategori wajib diisi.');
  if (input.id && state.categories.some((c) => c.id === input.id)) {
    const index = state.categories.findIndex((c) => c.id === input.id);
    const original = state.categories[index];
    if (original.kind !== category.kind && categoryUsage(input.id) > 0) {
      throw new Error('Jenis kategori tidak bisa diubah karena sudah dipakai transaksi.');
    }
    state.categories[index] = category;
  } else {
    if (state.categories.some((c) => c.id === category.id)) category.id = uid('cat');
    state.categories.push(category);
  }
  save();
  return category;
}

export function deleteCategory(id) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  const usage = categoryUsage(id);
  if (usage > 0) throw new Error(`Kategori ini dipakai di ${usage} transaksi.`);
  state.categories = state.categories.filter((c) => c.id !== id);
  delete state.budgets[id];
  save();
}

export function setBudget(categoryId, amount) {
  const value = Math.max(0, Math.round(num(amount)));
  if (value > 0) state.budgets[categoryId] = value;
  else delete state.budgets[categoryId];
  save();
}

/* ------------------------------------------------------------------ */
/* Perhitungan                                                         */
/* ------------------------------------------------------------------ */

export function accountBalance(accountId, upToDate = null) {
  const account = state.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  let balance = num(account.initialBalance);
  for (const t of state.transactions) {
    if (upToDate && t.date > upToDate) continue;
    if (t.type === 'expense') {
      if (t.accountId === accountId) balance -= t.amount;
    } else if (t.type === 'income') {
      if (t.accountId === accountId) balance += t.amount;
    } else if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount;
      if (t.toAccountId === accountId) balance += t.amount;
    }
  }
  return balance;
}

export function totalBalanceAt(upToDate = null) {
  return state.accounts.reduce((sum, a) => sum + accountBalance(a.id, upToDate), 0);
}

export function accountsWithBalance(upToDate = null) {
  return state.accounts.map((account) => ({
    ...account,
    balance: accountBalance(account.id, upToDate),
    usage: accountUsage(account.id),
  }));
}

export function monthTotals(key) {
  let income = 0;
  let expense = 0;
  let count = 0;
  for (const t of state.transactions) {
    if (monthKeyOf(t.date) !== key) continue;
    count += 1;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense, net: income - expense, count };
}

export function categoryTotals(key, kind = 'expense') {
  const byId = new Map();
  for (const t of state.transactions) {
    if (monthKeyOf(t.date) !== key || t.type !== kind) continue;
    const keyId = t.categoryId || '__none__';
    const entry = byId.get(keyId) || { total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    byId.set(keyId, entry);
  }
  const rows = [];
  for (const [id, entry] of byId) {
    const category = state.categories.find((c) => c.id === id) || {
      id: '__none__', name: 'Tanpa kategori', kind, icon: '✳️', color: '#8B8375',
    };
    rows.push({ category, total: entry.total, count: entry.count });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export function monthSeries(endKey, count = 6) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const key = addMonths(endKey, -i);
    const totals = monthTotals(key);
    out.push({
      key,
      income: totals.income,
      expense: totals.expense,
      net: totals.net,
    });
  }
  return out;
}

export function cumulativeSpendSeries(key) {
  const { year, month } = { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
  const total = daysInMonth(key);
  const limit = key === currentMonthKey() ? Number(todayISO().slice(8, 10)) : total;
  const daily = new Array(total).fill(0);
  for (const t of state.transactions) {
    if (t.type !== 'expense' || monthKeyOf(t.date) !== key) continue;
    const day = Number(t.date.slice(8, 10));
    if (day >= 1 && day <= total) daily[day - 1] += t.amount;
  }
  const series = [];
  let acc = 0;
  for (let i = 0; i < Math.max(2, limit); i += 1) {
    acc += daily[i] || 0;
    series.push(acc);
  }
  return series;
}

export function budgetSummary(key) {
  const spentMap = new Map(categoryTotals(key, 'expense').map((row) => [row.category.id, row.total]));
  const items = [];
  const unbudgeted = [];
  for (const category of state.categories) {
    if (category.kind !== 'expense') continue;
    const budget = Math.max(0, Math.round(num(state.budgets[category.id])));
    const spent = spentMap.get(category.id) || 0;
    if (budget > 0) {
      items.push({
        category,
        budget,
        spent,
        remaining: budget - spent,
        ratio: spent / budget,
      });
    } else if (spent > 0) {
      unbudgeted.push({ category, spent });
    }
  }
  items.sort((a, b) => b.ratio - a.ratio);
  const total = items.reduce((sum, item) => sum + item.budget, 0);
  const spent = items.reduce((sum, item) => sum + item.spent, 0);
  return {
    items,
    unbudgeted,
    total,
    spent,
    remaining: total - spent,
    ratio: total > 0 ? spent / total : 0,
  };
}

export function recentTransactions(key, limit = 6) {
  return state.transactions
    .filter((t) => monthKeyOf(t.date) === key)
    .sort((a, b) => (a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : b.date.localeCompare(a.date)))
    .slice(0, limit);
}

export function allTransactionsSorted() {
  return [...state.transactions].sort((a, b) => (
    a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt)) : b.date.localeCompare(a.date)
  ));
}

export function getAccounts() {
  return state.accounts;
}

export function getCategories(kind = null) {
  return kind ? state.categories.filter((c) => c.kind === kind) : state.categories;
}

export function getBudgets() {
  return { ...state.budgets };
}

/* ------------------------------------------------------------------ */
/* Ekspor / impor / seed                                               */
/* ------------------------------------------------------------------ */

export function exportPayload() {
  return {
    app: 'uang',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    ...JSON.parse(JSON.stringify(state)),
  };
}

export function importPayload(data) {
  if (!data || typeof data !== 'object') throw new Error('Berkas bukan cadangan UANG.');
  if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts) || !Array.isArray(data.categories)) {
    throw new Error('Struktur cadangan tidak dikenali.');
  }
  if (!data.accounts.length) throw new Error('Cadangan tidak berisi dompet.');
  if (!data.categories.length) throw new Error('Cadangan tidak berisi kategori.');
  const next = normalize(data);
  next.settings.onboarded = true;
  state = next;
  save();
}

export function seed(mode = 'starter') {
  const keep = { theme: state.settings.theme, privacy: state.settings.privacy };
  const next = freshState();
  next.settings = { ...next.settings, ...keep, onboarded: true };
  if (mode === 'demo') {
    next.accounts = demoAccounts();
    next.transactions = demoTransactions();
    next.budgets = demoBudgets();
  }
  state = next;
  save();
}

/* ------------------------------------------------------------------ */
/* Data contoh                                                         */
/* ------------------------------------------------------------------ */

function mulberry32(seedValue) {
  let a = seedValue;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoTransactions() {
  const rng = mulberry32(0x5EED1234);
  const now = new Date();
  const curKey = currentMonthKey();
  const todayDay = Number(todayISO().slice(8, 10));
  const keys = [addMonths(curKey, -2), addMonths(curKey, -1), curKey];
  const rows = [];
  let order = 0;

  const add = (type, amount, date, categoryId, accountId, note, toAccountId = null) => {
    if (!date) return;
    order += 1;
    const hour = 8 + (order % 11);
    const minute = (order * 7) % 60;
    rows.push({
      id: `trx-demo-${order}`,
      type,
      amount: Math.max(1, Math.round(amount / 500) * 500),
      date,
      categoryId: type === 'transfer' ? null : categoryId,
      accountId,
      ...(type === 'transfer' ? { toAccountId } : {}),
      note,
      createdAt: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
    });
  };

  const iso = (key, day, limit) => {
    if (day > limit) return null;
    const max = daysInMonth(key);
    const d = Math.min(Math.max(1, day), max);
    return `${key}-${String(d).padStart(2, '0')}`;
  };

  keys.forEach((key, monthIndex) => {
    const limit = key === curKey ? todayDay : 28;
    const at = (day) => iso(key, day, limit);

    add('income', 9500000, at(1), 'cat-gaji', 'acc-bca', 'Gaji bulanan');
    add('income', [2400000, 1750000, 2100000][monthIndex], at(12), 'cat-freelance', 'acc-bca', 'Proyek desain');
    add('income', 185000 + monthIndex * 20000, at(20), 'cat-investasi', 'acc-bca', 'Dividen reksa dana');

    add('expense', 2500000, at(2), 'cat-tempat', 'acc-bca', 'Sewa kos');
    add('expense', 387000 + monthIndex * 13000, at(5), 'cat-tagihan', 'acc-bca', 'Listrik & air');
    add('expense', 349000, at(7), 'cat-tagihan', 'acc-bca', 'Internet rumah');
    add('expense', 186000, at(9), 'cat-tagihan', 'acc-gopay', 'Langganan digital');

    add('transfer', 600000, at(3), null, 'acc-bca', 'Isi saldo GoPay', 'acc-gopay');
    add('transfer', 500000, at(8), null, 'acc-bca', 'Tarik tunai', 'acc-tunai');

    const eatNotes = [
      'Makan siang', 'Kopi susu', 'Nasi goreng', 'Bakso', 'Ayam geprek',
      'Sarapan', 'Makan malam', 'Jajan pasar', 'Soto ayam', 'Nasi padang',
      'Martabak', 'Kopi', 'Mie ayam', 'Sate',
    ];
    const eatCount = Math.min(15, Math.max(5, Math.round(limit * 0.85)));
    for (let i = 0; i < eatCount; i += 1) {
      const day = 1 + Math.floor(rng() * limit);
      add(
        'expense',
        18000 + rng() * 70000,
        at(day),
        'cat-makan',
        rng() > 0.45 ? 'acc-gopay' : 'acc-tunai',
        eatNotes[Math.floor(rng() * eatNotes.length)],
      );
    }

    const rideNotes = ['Ojek online', 'Bensin', 'KRL', 'Parkir', 'Gojek ke kantor', 'Taksi'];
    const rideCount = Math.min(10, Math.max(4, Math.round(limit * 0.5)));
    for (let i = 0; i < rideCount; i += 1) {
      const day = 1 + Math.floor(rng() * limit);
      add(
        'expense',
        12000 + rng() * 30000,
        at(day),
        'cat-transport',
        rng() > 0.5 ? 'acc-gopay' : 'acc-tunai',
        rideNotes[Math.floor(rng() * rideNotes.length)],
      );
    }

    add('expense', 465000, at(6), 'cat-belanja', 'acc-bca', 'Belanja bulanan');
    add('expense', 189000, at(13), 'cat-belanja', 'acc-bca', 'Skincare');
    add('expense', 320000, at(22), 'cat-belanja', 'acc-bca', 'Peralatan rumah');

    add('expense', 95000, at(16), 'cat-hiburan', 'acc-gopay', 'Tiket bioskop');
    add('expense', 65000, at(21), 'cat-hiburan', 'acc-gopay', 'Langganan musik');

    add('expense', 165000, at(11), 'cat-kesehatan', 'acc-bca', 'Vitamin & obat');
    if (monthIndex === 1) add('expense', 149000, at(18), 'cat-pendidikan', 'acc-bca', 'Buku kerja');
  });

  return rows;
}
