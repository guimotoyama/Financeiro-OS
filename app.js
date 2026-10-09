'use strict';
/* =========================================================
   Financeiro OS — lógica do app (JavaScript puro)
   Dados salvos no Supabase. Gráficos: Chart.js (CDN).
   ========================================================= */

/* ---------------------- Helpers ---------------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------------------- Supabase ---------------------- */
const SUPABASE_URL = 'https://klfvazxnureqgaoijvdv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M76XPoguxn32vCe0NLUqCw_pidejaZm';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------------- Autenticação ---------------------- */
let currentUserId = null;
let APP_READY = false; // true somente quando load() carregou os dados reais com sucesso

function setAuthState(isAuthed) {
  document.body.classList.toggle('authenticated', isAuthed);
}

async function initApp() {
  APP_READY = false;
  try {
    S = await load();
    APP_READY = true;
  } catch (e) {
    console.error('Falha crítica ao carregar dados do servidor:', e);
    APP_READY = false;
    return; // não renderiza e não libera salvar enquanto o carregamento não funcionar
  }
  const startPage = location.hash.replace('#', '');
  if (PAGES[startPage]) ui.page = startPage;
  render();
}

sb.auth.onAuthStateChange((_event, session) => {
  setAuthState(!!session);
  const uid = session?.user?.id || null;
  if (uid && uid !== currentUserId) {
    currentUserId = uid;
    initApp();
  } else if (!uid) {
    currentUserId = null;
    APP_READY = false;
    S = defaultState();
  }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  const errEl = $('#loginError');
  errEl.textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'E-mail ou senha incorretos.';
    return;
  }
  $('#loginForm').reset();
});

$('#logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
});

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = v => BRL.format(+v || 0);
const fmtPct = (v, d = 1) => (isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (v, cls = '') => `<span class="money ${cls}">${fmt(v)}</span>`;
const sgn = v => (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : '');
const numStr = n => String(Math.round((+n || 0) * 100) / 100).replace('.', ',');
const pad = n => String(n).padStart(2, '0');

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const thisYM = () => todayISO().slice(0, 7);
const addMonthsISO = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(Math.min(d, last))}`;
};
const addMonthsYM = (ym, n) => addMonthsISO(ym + '-01', n).slice(0, 7);
const monthLabel = ym => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const shortMonth = ym => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(y).slice(2);
};
const fmtDate = iso => (iso || '').split('-').reverse().join('/');
const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

/* ---------------------- Feriados e dia útil ---------------------- */
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function dateISOFromYMD(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

// Algoritmo de Gauss/Meeus para calcular a data da Páscoa (domingo) de um ano
function easterISO(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateISOFromYMD(year, month, day);
}

const holidayCache = {};
function holidaysForYear(year) {
  if (holidayCache[year]) return holidayCache[year];
  const easter = easterISO(year);
  const set = new Set([
    dateISOFromYMD(year, 1, 1),   // Ano Novo
    dateISOFromYMD(year, 4, 21),  // Tiradentes
    dateISOFromYMD(year, 5, 1),   // Dia do Trabalho
    dateISOFromYMD(year, 9, 7),   // Independência
    dateISOFromYMD(year, 10, 12), // N. Sra. Aparecida
    dateISOFromYMD(year, 11, 2),  // Finados
    dateISOFromYMD(year, 11, 15), // Proclamação da República
    dateISOFromYMD(year, 12, 25), // Natal
    addDaysISO(easter, -47), // Carnaval (terça-feira)
    addDaysISO(easter, -2),  // Sexta-feira Santa
    addDaysISO(easter, 60),  // Corpus Christi
  ]);
  holidayCache[year] = set;
  return set;
}
function isHoliday(iso) { return holidaysForYear(+iso.slice(0, 4)).has(iso); }
function isWeekend(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}
function nextBusinessDay(iso) {
  let cur = iso;
  while (isWeekend(cur) || isHoliday(cur)) cur = addDaysISO(cur, 1);
  return cur;
}

/* ---------------------- Automação de fatura ---------------------- */
function computeInvoiceNature(accountId, dateISO) {
  const acc = S.accounts.find(a => a.id === accountId);
  if (!acc || !acc.closingDay) return null; // sem automação configurada
  const day = +dateISO.slice(8, 10);
  return day < acc.closingDay ? 'fatura_mes' : 'fatura_seg';
}
function computeDueDate(accountId) {
  const acc = S.accounts.find(a => a.id === accountId);
  if (!acc || !acc.dueDay) return null;
  const ym = thisYM();
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(acc.dueDay, lastDay);
  const raw = dateISOFromYMD(y, m, day);
  return nextBusinessDay(raw);
}

function parseBR(s) {
  s = String(s ?? '').replace(/[R$\s]/g, '');
  if (!s) return NaN;
  const neg = s.includes('-') || /^\(.*\)$/.test(s);
  s = s.replace(/[()-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}

/* ---------------------- Constantes ---------------------- */
const NATURES = {
  entrada:       { label: 'Entrada',                  tone: 'pos',     o: 'Conta que recebeu', ot: ['acc', 'pot'] },
  flash:         { label: 'Benefício Flash',          tone: 'pos',     o: 'Conta Flash',       ot: ['acc'] },
  rendimento:    { label: 'Rendimento',               tone: 'pos',     o: 'Rendeu em',         ot: ['acc', 'pot', 'asset'] },
  saida:         { label: 'Saída',                    tone: 'neg',     o: 'Pago com (conta)',  ot: ['acc', 'pot'], cat: true },
  fatura_mes:    { label: 'Fatura do Mês (cartão)',   tone: 'neg',     o: 'Cartão (banco)',    ot: ['acc'], cat: true, credit: true },
  fatura_seg:    { label: 'Fatura Seguinte (cartão)', tone: 'warn',    o: 'Cartão (banco)',    ot: ['acc'], cat: true, credit: true },
  pag_fatura:    { label: 'Pagamento de Fatura',      tone: 'neutral', o: 'Paga com a conta',  ot: ['acc'], d: 'Fatura de qual cartão', dt: ['acc'], dOptional: true },
  transferencia: { label: 'Transferência entre contas', tone: 'neutral', o: 'Sai de',          ot: ['acc', 'pot'], d: 'Entra em', dt: ['acc', 'pot'] },
  aporte:        { label: 'Aporte em Investimento',   tone: 'info',    o: 'Sai de',            ot: ['acc', 'pot'], d: 'Investimento', dt: ['asset'] },
  resgate:       { label: 'Resgate de Investimento',  tone: 'neutral', o: 'Resgatado de',      ot: ['asset'], d: 'Cai em', dt: ['acc', 'pot'] },
};
const PAYMENTS = ['Débito', 'Crédito', 'Pix', 'Dinheiro', 'Parcelado', 'TED', 'Boleto'];
const ASSET_CLASSES = { acao: 'Ações', tesouro: 'Tesouro / Renda Fixa', cripto: 'Bitcoin / Cripto', outro: 'Outros' };
const KINDS = { essencial: 'Essencial', nao_essencial: 'Não essencial', invest: 'Investimento' };
const CREDIT = ['fatura_mes', 'fatura_seg'];

/* ---------------------- Estado ---------------------- */
function defaultState() {
  return {
    version: 1,
    settings: { theme: 'dark', hide: false, appName: 'Financeiro OS', goalPct: 20, brapiToken: '' },
    accounts: [
      { id: 'acc_mp',     name: 'Mercado Pago', kind: 'conta',     color: '#00a8e8', logo: 'assets/logos/mercadopago.png', initial: 0 },
      { id: 'acc_nu',     name: 'Nubank',       kind: 'conta',     color: '#8a05be', logo: 'assets/logos/nubank.png',      initial: 0 },
      { id: 'acc_xp',     name: 'XP',           kind: 'conta',     color: '#2b2b2b', logo: 'assets/logos/xp.png',          initial: 0 },
      { id: 'acc_flexf',  name: 'Flash Flex',   kind: 'beneficio', color: '#ff2d6f', logo: 'assets/logos/flash-flex.png',  initial: 0 },
      { id: 'acc_flashm', name: 'Flash Mob',    kind: 'beneficio', color: '#ff7a00', logo: 'assets/logos/flash-mob.png',   initial: 0 },
    ],
    pots: [
      { id: 'pot_reserva', name: 'Reserva de Emergência', icon: '🛟', color: '#10b981', initial: 0, goal: 0, deadline: '' },
      { id: 'pot_datas',   name: 'Datas',                 icon: '🎁', color: '#f59e0b', initial: 0, goal: 0, deadline: '' },
      { id: 'pot_carro',   name: 'Carro',                 icon: '🚗', color: '#3b82f6', initial: 0, goal: 0, deadline: '' },
      { id: 'pot_fatura',  name: 'Fatura',                icon: '💳', color: '#ec4899', initial: 0, goal: 0, deadline: '' },
    ],
    assets: [
      { id: 'ast_btc',   name: 'Bitcoin',            ticker: 'BTC',   cls: 'cripto',  qty: 0, color: '#f7931a', initialApplied: 0, initialValue: 0, adjust: 0 },
      { id: 'ast_ipca',  name: 'Tesouro IPCA+ 2050', ticker: '',      cls: 'tesouro', qty: 0, color: '#0ea5e9', initialApplied: 0, initialValue: 0, adjust: 0 },
      { id: 'ast_petr4', name: 'PETR4',              ticker: 'PETR4', cls: 'acao',    qty: 0, color: '#22c55e', initialApplied: 0, initialValue: 0, adjust: 0 },
      { id: 'ast_vale3', name: 'VALE3',              ticker: 'VALE3', cls: 'acao',    qty: 0, color: '#14b8a6', initialApplied: 0, initialValue: 0, adjust: 0 },
      { id: 'ast_klbn4', name: 'KLBN4',              ticker: 'KLBN4', cls: 'acao',    qty: 0, color: '#a855f7', initialApplied: 0, initialValue: 0, adjust: 0 },
      { id: 'ast_csna3', name: 'CSNA3',              ticker: 'CSNA3', cls: 'acao',    qty: 0, color: '#64748b', initialApplied: 0, initialValue: 0, adjust: 0 },
    ],
    categories: [
      { id: 'cat_essenciais',  name: 'Essenciais',               kind: 'essencial',     color: '#10b981', budget: 0 },
      { id: 'cat_moradia',     name: 'Moradia & Contas',         kind: 'essencial',     color: '#3b82f6', budget: 0 },
      { id: 'cat_lazer',       name: 'Lazer',                    kind: 'nao_essencial', color: '#f59e0b', budget: 0 },
      { id: 'cat_transporte',  name: 'Transporte',               kind: 'essencial',     color: '#8b5cf6', budget: 0 },
      { id: 'cat_saude',       name: 'Saúde',                    kind: 'essencial',     color: '#ef4444', budget: 0 },
      { id: 'cat_assinaturas', name: 'Assinaturas & Serviços',   kind: 'nao_essencial', color: '#06b6d4', budget: 0 },
      { id: 'cat_compras',     name: 'Compras Pessoais',         kind: 'nao_essencial', color: '#ec4899', budget: 0 },
      { id: 'cat_presentes',   name: 'Presentes & Datas',        kind: 'nao_essencial', color: '#f97316', budget: 0 },
      { id: 'cat_educacao',    name: 'Educação & Trabalho',      kind: 'essencial',     color: '#14b8a6', budget: 0 },
      { id: 'cat_impostos',    name: 'Impostos, Taxas & Bancos', kind: 'essencial',     color: '#64748b', budget: 0 },
      { id: 'cat_invest',      name: 'Investimentos',            kind: 'invest',        color: '#22c55e', budget: 0 },
    ],
    transactions: [],
    commitments: [],
    receivables: [],
  };
}

function migrate(s) {
  const d = defaultState();
  const out = Object.assign({}, d, s);
  out.settings = Object.assign({}, d.settings, s.settings || {});
  ['accounts', 'pots', 'assets', 'categories', 'transactions', 'commitments', 'receivables'].forEach(k => { if (!Array.isArray(out[k])) out[k] = d[k]; });
  return out;
}

/* ---------------------- Persistência (Supabase) ---------------------- */
const TABLES = ['accounts', 'pots', 'assets', 'categories', 'transactions', 'commitments', 'receivables'];

// mapeia nomes de campo do app (camelCase) <-> nomes de coluna no banco (snake_case)
const FIELD_MAP = {
  transactions: { desc: 'description' },
  commitments: { desc: 'description' },
  receivables: { desc: 'description' },
};

// lista fixa de campos esperados por tabela — garante que todo upsert em lote
// tenha objetos com EXATAMENTE as mesmas chaves (o Postgrest exige isso em arrays)
const TABLE_FIELDS = {
  accounts: ['name', 'kind', 'color', 'logo', 'initial', 'closingDay', 'dueDay'],
  pots: ['name', 'icon', 'color', 'initial', 'goal', 'deadline'],
  assets: ['name', 'ticker', 'cls', 'qty', 'color', 'logo', 'initialApplied', 'initialValue', 'adjust', 'lastPrice'],
  categories: ['name', 'kind', 'color', 'budget'],
  transactions: ['date', 'desc', 'nature', 'payment', 'category', 'origin', 'dest', 'value', 'grp', 'paid', 'realValue'],
  commitments: ['desc', 'value', 'due', 'paid'],
  receivables: ['person', 'desc', 'value', 'date', 'received', 'receivedDate'],
};

// valores padrão para campos que são NOT NULL no banco, caso o objeto não os tenha ainda
const FIELD_DEFAULTS = {
  transactions: { paid: false },
  commitments: { paid: false },
  receivables: { received: false },
};

function toRow(table, obj, userId) {
  const map = FIELD_MAP[table] || {};
  const fields = TABLE_FIELDS[table] || Object.keys(obj);
  const defaults = FIELD_DEFAULTS[table] || {};
  const row = { id: obj.id, user_id: userId };
  for (const k of fields) {
    const col = map[k] || k.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    let v = obj[k];
    if (v === undefined) v = (k in defaults) ? defaults[k] : null;
    row[col] = v;
  }
  return row;
}

function fromRow(table, row) {
  const map = FIELD_MAP[table] || {};
  const inv = Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
  const obj = {};
  for (const [col, v] of Object.entries(row)) {
    if (col === 'user_id') continue;
    const key = inv[col] || col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    obj[key] = v;
  }
  return obj;
}

async function load() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return defaultState();
  const userId = session.user.id;

  const d = defaultState();
  const out = { version: d.version, settings: d.settings, accounts: [], pots: [], assets: [], categories: [], transactions: [], commitments: [], receivables: [] };

  const { data: settingsRow, error: errSettings } = await sb.from('settings').select('*').eq('user_id', userId).maybeSingle();
  if (errSettings) {
    console.error('settings', errSettings);
    toast('❌ Falha ao carregar configurações do servidor. Recarregue a página (F5). Não faça alterações até conseguir carregar com sucesso.', true);
    throw new Error('load_failed_settings');
  }
  if (settingsRow) {
    out.settings = {
      theme: settingsRow.theme, hide: settingsRow.hide, appName: settingsRow.app_name,
      goalPct: settingsRow.goal_pct, brapiToken: settingsRow.brapi_token,
    };
  }

  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select('*').eq('user_id', userId);
    if (error) {
      console.error(table, error);
      toast(`❌ Falha ao carregar "${table}" do servidor. Recarregue a página (F5). Não faça alterações até conseguir carregar com sucesso.`, true);
      throw new Error('load_failed_' + table);
    }
    out[table] = data.map(r => fromRow(table, r));
  }

  const isEmpty = TABLES.every(t => out[t].length === 0) && !settingsRow;
  if (isEmpty) return migrate(defaultState());

  return migrate(out);
}

let SAVING = false;
async function save() {
  if (!APP_READY) {
    console.warn('save() bloqueado: os dados ainda não foram carregados com sucesso nesta sessão.');
    toast('⚠️ Não é possível salvar agora: os dados não foram carregados corretamente. Recarregue a página (F5).', true);
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const userId = session.user.id;
  SAVING = true; updateSaveIndicator();
  let hadError = false;

  try {
    const r0 = await sb.from('settings').upsert({
      user_id: userId, theme: S.settings.theme, hide: S.settings.hide,
      app_name: S.settings.appName, goal_pct: S.settings.goalPct, brapi_token: S.settings.brapiToken,
    });
    if (r0.error) { console.error('settings', r0.error); hadError = true; }

    for (const table of TABLES) {
      const { data: existing, error: errSel } = await sb.from(table).select('id').eq('user_id', userId);
      if (errSel) { console.error(table, 'select', errSel); hadError = true; continue; }
      const existingIds = new Set((existing || []).map(r => r.id));
      const currentIds = new Set(S[table].map(x => x.id));

      const toDelete = [...existingIds].filter(id => !currentIds.has(id));
      if (toDelete.length) {
        const { error: errDel } = await sb.from(table).delete().eq('user_id', userId).in('id', toDelete);
        if (errDel) { console.error(table, 'delete', errDel); hadError = true; }
      }

      if (S[table].length) {
        const rows = S[table].map(obj => toRow(table, obj, userId));
        const { error: errUp } = await sb.from(table).upsert(rows);
        if (errUp) { console.error(table, 'upsert', errUp); hadError = true; }
      }
    }
  } catch (e) {
    console.error(e);
    hadError = true;
  } finally {
    SAVING = false;
    if (hadError) {
      toast('⚠️ Erro ao salvar! Verifique sua conexão e tente novamente. Não recarregue a página agora.', true);
    }
    updateSaveIndicator(hadError);
  }
}
function updateSaveIndicator(hadError = false) {
  const el = $('#saveIndicator');
  if (!el) return;
  el.textContent = SAVING ? '💾 Salvando…' : (hadError ? '❌ Erro ao salvar' : '✅ Salvo');
}

let S = defaultState(); // placeholder até carregar de fato

const ui = { page: 'dashboard', month: thisYM(), f: { q: '', nature: '', cat: '', loc: '', all: false } };
const cache = { C: null };

/* ---------------------- Lookups ---------------------- */
const findLoc = id => S.accounts.find(a => a.id === id) || S.pots.find(p => p.id === id) || S.assets.find(a => a.id === id) || null;
const locName = id => (findLoc(id) || {}).name || '—';
const catById = id => S.categories.find(c => c.id === id);
const investCatId = () => (S.categories.find(c => c.kind === 'invest') || {}).id || 'cat_invest';

function locOptions(types, sel, ph = 'Selecione…') {
  const g = (label, arr) => arr.length ? `<optgroup label="${label}">${arr.map(x => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : '';
  let h = `<option value="">${ph}</option>`;
  if (types.includes('acc')) h += g('Contas', S.accounts);
  if (types.includes('pot')) h += g('Cofrinhos', S.pots);
  if (types.includes('asset')) h += g('Investimentos', S.assets);
  return h;
}
function logoEl(item, size = '') {
  const ini = esc((item.name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const img = item.logo ? `<img src="${esc(item.logo)}" alt="" onerror="this.remove()">` : '';
  const inner = item.icon ? item.icon : ini;
  return `<span class="logo-slot ${size} ${item.icon ? 'emoji' : ''}" style="--c:${esc(item.color || '#6366f1')}">${img}<b>${inner}</b></span>`;
}

/* ---------------------- Motor de cálculo ---------------------- */
function deltas(t) {
  const v = +t.value || 0;
  switch (t.nature) {
    case 'entrada': case 'flash': case 'rendimento': return [[t.origin, v]];
    case 'saida': case 'pag_fatura': return [[t.origin, -v]];
    case 'transferencia': case 'aporte': case 'resgate': return [[t.origin, -v], [t.dest, v]];
    default: return [];
  }
}
/* cutoff: considera lançamentos até a data; now=true inclui futuro (faturas/parcelas, agendados, compromissos) */
function compute({ cutoff = todayISO(), now = true } = {}) {
  const bal = {}, applied = {}, debt = {}, debtReal = {};
  S.accounts.forEach(a => bal[a.id] = +a.initial || 0);
  S.pots.forEach(p => bal[p.id] = +p.initial || 0);
  S.assets.forEach(a => { bal[a.id] = (+a.initialValue || 0) + (+a.adjust || 0); applied[a.id] = +a.initialApplied || 0; });
  let scheduled = 0;
  for (const t of S.transactions) {
    const v = +t.value || 0, future = t.date > cutoff;
    if (CREDIT.includes(t.nature)) {
      if (!t.paid && (!future || now)) {
        const rv = (t.realValue != null) ? (+t.realValue || 0) : v;
        debt[t.origin] = (debt[t.origin] || 0) + v;
        debtReal[t.origin] = (debtReal[t.origin] || 0) + rv;
      }
      continue;
    }
    if (future) { if (now && t.nature === 'saida') scheduled += v; continue; }
    if (t.nature === 'resgate' && applied[t.origin] !== undefined) {
      const cur = bal[t.origin] || 0, ratio = cur > 0 ? Math.min(1, v / cur) : 0;
      applied[t.origin] -= applied[t.origin] * ratio;
    }
    if (t.nature === 'aporte' && applied[t.dest] !== undefined) applied[t.dest] += v;
    if (t.nature === 'pag_fatura') {
      const c = t.dest || t.origin;
      debt[c] = (debt[c] || 0) - v;
      debtReal[c] = (debtReal[c] || 0) - v;
    }
    deltas(t).forEach(([id, d]) => { if (id) bal[id] = (bal[id] || 0) + d; });
  }
  const sum = arr => arr.reduce((s, x) => s + (bal[x.id] || 0), 0);
  const accSum = sum(S.accounts), potSum = sum(S.pots), assetSum = sum(S.assets);
  const debtTotal = Object.values(debt).reduce((s, x) => s + Math.max(0, x), 0);
  const debtTotalReal = Object.values(debtReal).reduce((s, x) => s + Math.max(0, x), 0);
  const commitments = now ? S.commitments.filter(c => !c.paid).reduce((s, c) => s + (+c.value || 0), 0) : 0;
  const receivablesTotal = S.receivables.filter(r => !r.received).reduce((s, r) => s + (+r.value || 0), 0);
  const gross = accSum + potSum + assetSum + receivablesTotal;
  return {
    bal, applied, debt, debtReal, accSum, potSum, assetSum,
    debtTotal, debtTotalReal, receivablesTotal,
    scheduled: now ? scheduled : 0, commitments, gross,
    total: gross - debtTotalReal - (now ? scheduled : 0) - commitments,
  };
}

const refreshCache = () => { cache.C = compute(); };

function monthStats(ym) {
  const r = { ym, entrada: 0, flash: 0, rend: 0, saidas: 0, fatura: 0, faturaSeg: 0, faturaReal: 0, faturaSegReal: 0, aportes: 0, resgates: 0, byCat: {} };
  const inv = investCatId();
  const spend = (cid, v) => { const k = cid || '_none'; r.byCat[k] = (r.byCat[k] || 0) + v; };
  const prev = addMonthsYM(ym, -1);
  r.carry = 0;
  r.carryReal = 0;
  for (const t of S.transactions) {
    const v = +t.value || 0;
    const rv = (t.realValue != null) ? (+t.realValue || 0) : v; // sua parte real, ou o valor cheio se não preenchido
    if (t.nature === 'fatura_seg' && t.date.startsWith(prev)) { r.carry += v; r.carryReal += rv; }
    if (!t.date.startsWith(ym)) continue;
    switch (t.nature) {
      case 'entrada': r.entrada += v; break;
      case 'flash': r.flash += v; break;
      case 'rendimento': r.rend += v; break;
      case 'saida': r.saidas += v; spend(t.category, v); break;
      case 'fatura_mes': r.fatura += v; r.faturaReal += rv; spend(t.category, rv); break;
      case 'fatura_seg': r.faturaSeg += v; r.faturaSegReal += rv; spend(t.category, rv); break;
      case 'aporte': r.aportes += v; spend(inv, v); break;
      case 'resgate': r.resgates += v; break;
    }
  }
  r.entradas = r.entrada + r.flash + r.rend;
  r.faturaBruta = r.fatura + r.carry;            // valor total que será cobrado (cash-flow real, não muda com valor real)
  r.faturaLiquida = r.faturaReal + r.carryReal;   // sua parte real da fatura, descontando o que é de terceiros
  r.saldo = r.entradas - r.saidas;
  r.sobraFatura = r.saldo - r.faturaBruta;
  r.sobraPct = r.entradas > 0 ? r.sobraFatura / r.entradas * 100 : 0;
  r.totalOut = Object.values(r.byCat).reduce((s, x) => s + x, 0);
  r.ess = 0; r.nao = 0;
  for (const [cid, v] of Object.entries(r.byCat)) {
    const c = catById(cid), k = c ? c.kind : 'nao_essencial';
    if (k === 'essencial') r.ess += v; else if (k === 'nao_essencial') r.nao += v;
  }
  r.gastos = r.ess + r.nao;
  r.essPct = r.gastos > 0 ? r.ess / r.gastos * 100 : 0;
  r.naoPct = r.gastos > 0 ? r.nao / r.gastos * 100 : 0;
  return r;
}

const classAssets = cls => S.assets.filter(a => a.cls === cls);
const classValue = cls => classAssets(cls).reduce((s, a) => s + (cache.C.bal[a.id] || 0), 0);
const classLabel = cls => { const l = classAssets(cls); return l.length === 1 ? l[0].name : ASSET_CLASSES[cls]; };

function netWorthHistory(n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ym = addMonthsYM(thisYM(), -i);
    out.push({ ym, v: i === 0 ? cache.C.total : compute({ cutoff: ym + '-31', now: false }).total });
  }
  return out;
}

/* ---------------------- UI base: toast, modal, charts ---------------------- */
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function openModal({ title, body, submitLabel = 'Salvar', onSubmit, wide = false, extraActions = '', noSubmit = false }) {
  const root = $('#modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop"><form class="modal ${wide ? 'wide' : ''}">
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close>✕</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${extraActions}<button type="button" class="btn ghost" data-close>Cancelar</button>${noSubmit ? '' : `<button class="btn primary" type="submit">${esc(submitLabel)}</button>`}</div>
    </form></div>`;
  const form = $('form', root);
  root.querySelector('.modal-backdrop').addEventListener('mousedown', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); });
  $$('[data-close]', root).forEach(b => b.addEventListener('click', closeModal));
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (onSubmit && onSubmit(new FormData(form), form) === false) return;
    closeModal();
  });
  const first = $('input:not([type=hidden]),select', form); if (first) setTimeout(() => first.focus(), 30);
  return form;
}
function confirmBox(msg, onYes, label = 'Excluir') {
  openModal({ title: 'Confirmar', body: `<p>${esc(msg)}</p>`, submitLabel: label, onSubmit: () => { onYes(); } });
}

const charts = {};
function chart(id, cfg) {
  const cv = document.getElementById(id); if (!cv) return;
  if (charts[id]) charts[id].destroy();
  if (typeof Chart === 'undefined') {
    cv.replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Gráfico indisponível (conecte-se à internet para carregar o Chart.js).' }));
    return;
  }
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = css.getPropertyValue('--muted').trim();
  Chart.defaults.borderColor = css.getPropertyValue('--border').trim();
  Chart.defaults.font.family = css.getPropertyValue('--font').trim();
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
  charts[id] = new Chart(cv, cfg);
}
const axisMoney = { ticks: { callback: v => 'R$ ' + COMPACT.format(v) } };
const tipMoney = { callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ': ' : (c.label ? c.label + ': ' : '')}${fmt(c.parsed.y ?? c.parsed)}` } };

const fi = (label, name, val = '', o = {}) => `<label class="${o.span ? 'span2' : ''}">${label}<input name="${name}" type="${o.type || 'text'}" value="${esc(val)}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ''} ${o.req ? 'required' : ''} ${o.mode ? `inputmode="${o.mode}"` : ''} ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.max !== undefined ? `max="${o.max}"` : ''}>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</label>`;
const fs = (label, name, opts, val, o = {}) => `<label class="${o.span ? 'span2' : ''}">${label}<select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

/* ---------------------- Render principal ---------------------- */
const PAGES = {
  dashboard:     { title: 'Visão Geral',        month: true,  render: renderDashboard },
  lancamentos:   { title: 'Lançamentos',        month: true,  render: renderTx },
  contas:        { title: 'Contas & Cartões',   month: true,  render: renderContas },
  investimentos: { title: 'Investimentos',      month: false, render: renderInvest },
  metas:         { title: 'Metas & Cofrinhos',  month: false, render: renderMetas },
  patrimonio:    { title: 'Patrimônio Líquido', month: false, render: renderPatrimonio },
  config:        { title: 'Configurações',      month: false, render: renderConfig },
};
function render() {
  refreshCache();
  $$('.page').forEach(p => p.hidden = p.id !== 'page-' + ui.page);
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === ui.page));
  const P = PAGES[ui.page];
  $('#pageTitle').textContent = P.title;
  $('#monthNav').style.visibility = P.month ? 'visible' : 'hidden';
  $('#monthLabel').textContent = monthLabel(ui.month);
  $('#monthPicker').value = ui.month;
  $('#brandName').textContent = S.settings.appName || 'Financeiro OS';
  document.title = S.settings.appName || 'Financeiro OS';
  document.documentElement.dataset.theme = S.settings.theme;
  $('#themeBtn').textContent = S.settings.theme === 'dark' ? '🌙' : '☀️';
  document.body.classList.toggle('hide-values', !!S.settings.hide);
  P.render();
}
const commit = () => { render(); save(); };
function go(page) {
  ui.page = page; history.replaceState(null, '', '#' + page);
  $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show');
  render(); window.scrollTo({ top: 0 });
}

/* ---------------------- DASHBOARD ---------------------- */
const kpi = (label, val, o = {}) => `
  <div class="kpi ${o.tone ? 't-' + o.tone : ''}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-value ${o.cls || ''}">${o.raw ? val : money(val, o.signed ? sgn(val) : '')}</div>
    ${o.sub ? `<div class="kpi-sub">${o.sub}</div>` : ''}
  </div>`;

function renderDashboard() {
  const ym = ui.month, M = monthStats(ym), C = cache.C, el = $('#page-dashboard');
  const btc = classValue('cripto'), acoes = classValue('acao'), fixa = classValue('tesouro');
  const btcPct = C.total > 0 ? btc / C.total * 100 : (C.gross > 0 ? btc / C.gross * 100 : 0);
  const goal = +S.settings.goalPct || 0;
  const cats = S.categories.map(c => ({ ...c, v: M.byCat[c.id] || 0 }));
  if (M.byCat._none) cats.push({ id: '_none', name: 'Sem categoria', kind: 'nao_essencial', color: '#94a3b8', budget: 0, v: M.byCat._none });
  cats.sort((a, b) => b.v - a.v);

  /* alertas */
  const al = [];
  if (M.entradas > 0 && M.sobraFatura < 0) al.push(['d', '⚠️', `Neste mês as entradas não cobrem saídas + fatura: faltam <b>${fmt(-M.sobraFatura)}</b>.`]);
  if (M.entradas > 0 && M.sobraFatura >= 0 && goal && M.sobraPct < goal) al.push(['w', '📉', `Sua sobra está em <b>${fmtPct(M.sobraPct)}</b>, abaixo da meta de <b>${fmtPct(goal, 0)}</b>.`]);
  if (M.entradas > 0 && goal && M.sobraPct >= goal) al.push(['g', '🎯', `Meta de sobra atingida: <b>${fmtPct(M.sobraPct)}</b> (meta ${fmtPct(goal, 0)}).`]);
  cats.filter(c => c.budget > 0 && c.v > c.budget).forEach(c => al.push(['d', '🚨', `<b>${esc(c.name)}</b> estourou o orçamento: ${fmt(c.v)} de ${fmt(c.budget)}.`]));
  if (M.gastos > 0 && M.naoPct > 45) al.push(['w', '🛍️', `Gastos não essenciais somam <b>${fmtPct(M.naoPct)}</b> dos gastos do mês.`]);
  if (M.faturaSeg > 0) al.push(['w', '💳', `Já há <b>${fmt(M.faturaSeg)}</b> comprometidos na fatura do próximo mês.`]);
  const soon = S.commitments.filter(c => !c.paid && c.due && monthsBetween(todayISO().slice(0, 7), c.due.slice(0, 7)) <= 2);
  soon.forEach(c => al.push(['w', '📅', `<b>${esc(c.desc)}</b> vence em ${fmtDate(c.due)}: ${fmt(c.value)}.`]));
  if (!al.length) al.push(['g', '✅', 'Tudo em ordem por aqui. Registre seus lançamentos para ver alertas e análises.']);

  el.innerHTML = `
  ${S.transactions.length === 0 ? `
    <div class="empty-banner">
      <div style="font-size:30px">👋</div>
      <p><b>Bem-vindo!</b> Comece ajustando os saldos em <a href="#contas">Contas</a> e <a href="#investimentos">Investimentos</a>, depois adicione lançamentos ou <b>importe o CSV</b> da sua planilha.</p>
      <button class="btn primary" data-act="newTx">+ Novo lançamento</button>
      <button class="btn" data-act="importCsv">Importar CSV</button>
    </div>` : ''}

  <div class="hero">
    <div>
      <small>PATRIMÔNIO LÍQUIDO TOTAL</small>
      <div class="big">${money(C.total, sgn(C.total))}</div>
      <div class="pills">
        <span class="pill">Contas <b>${money(C.accSum)}</b></span>
        <span class="pill">Cofrinhos <b>${money(C.potSum)}</b></span>
        <span class="pill">Investimentos <b>${money(C.assetSum)}</b></span>
        <span class="pill">(−) Faturas/Parcelas <b>${money(C.debtTotal)}</b></span>
        ${C.commitments + C.scheduled > 0 ? `<span class="pill">(−) Compromissos futuros <b>${money(C.commitments + C.scheduled)}</b></span>` : ''}
      </div>
      <p class="muted" style="margin-top:14px;font-size:12.5px">Tudo que você tem (contas, cofrinhos e investimentos) menos todas as faturas, parcelas e compromissos futuros já lançados.</p>
    </div>
    <div><div class="chart-box"><canvas id="chNet"></canvas></div></div>
  </div>

  <section class="block">
    <div class="block-head"><h2>Saldos nas Contas</h2><span class="sub">Total: ${money(C.accSum)}</span><a class="spacer" href="#contas" data-go="contas">Gerenciar →</a></div>
    <div class="grid auto">
      ${S.accounts.map(a => {
        const d = Math.max(0, C.debt[a.id] || 0);
        return `<div class="mini">${logoEl(a)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="vl">${money(C.bal[a.id] || 0, sgn(C.bal[a.id]) === 'neg' ? 'neg' : '')}</div>${d > 0 ? `<div class="sm-t">Fatura em aberto: ${money(d)}</div>` : `<div class="sm-t">${a.kind === 'beneficio' ? 'Benefício' : 'Conta'}</div>`}</div></div>`;
      }).join('')}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Carteira de Investimentos</h2><span class="sub">Total: ${money(C.assetSum)}</span><a class="spacer" href="#investimentos" data-go="investimentos">Detalhes →</a></div>
    <div class="grid auto">
      ${S.assets.map(a => {
        const cur = C.bal[a.id] || 0, ap = C.applied[a.id] || 0, pl = cur - ap, pct = ap > 0 ? pl / ap * 100 : 0;
        return `<div class="mini">${logoEl(a)}<div class="grow"><div class="nm">${esc(a.name)}</div><div class="vl">${money(cur)}</div><div class="sm-t ${ap > 0 ? sgn(pl) : ''}">${ap > 0 ? (pl >= 0 ? '▲ ' : '▼ ') + fmtPct(Math.abs(pct)) : ASSET_CLASSES[a.cls]}</div></div></div>`;
      }).join('')}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Resultados do Mês</h2><span class="sub">${monthLabel(ym)}</span></div>
    <div class="kpi-grid">
      ${kpi('Entrada Total', M.entradas, { tone: 'pos', sub: `Entradas ${fmt(M.entrada)} · Flash ${fmt(M.flash)} · Rend. ${fmt(M.rend)}` })}
      ${kpi('Saída Total', M.saidas, { tone: 'neg', sub: 'Débito, Pix, dinheiro, TED, boleto' })}
      ${kpi('Fatura Bruta', M.faturaBruta, { tone: 'warn', sub: M.carry > 0 ? `Inclui ${fmt(M.carry)} do mês anterior` : 'Compras no cartão deste mês' })}
      ${kpi('Fatura Líquida', M.faturaLiquida, { tone: 'info', sub: M.faturaLiquida !== M.faturaBruta ? `Sua parte real` : 'Igual à bruta — nenhum valor de terceiros' })}
      ${kpi('Saldo do Mês', M.saldo, { tone: M.saldo >= 0 ? 'pos' : 'neg', signed: true, sub: 'Entradas − Saídas' })}
      ${kpi('Fatura Seguinte', M.faturaSeg, { tone: 'warn', sub: `Líquida: ${fmt(M.faturaSegReal)}` })}
      ${kpi('Sobra da Fatura', M.sobraFatura, { tone: M.sobraFatura >= 0 ? 'pos' : 'neg', signed: true, sub: 'Saldo do mês − Fatura bruta' })}
      ${kpi('Patrimônio Líquido Total', C.total, { tone: 'acc', signed: true, sub: 'Hoje, já descontando dívidas futuras' })}
      ${kpi('Sobra do Mês %', fmtPct(M.sobraPct), { raw: true, tone: M.sobraPct >= goal ? 'pos' : 'warn', cls: sgn(M.sobraPct), sub: goal ? `Meta: ${fmtPct(goal, 0)} das entradas` : 'Sobra da fatura ÷ entradas' })}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Investimentos</h2><span class="sub">${monthLabel(ym)}</span></div>
    <div class="kpi-grid">
      ${kpi('Investimentos R$ (aportes do mês)', M.aportes, { tone: 'info', sub: M.resgates > 0 ? `Resgates: ${fmt(M.resgates)}` : 'Total aportado no mês' })}
      ${kpi('Rendimentos R$', M.rend, { tone: 'pos', sub: 'Rendimentos lançados no mês' })}
      ${kpi('Ações R$', acoes, { tone: 'acc', sub: esc(classLabel('acao')) })}
      ${kpi(esc(classLabel('tesouro')) + ' R$', fixa, { tone: 'acc', sub: 'Renda fixa / Tesouro' })}
      ${kpi('Bitcoin R$', btc, { tone: 'warn', sub: esc(classLabel('cripto')) })}
      ${kpi('Patrimônio em Bitcoin %', fmtPct(btcPct), { raw: true, tone: 'warn', sub: 'Bitcoin ÷ patrimônio líquido' })}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Metas & Cofrinhos</h2><span class="sub">Total guardado: ${money(C.potSum)}</span><a class="spacer" href="#metas" data-go="metas">Gerenciar →</a></div>
    <div class="grid auto">
      ${S.pots.map(p => {
        const v = C.bal[p.id] || 0, pct = p.goal > 0 ? Math.min(100, v / p.goal * 100) : 0;
        return `<div class="card entity">
          <div class="entity-head">${logoEl(p, 'sm')}<h3>Cofrinho ${esc(p.name)}</h3></div>
          <div class="val">${money(v)}</div>
          ${p.goal > 0 ? `<div class="progress" style="--bar:${esc(p.color)}"><span style="width:${pct}%"></span></div><div class="row"><span>${fmtPct(pct, 0)} da meta</span><b>${money(p.goal)}</b></div>` : `<div class="row"><span>Sem meta definida</span></div>`}
        </div>`;
      }).join('')}
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Gastos por Categoria</h2><span class="sub">${monthLabel(ym)} · Total ${fmt(M.totalOut)}</span></div>
    <div class="split2">
      <div class="card">
        <div class="cat-table">
          ${cats.map(c => {
            const pct = M.totalOut > 0 ? c.v / M.totalOut * 100 : 0;
            const over = c.budget > 0 && c.v > c.budget;
            return `<div class="cat-row">
              <div class="cat-name"><i class="dot" style="--c:${esc(c.color)}"></i><span title="${esc(c.name)}">${esc(c.name)}</span>${c.budget > 0 ? `<span class="tag ${over ? 'over' : ''}">${fmtPct(c.v / c.budget * 100, 0)} do orç.</span>` : ''}</div>
              <div class="progress" style="--bar:${esc(c.color)}"><span style="width:${pct}%"></span></div>
              <div class="v">${money(c.v)}</div><div class="p">${fmtPct(pct)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="card"><div class="chart-box" style="height:320px"><canvas id="chCat"></canvas></div></div>
    </div>
  </section>

  <section class="block">
    <div class="block-head"><h2>Gastos Essenciais vs Não Essenciais</h2><span class="sub">Considera todas as categorias (exceto investimentos)</span></div>
    <div class="card">
      <div class="ess-split"><span style="width:${M.essPct}%;background:var(--accent)"></span><span style="width:${M.naoPct}%;background:var(--warn)"></span></div>
      <div class="grid g2">
        <div><div class="kpi-label">🟢 Gastos Essenciais R$</div><div class="kpi-value">${money(M.ess)}</div><div class="kpi-sub">${fmtPct(M.essPct)} dos gastos</div></div>
        <div><div class="kpi-label">🟠 Gastos Não Essenciais R$</div><div class="kpi-value">${money(M.nao)}</div><div class="kpi-sub">${fmtPct(M.naoPct)} dos gastos</div></div>
      </div>
    </div>
  </section>

  <section class="block">
    <div class="split2">
      <div class="card"><div class="block-head"><h2>Fluxo dos últimos 6 meses</h2></div><div class="chart-box"><canvas id="chFlow"></canvas></div></div>
      <div class="card"><div class="block-head"><h2>Alertas & Insights</h2></div><div class="alerts">${al.map(a => `<div class="alert ${a[0]}"><span>${a[1]}</span><span>${a[2]}</span></div>`).join('')}</div></div>
    </div>
  </section>`;

  /* gráficos */
  const hist = netWorthHistory(6);
  chart('chNet', {
    type: 'line',
    data: { labels: hist.map(h => shortMonth(h.ym)), datasets: [{ label: 'Patrimônio', data: hist.map(h => h.v), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.16)', fill: true, tension: .35, pointRadius: 3 }] },
    options: { plugins: { legend: { display: false }, tooltip: tipMoney, title: { display: true, text: 'Evolução do patrimônio (estimada)' } }, scales: { y: axisMoney } },
  });
  const withV = cats.filter(c => c.v > 0);
  chart('chCat', {
    type: 'doughnut',
    data: { labels: withV.map(c => c.name), datasets: [{ data: withV.map(c => c.v), backgroundColor: withV.map(c => c.color), borderWidth: 0 }] },
    options: { cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed)}` } } } },
  });
  const flow = []; for (let i = 5; i >= 0; i--) flow.push(monthStats(addMonthsYM(ym, -i)));
  chart('chFlow', {
    type: 'bar',
    data: {
      labels: flow.map(f => shortMonth(f.ym)),
      datasets: [
        { label: 'Entradas', data: flow.map(f => f.entradas), backgroundColor: '#34d399', borderRadius: 6 },
        { label: 'Saídas + Fatura', data: flow.map(f => f.saidas + f.faturaBruta), backgroundColor: '#fb7185', borderRadius: 6 },
        { label: 'Sobra', data: flow.map(f => f.sobraFatura), type: 'line', borderColor: '#818cf8', backgroundColor: '#818cf8', tension: .3 },
      ],
    },
    options: { plugins: { tooltip: tipMoney, legend: { position: 'bottom', labels: { boxWidth: 10 } } }, scales: { y: axisMoney } },
  });
}

/* ---------------------- LANÇAMENTOS ---------------------- */
function filteredTx() {
  const f = ui.f, q = norm(f.q);
  return S.transactions.filter(t =>
    (f.all || t.date.startsWith(ui.month)) && (!f.nature || t.nature === f.nature) && (!f.cat || t.category === f.cat) &&
    (!f.loc || t.origin === f.loc || t.dest === f.loc) && (!q || norm(t.desc).includes(q))
  ).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
function renderTx() {
  const el = $('#page-lancamentos'), f = ui.f;
  el.innerHTML = `
    <div class="toolbar">
      <input id="fSearch" class="input" style="min-width:200px" placeholder="🔎 Buscar descrição…" value="${esc(f.q)}">
      <select id="fNature" class="input"><option value="">Todas as naturezas</option>${Object.entries(NATURES).map(([k, n]) => `<option value="${k}" ${f.nature === k ? 'selected' : ''}>${n.label}</option>`).join('')}</select>
      <select id="fCat" class="input"><option value="">Todas as categorias</option>${S.categories.map(c => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <select id="fLoc" class="input">${locOptions(['acc', 'pot', 'asset'], f.loc, 'Todas as origens')}</select>
      <label class="check"><input type="checkbox" id="fAll" ${f.all ? 'checked' : ''}> Todos os meses</label>
      <span class="spacer"></span>
      <button class="btn ghost" data-act="importCsv">⬆ Importar CSV</button>
      <button class="btn ghost" data-act="exportCsv">⬇ Exportar CSV</button>
      <button class="btn primary" data-act="newTx">+ Novo lançamento</button>
    </div>
    <div class="kpi-grid" id="txSummary" style="margin-bottom:14px"></div>
    <div class="bulk-bar" id="bulkBar" hidden>
      <span id="bulkCount"></span>
      <button class="btn sm" data-act="bulkPay">✅ Marcar pagas</button>
      <button class="btn sm ghost" data-act="bulkUnpay">↩️ Marcar não pagas</button>
      <button class="btn sm ghost" data-act="bulkClear">Cancelar seleção</button>
    </div>
    <div class="card table-wrap">
      <table class="tbl">
        <thead><tr><th><input type="checkbox" id="selAll"></th><th>Data</th><th>Descrição</th><th>Natureza</th><th>Pagamento</th><th>Categoria</th><th>Origem</th><th style="text-align:right">Valor</th><th>Pago</th><th></th></tr></thead>
        <tbody id="txBody"></tbody>
      </table>
      <div id="txEmpty"></div>
    </div>`;
  const bind = (id, key, ev = 'input', isCheck = false) => $(id).addEventListener(ev, e => { f[key] = isCheck ? e.target.checked : e.target.value; renderTxTable(); });
  bind('#fSearch', 'q'); bind('#fNature', 'nature', 'change'); bind('#fCat', 'cat', 'change'); bind('#fLoc', 'loc', 'change'); bind('#fAll', 'all', 'change', true);
  renderTxTable();
}

const selected = new Set();
function renderTxTable() {
  const list = filteredTx();
  let inn = 0, out = 0;
  list.forEach(t => { const tone = NATURES[t.nature]?.tone; if (tone === 'pos') inn += +t.value; else if (tone === 'neg' || tone === 'warn') out += +t.value; });
  $('#txSummary').innerHTML =
    kpi('Lançamentos', String(list.length), { raw: true, tone: 'acc' }) +
    kpi('Entradas', inn, { tone: 'pos' }) + kpi('Saídas + Faturas', out, { tone: 'neg' }) + kpi('Resultado', inn - out, { tone: inn - out >= 0 ? 'pos' : 'neg', signed: true });
  $('#txBody').innerHTML = list.map(t => {
    const N = NATURES[t.nature] || { label: t.nature, tone: 'neutral' };
    const c = catById(t.category) || (NATURES[t.nature]?.cat ? { name: 'Sem categoria', color: '#94a3b8' } : null);
    const prefix = N.tone === 'pos' ? '+' : (N.tone === 'neg' || N.tone === 'warn') ? '−' : '';
    const isCredit = CREDIT.includes(t.nature);
    const realLine = (t.realValue != null && t.realValue !== t.value) ? `<div class="sm-t">👥 sua parte: ${fmt(t.realValue)}</div>` : '';
    return `<tr>
      <td>${isCredit ? `<input type="checkbox" class="rowSel" data-id="${t.id}" ${selected.has(t.id) ? 'checked' : ''}>` : ''}</td>
      <td>${fmtDate(t.date)}</td>
      <td>${esc(t.desc)}${t.date > todayISO() ? '<span class="sub">agendado / futuro</span>' : ''}</td>
      <td><span class="badge ${N.tone}">${esc(N.label)}</span></td>
      <td>${esc(t.payment || '—')}</td>
      <td>${c ? `<span class="cat-name"><i class="dot" style="--c:${esc(c.color)}"></i>${esc(c.name)}</span>` : '<span class="muted">—</span>'}</td>
      <td>${esc(locName(t.origin))}${t.dest ? ` <span class="muted">→</span> ${esc(locName(t.dest))}` : ''}</td>
      <td class="num ${N.tone === 'neutral' || N.tone === 'info' ? '' : N.tone === 'warn' ? 'warn' : N.tone}">${prefix}${money(t.value)}${realLine}</td>
      <td>${isCredit ? `<button class="row-btn" title="${t.paid ? 'Marcar como não paga' : 'Marcar como paga'}" data-act="togglePaid" data-id="${t.id}">${t.paid ? '✅' : '⬜'}</button>` : '—'}</td>
      <td class="act"><button class="row-btn" title="Editar" data-act="editTx" data-id="${t.id}">✏️</button><button class="row-btn" title="Excluir" data-act="delTx" data-id="${t.id}">🗑️</button></td>
    </tr>`;
  }).join('');
  $('#txEmpty').innerHTML = list.length ? '' : '<div class="empty">Nenhum lançamento neste filtro. Clique em <b>+ Novo lançamento</b> ou importe seu CSV.</div>';
  bindRowSelection();
  updateBulkBar();
}

function bindRowSelection() {
  $$('.rowSel').forEach(cb => cb.addEventListener('change', e => {
    const id = e.target.dataset.id;
    if (e.target.checked) selected.add(id); else selected.delete(id);
    updateBulkBar();
  }));

  const selAll = $('#selAll');
  if (selAll) {
    selAll.checked = false;
    selAll.addEventListener('change', e => {
      $$('.rowSel').forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
      });
      updateBulkBar();
    });
  }
}

function updateBulkBar() {
  const bar = $('#bulkBar'); if (!bar) return;
  bar.hidden = selected.size === 0;
  $('#bulkCount').textContent = `${selected.size} selecionada(s)`;
}

/* ----- Formulário de lançamento ----- */
function openTxModal(t) {
  const edit = !!(t && t.id);
  const isCur = ui.month === thisYM();
  const d = t || { date: isCur ? todayISO() : ui.month + '-01', desc: '', nature: 'saida', payment: 'Pix', category: '', origin: '', dest: '', value: '' };
  const natureOptions = Object.entries(NATURES).map(([k, n]) => {
    const hide = !edit && CREDIT.includes(k); // em criação, oculta fatura_mes/fatura_seg (é automático)
    return `<option value="${k}" ${k === d.nature ? 'selected' : ''} ${hide ? 'hidden' : ''}>${esc(n.label)}</option>`;
  }).join('');
  const body = `
    <div class="form-grid">
      ${fi('Data', 'date', d.date, { type: 'date', req: true })}
      ${fi('Valor (R$)', 'value', d.value === '' ? '' : numStr(d.value), { req: true, mode: 'decimal', ph: '0,00' })}
      ${fi('Descrição', 'desc', d.desc, { req: true, span: true, ph: 'Ex.: Supermercado, Salário, Netflix…' })}
      ${fs('Pagamento', 'payment', PAYMENTS.map(p => [p, p]), d.payment || 'Pix')}
      <label data-f="origin"><span class="lbl-o">Origem</span><select name="origin"></select></label>
      <label>Natureza<select name="nature">${natureOptions}</select></label>
      <label data-f="cat">Categoria<select name="category"></select></label>
      <label data-f="dest"><span class="lbl-d">Destino</span><select name="dest"></select></label>
      <div class="span2" data-f="real">${fi('Valor real (sua parte) — R$', 'realValue', d.realValue != null ? numStr(d.realValue) : '', { mode: 'decimal', ph: 'Deixe em branco se o valor é todo seu', hint: 'Preencha só se parte desta compra foi de outra pessoa (ex.: compra dividida). Usado apenas para corrigir seus relatórios de gasto — não afeta a fatura real.' })}</div>
      ${edit ? '' : `
      <div class="span2" data-f="inst"><div class="note">
        <div class="inline-fields">Parcelas: <input type="number" name="parcelas" min="2" max="60" value="2">
        <select name="parcMode"><option value="total">Valor informado é o TOTAL</option><option value="parcela">Valor informado é de CADA parcela</option></select></div>
        <div class="hint">As parcelas futuras entram automaticamente nas faturas dos próximos meses e no patrimônio líquido.</div>
      </div></div>
      <div class="span2" data-f="repeat"><div class="inline-fields">🔁 Repetir mensalmente por <input type="number" name="repeat" min="1" max="60" value="1"> vez(es) <span class="hint">(1 = não repete · use para salário, aluguel, assinaturas…)</span></div></div>`}
    </div>`;
  const form = openModal({
    title: edit ? 'Editar lançamento' : 'Novo lançamento', body, wide: true,
    onSubmit: (fd) => saveTx(fd, edit ? t : null),
  });
  const E = form.elements;
  const sync = (init) => {
    const nat = E.nature.value, N = NATURES[nat];
    const curO = init ? init.origin : E.origin.value, curD = init ? init.dest : E.dest.value, curC = init ? init.category : E.category.value;
    E.origin.innerHTML = locOptions(N.ot, curO);
    E.dest.innerHTML = locOptions(N.dt || [], curD, N.dOptional ? 'Mesmo cartão da conta' : 'Selecione…');
    E.category.innerHTML = '<option value="">Selecione…</option>' + S.categories.filter(c => c.kind !== 'invest').map(c => `<option value="${c.id}" ${c.id === curC ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    $('.lbl-o', form).textContent = N.o; $('.lbl-d', form).textContent = N.d || 'Destino';
    $('[data-f=cat]', form).hidden = !N.cat; $('[data-f=dest]', form).hidden = !N.d;
    const inst = $('[data-f=inst]', form), rep = $('[data-f=repeat]', form);
    if (inst) inst.hidden = !(E.payment.value === 'Parcelado' && N.credit);
    if (rep) rep.hidden = E.payment.value === 'Parcelado' && N.credit;
    const real = $('[data-f=real]', form);
    if (real) real.hidden = !N.credit;
  };

  const autoNature = () => {
    const nat = E.nature.value;
    if (!CREDIT.includes(nat)) return;
    const accId = E.origin.value, date = E.date.value;
    if (!accId || !date) return;
    const suggested = computeInvoiceNature(accId, date);
    if (suggested && suggested !== nat) {
      E.nature.value = suggested;
      sync();
      toast(`Natureza ajustada automaticamente para "${NATURES[suggested].label}" com base no fechamento da conta.`);
    }
  };
  E.nature.addEventListener('change', () => {
    const nat = E.nature.value, pay = E.payment.value;
    if (NATURES[nat].credit && !['Crédito', 'Parcelado'].includes(pay)) E.payment.value = 'Crédito';
    if (nat === 'saida' && ['Crédito', 'Parcelado'].includes(pay)) E.payment.value = 'Pix';
    if (nat === 'transferencia' && !['Pix', 'TED', 'Dinheiro'].includes(pay)) E.payment.value = 'Pix';
    sync();
  });
  E.origin.addEventListener('change', autoNature);
  E.date.addEventListener('change', autoNature);
  E.payment.addEventListener('change', () => {
    const pay = E.payment.value, nat = E.nature.value;
    if (['Crédito', 'Parcelado'].includes(pay) && nat === 'saida') E.nature.value = 'fatura_mes';
    if (!['Crédito', 'Parcelado'].includes(pay) && CREDIT.includes(nat)) E.nature.value = 'saida';
    sync();
    autoNature();
  });
  sync(d);
}

function saveTx(fd, editing) {
  const nature = fd.get('nature'), N = NATURES[nature];
  const value = parseBR(fd.get('value'));
  if (!(value > 0)) { toast('Informe um valor maior que zero.', true); return false; }
  const date = fd.get('date'); if (!date) { toast('Informe a data.', true); return false; }
  const origin = fd.get('origin'); if (!origin) { toast('Selecione a origem (' + N.o + ').', true); return false; }
  const dest = N.d ? (fd.get('dest') || '') : '';
  if (N.d && !N.dOptional && !dest) { toast('Selecione o destino (' + N.d + ').', true); return false; }
  if (dest && dest === origin && nature !== 'pag_fatura') { toast('Origem e destino não podem ser iguais.', true); return false; }
  const category = nature === 'aporte' ? investCatId() : (N.cat ? fd.get('category') : '');
  if (N.cat && !category) { toast('Selecione a categoria.', true); return false; }

  let realValue = null;
  if (N.credit) {
    const rawReal = (fd.get('realValue') || '').trim();
    if (rawReal) {
      const rv = parseBR(rawReal);
      if (isNaN(rv) || rv < 0) { toast('O valor real não pode ser negativo.', true); return false; }
      if (rv > value) { toast('O valor real não pode ser maior que o valor total.', true); return false; }
      realValue = rv;
    }
  }

  const base = { date, desc: (fd.get('desc') || '').trim(), nature, payment: fd.get('payment'), category, origin, dest };
  if (editing) {
    Object.assign(editing, base, { value, realValue });
    toast('Lançamento atualizado.');
  } else {
    const parcelado = base.payment === 'Parcelado' && N.credit;
    const n = parcelado ? Math.max(2, Math.min(60, +fd.get('parcelas') || 2)) : 1;
    const rep = !parcelado ? Math.max(1, Math.min(60, +fd.get('repeat') || 1)) : 1;
    const count = Math.max(n, rep), grp = count > 1 ? uid() : undefined;
    let part = value, first = value;
    let realPart = realValue, realFirst = realValue;
    if (parcelado && fd.get('parcMode') === 'total') {
      part = Math.floor(value / n * 100) / 100;
      first = Math.round((value - part * (n - 1)) * 100) / 100;
      if (realValue != null) {
        realPart = Math.floor(realValue / n * 100) / 100;
        realFirst = Math.round((realValue - realPart * (n - 1)) * 100) / 100;
      }
    }
    for (let i = 0; i < count; i++) {
      S.transactions.push({
        ...base, id: uid(), date: addMonthsISO(date, i), value: i === 0 ? first : part,
        realValue: parcelado ? (i === 0 ? realFirst : realPart) : realValue,
        grp,
        desc: parcelado ? `${base.desc} (${i + 1}/${n})` : base.desc,
      });
    }
    toast(count > 1 ? `${count} lançamentos criados.` : 'Lançamento adicionado.');
  }
  commit();
}

function deleteTx(id) {
  const t = S.transactions.find(x => x.id === id); if (!t) return;
  const series = t.grp ? S.transactions.filter(x => x.grp === t.grp) : [];
  if (series.length > 1) {
    openModal({
      title: 'Excluir lançamento', noSubmit: true,
      body: `<p>Este lançamento faz parte de uma série (${series.length} lançamentos: parcelas ou recorrência).</p>`,
      extraActions: `<button type="button" class="btn danger" id="delAll">Excluir toda a série</button><button type="button" class="btn danger" id="delOne">Só este</button>`,
    });
    $('#delOne').onclick = () => { S.transactions = S.transactions.filter(x => x.id !== id); closeModal(); commit(); toast('Lançamento excluído.'); };
    $('#delAll').onclick = () => { S.transactions = S.transactions.filter(x => x.grp !== t.grp); closeModal(); commit(); toast('Série excluída.'); };
  } else confirmBox(`Excluir "${t.desc}" (${fmt(t.value)})?`, () => { S.transactions = S.transactions.filter(x => x.id !== id); commit(); toast('Lançamento excluído.'); });
}

function togglePaid(id) {
  const t = S.transactions.find(x => x.id === id); if (!t) return;
  t.paid = !t.paid;
  commit();
  toast(t.paid ? 'Marcada como paga.' : 'Marcada como não paga.');
}
function markManyPaid(ids, paid) {
  if (!ids.length) return;
  ids.forEach(id => { const t = S.transactions.find(x => x.id === id); if (t) t.paid = paid; });
  commit();
  toast(`${ids.length} lançamento(s) marcado(s) como ${paid ? 'pago' : 'não pago'}.`);
}

/* ---------------------- CONTAS ---------------------- */
function renderContas() {
  const C = cache.C, ym = ui.month, el = $('#page-contas'), flows = {};
  S.transactions.filter(t => t.date.startsWith(ym)).forEach(t => deltas(t).forEach(([id, d]) => {
    if (!id) return; const f = flows[id] || (flows[id] = { in: 0, out: 0 }); d >= 0 ? f.in += d : f.out += -d;
  }));
  const cardsOpen = S.accounts.reduce((s, a) => s + Math.max(0, C.debt[a.id] || 0), 0);
  el.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Saldo total em contas', C.accSum, { tone: 'acc', signed: true })}
      ${kpi('Faturas em aberto (todos os cartões)', cardsOpen, { tone: 'warn', sub: 'Compras no cartão ainda não pagas' })}
      ${kpi('Saldo livre após faturas', C.accSum - cardsOpen, { tone: 'pos', signed: true })}
    </div>
    <div class="block-head"><h2>Suas contas</h2><span class="sub">Fluxo de ${monthLabel(ym)}</span><button class="btn primary spacer" data-act="newAcc">+ Nova conta</button></div>
    <div class="grid auto-lg">

      ${S.accounts.map(a => {
        const f = flows[a.id] || { in: 0, out: 0 }, debt = Math.max(0, C.debt[a.id] || 0);
        const due = a.dueDay ? computeDueDate(a.id) : null;
        return `<div class="card entity">
          <div class="entity-head">${logoEl(a)}<div><h3>${esc(a.name)}</h3><span class="muted" style="font-size:12px">${a.kind === 'beneficio' ? 'Benefício (Flash)' : 'Conta / Cartão'}</span></div></div>
          <div class="val">${money(C.bal[a.id] || 0, sgn(C.bal[a.id]) === 'neg' ? 'neg' : '')}</div>
          <div class="row"><span>Entrou no mês</span><b class="pos">${money(f.in)}</b></div>
          <div class="row"><span>Saiu no mês</span><b class="neg">${money(f.out)}</b></div>
          <div class="row"><span>Fatura do cartão em aberto</span><b class="${debt > 0 ? 'warn' : ''}">${money(debt)}</b></div>
          ${due ? `<div class="row"><span>Vencimento deste mês</span><b>${fmtDate(due)}</b></div>` : ''}
          <div class="actions">
            <button class="btn sm" data-act="adjAcc" data-id="${a.id}">Conferir saldo</button>
            <button class="btn sm ghost" data-act="editAcc" data-id="${a.id}">Editar</button>
            <button class="btn sm danger" data-act="delAcc" data-id="${a.id}">Excluir</button>
          </div>
        </div>`;
      }).join('')}

    </div>
    <div class="note" style="margin-top:18px">💡 <b>Dica:</b> use <b>Conferir saldo</b> para igualar o saldo do app ao saldo real do banco. Para abater a fatura do cartão, lance um <b>Pagamento de Fatura</b>.</div>`;
}

function accountForm(a) {
  const edit = !!a;
  openModal({
    title: edit ? 'Editar conta' : 'Nova conta',
    body: `<div class="form-grid">
      ${fi('Nome', 'name', a?.name || '', { req: true, span: true })}
      ${fs('Tipo', 'kind', [['conta', 'Conta bancária / cartão'], ['beneficio', 'Benefício (Flash, VR, VA)']], a?.kind || 'conta')}
      ${fi('Cor', 'color', a?.color || '#6366f1', { type: 'color' })}
      ${fi('Caminho da logo', 'logo', a?.logo || '', { span: true, ph: 'assets/logos/meubanco.png', hint: 'Coloque a imagem na pasta do projeto (VS Code) e informe o caminho. Opcional.' })}
      ${fi('Dia de fechamento da fatura', 'closingDay', a?.closingDay ?? '', { type: 'number', min: 1, max: 31, ph: 'Ex.: 11', hint: 'Só para cartões. Compras a partir deste dia (inclusive) caem na fatura seguinte. Deixe em branco se não for cartão.' })}
      ${fi('Dia de vencimento da fatura', 'dueDay', a?.dueDay ?? '', { type: 'number', min: 1, max: 31, ph: 'Ex.: 18', hint: 'Usado só para exibir a data de vencimento (ajustada para o próximo dia útil).' })}
      ${edit ? '' : fi('Saldo atual (R$)', 'initial', '0', { mode: 'decimal', span: true })}
    </div>`,
    onSubmit: fd => {
      const name = fd.get('name').trim(); if (!name) return false;
      const closingRaw = fd.get('closingDay'), dueRaw = fd.get('dueDay');
      const closingDay = closingRaw ? Math.max(1, Math.min(31, parseInt(closingRaw, 10))) : null;
      const dueDay = dueRaw ? Math.max(1, Math.min(31, parseInt(dueRaw, 10))) : null;
      const o = { name, kind: fd.get('kind'), color: fd.get('color'), logo: fd.get('logo').trim(), closingDay, dueDay };
      if (edit) Object.assign(a, o); else S.accounts.push({ id: 'acc_' + uid(), ...o, initial: parseBR(fd.get('initial')) || 0 });
      commit();
    },
  });
}

function adjustBalance(item, label) {
  const cur = cache.C.bal[item.id] || 0;
  openModal({
    title: `Conferir saldo — ${item.name}`,
    body: `<div class="form-grid">${fi('Saldo real agora (R$)', 'v', numStr(cur), { mode: 'decimal', req: true, span: true })}</div><p class="hint" style="margin-top:10px">Saldo calculado pelo app: <b>${fmt(cur)}</b>. O app ajusta o saldo inicial para bater com o valor informado, sem criar lançamentos.</p>`,
    onSubmit: fd => {
      const v = parseBR(fd.get('v')); if (isNaN(v)) return false;
      item.initial = (+item.initial || 0) + (v - cur); commit(); toast('Saldo ajustado.');
    },
  });
}
function usageCount(id) { return S.transactions.filter(t => t.origin === id || t.dest === id).length; }
function deleteEntity(arrKey, id, noun) {
  const n = usageCount(id);
  if (n > 0) { toast(`Há ${n} lançamentos vinculados a este item. Edite ou exclua os lançamentos antes.`, true); return; }
  confirmBox(`Excluir ${noun}?`, () => { S[arrKey] = S[arrKey].filter(x => x.id !== id); commit(); });
}

/* ---------------------- INVESTIMENTOS ---------------------- */
function renderInvest() {
  const C = cache.C, el = $('#page-investimentos'), ym = ui.month;
  const totalAp = S.assets.reduce((s, a) => s + (C.applied[a.id] || 0), 0), pl = C.assetSum - totalAp, plPct = totalAp > 0 ? pl / totalAp * 100 : 0;
  const M = monthStats(thisYM());
  el.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Valor investido (aplicado)', totalAp, { tone: 'info' })}
      ${kpi('Valor atual', C.assetSum, { tone: 'acc' })}
      ${kpi('Resultado', pl, { tone: pl >= 0 ? 'pos' : 'neg', signed: true, sub: fmtPct(plPct) + ' sobre o aplicado' })}
      ${kpi('Aportes no mês atual', M.aportes, { tone: 'info' })}
      ${kpi('Rendimentos no mês atual', M.rend, { tone: 'pos' })}
    </div>
    <div class="toolbar">
      <button class="btn primary" data-act="newAsset">+ Novo ativo</button>
      <button class="btn" data-act="quotes">🔄 Atualizar cotações online</button>
      <span class="muted" style="font-size:12.5px">Cotações automáticas: informe <b>ticker</b> e <b>quantidade</b> no ativo. Tesouro e outros: atualize o valor manualmente.</span>
    </div>
    <div class="split2">
      <div class="card table-wrap">
        <table class="tbl" style="min-width:680px">
          <thead><tr><th>Ativo</th><th>Classe</th><th style="text-align:right">Aplicado</th><th style="text-align:right">Atual</th><th style="text-align:right">Resultado</th><th style="text-align:right">% Cart.</th><th></th></tr></thead>
          <tbody>
          ${S.assets.map(a => {
            const cur = C.bal[a.id] || 0, ap = C.applied[a.id] || 0, p = cur - ap, pc = ap > 0 ? p / ap * 100 : 0, share = C.assetSum > 0 ? cur / C.assetSum * 100 : 0;
            return `<tr>
              <td><div class="cat-name">${logoEl(a, 'sm')}<span><b>${esc(a.name)}</b>${a.ticker ? `<span class="sub">${esc(a.ticker)}${+a.qty > 0 ? ' · ' + a.qty + ' un.' : ''}${a.lastPrice ? ' · cotação ' + fmt(a.lastPrice) : ''}</span>` : ''}</span></div></td>
              <td>${ASSET_CLASSES[a.cls] || a.cls}</td>
              <td class="num">${money(ap)}</td><td class="num">${money(cur)}</td>
              <td class="num ${ap > 0 ? sgn(p) : ''}">${ap > 0 ? money(p) + `<span class="sub">${fmtPct(pc)}</span>` : '—'}</td>
              <td class="num">${fmtPct(share)}</td>
              <td class="act"><button class="row-btn" title="Atualizar valor" data-act="valAsset" data-id="${a.id}">💲</button><button class="row-btn" title="Editar" data-act="editAsset" data-id="${a.id}">✏️</button><button class="row-btn" title="Excluir" data-act="delAsset" data-id="${a.id}">🗑️</button></td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
        ${S.assets.length ? '' : '<div class="empty">Nenhum ativo cadastrado.</div>'}
      </div>
      <div class="card"><div class="block-head"><h2>Alocação</h2></div><div class="chart-box" style="height:300px"><canvas id="chAlloc"></canvas></div></div>
    </div>
    <div class="note" style="margin-top:16px">💡 Para registrar um <b>aporte</b>, use <b>+ Lançamento → Aporte em Investimento</b> (sai de uma conta, vai para o ativo). <b>Rendimentos</b> também são lançamentos (natureza "Rendimento"). Se o preço de mercado mudar, use 💲 para atualizar o valor atual.</div>`;
  const items = S.assets.filter(a => (C.bal[a.id] || 0) > 0);
  chart('chAlloc', {
    type: 'doughnut',
    data: { labels: items.map(a => a.name), datasets: [{ data: items.map(a => C.bal[a.id]), backgroundColor: items.map(a => a.color), borderWidth: 0 }] },
    options: { cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed)}` } } } },
  });
}
function setAssetValue(a, v) { refreshCache(); a.adjust = (+a.adjust || 0) + (v - (cache.C.bal[a.id] || 0)); }
function assetForm(a) {
  const edit = !!a, C = cache.C;
  openModal({
    title: edit ? 'Editar ativo' : 'Novo ativo',
    body: `<div class="form-grid">
      ${fi('Nome', 'name', a?.name || '', { req: true })}
      ${fi('Ticker (opcional)', 'ticker', a?.ticker || '', { ph: 'PETR4, BTC…' })}
      ${fs('Classe', 'cls', Object.entries(ASSET_CLASSES), a?.cls || 'acao')}
      ${fi('Quantidade (opcional)', 'qty', a?.qty ? String(a.qty).replace('.', ',') : '', { mode: 'decimal', ph: 'p/ cotação automática' })}
      ${fi('Valor aplicado (R$)', 'applied', numStr(edit ? (C.applied[a.id] || 0) : 0), { mode: 'decimal', hint: 'Quanto você já colocou neste ativo' })}
      ${fi('Valor atual (R$)', 'cur', numStr(edit ? (C.bal[a.id] || 0) : 0), { mode: 'decimal', hint: 'Quanto vale hoje' })}
      ${fi('Cor', 'color', a?.color || '#6366f1', { type: 'color' })}
      ${fi('Caminho da logo', 'logo', a?.logo || '', { ph: 'assets/logos/petr4.png' })}
    </div>`,
    onSubmit: fd => {
      const name = fd.get('name').trim(); if (!name) return false;
      const qty = parseBR(fd.get('qty')) || 0, applied = parseBR(fd.get('applied')) || 0, cur = parseBR(fd.get('cur')) || 0;
      const o = { name, ticker: fd.get('ticker').trim().toUpperCase(), cls: fd.get('cls'), qty, color: fd.get('color'), logo: fd.get('logo').trim() };
      if (edit) {
        Object.assign(a, o);
        a.initialApplied = (+a.initialApplied || 0) + (applied - (C.applied[a.id] || 0));
        setAssetValue(a, cur);
      } else {
        const n = { id: 'ast_' + uid(), ...o, initialApplied: applied, initialValue: 0, adjust: 0 };
        S.assets.push(n); setAssetValue(n, cur);
      }
      commit();
    },
  });
}
function valueAssetForm(a) {
  openModal({
    title: `Atualizar valor — ${a.name}`,
    body: `<div class="form-grid">
      ${fi('Valor atual total (R$)', 'v', numStr(cache.C.bal[a.id] || 0), { mode: 'decimal', req: true, span: true })}
      ${+a.qty > 0 ? `<p class="hint span2">Quantidade cadastrada: ${a.qty}. Preço unitário = valor ÷ quantidade.</p>` : ''}
    </div>`,
    onSubmit: fd => { const v = parseBR(fd.get('v')); if (isNaN(v)) return false; setAssetValue(a, v); commit(); toast('Valor atualizado.'); },
  });
}
async function refreshQuotes() {
  const list = S.assets.filter(a => a.ticker && +a.qty > 0);
  if (!list.length) { toast('Informe ticker e quantidade nos ativos (✏️) para atualizar cotações.', true); return; }
  toast('Buscando cotações…');
  let ok = 0; const fail = [];
  refreshCache();
  await Promise.all(list.map(async a => {
    try {
      let price;
      if (a.cls === 'cripto') {
        const id = a.ticker.toUpperCase() === 'BTC' ? 'bitcoin' : a.ticker.toLowerCase();
        const j = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=brl`)).json();
        price = j[id]?.brl;
      } else {
        const tk = S.settings.brapiToken ? `?token=${encodeURIComponent(S.settings.brapiToken)}` : '';
        const j = await (await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(a.ticker)}${tk}`)).json();
        price = j.results?.[0]?.regularMarketPrice;
      }
      if (!price) throw new Error('sem preço');
      a.lastPrice = price; a._d = price * a.qty; ok++;
    } catch (e) { fail.push(a.ticker); }
  }));
  list.forEach(a => { if (a._d != null) { a.adjust = (+a.adjust || 0) + (a._d - (cache.C.bal[a.id] || 0)); delete a._d; } });
  commit();
  toast(`${ok} cotação(ões) atualizada(s).${fail.length ? ' Falhou: ' + fail.join(', ') + ' (algumas ações exigem token da brapi.dev — veja Configurações).' : ''}`, fail.length > 0 && ok === 0);
}

/* ---------------------- METAS & COFRINHOS ---------------------- */
function renderMetas() {
  const C = cache.C, el = $('#page-metas'), M = monthStats(thisYM()), goal = +S.settings.goalPct || 0;
  const totalGoal = S.pots.reduce((s, p) => s + (+p.goal || 0), 0);
  el.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:22px">
      ${kpi('Total nos cofrinhos', C.potSum, { tone: 'acc' })}
      ${kpi('Soma das metas', totalGoal, { tone: 'info', sub: totalGoal > 0 ? fmtPct(C.potSum / totalGoal * 100, 0) + ' concluído' : 'Defina metas nos cofrinhos' })}
      ${kpi('Meta de sobra mensal', fmtPct(goal, 0), { raw: true, tone: 'warn', sub: 'Defina em Configurações' })}
      ${kpi('Sobra do mês atual', fmtPct(M.sobraPct), { raw: true, tone: M.sobraPct >= goal ? 'pos' : 'neg', cls: sgn(M.sobraPct), sub: 'Sobra da fatura ÷ entradas' })}
    </div>
    <div class="block-head"><h2>Cofrinhos</h2><button class="btn primary spacer" data-act="newPot">+ Novo cofrinho</button></div>
    <div class="grid auto-lg">
      ${S.pots.map(p => {
        const v = C.bal[p.id] || 0, pct = p.goal > 0 ? Math.min(100, v / p.goal * 100) : 0, left = Math.max(0, (p.goal || 0) - v);
        let extra = '';
        if (p.goal > 0 && left > 0 && p.deadline) {
          const m = Math.max(1, monthsBetween(thisYM(), p.deadline.slice(0, 7)));
          extra = `<div class="row"><span>Prazo ${fmtDate(p.deadline)}</span><b>${money(left / m)}/mês</b></div>`;
        }
        return `<div class="card entity">
          <div class="entity-head">${logoEl(p)}<div><h3>${esc(p.name)}</h3><span class="muted" style="font-size:12px">Cofrinho</span></div></div>
          <div class="val">${money(v)}</div>
          ${p.goal > 0 ? `<div class="progress" style="--bar:${esc(p.color)}"><span style="width:${pct}%"></span></div>
            <div class="row"><span>${fmtPct(pct, 0)} de ${money(p.goal)}</span><b>${left > 0 ? 'Faltam ' + money(left) : '🎉 Meta atingida!'}</b></div>${extra}` : '<div class="row"><span>Sem meta definida — clique em editar</span></div>'}
          <div class="actions">
            <button class="btn sm primary" data-act="depPot" data-id="${p.id}">+ Depositar</button>
            <button class="btn sm" data-act="wdPot" data-id="${p.id}">Resgatar</button>
            <button class="btn sm ghost" data-act="adjPot" data-id="${p.id}">Conferir</button>
            <button class="btn sm ghost" data-act="editPot" data-id="${p.id}">Editar</button>
            <button class="btn sm danger" data-act="delPot" data-id="${p.id}">Excluir</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}
function potForm(p) {
  const edit = !!p;
  openModal({
    title: edit ? 'Editar cofrinho' : 'Novo cofrinho',
    body: `<div class="form-grid">
      ${fi('Nome', 'name', p?.name || '', { req: true })}
      ${fi('Ícone (emoji)', 'icon', p?.icon || '🐷')}
      ${fi('Meta (R$)', 'goal', numStr(p?.goal || 0), { mode: 'decimal' })}
      ${fi('Prazo da meta (opcional)', 'deadline', p?.deadline || '', { type: 'date' })}
      ${fi('Cor', 'color', p?.color || '#10b981', { type: 'color' })}
      ${edit ? '' : fi('Saldo atual (R$)', 'initial', '0', { mode: 'decimal' })}
    </div>`,
    onSubmit: fd => {
      const name = fd.get('name').trim(); if (!name) return false;
      const o = { name, icon: fd.get('icon').trim() || '🐷', goal: parseBR(fd.get('goal')) || 0, deadline: fd.get('deadline') || null, color: fd.get('color') };
      if (edit) Object.assign(p, o); else S.pots.push({ id: 'pot_' + uid(), ...o, initial: parseBR(fd.get('initial')) || 0 });
      commit();
    },
  });
}
function potMove(p, deposit) {
  const bal = cache.C.bal[p.id] || 0;
  openModal({
    title: deposit ? `Depositar em ${p.name}` : `Resgatar de ${p.name}`,
    body: `<div class="form-grid">
      ${fi('Valor (R$)', 'v', '', { mode: 'decimal', req: true })}
      ${fi('Data', 'date', todayISO(), { type: 'date', req: true })}
      <label class="span2">${deposit ? 'Sai da conta' : 'Cai na conta'}<select name="acc">${locOptions(['acc'], '')}</select></label>
      ${deposit ? '' : `<p class="hint span2">Disponível no cofrinho: ${fmt(bal)}</p>`}
    </div>`,
    onSubmit: fd => {
      const v = parseBR(fd.get('v')), acc = fd.get('acc');
      if (!(v > 0) || !acc) { toast('Informe valor e conta.', true); return false; }
      S.transactions.push({ id: uid(), date: fd.get('date'), desc: (deposit ? 'Depósito no cofrinho ' : 'Resgate do cofrinho ') + p.name, nature: 'transferencia', payment: 'Pix', category: '', origin: deposit ? acc : p.id, dest: deposit ? p.id : acc, value: v });
      commit(); toast(deposit ? 'Depósito registrado.' : 'Resgate registrado.');
    },
  });
}

/* ---------------------- PATRIMÔNIO ---------------------- */
function renderPatrimonio() {
  const C = cache.C, el = $('#page-patrimonio');
  /* faturas futuras por mês */
  const inv = {};
  S.transactions.forEach(t => {
    if (!CREDIT.includes(t.nature)) return;
    const m = t.nature === 'fatura_seg' ? addMonthsYM(t.date.slice(0, 7), 1) : t.date.slice(0, 7);
    if (m >= thisYM()) inv[m] = (inv[m] || 0) + (+t.value || 0);
  });
  const invMonths = Object.keys(inv).sort();
  const classes = ['acao', 'tesouro', 'cripto', 'outro'].map(c => [ASSET_CLASSES[c], classValue(c)]).filter(x => x[1] > 0);
  const row = (label, v, o = {}) => `<tr><td>${o.indent ? '&nbsp;&nbsp;&nbsp;↳ ' : ''}${label}</td><td class="num ${o.cls || sgn(v)}">${o.minus ? '−' : ''}${money(v)}</td></tr>`;
  el.innerHTML = `
    <div class="hero">
      <div>
        <small>PATRIMÔNIO LÍQUIDO TOTAL</small>
        <div class="big">${money(C.total, sgn(C.total))}</div>
        <div class="pills"><span class="pill">Ativos <b>${money(C.gross)}</b></span><span class="pill">Passivos <b>${money(C.debtTotalReal + C.scheduled + C.commitments)}</b></span></div>
        <p class="muted" style="margin-top:14px;font-size:12.5px">Saldos de contas + cofrinhos + investimentos + a receber de terceiros − sua parte real das faturas de cartão (inclusive parcelas futuras) − lançamentos agendados − compromissos futuros (IPVA etc.).</p>
      </div>
      <div class="chart-box"><canvas id="chNet2"></canvas></div>
    </div>
    <div class="split2" style="margin-bottom:26px">
      <div class="card table-wrap">
        <table class="tbl" style="min-width:0"><thead><tr><th>Composição</th><th style="text-align:right">Valor</th></tr></thead><tbody>
          ${row('<b>Saldo em contas</b>', C.accSum, { cls: '' })}
          ${S.accounts.map(a => row(esc(a.name), C.bal[a.id] || 0, { indent: 1, cls: '' })).join('')}
          ${row('<b>Cofrinhos</b>', C.potSum, { cls: '' })}
          ${S.pots.map(p => row(esc(p.name), C.bal[p.id] || 0, { indent: 1, cls: '' })).join('')}
          ${row('<b>Investimentos</b>', C.assetSum, { cls: '' })}
          ${classes.map(c => row(c[0], c[1], { indent: 1, cls: '' })).join('')}
          ${C.receivablesTotal > 0 ? row('<b>A Receber de Terceiros</b>', C.receivablesTotal, { cls: '' }) : ''}
          ${row('<b>= Total de ativos</b>', C.gross, { cls: 'pos' })}
          ${row('<b>(−) Sua parte real das faturas de cartão e parcelas futuras</b>', C.debtTotalReal, { minus: 1, cls: 'neg' })}
          ${S.accounts.filter(a => (C.debt[a.id] || 0) > 0).map(a => row('Cartão ' + esc(a.name) + ' (bruto: ' + fmt(C.debt[a.id]) + ')', Math.max(0, C.debtReal[a.id] || 0), { indent: 1, minus: 1, cls: 'neg' })).join('')}
          ${row('<b>(−) Saídas agendadas (datas futuras)</b>', C.scheduled, { minus: 1, cls: 'neg' })}
          ${row('<b>(−) Compromissos futuros</b>', C.commitments, { minus: 1, cls: 'neg' })}
          <tr><td><b>= PATRIMÔNIO LÍQUIDO</b></td><td class="num ${sgn(C.total)}" style="font-size:16px">${money(C.total)}</td></tr>
        </tbody></table>
      </div>
      <div class="card"><div class="block-head"><h2>Onde está seu patrimônio</h2></div><div class="chart-box" style="height:300px"><canvas id="chComp"></canvas></div></div>
    </div>

    <section class="block">
      <div class="block-head"><h2>A Receber de Terceiros</h2><span class="sub">Valores pendentes somam no patrimônio como ativo</span><button class="btn primary spacer" data-act="newReceivable">+ Novo "a receber"</button></div>
      <div class="card table-wrap">
        <table class="tbl" style="min-width:560px"><thead><tr><th>Pessoa</th><th>Descrição</th><th>Data</th><th>Status</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
          ${S.receivables.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(r => `<tr>
            <td>${esc(r.person)}</td><td>${esc(r.desc || '—')}</td><td>${r.date ? fmtDate(r.date) : '—'}</td>
            <td><span class="badge ${r.received ? 'pos' : 'warn'}">${r.received ? 'Recebido' : 'Pendente'}</span></td>
            <td class="num">${money(r.value)}</td>
            <td class="act">${r.received ? '' : `<button class="row-btn" title="Marcar como recebido" data-act="markReceived" data-id="${r.id}">✅</button>`}<button class="row-btn" title="Editar" data-act="editReceivable" data-id="${r.id}">✏️</button><button class="row-btn" title="Excluir" data-act="delReceivable" data-id="${r.id}">🗑️</button></td>
          </tr>`).join('')}
        </tbody></table>
        ${S.receivables.length ? '' : '<div class="empty">Nenhum valor a receber cadastrado. Use para controlar compras parceladas que você pagou mas são de outra pessoa.</div>'}
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>Compromissos futuros</h2><span class="sub">Despesas que ainda não estão em fatura (IPVA, seguro, IPTU…)</span><button class="btn primary spacer" data-act="newCommit">+ Novo compromisso</button></div>
      <div class="card table-wrap">
        <table class="tbl" style="min-width:560px"><thead><tr><th>Descrição</th><th>Vencimento</th><th>Status</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
          ${S.commitments.slice().sort((a, b) => (a.due || '').localeCompare(b.due || '')).map(c => `<tr>
            <td>${esc(c.desc)}</td><td>${c.due ? fmtDate(c.due) : '—'}</td>
            <td><span class="badge ${c.paid ? 'pos' : 'warn'}">${c.paid ? 'Pago' : 'Em aberto'}</span></td>
            <td class="num">${money(c.value)}</td>
            <td class="act"><button class="row-btn" title="${c.paid ? 'Reabrir' : 'Marcar como pago'}" data-act="payCommit" data-id="${c.id}">${c.paid ? '↩️' : '✅'}</button><button class="row-btn" title="Editar" data-act="editCommit" data-id="${c.id}">✏️</button><button class="row-btn" title="Excluir" data-act="delCommit" data-id="${c.id}">🗑️</button></td>
          </tr>`).join('')}
        </tbody></table>
        ${S.commitments.length ? '' : '<div class="empty">Nenhum compromisso. Adicione o IPVA do ano que vem, por exemplo, para já descontar do patrimônio.</div>'}
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>Faturas previstas por mês</h2><span class="sub">Compras no cartão + parcelas futuras (a fatura seguinte conta no mês seguinte)</span></div>
      <div class="card">${invMonths.length ? `<div class="chart-box sm"><canvas id="chInv"></canvas></div>` : '<div class="empty">Sem faturas futuras lançadas.</div>'}</div>
    </section>`;

  const hist = netWorthHistory(12);
  chart('chNet2', {
    type: 'line',
    data: { labels: hist.map(h => shortMonth(h.ym)), datasets: [{ label: 'Patrimônio', data: hist.map(h => h.v), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.16)', fill: true, tension: .35, pointRadius: 3 }] },
    options: { plugins: { legend: { display: false }, tooltip: tipMoney, title: { display: true, text: 'Evolução (12 meses, estimada pelos lançamentos)' } }, scales: { y: axisMoney } },
  });
  const comp = [['Contas', C.accSum, '#60a5fa'], ['Cofrinhos', C.potSum, '#34d399'], ...['acao', 'tesouro', 'cripto', 'outro'].map((c, i) => [ASSET_CLASSES[c], classValue(c), ['#a78bfa', '#38bdf8', '#fbbf24', '#94a3b8'][i]])].filter(x => x[1] > 0);
  if (C.receivablesTotal > 0) comp.push(['A Receber', C.receivablesTotal, '#f43f5e']);
  chart('chComp', {
    type: 'doughnut',
    data: { labels: comp.map(c => c[0]), datasets: [{ data: comp.map(c => c[1]), backgroundColor: comp.map(c => c[2]), borderWidth: 0 }] },
    options: { cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed)}` } } } },
  });
  if (invMonths.length) chart('chInv', {
    type: 'bar',
    data: { labels: invMonths.map(shortMonth), datasets: [{ label: 'Fatura prevista', data: invMonths.map(m => inv[m]), backgroundColor: '#fbbf24', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false }, tooltip: tipMoney }, scales: { y: axisMoney } },
  });
}

function commitForm(c) {
  const edit = !!c;
  openModal({
    title: edit ? 'Editar compromisso' : 'Novo compromisso futuro',
    body: `<div class="form-grid">
      ${fi('Descrição', 'desc', c?.desc || '', { req: true, span: true, ph: 'IPVA do carro 2027' })}
      ${fi('Valor (R$)', 'value', c ? numStr(c.value) : '', { req: true, mode: 'decimal' })}
      ${fi('Vencimento', 'due', c?.due || '', { type: 'date' })}
    </div>`,
    onSubmit: fd => {
      const v = parseBR(fd.get('value')); if (!(v > 0)) { toast('Informe um valor.', true); return false; }
      const o = { desc: fd.get('desc').trim(), value: v, due: fd.get('due') };
      if (edit) Object.assign(c, o); else S.commitments.push({ id: uid(), paid: false, ...o });
      commit();
    },
  });
}

function receivableForm(r) {
  const edit = !!r;
  openModal({
    title: edit ? 'Editar "a receber"' : 'Novo "a receber"',
    body: `<div class="form-grid">
      ${fi('Pessoa', 'person', r?.person || '', { req: true, ph: 'Ex.: Pai, Maria, João…' })}
      ${fi('Descrição (opcional)', 'desc', r?.desc || '', { span: true, ph: 'Ex.: Metade do notebook' })}
      ${fi('Valor (R$)', 'value', r ? numStr(r.value) : '', { req: true, mode: 'decimal' })}
      ${fi('Data', 'date', r?.date || todayISO(), { type: 'date', req: true })}
    </div>`,
    onSubmit: fd => {
      const person = fd.get('person').trim(); if (!person) { toast('Informe a pessoa.', true); return false; }
      const v = parseBR(fd.get('value')); if (!(v > 0)) { toast('Informe um valor maior que zero.', true); return false; }
      const date = fd.get('date'); if (!date) { toast('Informe a data.', true); return false; }
      const o = { person, desc: fd.get('desc').trim(), value: v, date };
      if (edit) Object.assign(r, o);
      else S.receivables.push({ id: uid(), received: false, receivedDate: null, ...o });
      commit();
    },
  });
}

function markReceived(r) {
  if (!r) return;
  openModal({
    title: `Marcar como recebido — ${r.person}`,
    body: `<div class="form-grid">
      ${fi('Valor recebido (R$)', 'value', numStr(r.value), { mode: 'decimal', req: true })}
      ${fi('Data do recebimento', 'date', todayISO(), { type: 'date', req: true })}
      <label class="span2">Entra na conta<select name="acc">${locOptions(['acc'], '')}</select></label>
    </div>`,
    onSubmit: fd => {
      const v = parseBR(fd.get('value')), acc = fd.get('acc'), date = fd.get('date');
      if (!(v > 0)) { toast('Informe um valor maior que zero.', true); return false; }
      if (!acc) { toast('Selecione a conta que recebeu.', true); return false; }
      if (!date) { toast('Informe a data.', true); return false; }
      S.transactions.push({ id: uid(), date, desc: `Recebimento de ${r.person}${r.desc ? ' — ' + r.desc : ''}`, nature: 'entrada', payment: 'Pix', category: '', origin: acc, dest: '', value: v });
      r.received = true;
      r.receivedDate = date;
      commit();
      toast('Marcado como recebido e lançado como entrada.');
    },
  });
}

function deleteReceivable(id) {
  const r = S.receivables.find(x => x.id === id); if (!r) return;
  confirmBox(`Excluir "a receber" de ${r.person} (${fmt(r.value)})?`, () => { S.receivables = S.receivables.filter(x => x.id !== id); commit(); toast('Excluído.'); });
}

/* ---------------------- CONFIGURAÇÕES ---------------------- */
function renderConfig() {
  const el = $('#page-config'), st = S.settings;
  el.innerHTML = `
    <div class="cfg-grid">
      <div class="card">
        <div class="block-head"><h2>Geral</h2></div>
        <div class="form-grid">
          <label class="span2">Nome do app<input id="cfgName" value="${esc(st.appName)}"></label>
          <label>Meta de sobra mensal (%)<input id="cfgGoal" inputmode="decimal" value="${numStr(st.goalPct)}"></label>
          <label>Tema<select id="cfgTheme"><option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>Escuro</option><option value="light" ${st.theme === 'light' ? 'selected' : ''}>Claro</option></select></label>
          <label class="span2">Token brapi.dev (opcional, cotações de ações)<input id="cfgToken" value="${esc(st.brapiToken)}" placeholder="Cole seu token gratuito de brapi.dev"><span class="hint">Sem token, funcionam apenas alguns tickers (PETR4, VALE3, ITUB4, MGLU3). Bitcoin usa CoinGecko, sem token.</span></label>
        </div>
      </div>
      <div class="card">
        <div class="block-head"><h2>Logos</h2></div>
        <p class="muted" style="font-size:13px;line-height:1.6">Para adicionar suas logos pelo VS Code:<br>
        • Logo do app: <span class="kbd">assets/logo.png</span><br>
        • Bancos: <span class="kbd">assets/logos/nubank.png</span>, <span class="kbd">mercadopago.png</span>, <span class="kbd">xp.png</span>, <span class="kbd">flash-flex.png</span>, <span class="kbd">flash-mob.png</span><br>
        • Ativos e contas novas: informe o caminho no formulário de edição.<br>
        Enquanto a imagem não existir, aparecem as iniciais coloridas.</p>
      </div>
      <div class="card">
        <div class="block-head"><h2>Backup & Dados</h2></div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">Seus dados ficam salvos na nuvem (Supabase). Ainda assim, faça backup com frequência por segurança.</p>
        <div class="btn-row">
          <button class="btn" data-act="exportJson">⬇ Exportar backup (JSON)</button>
          <button class="btn" data-act="importJson">⬆ Restaurar backup</button>
          <button class="btn ghost" data-act="exportCsv">⬇ Exportar lançamentos (CSV)</button>
          <button class="btn ghost" data-act="importCsv">⬆ Importar lançamentos (CSV)</button>
        </div>
        <p class="hint" style="margin-top:12px">CSV aceito (cabeçalho): <span class="kbd">Data;Descrição;Natureza;Pagamento;Categoria;Origem;Destino;Valor</span> — exatamente as colunas da sua planilha do Excel (salve como CSV).</p>

        <div class="btn-row" style="margin-top:14px">
          <button class="btn danger" data-act="clearTx">Apagar lançamentos</button>
          <button class="btn danger" data-act="resetAll">Resetar tudo</button>
        </div>
      </div>
    </div>

    <section class="block" style="margin-top:26px">
      <div class="block-head"><h2>Categorias de gasto</h2><span class="sub">Defina se cada categoria é essencial e um orçamento mensal opcional</span><button class="btn primary spacer" data-act="addCat">+ Categoria</button></div>
      <div class="card">
        <div class="cfg-cat muted" style="font-size:12px"><span>Cor</span><span>Nome</span><span>Tipo</span><span>Orçamento (R$)</span><span></span></div>
        ${S.categories.map(c => `<div class="cfg-cat" data-cat="${c.id}">
          <input type="color" data-k="color" value="${esc(c.color)}">
          <input data-k="name" value="${esc(c.name)}">
          <select data-k="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input data-k="budget" inputmode="decimal" value="${c.budget ? numStr(c.budget) : ''}" placeholder="sem limite">
          <button class="row-btn" data-act="delCat" data-id="${c.id}" title="Excluir">🗑️</button>
        </div>`).join('')}
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>Como os números são calculados</h2></div>
      <div class="card" style="line-height:1.75;font-size:13.5px">
        <b>Entrada Total</b> = Entradas + Benefício Flash + Rendimentos do mês.<br>
        <b>Saída Total</b> = lançamentos de natureza Saída (débito, Pix, dinheiro, TED, boleto).<br>
        <b>Fatura Bruta</b> = compras "Fatura do Mês" + o que ficou como "Fatura Seguinte" no mês anterior.<br>
        <b>Saldo do Mês</b> = Entrada Total − Saída Total. &nbsp; <b>Sobra da Fatura</b> = Saldo do Mês − Fatura Bruta. &nbsp; <b>Sobra do Mês %</b> = Sobra da Fatura ÷ Entrada Total.<br>
        <b>Transferências, pagamentos de fatura e resgates</b> não contam como gasto — só movem dinheiro (pagar a fatura abate a dívida do cartão).<br>
        <b>Aportes</b> aparecem em "Investimentos" e na categoria Investimentos; não entram em Saída Total.<br>
        <b>Patrimônio Líquido</b> = contas + cofrinhos + investimentos − faturas (inclui parcelas futuras) − saídas agendadas − compromissos futuros.
      </div>
    </section>`;
  const set = (id, fn) => $(id).addEventListener('change', e => { fn(e.target.value); save(); render(); });
  set('#cfgName', v => st.appName = v.trim() || 'Financeiro OS');
  set('#cfgGoal', v => st.goalPct = parseBR(v) || 0);
  set('#cfgTheme', v => st.theme = v);
  set('#cfgToken', v => st.brapiToken = v.trim());
  $$('[data-cat]').forEach(row => {
    const c = catById(row.dataset.cat);
    $$('[data-k]', row).forEach(inp => inp.addEventListener('change', () => {
      const k = inp.dataset.k;
      c[k] = k === 'budget' ? (parseBR(inp.value) || 0) : (k === 'name' ? (inp.value.trim() || c.name) : inp.value);
      save(); if (k !== 'color') render();
    }));
  });
}

/* ---------------------- CSV / JSON ---------------------- */
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
function exportCsv() {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Data', 'Descrição', 'Natureza', 'Pagamento', 'Categoria', 'Origem', 'Destino', 'Valor']];
  S.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(t =>
    rows.push([fmtDate(t.date), t.desc, NATURES[t.nature]?.label || t.nature, t.payment, catById(t.category)?.name || '', locName(t.origin) === '—' ? '' : locName(t.origin), t.dest ? locName(t.dest) : '', String(t.value).replace('.', ',')]));
  download('lancamentos.csv', '\uFEFF' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV exportado.');
}
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
function parseDateAny(s) {
  s = String(s).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  return null;
}
function mapNature(txt) {
  const n = norm(txt);
  if (n.includes('transfer')) return 'transferencia';
  if (n.includes('fatura')) return n.includes('pag') ? 'pag_fatura' : (n.includes('seguinte') || n.includes('proxim')) ? 'fatura_seg' : 'fatura_mes';
  if (n.includes('flash') || n.includes('beneficio')) return 'flash';
  if (n.includes('rendimento') || n.includes('juros') || n.includes('dividendo')) return 'rendimento';
  if (n.includes('aporte') || n.includes('invest')) return 'aporte';
  if (n.includes('resgate')) return 'resgate';
  if (n.includes('entrada') || n.includes('receita') || n.includes('salario')) return 'entrada';
  if (n.includes('saida') || n.includes('despesa') || n.includes('gasto')) return 'saida';
  return null;
}
function matchLoc(txt) {
  const n = norm(txt); if (!n) return '';
  const all = [...S.accounts, ...S.pots, ...S.assets];
  const hit = all.find(x => norm(x.name) === n) || all.find(x => n.includes(norm(x.name)) || norm(x.name).includes(n));
  return hit ? hit.id : '';
}
function importCsvText(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) { toast('CSV vazio ou sem cabeçalho.', true); return; }
  const head = rows[0].map(norm), idx = k => head.findIndex(h => h.includes(k));
  const ix = { date: idx('data'), desc: idx('descri'), nat: idx('natureza'), pay: idx('pagamento'), cat: idx('categoria'), org: idx('origem'), dst: idx('destino'), val: idx('valor') };
  if (ix.date < 0 || ix.val < 0) { toast('Cabeçalho não reconhecido. Precisa ter ao menos as colunas Data e Valor.', true); return; }
  const good = [], bad = []; let noOrigin = 0; const newCats = new Set();
  rows.slice(1).forEach((r, i) => {
    const date = parseDateAny(r[ix.date] || ''), val = Math.abs(parseBR(r[ix.val]));
    const nature = ix.nat >= 0 ? mapNature(r[ix.nat] || '') : 'saida';
    if (!date || !(val > 0) || !nature) { bad.push(i + 2); return; }
    const org = ix.org >= 0 ? matchLoc(r[ix.org]) : '';
    if (!org) noOrigin++;
    const catName = ix.cat >= 0 ? (r[ix.cat] || '').trim() : '';
    let cat = catName ? (S.categories.find(c => norm(c.name) === norm(catName)) || S.categories.find(c => norm(catName).includes(norm(c.name)) || norm(c.name).includes(norm(catName)))) : null;
    if (catName && !cat) newCats.add(catName);
    let pay = ix.pay >= 0 ? (r[ix.pay] || '').trim() : '';
    pay = PAYMENTS.find(p => norm(p) === norm(pay)) || pay || (NATURES[nature].credit ? 'Crédito' : 'Pix');
    good.push({ id: uid(), date, desc: (r[ix.desc] || '').trim() || '(sem descrição)', nature, payment: pay, category: cat ? cat.id : '', _catName: catName, origin: org, dest: ix.dst >= 0 ? matchLoc(r[ix.dst]) : '', value: val });
  });
  openModal({
    title: 'Importar lançamentos', submitLabel: `Importar ${good.length}`,
    body: `<p><b>${good.length}</b> linhas válidas${bad.length ? ` · <span class="warn">${bad.length} ignoradas</span> (linhas ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''})` : ''}.</p>
      ${noOrigin ? `<p class="hint">⚠️ ${noOrigin} linhas sem origem reconhecida (nome diferente das suas contas/cofrinhos). Elas serão importadas sem origem e não afetarão saldos — ajuste depois.</p>` : ''}
      ${newCats.size ? `<p class="hint">Categorias novas que serão criadas: ${[...newCats].map(esc).join(', ')}</p>` : ''}
      <p class="hint">Dica: nomes de origem devem lembrar os cadastrados (Nubank, Mercado Pago, XP, Flash Flex, Cofrinho Carro…).</p>`,
    onSubmit: () => {
      const created = {};
      newCats.forEach(n => { const c = { id: 'cat_' + uid(), name: n, kind: 'nao_essencial', color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'), budget: 0 }; S.categories.push(c); created[norm(n)] = c.id; });
      good.forEach(t => { if (!t.category && t._catName) t.category = created[norm(t._catName)] || ''; delete t._catName; S.transactions.push(t); });
      commit(); toast(`${good.length} lançamentos importados.`);
    },
  });
}
function exportJson() { download(`backup-financeiro-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json'); toast('Backup exportado.'); }

/* ---------------------- Ações (delegação de eventos) ---------------------- */
const actions = {
  newTx: () => openTxModal(),
  editTx: id => openTxModal(S.transactions.find(t => t.id === id)),
  delTx: id => deleteTx(id),
  togglePaid: id => togglePaid(id),
  bulkPay: () => { markManyPaid([...selected], true); selected.clear(); renderTxTable(); },
  bulkUnpay: () => { markManyPaid([...selected], false); selected.clear(); renderTxTable(); },
  bulkClear: () => { selected.clear(); renderTxTable(); },
  exportCsv, exportJson,
  importCsv: () => $('#fileCsv').click(),
  importJson: () => $('#fileJson').click(),
  newAcc: () => accountForm(), editAcc: id => accountForm(S.accounts.find(a => a.id === id)),
  adjAcc: id => adjustBalance(S.accounts.find(a => a.id === id)),
  delAcc: id => deleteEntity('accounts', id, 'esta conta'),
  newAsset: () => assetForm(), editAsset: id => assetForm(S.assets.find(a => a.id === id)),
  valAsset: id => valueAssetForm(S.assets.find(a => a.id === id)),
  delAsset: id => deleteEntity('assets', id, 'este ativo'),
  quotes: refreshQuotes,
  newPot: () => potForm(), editPot: id => potForm(S.pots.find(p => p.id === id)),
  depPot: id => potMove(S.pots.find(p => p.id === id), true),
  wdPot: id => potMove(S.pots.find(p => p.id === id), false),
  adjPot: id => adjustBalance(S.pots.find(p => p.id === id)),
  delPot: id => deleteEntity('pots', id, 'este cofrinho'),
  newCommit: () => commitForm(), editCommit: id => commitForm(S.commitments.find(c => c.id === id)),
  payCommit: id => { const c = S.commitments.find(x => x.id === id); c.paid = !c.paid; commit(); },
  delCommit: id => confirmBox('Excluir este compromisso?', () => { S.commitments = S.commitments.filter(c => c.id !== id); commit(); }),
  newReceivable: () => receivableForm(), editReceivable: id => receivableForm(S.receivables.find(r => r.id === id)),
  markReceived: id => markReceived(S.receivables.find(r => r.id === id)),
  delReceivable: id => deleteReceivable(id),
  addCat: () => { S.categories.push({ id: 'cat_' + uid(), name: 'Nova categoria', kind: 'nao_essencial', color: '#8b5cf6', budget: 0 }); commit(); },
  delCat: id => {
    const n = S.transactions.filter(t => t.category === id).length;
    confirmBox(n ? `Esta categoria tem ${n} lançamentos, que ficarão "sem categoria". Excluir mesmo assim?` : 'Excluir esta categoria?', () => { S.categories = S.categories.filter(c => c.id !== id); S.transactions.forEach(t => { if (t.category === id) t.category = ''; }); commit(); });
  },
  clearTx: () => confirmBox('Apagar TODOS os lançamentos? (contas, cofrinhos e ativos são mantidos)', () => { S.transactions = []; commit(); toast('Lançamentos apagados.'); }, 'Apagar'),
  resetAll: () => confirmBox('Resetar TUDO e voltar ao estado inicial? Faça um backup antes!', () => { S = defaultState(); commit(); toast('App resetado.'); }, 'Resetar'),
};
document.addEventListener('click', e => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { e.preventDefault(); go(goEl.dataset.go); return; }
  const hashA = e.target.closest('a[href^="#"]');
  if (hashA && PAGES[hashA.getAttribute('href').slice(1)]) { e.preventDefault(); go(hashA.getAttribute('href').slice(1)); return; }
  const b = e.target.closest('[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act](b.dataset.id, b);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ---------------------- Inicialização ---------------------- */
$$('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.page)));
$('#prevMonth').addEventListener('click', () => { ui.month = addMonthsYM(ui.month, -1); render(); });
$('#nextMonth').addEventListener('click', () => { ui.month = addMonthsYM(ui.month, 1); render(); });
$('#todayMonth').addEventListener('click', () => { ui.month = thisYM(); render(); });
$('#monthPicker').addEventListener('change', e => { if (e.target.value) { ui.month = e.target.value; render(); } });
$('#hideBtn').addEventListener('click', () => { S.settings.hide = !S.settings.hide; commit(); });
$('#themeBtn').addEventListener('click', () => { S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark'; commit(); });
$('#menuBtn').addEventListener('click', () => { $('#sidebar').classList.toggle('open'); $('#scrim').classList.toggle('show'); });
$('#scrim').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); });
$('#fileCsv').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => importCsvText(String(r.result)); r.readAsText(f, 'utf-8'); e.target.value = '';
});
$('#fileJson').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { const data = JSON.parse(String(r.result)); confirmBox('Restaurar este backup substitui todos os dados atuais. Continuar?', () => { S = migrate(data); commit(); toast('Backup restaurado.'); }, 'Restaurar'); }
    catch { toast('Arquivo de backup inválido.', true); }
  };
  r.readAsText(f); e.target.value = '';
});

/* ---------------------- PWA: Service Worker ---------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('Service Worker registrado.'))
      .catch((err) => console.warn('Falha ao registrar Service Worker:', err));
  });
}