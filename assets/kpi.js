// Arithmos — Moteur de calcul des KPI comptables belges (V10-001)
// Calcule, à partir des valeurs importées d'un exercice (voir admin.js / CODE_MAP),
// un jeu standard de ratios de liquidité, solvabilité, rentabilité et trésorerie,
// avec seuils d'interprétation usuels pour une PME belge (schéma abrégé).

function div(a, b) {
  if (!b) return null; // dénominateur nul ou absent -> ratio non calculable
  return a / b;
}

function pct(n) {
  if (n === null || n === undefined) return '—';
  return (n * 100).toLocaleString('fr-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
}
function ratio(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function eur(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('fr-BE', { maximumFractionDigits: 0 }) + ' €';
}
function jours(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('fr-BE') + ' jours';
}

// Division en jours : renvoie null (plutôt que 0, piège classique avec "null * x") si le ratio
// sous-jacent n'est pas calculable (dénominateur nul/absent).
function diviseEnJours(numerateur, denominateur, dureeJours) {
  const r = div(numerateur, denominateur);
  return r === null ? null : r * dureeJours;
}

// Agrégats intermédiaires non stockés tels quels dans Firestore, recalculés à la volée.
function agregats(v, t) {
  const actifsCirculants = (v.stocks || 0) + (v.creancesCT || 0) + (v.placementsTresorerie || 0) +
    (v.valeursDisponibles || 0) + (v.regularisationActif || 0);
  const dettesCT = (v.dettesFinancieresCT || 0) + (v.dettesCommercialesCT || 0) +
    (v.autresDettesCT || 0) + (v.regularisationPassif || 0);
  return { actifsCirculants, dettesCT };
}

// Chaque KPI : code, libellé, groupe, valeur calculée, formule (texte), formatage,
// seuils (bon / correct / fragile) et phrase d'analyse générée dynamiquement.
// nombreMois : durée de la période couverte par l'exercice (12 par défaut, pour les exercices
// importés avant la gestion des périodes). Sert uniquement à donner une valeur "par mois" pour
// le cash-flow (seul KPI en montant € basé sur un flux) — les KPI en % restent comparables
// tels quels d'une période à l'autre, sans retraitement.
export function calculerKPI(valeurs, totaux, nombreMois = 12) {
  const v = valeurs || {};
  const t = totaux || {};
  const { actifsCirculants, dettesCT } = agregats(v, t);

  const liquiditeGenerale = div(actifsCirculants, dettesCT);
  const liquiditeReduite = div(actifsCirculants - (v.stocks || 0), dettesCT);
  const fondsRoulementNet = (dettesCT !== undefined) ? actifsCirculants - dettesCT : null;

  const solvabilite = div(v.capitauxPropres || 0, t.totalActif || 0);
  const tauxEndettement = (solvabilite === null) ? null : 1 - solvabilite;

  const margeNette = div(t.resultatExercice || 0, v.chiffreAffaires || 0);
  const margeExploitation = div(t.resultatExploitation || 0, v.chiffreAffaires || 0);
  const roe = div(t.resultatExercice || 0, v.capitauxPropres || 0);
  const roa = div(t.resultatExercice || 0, t.totalActif || 0);

  const cashFlow = (t.resultatExercice || 0) + (v.amortissements || 0);
  const tresorerieNette = (v.valeursDisponibles || 0) + (v.placementsTresorerie || 0) - (v.dettesFinancieresCT || 0);

  // Délais de paiement, exprimés en jours. "dureeJours" adapte le calcul à la durée réelle de
  // l'exercice (365 jours pour un exercice de 12 mois, proportionnellement moins pour une période
  // plus courte) — sinon un exercice de 6 mois afficherait un délai deux fois trop long.
  const dureeJours = 365 * ((nombreMois || 12) / 12);
  const delaiClients = diviseEnJours(v.creancesCT || 0, v.chiffreAffaires || 0, dureeJours);
  const delaiFournisseurs = diviseEnJours(v.dettesCommercialesCT || 0, (v.achats || 0) + (v.servicesBiensDivers || 0), dureeJours);
  const ecartDelais = (delaiClients !== null && delaiFournisseurs !== null) ? delaiClients - delaiFournisseurs : null;

  function kpi(code, label, groupe, valeur, format, seuils, analyse, parMois) {
    let statut = 'neutre';
    if (valeur !== null && valeur !== undefined && seuils) {
      if (seuils.sens === 'haut') {
        statut = valeur >= seuils.bon ? 'bon' : (valeur >= seuils.correct ? 'correct' : 'fragile');
      } else {
        statut = valeur <= seuils.bon ? 'bon' : (valeur <= seuils.correct ? 'correct' : 'fragile');
      }
    }
    return {
      code, label, groupe, valeur,
      affichage: format(valeur),
      statut,
      analyse: analyse(valeur, statut),
      parMois: (parMois === undefined || parMois === null) ? null : eur(parMois),
    };
  }

  return [
    kpi('liquidite_generale', 'Liquidité générale', 'Liquidité', liquiditeGenerale, ratio,
      { sens: 'haut', bon: 1.5, correct: 1 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio." :
        st === 'bon' ? `Avec ${ratio(val)}, la société dispose de largement plus d'actifs à court terme que de dettes à court terme : la capacité à payer ses factures à l'échéance est solide.` :
        st === 'correct' ? `À ${ratio(val)}, les actifs à court terme couvrent les dettes à court terme, mais la marge de sécurité reste limitée.` :
        `À ${ratio(val)}, les actifs à court terme ne couvrent pas les dettes à court terme : un risque de tension de trésorerie à surveiller.`),

    kpi('liquidite_reduite', 'Liquidité réduite', 'Liquidité', liquiditeReduite, ratio,
      { sens: 'haut', bon: 1, correct: 0.7 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio." :
        st === 'bon' ? `Même sans compter sur la vente des stocks, la société peut couvrir ses dettes à court terme (${ratio(val)}).` :
        st === 'correct' ? `Sans les stocks, la couverture des dettes à court terme reste correcte mais plus juste (${ratio(val)}).` :
        `Sans les stocks, les actifs disponibles ne suffisent plus à couvrir les dettes à court terme (${ratio(val)}).`),

    kpi('fonds_roulement', 'Fonds de roulement net', 'Liquidité', fondsRoulementNet, eur,
      { sens: 'haut', bon: 0.0001, correct: -Infinity },
      (val, st) => val === null ? "Pas assez de données pour ce calcul." :
        val >= 0 ? `Le fonds de roulement est positif (${eur(val)}) : les ressources à long terme financent bien les besoins à court terme.` :
        `Le fonds de roulement est négatif (${eur(val)}) : une partie des investissements durables est financée par des dettes à court terme, ce qui fragilise la structure financière.`),

    kpi('solvabilite', "Solvabilité (indépendance financière)", 'Solvabilité', solvabilite, pct,
      { sens: 'haut', bon: 0.33, correct: 0.20 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio." :
        st === 'bon' ? `Les capitaux propres représentent ${pct(val)} du total du bilan : la société est peu dépendante de ses créanciers.` :
        st === 'correct' ? `Les capitaux propres représentent ${pct(val)} du bilan, un niveau de solvabilité correct mais à renforcer dans le temps.` :
        `Les capitaux propres ne représentent que ${pct(val)} du bilan : la société dépend fortement de financements externes.`),

    kpi('endettement', "Taux d'endettement", 'Solvabilité', tauxEndettement, pct,
      { sens: 'bas', bon: 0.67, correct: 0.80 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio." :
        `${pct(val)} du bilan est financé par des dettes (envers des tiers, banques ou fournisseurs).`),

    kpi('marge_nette', 'Marge nette', 'Rentabilité', margeNette, pct,
      { sens: 'haut', bon: 0.05, correct: 0 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio (chiffre d'affaires manquant ou nul)." :
        st === 'bon' ? `Chaque euro de chiffre d'affaires dégage ${pct(val)} de bénéfice net : une rentabilité confortable.` :
        st === 'correct' ? `La société reste bénéficiaire (marge nette de ${pct(val)}), mais avec une marge de manœuvre réduite.` :
        `La marge nette est négative (${pct(val)}) : l'exercice se solde par une perte.`),

    kpi('marge_exploitation', "Marge d'exploitation", 'Rentabilité', margeExploitation, pct,
      { sens: 'haut', bon: 0.08, correct: 0.02 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio." :
        `L'activité courante (hors éléments financiers et exceptionnels) dégage une marge d'exploitation de ${pct(val)}.`),

    kpi('roe', 'Rentabilité des capitaux propres (ROE)', 'Rentabilité', roe, pct,
      { sens: 'haut', bon: 0.15, correct: 0.05 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio (capitaux propres manquants ou nuls)." :
        st === 'bon' ? `Les capitaux investis par les associés rapportent ${pct(val)} sur l'exercice : un bon retour sur investissement.` :
        st === 'correct' ? `Le retour sur capitaux propres est positif (${pct(val)}) mais modeste.` :
        `Le retour sur capitaux propres est faible ou négatif (${pct(val)}).`),

    kpi('roa', "Rentabilité de l'actif (ROA)", 'Rentabilité', roa, pct,
      { sens: 'haut', bon: 0.05, correct: 0.01 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio." :
        `L'ensemble des actifs de la société génère un rendement de ${pct(val)} sur l'exercice.`),

    kpi('cash_flow', "Cash-flow (capacité d'autofinancement)", 'Trésorerie', cashFlow, eur,
      { sens: 'haut', bon: 0.0001, correct: -Infinity },
      (val, st) => val === null ? "Pas assez de données pour ce calcul." :
        val >= 0 ? `La société dégage ${eur(val)} de capacité d'autofinancement (résultat + amortissements) sur la période, de quoi financer une partie de ses futurs investissements sans emprunt supplémentaire.` :
        `La capacité d'autofinancement est négative (${eur(val)}) sur la période : l'activité ne génère pas de ressources propres.`,
      nombreMois ? cashFlow / nombreMois : null),

    kpi('tresorerie_nette', 'Trésorerie nette', 'Trésorerie', tresorerieNette, eur,
      { sens: 'haut', bon: 0.0001, correct: -Infinity },
      (val, st) => val === null ? "Pas assez de données pour ce calcul." :
        val >= 0 ? `La trésorerie disponible (${eur(val)}) couvre les dettes financières à court terme.` :
        `Les dettes financières à court terme dépassent la trésorerie disponible (écart de ${eur(Math.abs(val))}) : point de vigilance.`),

    kpi('delai_clients', 'Délai de paiement clients', 'Délais de paiement', delaiClients, jours,
      { sens: 'bas', bon: 30, correct: 60 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio (chiffre d'affaires manquant ou nul)." :
        st === 'bon' ? `Les clients paient en moyenne sous ${jours(val)} : un délai de recouvrement rapide, favorable à la trésorerie.` :
        st === 'correct' ? `Les clients paient en moyenne en ${jours(val)} : un délai correct, à surveiller pour qu'il ne s'allonge pas.` :
        `Les clients paient en moyenne en ${jours(val)} : un délai de recouvrement long, qui immobilise de la trésorerie.`),

    kpi('delai_fournisseurs', 'Délai de paiement fournisseurs', 'Délais de paiement', delaiFournisseurs, jours,
      { sens: 'bas', bon: 60, correct: 90 },
      (val, st) => val === null ? "Pas assez de données pour ce ratio (achats et services manquants ou nuls)." :
        st === 'bon' ? `Les fournisseurs sont payés en moyenne sous ${jours(val)} : un délai dans la norme des usages commerciaux belges.` :
        st === 'correct' ? `Les fournisseurs sont payés en moyenne en ${jours(val)} : un délai déjà long, à surveiller.` :
        `Les fournisseurs sont payés en moyenne en ${jours(val)} : un délai inhabituellement long, qui peut signaler une tension de trésorerie ou des tensions avec les fournisseurs.`),

    kpi('ecart_delais', 'Écart délais clients / fournisseurs', 'Délais de paiement', ecartDelais, jours,
      { sens: 'bas', bon: 0, correct: 30 },
      (val, st) => val === null ? "Pas assez de données pour comparer les deux délais (il faut un délai clients et un délai fournisseurs calculables)." :
        val <= 0 ? `Les clients paient en moyenne ${jours(Math.abs(val))} avant l'échéance moyenne des fournisseurs : un cycle favorable, les ventes financent les achats.` :
        st === 'correct' ? `Les clients paient en moyenne ${jours(val)} après que les fournisseurs doivent être réglés : un écart à surveiller, qui crée un besoin de financement à court terme.` :
        `Les clients paient en moyenne ${jours(val)} après que les fournisseurs doivent être réglés : un écart important — la société doit financer ce décalage (trésorerie ou crédit court terme).`),
  ];
}

export const GROUPES_KPI = ['Liquidité', 'Solvabilité', 'Rentabilité', 'Trésorerie', 'Délais de paiement'];
