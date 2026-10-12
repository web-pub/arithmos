// Arithmos — Espace Admin (V03-002)
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  updatePassword, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, collectionGroup, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

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
document.querySelectorAll('#admin-tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#admin-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'passwords') loadPasswordsPanel();
    if (btn.dataset.tab === 'comptes') loadExercices();
  });
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

  if (currentRole === 'lecteur') {
    // L'espace Admin n'est pas destiné aux comptes "accès résultats".
    toast("Cet espace est réservé à l'équipe Admin.", true);
    document.querySelector('.admin-main').innerHTML =
      '<div class="empty-state">Ce compte a un accès "résultats" uniquement. L\'espace de consultation dédié arrive avec le chantier KPI.</div>';
    document.getElementById('admin-tabs').style.display = 'none';
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
  const prevValue = compteSelect.value;
  compteSelect.innerHTML = options;
  exerciceSelect.innerHTML = options;
  if (societesCache.some(s => s.id === prevValue)) compteSelect.value = prevValue;
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
      <td class="row-actions">
        <button class="btn-outline" data-edit-societe="${s.id}">Modifier</button>
        <button class="btn-outline btn-danger" data-delete-societe="${s.id}">Supprimer</button>
      </td>
    </tr>`).join('');
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Société</th><th>Forme juridique</th><th>N° entreprise</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;

  el.querySelectorAll('[data-edit-societe]').forEach(b => b.addEventListener('click', () => editSociete(b.dataset.editSociete)));
  el.querySelectorAll('[data-delete-societe]').forEach(b => b.addEventListener('click', () => deleteSociete(b.dataset.deleteSociete)));
}

document.getElementById('btn-new-societe').addEventListener('click', () => {
  document.getElementById('societe-modal-title').textContent = 'Nouvelle société';
  document.getElementById('form-societe').reset();
  document.getElementById('societe-id').value = '';
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
  openModal('modal-societe');
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

function parseArithmosWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const valeurs = {};
  let societeFichier = '', anneeFichier = '';

  rows.forEach((row, idx) => {
    const a = String(row[0] ?? '').trim();
    const b = String(row[1] ?? '').trim();
    const c = row[2];

    if (b === 'Société' && !societeFichier) societeFichier = String(c ?? '').trim();
    if (b === 'Exercice (année)' && !anneeFichier) anneeFichier = String(c ?? '').trim();

    if (CODE_MAP[a] && typeof c === 'number') {
      valeurs[CODE_MAP[a]] = c;
    }
  });

  return { valeurs, societeFichier, anneeFichier, totaux: computeTotaux(valeurs) };
}

async function loadExercices() {
  const societeId = document.getElementById('comptes-societe-select').value;
  const el = document.getElementById('exercices-list');
  if (!societeId) {
    el.innerHTML = '<div class="empty-state">Crée d\'abord une société.</div>';
    exercicesCache = [];
    return;
  }
  const snap = await getDocs(query(collection(db, 'societes', societeId, 'exercices'), orderBy('annee', 'desc')));
  exercicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
      <td><strong>${escapeHtml(String(ex.annee))}</strong></td>
      <td>${formatEUR(t.totalActif)}</td>
      <td>${formatEUR(t.resultatExercice)}</td>
      <td>${equilibre ? '✓ équilibré' : `⚠ écart ${formatEUR(ecart)}`}</td>
      <td class="row-actions">
        <button class="btn-outline btn-danger" data-delete-exercice="${ex.id}" data-societe="${societeId}">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table class="data-table">
    <thead><tr><th>Exercice</th><th>Total actif</th><th>Résultat de l'exercice</th><th>Équilibre</th><th></th></tr></thead>
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
  if (societeId) document.getElementById('exercice-societe').value = societeId;
  openModal('modal-exercice');
});

document.getElementById('form-exercice').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('exercice-msg');
  msg.textContent = '';
  msg.className = 'login-msg';

  const societeId = document.getElementById('exercice-societe').value;
  const annee = parseInt(document.getElementById('exercice-annee').value, 10);
  const fileInput = document.getElementById('exercice-fichier');
  const file = fileInput.files[0];
  if (!societeId || !annee || !file) return;

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseArithmosWorkbook(buffer);

    if (Object.keys(parsed.valeurs).length === 0) {
      msg.textContent = "Aucune donnée reconnue dans ce fichier — utilise le modèle Arithmos sans modifier les codes/libellés.";
      msg.classList.add('error');
      return;
    }

    const societeNom = societesCache.find(s => s.id === societeId)?.nom || '';
    if (parsed.societeFichier && parsed.societeFichier.toLowerCase() !== societeNom.toLowerCase()) {
      msg.textContent = `Attention : le fichier indique "${parsed.societeFichier}", différent de la société sélectionnée (${societeNom}). Import quand même sous ${societeNom}.`;
      msg.classList.add('warn');
    }
    if (parsed.anneeFichier && parseInt(parsed.anneeFichier, 10) !== annee) {
      toast(`Le fichier indiquait l'exercice ${parsed.anneeFichier}, importé sous ${annee} comme sélectionné.`);
    }

    await setDoc(doc(db, 'societes', societeId, 'exercices', String(annee)), {
      annee,
      valeurs: parsed.valeurs,
      totaux: parsed.totaux,
      dateImport: serverTimestamp(),
      importePar: currentUid,
    });

    toast(`Exercice ${annee} importé.`);
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
async function loadDashboard() {
  document.getElementById('stat-societes').textContent = societesCache.length || '0';
  document.getElementById('stat-acces').textContent = accesCache.length || '0';
  try {
    const snap = await getDocs(collectionGroup(db, 'exercices'));
    document.getElementById('stat-bilans').textContent = snap.size || '0';
  } catch (err) {
    document.getElementById('stat-bilans').textContent = '0';
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
