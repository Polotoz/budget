'use strict';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt = (n) => eur.format(n);
const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const $ = (s) => document.querySelector(s);

const CATEGORIES = ['Courses', 'Restaurant', 'Transport', 'Loisirs', 'Santé', 'Maison', 'Shopping', 'Autre'];
const FREQ = {
  monthly: { label: 'mensuel', div: 1 },
  quarterly: { label: 'trimestriel', div: 3 },
  yearly: { label: 'annuel', div: 12 },
};
const BACKUP_REMINDER_DAYS = 14;

let data = Store.empty();
let simInstallments = 1;
let storageProtected = false;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Accepte « 12,50 », « 12.5 », « 1 200 ».
function parseAmount(value) {
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// Exécute une écriture et prévient si le stockage échoue.
async function save(fn) {
  try {
    data = await fn();
    renderAll();
  } catch (err) {
    console.error(err);
    alert('Enregistrement impossible : le stockage du navigateur est indisponible ou plein.');
  }
}

/* ---------- Calculs ---------- */

function monthInfo(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = now.getDate();
  return { y, m, daysInMonth, today, daysLeft: daysInMonth - today + 1, key: `${y}-${pad(m + 1)}` };
}

function compute() {
  const mi = monthInfo();
  let income = 0;
  let fixed = 0;
  let upcoming = 0;

  for (const r of data.recurring) {
    const monthly = r.amount / FREQ[r.freq].div; // trimestriel et annuel lissés
    if (r.type === 'income') {
      income += monthly;
    } else {
      fixed += monthly;
      if (r.freq === 'monthly' && r.day > mi.today) upcoming += r.amount;
    }
  }

  const savings = data.settings.savings || 0;
  const spent = data.transactions
    .filter((t) => t.date.startsWith(mi.key))
    .reduce((sum, t) => sum + t.amount, 0);
  const variableBudget = income - fixed - savings;
  const rest = variableBudget - spent;

  return { mi, income, fixed, upcoming, savings, spent, variableBudget, rest, perDay: rest / mi.daysLeft };
}

// ok / warn (moins de 20 % du budget variable) / bad (dépassement)
function stateOf(rest, base) {
  if (rest < 0) return 'bad';
  if (base > 0 && rest < base * 0.2) return 'warn';
  return 'ok';
}

/* ---------- Affichage ---------- */

function renderHome() {
  const c = compute();
  const hasIncome = data.recurring.some((r) => r.type === 'income');

  $('#heroLabel').textContent =
    `Reste par jour jusqu’au ${c.mi.daysInMonth} ${monthName.format(new Date(c.mi.y, c.mi.m))}`;
  const big = $('#perDay');
  big.textContent = fmt(c.perDay);
  big.className = 'big ' + (hasIncome ? stateOf(c.rest, c.variableBudget) : '');
  $('#setupHint').hidden = hasIncome;

  $('#statRest').textContent = fmt(c.rest);
  $('#statSpent').textContent = fmt(c.spent);
  $('#statUpcoming').textContent = fmt(c.upcoming);
  $('#statBudget').textContent = fmt(c.variableBudget);

  const elapsedPct = Math.round((c.mi.today / c.mi.daysInMonth) * 100);
  const spentPct =
    c.variableBudget > 0 ? Math.min(100, Math.round((c.spent / c.variableBudget) * 100)) : c.spent > 0 ? 100 : 0;
  $('#elapsedPct').textContent = `${elapsedPct} %`;
  $('#spentPct').textContent = `${spentPct} %`;
  $('#elapsedBar').style.width = `${elapsedPct}%`;
  $('#spentBar').style.width = `${spentPct}%`;
  $('#pace').textContent =
    spentPct > elapsedPct + 5
      ? 'Tu dépenses plus vite que le mois n’avance.'
      : 'Ton rythme de dépenses suit le mois.';

  const hasData = data.transactions.length + data.recurring.length > 0;
  const last = data.settings.lastExport ? new Date(data.settings.lastExport) : null;
  const stale = !last || (Date.now() - last.getTime()) / 86400000 > BACKUP_REMINDER_DAYS;
  $('#backupNotice').hidden = !(hasData && stale);

  renderSim();
}

function renderSim() {
  const out = $('#simResult');
  const amount = parseAmount($('#simAmount').value);
  if (!amount) {
    out.hidden = true;
    return;
  }
  const c = compute();
  const thisMonth = amount / simInstallments;
  const rest = c.rest - thisMonth;
  const state = stateOf(rest, c.variableBudget);
  const titles = { ok: 'Ça passe.', warn: 'Ça passe, mais c’est serré.', bad: 'Pas ce mois-ci.' };

  let detail =
    rest >= 0
      ? `Il te resterait ${fmt(rest)}, soit ${fmt(rest / c.mi.daysLeft)} par jour.`
      : `Tu dépasserais ton budget de ${fmt(-rest)}.`;
  if (simInstallments > 1) detail += ` Puis ${fmt(thisMonth)} par mois pendant ${simInstallments - 1} mois.`;

  const strong = document.createElement('strong');
  strong.textContent = titles[state];
  out.replaceChildren(strong, document.createTextNode(' ' + detail));
  out.className = 'verdict ' + state;
  out.hidden = false;
}

function renderExpenses() {
  const { key } = monthInfo();
  const items = data.transactions
    .filter((t) => t.date.startsWith(key))
    .sort((a, b) => b.date.localeCompare(a.date));

  $('#expTotal').textContent = fmt(items.reduce((s, t) => s + t.amount, 0));
  $('#expList').innerHTML = items.length
    ? items
        .map((t) => {
          const title = esc(t.label || t.category);
          return `<li>
            <div class="main">
              <div class="title">${title}</div>
              <div class="sub">${esc(t.category)}, ${esc(dayFmt.format(fromISO(t.date)))}</div>
            </div>
            <span class="amt">${fmt(t.amount)}</span>
            <button class="del" type="button" data-del-tx="${esc(t.id)}" aria-label="Supprimer ${title}">×</button>
          </li>`;
        })
        .join('')
    : '<li class="empty">Aucune dépense ce mois-ci. Ajoute la première ci-dessus.</li>';
}

function recurringItem(r) {
  const title = esc(r.label || (r.type === 'income' ? 'Revenu' : 'Dépense'));
  const smoothed = r.freq !== 'monthly' ? `, soit ${fmt(r.amount / FREQ[r.freq].div)} par mois` : '';
  return `<li>
    <div class="main">
      <div class="title">${title}</div>
      <div class="sub">${FREQ[r.freq].label}, le ${r.day}${smoothed}</div>
    </div>
    <span class="amt">${fmt(r.amount)}</span>
    <button class="del" type="button" data-del-rec="${esc(r.id)}" aria-label="Supprimer ${title}">×</button>
  </li>`;
}

function renderFixed() {
  const byDay = (a, b) => a.day - b.day;
  const incomes = data.recurring.filter((r) => r.type === 'income').sort(byDay);
  const expenses = data.recurring.filter((r) => r.type === 'expense').sort(byDay);
  $('#incomeList').innerHTML = incomes.length
    ? incomes.map(recurringItem).join('')
    : '<li class="empty">Aucun revenu. Ajoute ton salaire avec le formulaire ci-dessous.</li>';
  $('#fixedList').innerHTML = expenses.length
    ? expenses.map(recurringItem).join('')
    : '<li class="empty">Aucune dépense fixe. Loyer, abonnements, assurances : ajoute-les ci-dessous.</li>';
}

function renderSettings() {
  $('#savings').value = data.settings.savings || '';
  const last = data.settings.lastExport;
  $('#lastExport').textContent = last
    ? `Dernière sauvegarde : ${new Date(last).toLocaleDateString('fr-FR')}.`
    : 'Aucune sauvegarde pour l’instant.';
  $('#persistStatus').textContent = storageProtected
    ? 'Le navigateur ne supprimera pas tes données de lui-même. Effacer les données du site les supprime quand même : garde une sauvegarde.'
    : 'Le navigateur peut supprimer tes données s’il manque de place. Installe l’appli sur l’écran d’accueil et sauvegarde régulièrement.';
}

function renderAll() {
  renderHome();
  renderExpenses();
  renderFixed();
  renderSettings();
}

function show(view) {
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

/* ---------- Actions ---------- */

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `budget-sauvegarde-${toISO(new Date())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  save(() => Store.updateSettings({ lastExport: new Date().toISOString() }));
}

async function importData(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    alert('Ce fichier n’est pas un JSON valide.');
    return;
  }
  if (!raw || (!Array.isArray(raw.recurring) && !Array.isArray(raw.transactions))) {
    alert('Ce fichier n’est pas une sauvegarde de l’appli Budget.');
    return;
  }
  if (confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) {
    save(() => Store.replaceAll(raw));
  }
}

function bindEvents() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

  // Simulateur
  $('#simAmount').addEventListener('input', renderSim);
  document.querySelectorAll('#simSeg button').forEach((b) =>
    b.addEventListener('click', () => {
      simInstallments = Number(b.dataset.n);
      document.querySelectorAll('#simSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderSim();
    })
  );

  // Ajout d'une dépense
  $('#expForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount($('#expAmount').value);
    const date = $('#expDate').value;
    if (!amount) return alert('Indique un montant supérieur à 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert('Indique une date valide.');
    save(() =>
      Store.addTransaction({
        amount,
        date,
        label: $('#expLabel').value.trim().slice(0, 80),
        category: $('#expCategory').value,
      })
    );
    $('#expAmount').value = '';
    $('#expLabel').value = '';
    $('#expAmount').focus();
  });

  // Ajout d'un revenu ou d'une dépense fixe
  $('#recForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount($('#recAmount').value);
    const day = Math.round(Number($('#recDay').value));
    if (!amount) return alert('Indique un montant supérieur à 0.');
    if (!(day >= 1 && day <= 31)) return alert('Indique un jour entre 1 et 31.');
    save(() =>
      Store.addRecurring({
        type: $('#recType').value,
        label: $('#recLabel').value.trim().slice(0, 80),
        amount,
        freq: $('#recFreq').value,
        day,
      })
    );
    e.target.reset();
  });

  // Suppressions
  document.addEventListener('click', (e) => {
    const tx = e.target.closest('[data-del-tx]');
    const rec = e.target.closest('[data-del-rec]');
    if (tx && confirm('Supprimer cette dépense ?')) save(() => Store.removeTransaction(tx.dataset.delTx));
    if (rec && confirm('Supprimer cette ligne ?')) save(() => Store.removeRecurring(rec.dataset.delRec));
  });

  // Réglages
  $('#savingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('#savings').value.trim();
    const savings = raw === '' ? 0 : parseAmount(raw);
    if (savings === null) return alert('Indique un montant valide, ou laisse vide pour 0.');
    save(() => Store.updateSettings({ savings }));
  });
  $('#exportBtn').addEventListener('click', exportData);
  $('#backupNow').addEventListener('click', exportData);
  $('#importFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  $('#clearBtn').addEventListener('click', () => {
    if (confirm('Effacer toutes les données ? Cette action est définitive sans sauvegarde.')) save(() => Store.clear());
  });

  // Recalcule quand on revient sur l'appli (changement de jour, de mois).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderAll();
  });
}

(async function init() {
  data = await Store.load();
  $('#expCategory').innerHTML = CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('');
  $('#expDate').value = toISO(new Date());
  bindEvents();
  renderAll();

  try {
    storageProtected = await Store.requestPersistence();
  } catch {
    storageProtected = false;
  }
  renderSettings();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker non enregistré', err));
  }
})();
