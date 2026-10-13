// Arithmos — Score de santé financière & signaux d'alerte (V12-001)
// S'inspire des rapports de type GraydonCreditsafe (score global + alertes) mais reste une
// SYNTHÈSE HEURISTIQUE à base de règles et de seuils comptables usuels, construite à partir des
// 11 KPI déjà calculés par kpi.js — PAS une probabilité statistique de faillite (un vrai modèle de
// ce type s'entraîne sur des milliers de cas réels de faillite, ce qu'Arithmos n'a pas). Le but est
// de donner un indicateur de santé lisible en un coup d'œil, jamais une prédiction chiffrée de risque.

const POINTS_STATUT = { bon: 100, correct: 60, fragile: 20 };

// Score /100 par groupe (Liquidité, Solvabilité, Rentabilité, Trésorerie) — même échelle et même
// logique que calculerScoreGlobal(), réutilisée pour le radar des 4 groupes (charts.js).
export function scoresParGroupe(kpis) {
  const parGroupe = {};
  (kpis || []).forEach(k => {
    const pts = POINTS_STATUT[k.statut];
    if (pts === undefined) return;
    (parGroupe[k.groupe] = parGroupe[k.groupe] || []).push(pts);
  });
  const resultat = {};
  Object.keys(parGroupe).forEach(g => {
    resultat[g] = Math.round(parGroupe[g].reduce((a, b) => a + b, 0) / parGroupe[g].length);
  });
  return resultat;
}

// Calcule un score global /100 + une note A-D, en moyennant d'abord les KPI par groupe (Liquidité,
// Solvabilité, Rentabilité, Trésorerie), puis les 4 groupes entre eux — pour que la rentabilité
// (4 KPI) ne pèse pas plus lourd que la trésorerie (2 KPI) dans la synthèse.
export function calculerScoreGlobal(kpis) {
  const parGroupe = {};
  (kpis || []).forEach(k => {
    const pts = POINTS_STATUT[k.statut];
    if (pts === undefined) return; // statut "neutre" (KPI non calculable) : exclu du score
    (parGroupe[k.groupe] = parGroupe[k.groupe] || []).push(pts);
  });

  const scoresGroupes = Object.values(parGroupe).map(pts => pts.reduce((a, b) => a + b, 0) / pts.length);
  if (scoresGroupes.length === 0) {
    return { score: null, note: 'E', label: 'Non noté', affichage: '—', detail: "Pas assez de données pour calculer un score de synthèse." };
  }

  const score = Math.round(scoresGroupes.reduce((a, b) => a + b, 0) / scoresGroupes.length);
  let note, label;
  if (score >= 80) { note = 'A'; label = 'Solide'; }
  else if (score >= 60) { note = 'B'; label = 'Correct'; }
  else if (score >= 40) { note = 'C'; label = 'Fragile'; }
  else { note = 'D'; label = 'À risque'; }

  const nbCalcules = Object.values(parGroupe).reduce((a, pts) => a + pts.length, 0);
  return {
    score, note, label, affichage: `${note} — ${score}/100`,
    detail: `Synthèse de ${nbCalcules} indicateur${nbCalcules > 1 ? 's' : ''} calculé${nbCalcules > 1 ? 's' : ''} (liquidité, solvabilité, rentabilité, trésorerie, délais de paiement), à seuils comptables usuels pour une PME belge — un indicateur de santé, pas une probabilité statistique de faillite.`,
  };
}

// Liste les points de vigilance détectés automatiquement sur l'exercice analysé, et leur évolution
// par rapport à l'exercice précédent quand il est disponible (kpisAnterieurs = tableau calculerKPI()
// de l'exercice N-1, ou null/undefined si aucun historique).
export function detecterSignauxAlerte(valeurs, totaux, kpis, kpisAnterieurs, statutLegal) {
  const v = valeurs || {};
  const t = totaux || {};
  const parCode = {};
  (kpis || []).forEach(k => parCode[k.code] = k);
  const parCodeAnt = {};
  (kpisAnterieurs || []).forEach(k => parCodeAnt[k.code] = k);

  const alertes = [];
  const ajoute = (severite, texte) => alertes.push({ severite, texte });

  if (statutLegal && statutLegal !== 'normal') {
    const labels = {
      surveillance: "Cette société est signalée comme sous surveillance.",
      reorganisation: "Cette société est signalée en réorganisation judiciaire.",
      faillite: "Cette société est signalée en faillite déclarée.",
      liquidation: "Cette société est signalée en dissolution / liquidation.",
    };
    ajoute('critique', labels[statutLegal] || "Statut légal à risque signalé pour cette société.");
  }

  if ((v.capitauxPropres || 0) < 0) {
    ajoute('critique', "Capitaux propres négatifs : l'actif ne couvre plus les dettes envers les tiers (insolvabilité technique) — une procédure de sonnette d'alarme peut s'appliquer.");
  }
  const perteExercice = (t.resultatExercice || 0) < 0;
  if (perteExercice) ajoute('attention', "L'exercice se solde par une perte.");

  if (perteExercice && kpisAnterieurs) {
    // On retrouve le résultat de l'exercice précédent via le cash-flow/marge nette n'est pas fiable :
    // on se base sur le signe de la marge nette (même dénominateur, même sens) de l'exercice précédent.
    const margeAnt = parCodeAnt['marge_nette'];
    if (margeAnt && margeAnt.valeur !== null && margeAnt.valeur < 0) {
      ajoute('critique', "Pertes sur deux exercices consécutifs : point de vigilance sérieux sur la continuité d'exploitation.");
    }
  }

  const fdr = parCode['fonds_roulement'];
  if (fdr && fdr.valeur !== null && fdr.valeur < 0) {
    ajoute('attention', "Fonds de roulement net négatif : une partie des investissements durables est financée par des dettes à court terme.");
  }
  const tresorerie = parCode['tresorerie_nette'];
  if (tresorerie && tresorerie.valeur !== null && tresorerie.valeur < 0) {
    ajoute('attention', "Trésorerie nette négative : les dettes financières à court terme dépassent les liquidités disponibles.");
  }
  const solvabilite = parCode['solvabilite'];
  if (solvabilite && solvabilite.statut === 'fragile') {
    ajoute('attention', "Solvabilité fragile : la société dépend fortement de financements externes.");
  }
  const liquiditeGenerale = parCode['liquidite_generale'];
  if (liquiditeGenerale && liquiditeGenerale.statut === 'fragile') {
    ajoute('attention', "Liquidité générale fragile : les actifs à court terme ne couvrent pas les dettes à court terme.");
  }
  const ecartDelais = parCode['ecart_delais'];
  if (ecartDelais && ecartDelais.statut === 'fragile') {
    ajoute('attention', "Écart important entre le délai de paiement des clients et celui des fournisseurs : la société doit financer ce décalage sur ses fonds propres ou par du crédit court terme.");
  }

  // Dégradation nette d'un KPI clé par rapport à l'exercice précédent (bon/correct -> fragile).
  const labelsKpi = { liquidite_generale: 'liquidité générale', solvabilite: 'solvabilité', marge_nette: 'marge nette', roe: 'rentabilité des capitaux propres (ROE)' };
  Object.keys(labelsKpi).forEach(code => {
    const actuel = parCode[code];
    const ancien = parCodeAnt[code];
    if (actuel && ancien && actuel.statut === 'fragile' && (ancien.statut === 'bon' || ancien.statut === 'correct')) {
      ajoute('attention', `Dégradation de la ${labelsKpi[code]} par rapport à la période précédente (passée de "${ancien.statut === 'bon' ? 'bon' : 'correct'}" à "à surveiller").`);
    }
  });

  return alertes;
}

// Bloc HTML partagé (Admin + espace Mes résultats) : score global + signaux d'alerte.
// Les textes insérés ici sont tous générés par Arithmos (jamais de texte saisi par l'utilisateur) :
// pas d'échappement HTML nécessaire.
export function renderSanteHtml(scoreGlobal, alertes, htmlJauge) {
  const scoreBlock = `
    <div class="kpi-card" style="margin-bottom:16px;">
      <div class="kpi-card-head">
        <h4>Score de santé financière</h4>
        ${scoreGlobal.label ? `<span style="font-size:12px;color:var(--ink-soft);">${scoreGlobal.label}</span>` : ''}
      </div>
      ${htmlJauge || `<div class="kpi-value">${scoreGlobal.affichage}</div>`}
      <p class="kpi-analyse">${scoreGlobal.detail}</p>
    </div>`;

  const alertesBlock = alertes.length ? `
    <div class="kpi-card" style="margin-bottom:16px;border-left:3px solid ${alertes.some(a => a.severite === 'critique') ? '#b42318' : '#9a6700'};">
      <div class="kpi-card-head"><h4>Signaux d'alerte</h4></div>
      <ul style="margin:6px 0 0;padding-left:20px;font-size:13px;line-height:1.6;">
        ${alertes.map(a => `<li style="color:${a.severite === 'critique' ? '#b42318' : '#9a6700'};">${a.texte}</li>`).join('')}
      </ul>
    </div>` : `
    <div class="kpi-card" style="margin-bottom:16px;">
      <div class="kpi-card-head"><h4>Signaux d'alerte</h4></div>
      <p class="kpi-analyse">Aucun signal de vigilance détecté sur cette période.</p>
    </div>`;

  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:8px;">${scoreBlock}${alertesBlock}</div>`;
}
