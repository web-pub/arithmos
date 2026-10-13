// Arithmos — Espace Admin (V10-001)
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updatePassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { calculerKPI, GROUPES_KPI } from "./kpi.js";
import {
  renderSparkline, htmlCourbeKpi, montrerCourbeKpi, htmlJaugeScore, montrerJaugeScore,
  htmlRadarGroupes, montrerRadarGroupes, htmlBarresExercices, montrerBarresExercices,
} from "./charts.js";
import { exportKpiPdf, exportKpiExcel } from "./export.js";
import { RUBRIQUES, GROUPES_MAPPING, mappingParDefaut, parseRangesInput, formatRangesInput, sommeParRubrique } from "./mapping.js";
import { nombreMoisEntre, periodeDe, labelPeriode, labelCourtPeriode } from "./periode.js";
import { parseBnbOfficiel } from "./bnb-officiel.js";
import { calculerScoreGlobal, detecterSignauxAlerte, renderSanteHtml, scoresParGroupe } from "./sante.js";
import { detailKpi, estExerciceMargeBrute } from "./tracabilite.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Deuxième app Firebase, utilisée uniquement pour créer des comptes ou
// changer un mot de passe sans perturber la session Admin en cours.
const secondaryApp = getApps().some(a => a.name === "secondary")
  ? getApps().find(a => a.name === "secondary")
  : initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

let currentUid = null;
let currentRole = null;
let societesCache = [];
let accesCache = [];
let exercicesCache = [];

// ---------- utilitaires ----------
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function slug(str) {
  return stripAccents(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function suggestIdentifiant(prenom, nom) {
  return `${slug(prenom)}.${slug(nom).charAt(0)}`;
}
function suggestPassword(prenom, nom, dateNaissance) {
  const p = slug(prenom).slice(0, 3);
  const n = slug(nom).slice(0, 3);
  let jjmm = '0101';
  if (dateNaissance) {
    const [, mm, dd] = dateNaissance.split('-');
    jjmm = `${dd}${mm}`;
  }
  return `${p}${n}${jjmm}`;
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});

// ---------- tabs ----------
// activerTab() centralise le changement d'onglet (bouton de nav standard OU clic sur une tuile du
// tableau de bord) : même logique d'activation + chargement des données propres à l'onglet, dans
// les deux cas.
function activerTab(nomTab) {
  const btnNav = document.querySelector(`#admin-tabs button[data-tab="${nomTab}"]`);
  if (!btnNav || btnNav.style.display === 'none') return; // onglet inexistant ou masqué pour ce rôle
  document.querySelectorAll('#admin-tabs button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btnNav.classList.add('active');
  document.getElementById('panel-' + nomTab).classList.add('active');
  if (nomTab === 'passwords') loadPasswordsPanel();
  if (nomTab === 'comptes') loadExercices();
  if (nomTab === 'kpi') loadKpiSociete();
  if (nomTab === 'bnb') loadBnbSociete();
  if (nomTab === 'contenu') loadContenu();
  if (nomTab === 'maintenance') loadConnexions();
}
document.querySelectorAll('#admin-tabs button').forEach(btn => {
  btn.addEventListener('click', () => activerTab(btn.dataset.tab));
});
// Tuiles cliquables du tableau de bord : même mécanisme, pour accéder directement à ce qu'il y a
// "derrière" chaque chiffre (sociétés, accès, exercices, KPI).
document.querySelectorAll('#panel-dashboard .stat-tile.clickable').forEach(tuile => {
  tuile.addEventListener('click', () => activerTab(tuile.dataset.tab));
});

function applyRoleVisibility(role) {
  document.querySelectorAll('#admin-tabs button[data-role]').forEach(btn => {
    const needed = btn.dataset.role; // 'superadmin'
    btn.style.display = (role === needed) ? '' : 'none';
  });
  const badge = document.getElementById('role-badge');
  badge.textContent = role === 'superadmin' ? 'Super Admin' : (role === 'admin' ? 'Admin' : 'Lecteur');
}

// ---------- auth guard ----------
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUid = user.uid;
  document.getElementById('user-email').textContent = user.email;

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists()) {
    toast("Aucun profil Arithmos associé à ce compte. Contactez le Super Admin.", true);
    currentRole = null;
    applyRoleVisibility('lecteur');
    return;
  }
  const profile = profileSnap.data();
  currentRole = profile.role;

  // Trace du passage sur le site (visible en Maintenance, Super Admin uniquement) — non bloquant.
  updateDoc(doc(db, 'users', user.uid), { derniereConnexion: serverTimestamp() }).catch(() => {});

  if (currentRole === 'lecteur') {
    // L'espace Admin n'est pas destiné aux comptes "accès résultats" : on les renvoie vers leur propre espace.
    window.location.href = 'resultats.html';
    return;
  }

  applyRoleVisibility(currentRole);
  await loadSocietes();
  await loadAcces();
  await loadDashboard();
});

// ---------- Sociétés ----------
async function loadSocietes() {
  const snap = await getDocs(query(collection(db, 'societes'), orderBy('nom')));
  societesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderSocietes();
  populateSocietesChecklist();
  populateSocietesSelects();
}

function populateSocietesSelects() {
  const options = societesCache.length
    ? societesCache.map(s => `<option value="${s.id}">${escapeHtml(s.nom)}</option>`).join('')
    : '<option value="">Crée d\'abord une société</option>';
  const compteSelect = document.getElementById('comptes-societe-select');
  const exerciceSelect = document.getElementById('exercice-societe');
  const kpiSelect = document.getElementById('kpi-societe-select');
  const bnbSelect = document.getElementById('bnb-societe-select');
  const prevValue = compteSelect.value;
  const prevKpiValue = kpiSelect.value;
  const prevBnbValue = bnbSelect.value;
  compteSelect.innerHTML = options;
  exerciceSelect.innerHTML = options;
  kpiSelect.innerHTML = options;
  bnbSelect.innerHTML = options;
  if (societesCache.some(s => s.id === prevValue)) compteSelect.value = prevValue;
  if (societesCache.some(s => s.id === prevKpiValue)) kpiSelect.value = prevKpiValue;
  if (societesCache.some(s => s.id === prevBnbValue)) bnbSelect.value = prevBnbValue;
}

const STATUTS_LEGAUX = {
  normal: { label: 'Normal', classe: 'ok' },
  surveillance: { label: 'Sous surveillance', classe: 'warn' },
  reorganisation: { label: 'Réorganisation judiciaire', classe: 'danger' },
  faillite: { label: 'Faillite déclarée', classe: 'danger' },
  liquidation: { label: 'Dissolution / liquidation', classe: 'danger' },
};
function labelStatutLegal(statut) {
  return (STATUTS_LEGAUX[statut] || STATUTS_LEGAUX.normal).label;
}
function renderBadgeStatutLegal(statut) {
  const info = STATUTS_LEGAUX[statut] || STATUTS_LEGAUX.normal;
  if (info.classe === 'ok') return '<span style="color:var(--ink-soft);">Normal</span>';
  const couleur = info.classe === 'danger' ? '#b42318' : '#9a6700';
  const fond = info.classe === 'danger' ? '#fef3f2' : '#fff8e6';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;color:${couleur};background:${fond};">${escapeHtml(info.label)}</span>`;
}

function renderSocietes() {
  const el = document.getElementById('societes-list');
  if (societesCache.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucune société pour l\'instant. Crée la première avec le bouton ci-dessus.</div>';
    return;
  }
  const rows = societesCache.map(s => `
    <tr>
      <td><strong>${escapeHtml(s.nom)}</strong></td>
      <td>${escapeHtml(s.formeJuridique || '—')}</td>
      <td>${escapeHtml(s.numeroEntreprise || '—')}</td>
      <td>${renderBadgeStatutLegal(s.statutLegal)}</td>
      <td class="row-actions">
        <button class="btn-outline" data-edit-societe="${s.id}">Modifier</button>
        <button class="btn-outline btn-danger" data-delete-societe="${s.id}">Supprimer</button>
      </td>
    </tr>`).join('');
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Société</th><th>Forme juridique</th><th>N° entreprise</th><th>Statut légal</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;

  el.querySelectorAll('[data-edit-societe]').forEach(b => b.addEventListener('click', () => editSociete(b.dataset.editSociete)));
  el.querySelectorAll('[data-delete-societe]').forEach(b => b.addEventListener('click', () => deleteSociete(b.dataset.deleteSociete)));
}

document.getElementById('btn-new-societe').addEventListener('click', () => {
  document.getElementById('societe-modal-title').textContent = 'Nouvelle société';
  document.getElementById('form-societe').reset();
  document.getElementById('societe-id').value = '';
  document.getElementById('societe-statut-legal').value = 'normal';
  document.getElementById('societe-taux-tva').value = '21';
  renderMappingFields(mappingParDefaut());
  openModal('modal-societe');
});

function editSociete(id) {
  const s = societesCache.find(x => x.id === id);
  if (!s) return;
  document.getElementById('societe-modal-title').textContent = 'Modifier la société';
  document.getElementById('societe-id').value = s.id;
  document.getElementById('societe-nom').value = s.nom || '';
  document.getElementById('societe-forme').value = s.formeJuridique || '';
  document.getElementById('societe-numero').value = s.numeroEntreprise || '';
  document.getElementById('societe-statut-legal').value = s.statutLegal || 'normal';
  document.getElementById('societe-taux-tva').value = (typeof s.tauxTVA === 'number') ? (s.tauxTVA * 100) : 21;
  renderMappingFields(s.mappingComptes || mappingParDefaut());
  openModal('modal-societe');
}

// ---------- Mapping comptable (import "Balance comptable détaillée") ----------
function renderMappingFields(mapping) {
  const el = document.getElementById('mapping-fields');
  el.innerHTML = GROUPES_MAPPING.map(groupe => {
    const champs = RUBRIQUES.filter(r => r.groupe === groupe).map(r => `
      <div class="field">
        <label for="map-${r.key}">${escapeHtml(r.label)}</label>
        <input type="text" id="map-${r.key}" value="${escapeHtml(formatRangesInput(mapping[r.key] || r.defaut))}" placeholder="ex. 700000-709999">
      </div>`).join('');
    return `<h4 style="margin:14px 0 6px;font-size:13px;color:var(--ink-soft);">${escapeHtml(groupe)}</h4>${champs}`;
  }).join('');
}

function readMappingFields() {
  const mapping = {};
  RUBRIQUES.forEach(r => {
    const input = document.getElementById(`map-${r.key}`);
    const ranges = input ? parseRangesInput(input.value) : [];
    mapping[r.key] = ranges.length ? ranges : r.defaut;
  });
  return mapping;
}

async function deleteSociete(id) {
  const s = societesCache.find(x => x.id === id);
  if (!confirm(`Supprimer définitivement "${s?.nom || ''}" ? Cette action est irréversible.`)) return;
  await deleteDoc(doc(db, 'societes', id));
  toast('Société supprimée.');
  await loadSocietes();
  await loadDashboard();
}

document.getElementById('form-societe').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('societe-id').value;
  const payload = {
    nom: document.getElementById('societe-nom').value.trim(),
    formeJuridique: document.getElementById('societe-forme').value.trim(),
    numeroEntreprise: document.getElementById('societe-numero').value.trim(),
    statutLegal: document.getElementById('societe-statut-legal').value,
    tauxTVA: (() => {
      const pourcent = parseFloat(document.getElementById('societe-taux-tva').value);
      return (Number.isFinite(pourcent) && pourcent >= 0) ? pourcent / 100 : 0.21;
    })(),
    mappingComptes: readMappingFields(),
  };
  try {
    if (id) {
      await updateDoc(doc(db, 'societes', id), payload);
      toast('Société mise à jour.');
    } else {
      payload.dateCreation = serverTimestamp();
      await setDoc(doc(collection(db, 'societes')), payload);
      toast('Société créée.');
    }
    closeModal('modal-societe');
    await loadSocietes();
    await loadDashboard();
  } catch (err) {
    toast("Erreur : " + err.message, true);
  }
});

function populateSocietesChecklist() {
  const el = document.getElementById('acces-societes-checklist');
  if (societesCache.length === 0) {
    el.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;margin:0;">Crée d\'abord une société.</p>';
    return;
  }
  el.innerHTML = societesCache.map(s => `
    <label><input type="checkbox" value="${s.id}"> ${escapeHtml(s.nom)}</label>
  `).join('');
}

// ---------- Comptes annuels (import Excel) ----------

// Correspondance entre le code du modèle Excel (colonne A) et la clé stockée dans Firestore.
// Doit rester synchronisé avec assets/arithmos-modele-comptes-annuels.xlsx.
const CODE_MAP = {
  '20/28': 'actifsImmobilises',
  '3': 'stocks',
  '40/41': 'creancesCT',
  '50/53': 'placementsTresorerie',
  '54/58': 'valeursDisponibles',
  '490/1': 'regularisationActif',
  '10/15': 'capitauxPropres',
  '16': 'provisions',
  '17': 'dettesLT',
  '43': 'dettesFinancieresCT',
  '44': 'dettesCommercialesCT',
  '45/48': 'autresDettesCT',
  '492/3': 'regularisationPassif',
  '70': 'chiffreAffaires',
  '71': 'variationStocks',
  '74': 'autresProduitsExploitation',
  '60': 'achats',
  '61': 'servicesBiensDivers',
  '62': 'remunerations',
  '630': 'amortissements',
  '631/4': 'reductionsValeur',
  '640/8': 'autresChargesExploitation',
  '75': 'produitsFinanciers',
  '65': 'chargesFinancieres',
  '76': 'produitsExceptionnels',
  '66': 'chargesExceptionnelles',
  '67/77': 'impots',
};

function computeTotaux(v) {
  const totalActif = (v.actifsImmobilises||0) + (v.stocks||0) + (v.creancesCT||0) +
    (v.placementsTresorerie||0) + (v.valeursDisponibles||0) + (v.regularisationActif||0);
  const totalPassif = (v.capitauxPropres||0) + (v.provisions||0) + (v.dettesLT||0) +
    (v.dettesFinancieresCT||0) + (v.dettesCommercialesCT||0) + (v.autresDettesCT||0) + (v.regularisationPassif||0);
  const resultatExploitation = ((v.chiffreAffaires||0) + (v.variationStocks||0) + (v.autresProduitsExploitation||0)) -
    ((v.achats||0) + (v.servicesBiensDivers||0) + (v.remunerations||0) + (v.amortissements||0) +
     (v.reductionsValeur||0) + (v.autresChargesExploitation||0));
  const resultatCourant = resultatExploitation + (v.produitsFinanciers||0) - (v.chargesFinancieres||0);
  const resultatAvantImpot = resultatCourant + (v.produitsExceptionnels||0) - (v.chargesExceptionnelles||0);
  const resultatExercice = resultatAvantImpot - (v.impots||0);
  return { totalActif, totalPassif, resultatExploitation, resultatCourant, resultatAvantImpot, resultatExercice };
}

// Convertit une cellule "Date de début"/"Date de fin" (objet Date Excel, ou texte JJ/MM/AAAA
// en secours) en chaîne ISO AAAA-MM-JJ, ou null si vide/illisible.
// Important : on lit les composantes LOCALES de l'objet Date (pas UTC/toISOString), car SheetJS
// (cellDates:true) construit ces dates à minuit heure locale pour représenter le jour affiché
// dans Excel — passer par toISOString() décale d'un jour dans les fuseaux horaires UTC+.
function dateCelluleVersISO(val) {
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getFullYear(), m = String(val.getMonth() + 1).padStart(2, '0'), d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'string') {
    const m = val.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseArithmosWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const valeurs = {};
  let societeFichier = '', dateDebutFichier = null, dateFinFichier = null;

  rows.forEach((row, idx) => {
    const a = String(row[0] ?? '').trim();
    const b = row[1];
    const c = row[2];

    // Lignes "Société" / "Date de début" / "Date de fin" : libellé en colonne A, valeur en colonne B.
    if (a === 'Société' && !societeFichier) societeFichier = String(b ?? '').trim();
    if (a === 'Date de début' && !dateDebutFichier) dateDebutFichier = dateCelluleVersISO(b);
    if (a === 'Date de fin' && !dateFinFichier) dateFinFichier = dateCelluleVersISO(b);

    // Lignes de données : code en colonne A, montant en colonne C.
    if (CODE_MAP[a] && typeof c === 'number') {
      valeurs[CODE_MAP[a]] = c;
    }
  });

  return { valeurs, societeFichier, dateDebutFichier, dateFinFichier, totaux: computeTotaux(valeurs) };
}

// Import "Balance comptable détaillée" : 2 colonnes (Compte, Solde signé), une ligne par compte.
// Les comptes sont agrégés dans chaque rubrique interne selon le mapping de plages de la société
// (societes/{id}.mappingComptes), avec le même résultat final (valeurs/totaux) que l'import BNB.
function parseBalanceDetaillee(arrayBuffer, mappingComptes) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const comptesSoldes = [];
  let societeFichier = '', dateDebutFichier = null, dateFinFichier = null;

  rows.forEach(row => {
    const a = row[0];
    const aStr = String(a ?? '').trim();
    const b = row[1];
    const c = row[2];

    // Lignes "Société" / "Date de début" / "Date de fin" : libellé en colonne A, valeur en colonne B.
    if (aStr === 'Société' && !societeFichier) societeFichier = String(b ?? '').trim();
    if (aStr === 'Date de début' && !dateDebutFichier) dateDebutFichier = dateCelluleVersISO(b);
    if (aStr === 'Date de fin' && !dateFinFichier) dateFinFichier = dateCelluleVersISO(b);

    // Lignes de données : numéro de compte en colonne A, solde en colonne C.
    const compte = typeof a === 'number' ? a : (/^\d+$/.test(aStr) ? parseInt(aStr, 10) : null);
    if (compte !== null && typeof c === 'number') {
      comptesSoldes.push({ compte, solde: c });
    }
  });

  const valeurs = sommeParRubrique(comptesSoldes, mappingComptes);
  return { valeurs, societeFichier, dateDebutFichier, dateFinFichier, totaux: computeTotaux(valeurs), nbComptes: comptesSoldes.length };
}

async function loadExercices() {
  const societeId = document.getElementById('comptes-societe-select').value;
  const el = document.getElementById('exercices-list');
  if (!societeId) {
    el.innerHTML = '<div class="empty-state">Crée d\'abord une société.</div>';
    exercicesCache = [];
    return;
  }
  // Tri côté client par date de fin (pas de orderBy côté serveur : les exercices importés avant
  // V10-001 n'ont pas de champ dateFin, ce qui les exclurait d'un orderBy Firestore).
  const snap = await getDocs(collection(db, 'societes', societeId, 'exercices'));
  exercicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => periodeDe(b).dateFin.localeCompare(periodeDe(a).dateFin));
  renderExercices(societeId);
}

document.getElementById('comptes-societe-select').addEventListener('change', loadExercices);

function renderExercices(societeId) {
  const el = document.getElementById('exercices-list');
  if (exercicesCache.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun exercice importé pour cette société.</div>';
    return;
  }
  const rows = exercicesCache.map(ex => {
    const t = ex.totaux || {};
    const ecart = Math.round((t.totalActif || 0) - (t.totalPassif || 0));
    const equilibre = Math.abs(ecart) < 1;
    return `<tr>
      <td><strong>${escapeHtml(labelPeriode(ex))}</strong></td>
      <td>${ex.typeImport === 'detaillee' ? 'Balance détaillée' : ex.typeImport === 'bnb_officiel' ? 'Dépôt officiel BNB' : 'Bilan BNB'}</td>
      <td>${formatEUR(t.totalActif)}</td>
      <td>${formatEUR(t.resultatExercice)}</td>
      <td>${equilibre ? '✓ équilibré' : `⚠ écart ${formatEUR(ecart)}`}</td>
      <td class="row-actions">
        <button class="btn-outline btn-danger" data-delete-exercice="${ex.id}" data-societe="${societeId}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Exercice</th><th>Source</th><th>Total actif</th><th>Résultat de l'exercice</th><th>Équilibre</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;

  el.querySelectorAll('[data-delete-exercice]').forEach(b => b.addEventListener('click', () =>
    deleteExercice(b.dataset.societe, b.dataset.deleteExercice)));
}

async function deleteExercice(societeId, exerciceId) {
  if (!confirm(`Supprimer l'exercice ${exerciceId} ? Cette action est irréversible.`)) return;
  await deleteDoc(doc(db, 'societes', societeId, 'exercices', exerciceId));
  toast('Exercice supprimé.');
  await loadExercices();
  await loadDashboard();
}

document.getElementById('btn-new-exercice').addEventListener('click', () => {
  const societeId = document.getElementById('comptes-societe-select').value;
  document.getElementById('form-exercice').reset();
  document.getElementById('exercice-msg').textContent = '';
  document.getElementById('exercice-duree').textContent = '';
  if (societeId) document.getElementById('exercice-societe').value = societeId;
  document.querySelector('input[name="exercice-type"][value="bnb"]').checked = true;
  updateExerciceTypeUi();
  openModal('modal-exercice');
});

function updateExerciceTypeUi() {
  const type = document.querySelector('input[name="exercice-type"]:checked').value;
  document.getElementById('exercice-fichier').accept = (type === 'bnb_officiel') ? '.csv' : '.xlsx';
  document.getElementById('label-exercice-fichier').textContent = (type === 'bnb_officiel')
    ? 'Fichier CSV (dépôt BNB) *' : 'Fichier Excel (modèle Arithmos) *';
  document.getElementById('lien-modele-bnb').style.display = (type === 'bnb') ? 'inline-block' : 'none';
  document.getElementById('lien-modele-detaille').style.display = (type === 'detaillee') ? 'inline-block' : 'none';
  document.getElementById('aide-modele-bnb-officiel').style.display = (type === 'bnb_officiel') ? 'inline' : 'none';
}
document.querySelectorAll('input[name="exercice-type"]').forEach(r => r.addEventListener('change', updateExerciceTypeUi));

// Import "Dépôt officiel BNB" : les dates de la période sont déjà dans le fichier — on les
// propose automatiquement dès que le fichier est choisi, pour éviter une double saisie (l'utilisateur
// peut toujours les corriger avant de valider).
document.getElementById('exercice-fichier').addEventListener('change', async () => {
  const type = document.querySelector('input[name="exercice-type"]:checked').value;
  const file = document.getElementById('exercice-fichier').files[0];
  if (type !== 'bnb_officiel' || !file) return;
  try {
    const text = await file.text();
    const parsed = parseBnbOfficiel(text);
    if (parsed.dateDebutFichier) document.getElementById('exercice-date-debut').value = parsed.dateDebutFichier;
    if (parsed.dateFinFichier) document.getElementById('exercice-date-fin').value = parsed.dateFinFichier;
    updateExerciceDureeUi();
  } catch (err) {
    // Lecture en secours silencieuse : l'utilisateur peut toujours saisir les dates à la main.
  }
});

function updateExerciceDureeUi() {
  const debut = document.getElementById('exercice-date-debut').value;
  const fin = document.getElementById('exercice-date-fin').value;
  const el = document.getElementById('exercice-duree');
  if (!debut || !fin) { el.textContent = ''; return; }
  const n = nombreMoisEntre(debut, fin);
  el.textContent = (n >= 1 && n <= 36) ? `Durée : ${n} mois` : 'Vérifie les dates (durée incohérente).';
}
document.getElementById('exercice-date-debut').addEventListener('change', updateExerciceDureeUi);
document.getElementById('exercice-date-fin').addEventListener('change', updateExerciceDureeUi);

document.getElementById('form-exercice').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('exercice-msg');
  msg.textContent = '';
  msg.className = 'login-msg';

  const societeId = document.getElementById('exercice-societe').value;
  const dateDebut = document.getElementById('exercice-date-debut').value;
  const dateFin = document.getElementById('exercice-date-fin').value;
  const fileInput = document.getElementById('exercice-fichier');
  const file = fileInput.files[0];
  const typeImport = document.querySelector('input[name="exercice-type"]:checked').value;
  if (!societeId || !dateDebut || !dateFin || !file) return;

  const nombreMois = nombreMoisEntre(dateDebut, dateFin);
  if (nombreMois < 1 || nombreMois > 36) {
    msg.textContent = "La date de fin doit être postérieure à la date de début (durée incohérente).";
    msg.classList.add('error');
    return;
  }
  const annee = parseInt(dateFin.slice(0, 4), 10);
  // Une période complète de 12 mois commençant au 1er janvier garde l'ID "année" (comme avant,
  // pour réimporter/écraser un exercice complet existant) ; une période partielle a son propre ID
  // (date de fin), ce qui permet d'avoir plusieurs périodes la même année civile.
  const anneeComplete = nombreMois === 12 && dateDebut.slice(5) === '01-01';
  const exerciceId = anneeComplete ? String(annee) : dateFin;

  try {
    const societeMapping = societesCache.find(s => s.id === societeId)?.mappingComptes || mappingParDefaut();
    let parsed;
    if (typeImport === 'detaillee') {
      parsed = parseBalanceDetaillee(await file.arrayBuffer(), societeMapping);
    } else if (typeImport === 'bnb_officiel') {
      parsed = parseBnbOfficiel(await file.text());
      // Les sous-totaux officiels (bilan, résultats) sont fiables à la source ; en secours
      // seulement (fichier incomplet/atypique), on retombe sur le calcul à partir des rubriques.
      const totauxRecalcules = computeTotaux(parsed.valeurs);
      parsed.totaux = {
        totalActif: parsed.totaux.totalActif || totauxRecalcules.totalActif,
        totalPassif: parsed.totaux.totalPassif || totauxRecalcules.totalPassif,
        resultatExploitation: parsed.totaux.resultatExploitation || totauxRecalcules.resultatExploitation,
        resultatCourant: parsed.totaux.resultatCourant || totauxRecalcules.resultatCourant,
        resultatAvantImpot: parsed.totaux.resultatAvantImpot || totauxRecalcules.resultatAvantImpot,
        resultatExercice: parsed.totaux.resultatExercice || totauxRecalcules.resultatExercice,
      };
    } else {
      parsed = parseArithmosWorkbook(await file.arrayBuffer());
    }

    if (Object.keys(parsed.valeurs).length === 0 || (typeImport === 'detaillee' && parsed.nbComptes === 0) ||
        (typeImport === 'bnb_officiel' && !parsed.nbCodes)) {
      msg.textContent = typeImport === 'detaillee'
        ? "Aucun compte reconnu dans ce fichier — vérifie que la colonne Compte contient bien des numéros et la colonne Solde des montants."
        : typeImport === 'bnb_officiel'
        ? "Aucune donnée reconnue dans ce fichier — vérifie qu'il s'agit bien du fichier .csv téléchargé depuis le site de la BNB."
        : "Aucune donnée reconnue dans ce fichier — utilise le modèle Arithmos sans modifier les codes/libellés.";
      msg.classList.add('error');
      return;
    }

    const societeChoisie = societesCache.find(s => s.id === societeId);
    const societeNom = societeChoisie?.nom || '';
    // Le dépôt officiel BNB porte le numéro d'entreprise : vérification plus fiable qu'une
    // comparaison de nom (raison sociale parfois orthographiée différemment).
    const numeroMismatch = parsed.numeroEntrepriseFichier && societeChoisie?.numeroEntreprise &&
      parsed.numeroEntrepriseFichier.replace(/\D/g, '') !== societeChoisie.numeroEntreprise.replace(/\D/g, '');
    if (numeroMismatch) {
      msg.textContent = `Attention : le fichier est au nom de "${parsed.societeFichier}" (n° ${parsed.numeroEntrepriseFichier}), différent de la société sélectionnée (${societeNom}). Import quand même sous ${societeNom}.`;
      msg.classList.add('warn');
    } else if (parsed.societeFichier && parsed.societeFichier.toLowerCase() !== societeNom.toLowerCase()) {
      msg.textContent = `Attention : le fichier indique "${parsed.societeFichier}", différent de la société sélectionnée (${societeNom}). Import quand même sous ${societeNom}.`;
      msg.classList.add('warn');
    }
    if ((parsed.dateDebutFichier && parsed.dateDebutFichier !== dateDebut) || (parsed.dateFinFichier && parsed.dateFinFichier !== dateFin)) {
      toast(`Le fichier indiquait une autre période — importé sous la période saisie (${dateDebut} → ${dateFin}).`);
    }
    const estMargeBrute = typeImport === 'bnb_officiel' && !!parsed.chiffreAffairesEstMargeBrute;
    if (estMargeBrute) {
      toast("Ce dépôt ne précise pas de chiffre d'affaires séparé (option \"marge brute\") : les KPI qui ont besoin du CA ou des achats (marge nette, marge d'exploitation, délais de paiement) seront marqués non calculables plutôt que faussés.");
    }

    await setDoc(doc(db, 'societes', societeId, 'exercices', exerciceId), {
      annee,
      dateDebut,
      dateFin,
      nombreMois,
      valeurs: parsed.valeurs,
      totaux: parsed.totaux,
      typeImport,
      chiffreAffairesEstMargeBrute: estMargeBrute,
      dateImport: serverTimestamp(),
      importePar: currentUid,
    });

    toast(`Exercice importé (${labelPeriode({ dateDebut, dateFin, nombreMois, annee })}).`);
    closeModal('modal-exercice');
    document.getElementById('comptes-societe-select').value = societeId;
    await loadExercices();
    await loadDashboard();
  } catch (err) {
    msg.textContent = "Erreur de lecture du fichier : " + err.message;
    msg.classList.add('error');
  }
});

function formatEUR(n) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString('fr-BE', { maximumFractionDigits: 0 }) + ' €';
}

// ---------- Accès (comptes "lecteur") ----------
async function loadAcces() {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('nom')));
  accesCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role === 'lecteur');
  renderAcces();
  await loadDashboard();
}

function renderAcces() {
  const el = document.getElementById('acces-list');
  if (accesCache.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun accès donné pour l\'instant.</div>';
    return;
  }
  const rows = accesCache.map(u => {
    const societesNoms = (u.societesAutorisees || [])
      .map(id => societesCache.find(s => s.id === id)?.nom)
      .filter(Boolean).join(', ') || '—';
    return `<tr>
      <td><strong>${escapeHtml(u.prenom)} ${escapeHtml(u.nom)}</strong><br><span style="color:var(--ink-soft);font-size:12px;">${escapeHtml(u.email || '')}</span></td>
      <td>${escapeHtml(u.identifiant || '—')}</td>
      <td>${escapeHtml(societesNoms)}</td>
      <td class="row-actions">
        <button class="btn-outline" data-edit-acces="${u.id}">Modifier</button>
        <button class="btn-outline btn-danger" data-delete-acces="${u.id}">Révoquer</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Personne</th><th>Identifiant</th><th>Sociétés accessibles</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;

  el.querySelectorAll('[data-edit-acces]').forEach(b => b.addEventListener('click', () => editAcces(b.dataset.editAcces)));
  el.querySelectorAll('[data-delete-acces]').forEach(b => b.addEventListener('click', () => deleteAcces(b.dataset.deleteAcces)));
}

document.getElementById('btn-new-acces').addEventListener('click', () => {
  document.getElementById('acces-modal-title').textContent = 'Donner un accès';
  document.getElementById('form-acces').reset();
  document.getElementById('acces-uid').value = '';
  populateSocietesChecklist();
  openModal('modal-acces');
});

// Suggestions auto identifiant / mot de passe à la volée
['acces-prenom', 'acces-nom', 'acces-naissance'].forEach(fieldId => {
  document.getElementById(fieldId).addEventListener('input', () => {
    if (document.getElementById('acces-uid').value) return; // pas en édition
    const prenom = document.getElementById('acces-prenom').value;
    const nom = document.getElementById('acces-nom').value;
    const naissance = document.getElementById('acces-naissance').value;
    if (prenom && nom) {
      document.getElementById('acces-identifiant').value = suggestIdentifiant(prenom, nom);
      document.getElementById('acces-password').value = suggestPassword(prenom, nom, naissance);
    }
  });
});

function editAcces(uid) {
  const u = accesCache.find(x => x.id === uid);
  if (!u) return;
  document.getElementById('acces-modal-title').textContent = 'Modifier l\'accès';
  document.getElementById('acces-uid').value = u.id;
  document.getElementById('acces-prenom').value = u.prenom || '';
  document.getElementById('acces-nom').value = u.nom || '';
  document.getElementById('acces-email').value = u.email || '';
  document.getElementById('acces-identifiant').value = u.identifiant || '';
  document.getElementById('acces-identifiant-original').value = u.identifiant || '';
  document.getElementById('acces-password').value = '';
  document.getElementById('acces-password').placeholder = 'Laisser vide pour ne pas changer';
  populateSocietesChecklist();
  (u.societesAutorisees || []).forEach(id => {
    const cb = document.querySelector(`#acces-societes-checklist input[value="${id}"]`);
    if (cb) cb.checked = true;
  });
  openModal('modal-acces');
}

async function deleteAcces(uid) {
  const u = accesCache.find(x => x.id === uid);
  if (!confirm(`Révoquer l'accès de ${u?.prenom || ''} ${u?.nom || ''} ? Le compte de connexion ne sera plus utilisable depuis Arithmos.`)) return;
  await deleteDoc(doc(db, 'users', uid));
  await deleteDoc(doc(db, 'users', uid, 'private', 'credentials')).catch(() => {});
  if (u?.identifiant) await deleteDoc(doc(db, 'identifiants', u.identifiant.toLowerCase())).catch(() => {});
  toast('Accès révoqué.');
  await loadAcces();
}

document.getElementById('form-acces').addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = document.getElementById('acces-uid').value;
  const prenom = document.getElementById('acces-prenom').value.trim();
  const nom = document.getElementById('acces-nom').value.trim();
  const email = document.getElementById('acces-email').value.trim();
  const identifiant = document.getElementById('acces-identifiant').value.trim();
  const identifiantOriginal = document.getElementById('acces-identifiant-original').value.trim();
  const password = document.getElementById('acces-password').value;
  const societesAutorisees = Array.from(
    document.querySelectorAll('#acces-societes-checklist input:checked')
  ).map(cb => cb.value);

  if (!identifiant) { toast("L'identifiant est obligatoire.", true); return; }

  try {
    if (uid) {
      // édition d'un accès existant
      await updateDoc(doc(db, 'users', uid), { prenom, nom, email, identifiant, societesAutorisees });
      // L'identifiant sert à se connecter : on tient la table "identifiants" à jour.
      if (identifiant.toLowerCase() !== identifiantOriginal.toLowerCase() && identifiantOriginal) {
        await deleteDoc(doc(db, 'identifiants', identifiantOriginal.toLowerCase())).catch(() => {});
      }
      await setDoc(doc(db, 'identifiants', identifiant.toLowerCase()), { email });
      if (password) {
        await setDoc(doc(db, 'users', uid, 'private', 'credentials'), { motDePasseClair: password }, { merge: true });
        toast('Accès mis à jour. Pense à transmettre le nouveau mot de passe depuis l\'onglet Mots de passe (bouton Changer).');
      } else {
        toast('Accès mis à jour.');
      }
    } else {
      // création d'un nouveau compte "lecteur" via l'app Firebase secondaire
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password || suggestPassword(prenom, nom));
      const newUid = cred.user.uid;
      await setDoc(doc(db, 'users', newUid), {
        prenom, nom, email, identifiant, role: 'lecteur', societesAutorisees,
        dateCreation: serverTimestamp()
      });
      await setDoc(doc(db, 'users', newUid, 'private', 'credentials'), { motDePasseClair: password });
      await setDoc(doc(db, 'identifiants', identifiant.toLowerCase()), { email });
      await signOut(secondaryAuth);
      toast('Accès créé.');
    }
    closeModal('modal-acces');
    await loadAcces();
  } catch (err) {
    toast("Erreur : " + err.message, true);
  }
});

// ---------- Mots de passe (Super Admin) ----------
async function loadPasswordsPanel() {
  if (currentRole !== 'superadmin') return;
  const el = document.getElementById('passwords-list');
  el.innerHTML = '<div class="empty-state">Chargement…</div>';

  const snap = await getDocs(query(collection(db, 'users'), orderBy('nom')));
  const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const rows = await Promise.all(users.map(async (u) => {
    const credSnap = await getDoc(doc(db, 'users', u.id, 'private', 'credentials'));
    const pw = credSnap.exists() ? credSnap.data().motDePasseClair : null;
    return `<tr>
      <td><strong>${escapeHtml(u.prenom || '')} ${escapeHtml(u.nom || '')}</strong><br><span style="color:var(--ink-soft);font-size:12px;">${escapeHtml(u.email || '')}</span></td>
      <td>${escapeHtml(u.identifiant || '—')}</td>
      <td style="text-transform:capitalize;">${escapeHtml(u.role || '—')}</td>
      <td>
        <div class="pw-cell">
          <span class="masked" data-pw="${escapeHtml(pw || '')}">${pw ? '••••••••' : '—'}</span>
          ${pw ? `<button class="pw-reveal" data-reveal>Afficher</button>` : ''}
        </div>
      </td>
      <td class="row-actions">
        <button class="btn-outline" data-change-pw="${u.id}" data-email="${escapeHtml(u.email || '')}">Changer</button>
      </td>
    </tr>`;
  }));

  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Personne</th><th>Identifiant</th><th>Rôle</th><th>Mot de passe</th><th></th></tr></thead>
    <tbody>${rows.join('')}</tbody></table>`;

  el.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const span = btn.previousElementSibling;
      const real = span.dataset.pw;
      const showing = span.textContent !== '••••••••';
      span.textContent = showing ? '••••••••' : real;
      btn.textContent = showing ? 'Afficher' : 'Masquer';
    });
  });

  el.querySelectorAll('[data-change-pw]').forEach(btn => {
    btn.addEventListener('click', () => changePassword(btn.dataset.changePw, btn.dataset.email));
  });
}

async function changePassword(uid, email) {
  const newPassword = prompt(`Nouveau mot de passe pour ${email} :`);
  if (!newPassword) return;

  const credSnap = await getDoc(doc(db, 'users', uid, 'private', 'credentials'));
  const oldPassword = credSnap.exists() ? credSnap.data().motDePasseClair : null;

  try {
    if (!oldPassword) throw new Error('no-stored-password');
    // Connexion brève à la place de la personne via l'app secondaire, pour fixer le vrai mot de passe Firebase.
    await signInWithEmailAndPassword(secondaryAuth, email, oldPassword);
    await updatePassword(secondaryAuth.currentUser, newPassword);
    await signOut(secondaryAuth);
    await setDoc(doc(db, 'users', uid, 'private', 'credentials'), { motDePasseClair: newPassword }, { merge: true });
    toast('Mot de passe changé avec succès.');
    loadPasswordsPanel();
  } catch (err) {
    // Mot de passe stocké périmé ou absent : on retombe sur l'e-mail de réinitialisation.
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Le mot de passe stocké n'était plus valide : un e-mail de réinitialisation a été envoyé à " + email + ".");
    } catch (err2) {
      toast("Erreur : " + err2.message, true);
    }
  }
}

// ---------- Dashboard ----------
// Nombre entier simple (compteurs du tableau de bord) avec le même séparateur de milliers que
// partout ailleurs sur le site (espace tous les 3 chiffres, format fr-BE) — cohérence demandée.
function formatNombre(n) {
  return (typeof n === 'number' ? n : 0).toLocaleString('fr-BE');
}

async function loadDashboard() {
  document.getElementById('stat-societes').textContent = formatNombre(societesCache.length);

  // Compte "Accès résultats actifs" : interrogé directement (où role == 'lecteur') plutôt que de
  // dépendre d'accesCache, qui n'est rempli qu'après un passage par l'onglet Accès — sinon le
  // tableau de bord affichait "0" tant que cet onglet n'avait pas été ouvert dans la session.
  try {
    const accesSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'lecteur')));
    accesCache.length = 0; // garde accesCache à jour même si l'onglet Accès n'a pas encore été ouvert
    accesSnap.docs.forEach(d => accesCache.push({ id: d.id, ...d.data() }));
    document.getElementById('stat-acces').textContent = formatNombre(accesSnap.size);
  } catch (err) {
    document.getElementById('stat-acces').textContent = formatNombre(accesCache.length);
  }

  // Compte "Exercices importés" (et, au passage, "Sociétés avec KPI disponibles") : une requête
  // collectionGroup() directe peut échouer selon la configuration Firestore (index/règles) et
  // retombait silencieusement sur "0" — ce qui donnait un chiffre faux plutôt qu'une erreur visible.
  // On interroge donc directement chaque société (une requête par société, en parallèle), plus
  // robuste, et ça donne aussi le détail par société nécessaire pour la tuile KPI.
  try {
    const comptesParSociete = await Promise.all(
      societesCache.map(s => getDocs(collection(db, 'societes', s.id, 'exercices')))
    );
    const totalExercices = comptesParSociete.reduce((somme, snap) => somme + snap.size, 0);
    const societesAvecKpi = comptesParSociete.filter(snap => snap.size > 0).length;
    document.getElementById('stat-bilans').textContent = formatNombre(totalExercices);
    document.getElementById('stat-kpi').textContent = formatNombre(societesAvecKpi);
  } catch (err) {
    document.getElementById('stat-bilans').textContent = '—';
    document.getElementById('stat-kpi').textContent = '—';
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- KPI ----------
let kpiExercicesCache = []; // tous les exercices (triés par année) de la société actuellement affichée
let kpiExportCourant = { nomSociete: '', periodeLabel: '', kpis: [] }; // pour les boutons Export PDF / Excel

async function loadKpiSociete() {
  const societeId = document.getElementById('kpi-societe-select').value;
  const content = document.getElementById('kpi-content');
  const exerciceSelect = document.getElementById('kpi-exercice-select');

  if (!societeId) {
    content.innerHTML = '<div class="empty-state">Crée d\'abord une société.</div>';
    exerciceSelect.innerHTML = '';
    return;
  }

  // Tri côté client par date de fin (pas de orderBy côté serveur : les exercices importés avant
  // V10-001 n'ont pas de champ dateFin, ce qui les exclurait d'un orderBy Firestore).
  const snap = await getDocs(collection(db, 'societes', societeId, 'exercices'));
  kpiExercicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => periodeDe(a).dateFin.localeCompare(periodeDe(b).dateFin));

  if (kpiExercicesCache.length === 0) {
    exerciceSelect.innerHTML = '';
    content.innerHTML = `<div class="kpi-empty-exercice">Aucun exercice importé pour cette société. Importe un exercice depuis l'onglet <strong>Comptes annuels</strong> pour voir apparaître les KPI.</div>`;
    return;
  }

  // Exercice analysé par défaut : le plus récent (dernière date de fin).
  exerciceSelect.innerHTML = kpiExercicesCache
    .slice().reverse()
    .map(ex => `<option value="${ex.id}">${escapeHtml(labelPeriode(ex))}</option>`).join('');

  renderKpiContent();
}

document.getElementById('kpi-societe-select').addEventListener('change', loadKpiSociete);
document.getElementById('kpi-exercice-select').addEventListener('change', renderKpiContent);

// ---------- Chiffres BNB (lecture des montants bruts, sans ratio) ----------

let bnbExercicesCache = []; // exercices (triés par date de fin) de la société actuellement affichée dans cet onglet

async function loadBnbSociete() {
  const societeId = document.getElementById('bnb-societe-select').value;
  const content = document.getElementById('bnb-content');
  const exerciceSelect = document.getElementById('bnb-exercice-select');

  if (!societeId) {
    content.innerHTML = '<div class="empty-state">Crée d\'abord une société.</div>';
    exerciceSelect.innerHTML = '';
    return;
  }

  const snap = await getDocs(collection(db, 'societes', societeId, 'exercices'));
  bnbExercicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => periodeDe(a).dateFin.localeCompare(periodeDe(b).dateFin));

  if (bnbExercicesCache.length === 0) {
    exerciceSelect.innerHTML = '';
    content.innerHTML = `<div class="kpi-empty-exercice">Aucun exercice importé pour cette société. Importe un exercice depuis l'onglet <strong>Comptes annuels</strong>.</div>`;
    return;
  }

  exerciceSelect.innerHTML = bnbExercicesCache
    .slice().reverse()
    .map(ex => `<option value="${ex.id}">${escapeHtml(labelPeriode(ex))}</option>`).join('');

  renderBnbContent();
}

document.getElementById('bnb-societe-select').addEventListener('change', loadBnbSociete);
document.getElementById('bnb-exercice-select').addEventListener('change', renderBnbContent);

const LABEL_SOURCE_IMPORT = { detaillee: 'Balance détaillée', bnb_officiel: 'Dépôt officiel BNB' };

// Table d'une colonne (Actif / Passif / Produits / Charges) : une ligne par rubrique du groupe
// demandé (valeurs non nulles uniquement, dans l'ordre de RUBRIQUES), plus une ligne Total en gras.
function htmlColonneBnb(titre, groupe, valeurs, totalLabel, total, estMargeBrute) {
  const lignes = RUBRIQUES.filter(r => r.groupe === groupe)
    .map(r => ({
      label: (estMargeBrute && r.key === 'chiffreAffaires') ? "Marge brute (CA non précisé)" : r.label,
      montant: valeurs[r.key] || 0,
    }))
    .filter(l => l.montant !== 0)
    .map(l => `<tr><td>${escapeHtml(l.label)}</td><td style="text-align:right;">${formatEUR(l.montant)}</td></tr>`)
    .join('');
  return `
    <div class="bnb-col">
      <h4>${escapeHtml(titre)}</h4>
      <table class="data-table">
        <tbody>
          ${lignes || '<tr><td colspan="2" style="color:var(--ink-soft);">Aucun montant</td></tr>'}
          <tr class="bnb-total-row"><td>${escapeHtml(totalLabel)}</td><td style="text-align:right;">${formatEUR(total)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function renderBnbContent() {
  const content = document.getElementById('bnb-content');
  const exerciceId = document.getElementById('bnb-exercice-select').value;
  const exercice = bnbExercicesCache.find(ex => ex.id === exerciceId) || bnbExercicesCache[bnbExercicesCache.length - 1];
  if (!exercice) { content.innerHTML = ''; return; }

  const v = exercice.valeurs || {};
  const t = exercice.totaux || {};
  const ecart = Math.round((t.totalActif || 0) - (t.totalPassif || 0));
  const equilibre = Math.abs(ecart) < 1;
  const sourceLabel = LABEL_SOURCE_IMPORT[exercice.typeImport] || 'Bilan BNB';
  const estMargeBrute = estExerciceMargeBrute(exercice);

  const entete = `<p class="panel-sub" style="margin:-4px 0 18px;">
      Période : <strong>${escapeHtml(labelPeriode(exercice))}</strong>
      &nbsp;·&nbsp; Source : <strong>${escapeHtml(sourceLabel)}</strong>
      &nbsp;·&nbsp; ${equilibre ? '✓ Bilan équilibré' : `⚠ Écart actif/passif : ${formatEUR(ecart)}`}
    </p>` + (estMargeBrute ? `
    <div class="kpi-card" style="margin:0 0 16px;border-left:3px solid #9a6700;">
      <p style="margin:0;color:#9a6700;">⚠ Ce dépôt BNB ne précise pas de chiffre d'affaires séparé : la société a opté pour une déclaration en marge brute globale (code 9900), sans détailler achats et chiffre d'affaires. Cette marge brute est affichée ci-dessous à titre informatif, mais elle n'équivaut pas à un chiffre d'affaires — les KPI qui en dépendent (marge nette, marge d'exploitation, délais de paiement) sont marqués non calculables plutôt que faussés.</p>
    </div>` : '');

  const bilan = `
    <h3 class="kpi-group-title">Bilan</h3>
    <div class="bnb-grid">
      ${htmlColonneBnb('Actif', 'Bilan — Actif', v, 'TOTAL ACTIF', t.totalActif, estMargeBrute)}
      ${htmlColonneBnb('Passif', 'Bilan — Passif', v, 'TOTAL PASSIF', t.totalPassif, estMargeBrute)}
    </div>`;

  const compteResultats = `
    <h3 class="kpi-group-title">Compte de résultats</h3>
    <div class="bnb-grid">
      ${htmlColonneBnb('Produits', 'Compte de résultats — Produits', v,
        'TOTAL PRODUITS', (v.chiffreAffaires || 0) + (v.variationStocks || 0) + (v.autresProduitsExploitation || 0) + (v.produitsFinanciers || 0) + (v.produitsExceptionnels || 0), estMargeBrute)}
      ${htmlColonneBnb('Charges', 'Compte de résultats — Charges', v,
        'TOTAL CHARGES', (v.achats || 0) + (v.servicesBiensDivers || 0) + (v.remunerations || 0) + (v.amortissements || 0) + (v.reductionsValeur || 0) + (v.autresChargesExploitation || 0) + (v.chargesFinancieres || 0) + (v.chargesExceptionnelles || 0) + (v.impots || 0), estMargeBrute)}
    </div>`;

  const resultats = `
    <div class="stat-row" style="margin-top:8px;">
      <div class="stat-tile"><div class="num">${formatEUR(t.resultatExploitation)}</div><div class="label">Résultat d'exploitation</div></div>
      <div class="stat-tile"><div class="num">${formatEUR(t.resultatCourant)}</div><div class="label">Résultat courant</div></div>
      <div class="stat-tile"><div class="num">${formatEUR(t.resultatAvantImpot)}</div><div class="label">Résultat avant impôt</div></div>
      <div class="stat-tile"><div class="num">${formatEUR(t.resultatExercice)}</div><div class="label">Résultat de l'exercice</div></div>
    </div>`;

  content.innerHTML = entete + bilan + compteResultats + resultats;
}

function renderKpiContent() {
  const content = document.getElementById('kpi-content');
  const exerciceId = document.getElementById('kpi-exercice-select').value;
  const exercice = kpiExercicesCache.find(ex => ex.id === exerciceId) || kpiExercicesCache[kpiExercicesCache.length - 1];
  if (!exercice) { content.innerHTML = ''; return; }

  const societeId = document.getElementById('kpi-societe-select').value;
  const societeChoisie = societesCache.find(s => s.id === societeId);
  // Taux de TVA moyen de la société (décimal, ex. 0.21), configurable depuis sa fiche — sert à
  // corriger les délais de paiement : les créances/dettes commerciales (codes 40/41 et 44) sont
  // TVA comprise, alors que le CA et les achats/services (70, 60, 61) sont hors TVA.
  const tauxTVA = (typeof societeChoisie?.tauxTVA === 'number') ? societeChoisie.tauxTVA : 0.21;

  const periode = periodeDe(exercice);
  const kpis = calculerKPI(exercice.valeurs, exercice.totaux, periode.nombreMois, tauxTVA, estExerciceMargeBrute(exercice));

  kpiExportCourant = {
    nomSociete: societeChoisie?.nom || '',
    periodeLabel: labelPeriode(exercice),
    kpis,
    sante: null, // renseigné plus bas, une fois le score et les alertes calculés
  };

  // Historique par KPI (tous les exercices importés, pour la sparkline), aligné sur l'ordre chronologique.
  const historiquesParCode = {};
  kpiExercicesCache.forEach(ex => {
    const kpisEx = calculerKPI(ex.valeurs, ex.totaux, periodeDe(ex).nombreMois, tauxTVA, estExerciceMargeBrute(ex));
    kpisEx.forEach(k => {
      if (!historiquesParCode[k.code]) historiquesParCode[k.code] = [];
      historiquesParCode[k.code].push({ label: labelCourtPeriode(ex), value: k.valeur });
    });
  });

  // Score de santé & signaux d'alerte : comparés à l'exercice immédiatement précédent (même liste
  // triée par date de fin que kpiExercicesCache) quand il existe.
  const indexExercice = kpiExercicesCache.findIndex(ex => ex.id === exercice.id);
  const exerciceAnterieur = indexExercice > 0 ? kpiExercicesCache[indexExercice - 1] : null;
  const kpisAnterieurs = exerciceAnterieur
    ? calculerKPI(exerciceAnterieur.valeurs, exerciceAnterieur.totaux, periodeDe(exerciceAnterieur).nombreMois, tauxTVA, estExerciceMargeBrute(exerciceAnterieur))
    : null;
  const scoreGlobal = calculerScoreGlobal(kpis);
  const alertes = detecterSignauxAlerte(exercice.valeurs, exercice.totaux, kpis, kpisAnterieurs, societeChoisie?.statutLegal);
  kpiExportCourant.sante = { scoreGlobal, alertes };

  const idJauge = 'jauge-score-admin';
  const idRadar = 'radar-groupes-admin';
  const idBarres = 'barres-exercices-admin';

  const entete = `<p class="panel-sub" style="margin:-4px 0 14px;">Période analysée : <strong>${escapeHtml(labelPeriode(exercice))}</strong></p>` +
    renderSanteHtml(scoreGlobal, alertes, htmlJaugeScore(idJauge));

  const groupesActuels = scoresParGroupe(kpis);
  const groupesAnterieurs = kpisAnterieurs ? scoresParGroupe(kpisAnterieurs) : null;
  const radarBlock = `
    <div class="chart-card">
      <h4>Profil global (4 groupes de KPI)</h4>
      <div class="chart-card-wrap">${htmlRadarGroupes(idRadar)}</div>
    </div>`;

  // Comparaison par exercice (CA, résultat, total actif) : seulement si au moins 2 exercices.
  const barresBlock = kpiExercicesCache.length >= 2 ? `
    <div class="chart-card">
      <h4>Comparaison par exercice</h4>
      <div class="chart-card-wrap courte">${htmlBarresExercices(idBarres)}</div>
    </div>` : '';

  // idCourbe -> { historique, format }, rempli pendant la construction du HTML et consommé juste
  // après pour instancier les graphiques (les <canvas> n'existent qu'une fois innerHTML affecté).
  const courbesAMonter = {};

  const html = GROUPES_KPI.map(groupe => {
    const kpisDuGroupe = kpis.filter(k => k.groupe === groupe);
    const cards = kpisDuGroupe.map(k => {
      const format = k.code.includes('liquidite') ? 'ratio' :
        ['solvabilite', 'endettement', 'marge_nette', 'marge_exploitation', 'roe', 'roa'].includes(k.code) ? 'pct' :
        k.code.includes('delai') || k.code === 'ecart_delais' || k.code === 'rotation_stocks' ? 'jours' : null;
      const sensInverse = k.code === 'ecart_delais';
      const parMois = (k.parMois && periode.nombreMois !== 12) ? ` <span style="font-weight:400;font-size:12px;color:var(--ink-soft);">(${k.parMois}/mois)</span>` : '';
      const historique = historiquesParCode[k.code] || [];
      const assezDePoints = historique.filter(p => typeof p.value === 'number').length >= 2;
      const idCourbe = `kc-admin-${k.code}`;
      const courbeOuSpark = assezDePoints
        ? `<div class="chart-card-wrap courte" style="height:110px;">${htmlCourbeKpi(idCourbe)}</div>`
        : renderSparkline(historique, { format, sensInverse });
      if (assezDePoints) courbesAMonter[idCourbe] = { historique, format, sensInverse };
      const lignesDetail = detailKpi(k.code, exercice.valeurs, exercice.totaux, exercice.typeImport, societeChoisie?.mappingComptes);
      return `
        <div class="kpi-card">
          <div class="kpi-card-head">
            <h4>${escapeHtml(k.label)}</h4>
            <span class="kpi-badge ${k.statut}">${labelStatut(k.statut)}</span>
          </div>
          <div class="kpi-value">${escapeHtml(k.affichage)}${parMois}</div>
          ${courbeOuSpark}
          <p class="kpi-analyse">${escapeHtml(k.analyse)}</p>
          ${htmlDetailKpi(lignesDetail)}
        </div>`;
    }).join('');
    return `<h3 class="kpi-group-title">${escapeHtml(groupe)}</h3><div class="kpi-grid">${cards}</div>`;
  }).join('');

  content.innerHTML = entete + radarBlock + barresBlock + html;

  // Les <canvas> n'existent qu'une fois innerHTML affecté : on instancie/rafraîchit les graphiques
  // Chart.js juste après (ils remplacent toute instance précédente sur le même id).
  montrerJaugeScore(idJauge, scoreGlobal);
  montrerRadarGroupes(idRadar, groupesActuels, groupesAnterieurs, exerciceAnterieur ? labelCourtPeriode(exerciceAnterieur) : null);
  if (kpiExercicesCache.length >= 2) {
    montrerBarresExercices(idBarres, kpiExercicesCache.map(ex => labelCourtPeriode(ex)), [
      { label: "Chiffre d'affaires (ou marge brute)", data: kpiExercicesCache.map(ex => ex.valeurs?.chiffreAffaires || 0), color: '#316A6C' },
      { label: "Résultat de l'exercice", data: kpiExercicesCache.map(ex => ex.totaux?.resultatExercice || 0), color: '#0B1B32' },
      { label: 'Total actif', data: kpiExercicesCache.map(ex => ex.totaux?.totalActif || 0), color: '#C9A227' },
    ]);
  }
  Object.entries(courbesAMonter).forEach(([id, { historique, format, sensInverse }]) => montrerCourbeKpi(id, historique, { format, sensInverse }));
}

// Section dépliable "Voir le détail du calcul" : une ligne par rubrique PCMN/BNB impliquée dans
// le KPI, triée par poids décroissant, pour repérer d'un coup d'œil quel compte pèse le plus
// (en bien ou en mal) dans le résultat affiché.
function htmlDetailKpi(lignes) {
  if (!lignes || lignes.length === 0) return '';
  const rows = lignes.map(l => `
    <tr>
      <td>
        <div class="detail-label">${escapeHtml(l.label)}</div>
        <div class="detail-source">${escapeHtml(l.source)}</div>
      </td>
      <td class="detail-montant ${l.montant < 0 ? 'neg' : ''}">${l.montant >= 0 ? '+' : ''}${formatEUR(l.montant)}</td>
    </tr>`).join('');
  return `
    <details class="kpi-detail">
      <summary>Voir le détail du calcul</summary>
      <table class="kpi-detail-table">
        <thead><tr><th>Rubrique</th><th>Contribution</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>`;
}

function labelStatut(statut) {
  return { bon: 'Bon', correct: 'Correct', fragile: 'À surveiller', neutre: '—' }[statut] || '—';
}

// Capture un <canvas> Chart.js déjà affiché à l'écran en image PNG, pour l'insérer dans l'export
// PDF (voir export.js) — renvoie null si le canvas n'existe pas ou n'a pas pu être capturé (ex.
// graphique pas encore monté faute de données suffisantes), auquel cas le PDF se passe de l'image.
function capturerCanvas(id) {
  const c = document.getElementById(id);
  if (!c) return null;
  try { return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height }; } catch (e) { return null; }
}

document.getElementById('kpi-export-pdf').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) { toast("Sélectionne d'abord une société avec un exercice importé.", true); return; }
  const graphiques = {
    jauge: capturerCanvas('jauge-score-admin'),
    radar: capturerCanvas('radar-groupes-admin'),
    barres: kpiExercicesCache.length >= 2 ? capturerCanvas('barres-exercices-admin') : null,
    courbes: {},
  };
  kpiExportCourant.kpis.forEach(k => {
    const img = capturerCanvas(`kc-admin-${k.code}`);
    if (img) graphiques.courbes[k.code] = img;
  });
  exportKpiPdf(kpiExportCourant.nomSociete, kpiExportCourant.periodeLabel, kpiExportCourant.kpis, kpiExportCourant.sante, graphiques);
});
document.getElementById('kpi-export-excel').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) { toast("Sélectionne d'abord une société avec un exercice importé.", true); return; }
  exportKpiExcel(kpiExportCourant.nomSociete, kpiExportCourant.periodeLabel, kpiExportCourant.kpis, kpiExportCourant.sante);
});

// ---------- Contenu éditable des pages publiques ----------
const CONTENU_CLES = [
  'heroTitre', 'heroTitreAccent', 'heroTexte', 'baseline',
  'featuresKicker', 'featuresTitre',
  'feature1Titre', 'feature1Texte', 'feature2Titre', 'feature2Texte',
  'feature3Titre', 'feature3Texte', 'feature4Titre', 'feature4Texte',
  'feature5Titre', 'feature5Texte',
  'accesTitre', 'accesTexte',
  'legalSecurisation', 'legalConfidentialite', 'legalEthique',
  'legalCookies', 'legalResponsabilite', 'legalMentions',
];

async function loadContenu() {
  const snap = await getDoc(doc(db, 'contenu', 'site'));
  const data = snap.exists() ? snap.data() : {};
  CONTENU_CLES.forEach(cle => {
    const el = document.getElementById('c-' + cle);
    if (el) el.value = data[cle] || '';
  });
}

document.getElementById('form-contenu').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('contenu-msg');
  msg.textContent = '';
  msg.className = 'login-msg';

  const payload = {};
  CONTENU_CLES.forEach(cle => {
    const el = document.getElementById('c-' + cle);
    if (el) payload[cle] = el.value;
  });

  try {
    await setDoc(doc(db, 'contenu', 'site'), payload, { merge: true });
    msg.textContent = 'Contenu enregistré — visible immédiatement sur le site public.';
    msg.classList.add('ok');
    toast('Contenu mis à jour.');
  } catch (err) {
    msg.textContent = "Erreur : " + err.message;
    msg.classList.add('error');
  }
});

// ---------- Maintenance — Dernières connexions (Super Admin) ----------
async function loadConnexions() {
  if (currentRole !== 'superadmin') return;
  const el = document.getElementById('connexions-list');
  el.innerHTML = '<div class="empty-state">Chargement…</div>';

  const snap = await getDocs(collection(db, 'users'));
  const utilisateurs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  utilisateurs.sort((a, b) => {
    const ta = a.derniereConnexion?.toMillis ? a.derniereConnexion.toMillis() : 0;
    const tb = b.derniereConnexion?.toMillis ? b.derniereConnexion.toMillis() : 0;
    return tb - ta;
  });

  if (utilisateurs.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun compte pour l\'instant.</div>';
    return;
  }

  const rows = utilisateurs.map(u => `
    <tr>
      <td><strong>${escapeHtml(u.prenom || '')} ${escapeHtml(u.nom || '')}</strong><br><span style="color:var(--ink-soft);font-size:12px;">${escapeHtml(u.identifiant || u.email || '')}</span></td>
      <td style="text-transform:capitalize;">${escapeHtml(labelRole(u.role))}</td>
      <td>${formatDateHeure(u.derniereConnexion)}</td>
    </tr>`).join('');

  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Personne</th><th>Rôle</th><th>Dernier passage</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function labelRole(role) {
  return { superadmin: 'Super Admin', admin: 'Admin', lecteur: 'Accès résultats' }[role] || role || '—';
}

function formatDateHeure(timestamp) {
  if (!timestamp?.toDate) return 'Jamais connecté';
  const d = timestamp.toDate();
  return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' à ' + d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}
