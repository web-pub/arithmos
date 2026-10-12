// Arithmos — Espace "Résultats" (comptes à accès limité, rôle "lecteur") — V09-001
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { calculerKPI, GROUPES_KPI } from "./kpi.js";
import { renderSparkline } from "./charts.js";
import { exportKpiPdf, exportKpiExcel } from "./export.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let societesAutorisees = []; // [{id, nom}]
let exercicesCache = [];
let kpiExportCourant = { nomSociete: '', annee: null, kpis: [] }; // pour les boutons Export PDF / Excel

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  document.getElementById('user-email').textContent = user.email;

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists()) {
    document.getElementById('resultats-content').innerHTML =
      '<div class="empty-state">Aucun profil Arithmos associé à ce compte. Contacte l\'administrateur.</div>';
    return;
  }
  const profile = profileSnap.data();

  // Trace du passage sur le site (visible en Maintenance, Super Admin uniquement) — non bloquant.
  updateDoc(doc(db, 'users', user.uid), { derniereConnexion: serverTimestamp() }).catch(() => {});

  // Cette page est réservée aux comptes "lecteur" — les comptes Admin/Super Admin ont leur propre espace.
  if (profile.role !== 'lecteur') {
    window.location.href = 'admin.html';
    return;
  }

  document.getElementById('resultats-sub').textContent = `Bonjour ${profile.prenom || ''}, voici les indicateurs des sociétés auxquelles tu as accès.`;

  const ids = profile.societesAutorisees || [];
  if (ids.length === 0) {
    document.getElementById('resultats-content').innerHTML =
      '<div class="empty-state">Aucune société ne t\'a encore été ouverte. Contacte l\'administrateur si tu penses que c\'est une erreur.</div>';
    return;
  }

  const societeDocs = await Promise.all(ids.map(id => getDoc(doc(db, 'societes', id))));
  societesAutorisees = societeDocs
    .filter(s => s.exists())
    .map(s => ({ id: s.id, nom: s.data().nom }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  if (societesAutorisees.length === 0) {
    document.getElementById('resultats-content').innerHTML =
      '<div class="empty-state">Les sociétés associées à ton accès ne sont plus disponibles. Contacte l\'administrateur.</div>';
    return;
  }

  document.getElementById('resultats-toolbar').style.display = 'flex';
  const societeSelect = document.getElementById('resultats-societe-select');
  societeSelect.innerHTML = societesAutorisees.map(s => `<option value="${s.id}">${escapeHtml(s.nom)}</option>`).join('');
  societeSelect.addEventListener('change', loadExercicesEtAfficher);
  document.getElementById('resultats-exercice-select').addEventListener('change', renderContent);

  await loadExercicesEtAfficher();
});

async function loadExercicesEtAfficher() {
  const societeId = document.getElementById('resultats-societe-select').value;
  const exerciceSelect = document.getElementById('resultats-exercice-select');
  const content = document.getElementById('resultats-content');

  const snap = await getDocs(query(collection(db, 'societes', societeId, 'exercices'), orderBy('annee', 'asc')));
  exercicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (exercicesCache.length === 0) {
    exerciceSelect.innerHTML = '';
    content.innerHTML = '<div class="kpi-empty-exercice">Aucun exercice n\'a encore été importé pour cette société.</div>';
    return;
  }

  exerciceSelect.innerHTML = exercicesCache.slice().reverse().map(ex => `<option value="${ex.annee}">${ex.annee}</option>`).join('');
  renderContent();
}

function renderContent() {
  const content = document.getElementById('resultats-content');
  const anneeSelectionnee = parseInt(document.getElementById('resultats-exercice-select').value, 10);
  const exercice = exercicesCache.find(ex => ex.annee === anneeSelectionnee) || exercicesCache[exercicesCache.length - 1];
  if (!exercice) { content.innerHTML = ''; return; }

  const kpis = calculerKPI(exercice.valeurs, exercice.totaux);

  const societeId = document.getElementById('resultats-societe-select').value;
  kpiExportCourant = {
    nomSociete: societesAutorisees.find(s => s.id === societeId)?.nom || '',
    annee: exercice.annee,
    kpis,
  };

  const historiquesParCode = {};
  exercicesCache.forEach(ex => {
    const kpisEx = calculerKPI(ex.valeurs, ex.totaux);
    kpisEx.forEach(k => {
      if (!historiquesParCode[k.code]) historiquesParCode[k.code] = [];
      historiquesParCode[k.code].push({ label: String(ex.annee), value: k.valeur });
    });
  });

  content.innerHTML = GROUPES_KPI.map(groupe => {
    const kpisDuGroupe = kpis.filter(k => k.groupe === groupe);
    const cards = kpisDuGroupe.map(k => {
      const format = k.code.includes('liquidite') ? 'ratio' :
        ['solvabilite', 'endettement', 'marge_nette', 'marge_exploitation', 'roe', 'roa'].includes(k.code) ? 'pct' : null;
      return `
        <div class="kpi-card">
          <div class="kpi-card-head">
            <h4>${escapeHtml(k.label)}</h4>
            <span class="kpi-badge ${k.statut}">${labelStatut(k.statut)}</span>
          </div>
          <div class="kpi-value">${escapeHtml(k.affichage)}</div>
          ${renderSparkline(historiquesParCode[k.code] || [], { format })}
          <p class="kpi-analyse">${escapeHtml(k.analyse)}</p>
        </div>`;
    }).join('');
    return `<h3 class="kpi-group-title">${escapeHtml(groupe)}</h3><div class="kpi-grid">${cards}</div>`;
  }).join('');
}

function labelStatut(statut) {
  return { bon: 'Bon', correct: 'Correct', fragile: 'À surveiller', neutre: '—' }[statut] || '—';
}

document.getElementById('resultats-export-pdf').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) return;
  exportKpiPdf(kpiExportCourant.nomSociete, kpiExportCourant.annee, kpiExportCourant.kpis);
});
document.getElementById('resultats-export-excel').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) return;
  exportKpiExcel(kpiExportCourant.nomSociete, kpiExportCourant.annee, kpiExportCourant.kpis);
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
