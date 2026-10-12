// Arithmos — Espace "Résultats" (comptes à accès limité, rôle "lecteur") — V10-001
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, serverTimestamp, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { calculerKPI, GROUPES_KPI } from "./kpi.js";
import { renderSparkline } from "./charts.js";
import { exportKpiPdf, exportKpiExcel } from "./export.js";
import { periodeDe, labelPeriode, labelCourtPeriode } from "./periode.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let societesAutorisees = []; // [{id, nom}]
let exercicesCache = [];
let kpiExportCourant = { nomSociete: '', periodeLabel: '', kpis: [] }; // pour les boutons Export PDF / Excel

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

  // Tri côté client par date de fin (pas de orderBy côté serveur : les exercices importés avant
  // V10-001 n'ont pas de champ dateFin, ce qui les exclurait d'un orderBy Firestore).
  const snap = await getDocs(collection(db, 'societes', societeId, 'exercices'));
  exercicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => periodeDe(a).dateFin.localeCompare(periodeDe(b).dateFin));

  if (exercicesCache.length === 0) {
    exerciceSelect.innerHTML = '';
    content.innerHTML = '<div class="kpi-empty-exercice">Aucun exercice n\'a encore été importé pour cette société.</div>';
    return;
  }

  exerciceSelect.innerHTML = exercicesCache.slice().reverse()
    .map(ex => `<option value="${ex.id}">${escapeHtml(labelPeriode(ex))}</option>`).join('');
  renderContent();
}

function renderContent() {
  const content = document.getElementById('resultats-content');
  const exerciceId = document.getElementById('resultats-exercice-select').value;
  const exercice = exercicesCache.find(ex => ex.id === exerciceId) || exercicesCache[exercicesCache.length - 1];
  if (!exercice) { content.innerHTML = ''; return; }

  const periode = periodeDe(exercice);
  const kpis = calculerKPI(exercice.valeurs, exercice.totaux, periode.nombreMois);

  const societeId = document.getElementById('resultats-societe-select').value;
  kpiExportCourant = {
    nomSociete: societesAutorisees.find(s => s.id === societeId)?.nom || '',
    periodeLabel: labelPeriode(exercice),
    kpis,
  };

  const historiquesParCode = {};
  exercicesCache.forEach(ex => {
    const kpisEx = calculerKPI(ex.valeurs, ex.totaux, periodeDe(ex).nombreMois);
    kpisEx.forEach(k => {
      if (!historiquesParCode[k.code]) historiquesParCode[k.code] = [];
      historiquesParCode[k.code].push({ label: labelCourtPeriode(ex), value: k.valeur });
    });
  });

  const entete = `<p class="panel-sub" style="margin:-4px 0 14px;">Période analysée : <strong>${escapeHtml(labelPeriode(exercice))}</strong></p>`;

  content.innerHTML = entete + GROUPES_KPI.map(groupe => {
    const kpisDuGroupe = kpis.filter(k => k.groupe === groupe);
    const cards = kpisDuGroupe.map(k => {
      const format = k.code.includes('liquidite') ? 'ratio' :
        ['solvabilite', 'endettement', 'marge_nette', 'marge_exploitation', 'roe', 'roa'].includes(k.code) ? 'pct' : null;
      const parMois = (k.parMois && periode.nombreMois !== 12) ? ` <span style="font-weight:400;font-size:12px;color:var(--ink-soft);">(${k.parMois}/mois)</span>` : '';
      return `
        <div class="kpi-card">
          <div class="kpi-card-head">
            <h4>${escapeHtml(k.label)}</h4>
            <span class="kpi-badge ${k.statut}">${labelStatut(k.statut)}</span>
          </div>
          <div class="kpi-value">${escapeHtml(k.affichage)}${parMois}</div>
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
  exportKpiPdf(kpiExportCourant.nomSociete, kpiExportCourant.periodeLabel, kpiExportCourant.kpis);
});
document.getElementById('resultats-export-excel').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) return;
  exportKpiExcel(kpiExportCourant.nomSociete, kpiExportCourant.periodeLabel, kpiExportCourant.kpis);
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
