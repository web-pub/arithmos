// Arithmos — Espace "Résultats" (comptes à accès limité, rôle "lecteur") — V10-001
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, serverTimestamp, collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { calculerKPI, GROUPES_KPI } from "./kpi.js";
import {
  renderSparkline, htmlCourbeKpi, montrerCourbeKpi, htmlJaugeScore, montrerJaugeScore,
  htmlRadarGroupes, montrerRadarGroupes, htmlBarresExercices, montrerBarresExercices,
} from "./charts.js";
import { exportKpiPdf, exportKpiExcel } from "./export.js";
import { periodeDe, labelPeriode, labelCourtPeriode } from "./periode.js";
import { calculerScoreGlobal, detecterSignauxAlerte, renderSanteHtml, scoresParGroupe } from "./sante.js";
import { detailKpi, estExerciceMargeBrute } from "./tracabilite.js";

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
    .map(s => ({ id: s.id, nom: s.data().nom, statutLegal: s.data().statutLegal, mappingComptes: s.data().mappingComptes, tauxTVA: s.data().tauxTVA }))
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

  const societeId = document.getElementById('resultats-societe-select').value;
  const societeChoisie = societesAutorisees.find(s => s.id === societeId);
  // Voir admin.js (version jumelle) : corrige le décalage TVAC (créances/dettes commerciales) vs
  // HTVA (CA/achats) dans les 2 délais de paiement.
  const tauxTVA = (typeof societeChoisie?.tauxTVA === 'number') ? societeChoisie.tauxTVA : 0.21;

  const periode = periodeDe(exercice);
  const kpis = calculerKPI(exercice.valeurs, exercice.totaux, periode.nombreMois, tauxTVA, estExerciceMargeBrute(exercice));

  kpiExportCourant = {
    nomSociete: societeChoisie?.nom || '',
    periodeLabel: labelPeriode(exercice),
    kpis,
    sante: null,
  };

  const historiquesParCode = {};
  exercicesCache.forEach(ex => {
    const kpisEx = calculerKPI(ex.valeurs, ex.totaux, periodeDe(ex).nombreMois, tauxTVA, estExerciceMargeBrute(ex));
    kpisEx.forEach(k => {
      if (!historiquesParCode[k.code]) historiquesParCode[k.code] = [];
      historiquesParCode[k.code].push({ label: labelCourtPeriode(ex), value: k.valeur });
    });
  });

  const indexExercice = exercicesCache.findIndex(ex => ex.id === exercice.id);
  const exerciceAnterieur = indexExercice > 0 ? exercicesCache[indexExercice - 1] : null;
  const kpisAnterieurs = exerciceAnterieur
    ? calculerKPI(exerciceAnterieur.valeurs, exerciceAnterieur.totaux, periodeDe(exerciceAnterieur).nombreMois, tauxTVA, estExerciceMargeBrute(exerciceAnterieur))
    : null;
  const scoreGlobal = calculerScoreGlobal(kpis);
  const alertes = detecterSignauxAlerte(exercice.valeurs, exercice.totaux, kpis, kpisAnterieurs, societeChoisie?.statutLegal);
  kpiExportCourant.sante = { scoreGlobal, alertes };

  const idJauge = 'jauge-score-resultats';
  const idRadar = 'radar-groupes-resultats';
  const idBarres = 'barres-exercices-resultats';

  const entete = `<p class="panel-sub" style="margin:-4px 0 14px;">Période analysée : <strong>${escapeHtml(labelPeriode(exercice))}</strong></p>` +
    renderSanteHtml(scoreGlobal, alertes, htmlJaugeScore(idJauge));

  const groupesActuels = scoresParGroupe(kpis);
  const groupesAnterieurs = kpisAnterieurs ? scoresParGroupe(kpisAnterieurs) : null;
  const radarBlock = `
    <div class="chart-card">
      <h4>Profil global (4 groupes de KPI)</h4>
      <div class="chart-card-wrap">${htmlRadarGroupes(idRadar)}</div>
    </div>`;

  const barresBlock = exercicesCache.length >= 2 ? `
    <div class="chart-card">
      <h4>Comparaison par exercice</h4>
      <div class="chart-card-wrap courte">${htmlBarresExercices(idBarres)}</div>
    </div>` : '';

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
      const idCourbe = `kc-resultats-${k.code}`;
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

  montrerJaugeScore(idJauge, scoreGlobal);
  montrerRadarGroupes(idRadar, groupesActuels, groupesAnterieurs, exerciceAnterieur ? labelCourtPeriode(exerciceAnterieur) : null);
  if (exercicesCache.length >= 2) {
    montrerBarresExercices(idBarres, exercicesCache.map(ex => labelCourtPeriode(ex)), [
      { label: "Chiffre d'affaires (ou marge brute)", data: exercicesCache.map(ex => ex.valeurs?.chiffreAffaires || 0), color: '#316A6C' },
      { label: "Résultat de l'exercice", data: exercicesCache.map(ex => ex.totaux?.resultatExercice || 0), color: '#0B1B32' },
      { label: 'Total actif', data: exercicesCache.map(ex => ex.totaux?.totalActif || 0), color: '#C9A227' },
    ]);
  }
  Object.entries(courbesAMonter).forEach(([id, { historique, format, sensInverse }]) => montrerCourbeKpi(id, historique, { format, sensInverse }));
}

function labelStatut(statut) {
  return { bon: 'Bon', correct: 'Correct', fragile: 'À surveiller', neutre: '—' }[statut] || '—';
}

function formatEUR(n) {
  if (typeof n !== 'number') return '—';
  return n.toLocaleString('fr-BE', { maximumFractionDigits: 0 }) + ' €';
}

// Section dépliable "Voir le détail du calcul" : une ligne par rubrique PCMN/BNB impliquée dans
// le KPI, triée par poids décroissant (voir admin.js pour la version jumelle de cette fonction).
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

// Capture un <canvas> Chart.js déjà affiché à l'écran en image PNG, pour l'insérer dans l'export
// PDF (voir export.js, version jumelle de cette fonction dans admin.js).
function capturerCanvas(id) {
  const c = document.getElementById(id);
  if (!c) return null;
  try { return { dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height }; } catch (e) { return null; }
}

document.getElementById('resultats-export-pdf').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) return;
  const graphiques = {
    jauge: capturerCanvas('jauge-score-resultats'),
    radar: capturerCanvas('radar-groupes-resultats'),
    barres: exercicesCache.length >= 2 ? capturerCanvas('barres-exercices-resultats') : null,
    courbes: {},
  };
  kpiExportCourant.kpis.forEach(k => {
    const img = capturerCanvas(`kc-resultats-${k.code}`);
    if (img) graphiques.courbes[k.code] = img;
  });
  exportKpiPdf(kpiExportCourant.nomSociete, kpiExportCourant.periodeLabel, kpiExportCourant.kpis, kpiExportCourant.sante, graphiques);
});
document.getElementById('resultats-export-excel').addEventListener('click', () => {
  if (!kpiExportCourant.kpis.length) return;
  exportKpiExcel(kpiExportCourant.nomSociete, kpiExportCourant.periodeLabel, kpiExportCourant.kpis, kpiExportCourant.sante);
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
