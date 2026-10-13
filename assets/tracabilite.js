// Arithmos — Traçabilité des KPI vers les comptes PCMN/BNB sources (V13-005)
// Pour chaque KPI, décompose le résultat jusqu'aux rubriques de base ("valeurs", au sens de
// kpi.js/mapping.js) qui le composent, avec leur poids (+/-) dans le calcul. Permet d'afficher,
// à côté de chaque KPI, exactement quels comptes/codes BNB contribuent au résultat — et dans
// quelle proportion — pour repérer en un coup d'œil la rubrique qui "pose problème" (ou qui
// tire le résultat vers le haut).
//
// Les clés utilisées sont toujours des clés "valeurs" (feuilles), jamais des sous-totaux : un
// sous-total (ex. totalActif, resultatExercice) est toujours déjà décomposé ci-dessous en ses
// composantes de base, pour que la source affichée remonte jusqu'à un compte réel.

import { RUBRIQUES } from "./mapping.js";

// Détecte si un exercice relève du cas "marge brute" (dépôt officiel BNB sans chiffre d'affaires
// séparé, code 70 absent, seule une marge brute globale code 9900 a été communiquée) — voir
// bnb-officiel.js et kpi.js (paramètre estMargeBrute) pour le détail de ce que ça implique.
// Les imports à partir de la V13-010 stockent ce champ explicitement sur l'exercice
// (chiffreAffairesEstMargeBrute, booléen). Pour les exercices importés AVANT ce correctif, ce champ
// n'existe pas : on déduit alors la situation à partir de sa signature caractéristique — en mode
// marge brute, bnb-officiel.js force achats et services à 0 alors qu'un montant non nul figure
// dans "chiffre d'affaires" (qui est en réalité la marge). Un vrai zéro simultané sur achats ET
// services, combiné à un CA non nul, est en pratique quasi inexistant pour une société réelle, donc
// ce repli est fiable sans avoir besoin de réimporter les anciens exercices.
export function estExerciceMargeBrute(exercice) {
  if (!exercice) return false;
  if (typeof exercice.chiffreAffairesEstMargeBrute === 'boolean') return exercice.chiffreAffairesEstMargeBrute;
  if (exercice.typeImport !== 'bnb_officiel') return false;
  const v = exercice.valeurs || {};
  return (v.achats || 0) === 0 && (v.servicesBiensDivers || 0) === 0 && (v.chiffreAffaires || 0) !== 0;
}

// code KPI (kpi.js) -> liste de composantes { cle, signe, role }.
// "role" sert uniquement à grouper l'affichage (numérateur / dénominateur / terme) ; le signe
// porte la contribution réelle de la rubrique dans le résultat final du KPI.
export const KPI_DEPENDANCES = {
  liquidite_generale: [
    { cle: 'stocks', signe: 1, role: 'numerateur' },
    { cle: 'creancesCT', signe: 1, role: 'numerateur' },
    { cle: 'placementsTresorerie', signe: 1, role: 'numerateur' },
    { cle: 'valeursDisponibles', signe: 1, role: 'numerateur' },
    { cle: 'regularisationActif', signe: 1, role: 'numerateur' },
    { cle: 'dettesFinancieresCT', signe: 1, role: 'denominateur' },
    { cle: 'dettesCommercialesCT', signe: 1, role: 'denominateur' },
    { cle: 'autresDettesCT', signe: 1, role: 'denominateur' },
    { cle: 'regularisationPassif', signe: 1, role: 'denominateur' },
  ],
  liquidite_reduite: [
    { cle: 'creancesCT', signe: 1, role: 'numerateur' },
    { cle: 'placementsTresorerie', signe: 1, role: 'numerateur' },
    { cle: 'valeursDisponibles', signe: 1, role: 'numerateur' },
    { cle: 'regularisationActif', signe: 1, role: 'numerateur' },
    { cle: 'dettesFinancieresCT', signe: 1, role: 'denominateur' },
    { cle: 'dettesCommercialesCT', signe: 1, role: 'denominateur' },
    { cle: 'autresDettesCT', signe: 1, role: 'denominateur' },
    { cle: 'regularisationPassif', signe: 1, role: 'denominateur' },
  ],
  fonds_roulement: [
    { cle: 'stocks', signe: 1, role: 'terme' },
    { cle: 'creancesCT', signe: 1, role: 'terme' },
    { cle: 'placementsTresorerie', signe: 1, role: 'terme' },
    { cle: 'valeursDisponibles', signe: 1, role: 'terme' },
    { cle: 'regularisationActif', signe: 1, role: 'terme' },
    { cle: 'dettesFinancieresCT', signe: -1, role: 'terme' },
    { cle: 'dettesCommercialesCT', signe: -1, role: 'terme' },
    { cle: 'autresDettesCT', signe: -1, role: 'terme' },
    { cle: 'regularisationPassif', signe: -1, role: 'terme' },
  ],
  solvabilite: [
    { cle: 'capitauxPropres', signe: 1, role: 'numerateur' },
    { cle: 'actifsImmobilises', signe: 1, role: 'denominateur' },
    { cle: 'stocks', signe: 1, role: 'denominateur' },
    { cle: 'creancesCT', signe: 1, role: 'denominateur' },
    { cle: 'placementsTresorerie', signe: 1, role: 'denominateur' },
    { cle: 'valeursDisponibles', signe: 1, role: 'denominateur' },
    { cle: 'regularisationActif', signe: 1, role: 'denominateur' },
  ],
  endettement: [
    { cle: 'capitauxPropres', signe: 1, role: 'numerateur' },
    { cle: 'actifsImmobilises', signe: 1, role: 'denominateur' },
    { cle: 'stocks', signe: 1, role: 'denominateur' },
    { cle: 'creancesCT', signe: 1, role: 'denominateur' },
    { cle: 'placementsTresorerie', signe: 1, role: 'denominateur' },
    { cle: 'valeursDisponibles', signe: 1, role: 'denominateur' },
    { cle: 'regularisationActif', signe: 1, role: 'denominateur' },
  ],
  marge_nette: [
    { cle: 'chiffreAffaires', signe: 1, role: 'numerateur' },
    { cle: 'variationStocks', signe: 1, role: 'numerateur' },
    { cle: 'autresProduitsExploitation', signe: 1, role: 'numerateur' },
    { cle: 'achats', signe: -1, role: 'numerateur' },
    { cle: 'servicesBiensDivers', signe: -1, role: 'numerateur' },
    { cle: 'remunerations', signe: -1, role: 'numerateur' },
    { cle: 'amortissements', signe: -1, role: 'numerateur' },
    { cle: 'reductionsValeur', signe: -1, role: 'numerateur' },
    { cle: 'autresChargesExploitation', signe: -1, role: 'numerateur' },
    { cle: 'produitsFinanciers', signe: 1, role: 'numerateur' },
    { cle: 'chargesFinancieres', signe: -1, role: 'numerateur' },
    { cle: 'produitsExceptionnels', signe: 1, role: 'numerateur' },
    { cle: 'chargesExceptionnelles', signe: -1, role: 'numerateur' },
    { cle: 'impots', signe: -1, role: 'numerateur' },
    { cle: 'chiffreAffaires', signe: 1, role: 'denominateur' },
  ],
  marge_exploitation: [
    { cle: 'chiffreAffaires', signe: 1, role: 'numerateur' },
    { cle: 'variationStocks', signe: 1, role: 'numerateur' },
    { cle: 'autresProduitsExploitation', signe: 1, role: 'numerateur' },
    { cle: 'achats', signe: -1, role: 'numerateur' },
    { cle: 'servicesBiensDivers', signe: -1, role: 'numerateur' },
    { cle: 'remunerations', signe: -1, role: 'numerateur' },
    { cle: 'amortissements', signe: -1, role: 'numerateur' },
    { cle: 'reductionsValeur', signe: -1, role: 'numerateur' },
    { cle: 'autresChargesExploitation', signe: -1, role: 'numerateur' },
    { cle: 'chiffreAffaires', signe: 1, role: 'denominateur' },
  ],
  roe: [
    { cle: 'chiffreAffaires', signe: 1, role: 'numerateur' },
    { cle: 'variationStocks', signe: 1, role: 'numerateur' },
    { cle: 'autresProduitsExploitation', signe: 1, role: 'numerateur' },
    { cle: 'achats', signe: -1, role: 'numerateur' },
    { cle: 'servicesBiensDivers', signe: -1, role: 'numerateur' },
    { cle: 'remunerations', signe: -1, role: 'numerateur' },
    { cle: 'amortissements', signe: -1, role: 'numerateur' },
    { cle: 'reductionsValeur', signe: -1, role: 'numerateur' },
    { cle: 'autresChargesExploitation', signe: -1, role: 'numerateur' },
    { cle: 'produitsFinanciers', signe: 1, role: 'numerateur' },
    { cle: 'chargesFinancieres', signe: -1, role: 'numerateur' },
    { cle: 'produitsExceptionnels', signe: 1, role: 'numerateur' },
    { cle: 'chargesExceptionnelles', signe: -1, role: 'numerateur' },
    { cle: 'impots', signe: -1, role: 'numerateur' },
    { cle: 'capitauxPropres', signe: 1, role: 'denominateur' },
  ],
  roa: [
    { cle: 'chiffreAffaires', signe: 1, role: 'numerateur' },
    { cle: 'variationStocks', signe: 1, role: 'numerateur' },
    { cle: 'autresProduitsExploitation', signe: 1, role: 'numerateur' },
    { cle: 'achats', signe: -1, role: 'numerateur' },
    { cle: 'servicesBiensDivers', signe: -1, role: 'numerateur' },
    { cle: 'remunerations', signe: -1, role: 'numerateur' },
    { cle: 'amortissements', signe: -1, role: 'numerateur' },
    { cle: 'reductionsValeur', signe: -1, role: 'numerateur' },
    { cle: 'autresChargesExploitation', signe: -1, role: 'numerateur' },
    { cle: 'produitsFinanciers', signe: 1, role: 'numerateur' },
    { cle: 'chargesFinancieres', signe: -1, role: 'numerateur' },
    { cle: 'produitsExceptionnels', signe: 1, role: 'numerateur' },
    { cle: 'chargesExceptionnelles', signe: -1, role: 'numerateur' },
    { cle: 'impots', signe: -1, role: 'numerateur' },
    { cle: 'actifsImmobilises', signe: 1, role: 'denominateur' },
    { cle: 'stocks', signe: 1, role: 'denominateur' },
    { cle: 'creancesCT', signe: 1, role: 'denominateur' },
    { cle: 'placementsTresorerie', signe: 1, role: 'denominateur' },
    { cle: 'valeursDisponibles', signe: 1, role: 'denominateur' },
    { cle: 'regularisationActif', signe: 1, role: 'denominateur' },
  ],
  cash_flow: [
    { cle: 'chiffreAffaires', signe: 1, role: 'terme' },
    { cle: 'variationStocks', signe: 1, role: 'terme' },
    { cle: 'autresProduitsExploitation', signe: 1, role: 'terme' },
    { cle: 'achats', signe: -1, role: 'terme' },
    { cle: 'servicesBiensDivers', signe: -1, role: 'terme' },
    { cle: 'remunerations', signe: -1, role: 'terme' },
    { cle: 'amortissements', signe: -1, role: 'terme' },
    { cle: 'reductionsValeur', signe: -1, role: 'terme' },
    { cle: 'autresChargesExploitation', signe: -1, role: 'terme' },
    { cle: 'produitsFinanciers', signe: 1, role: 'terme' },
    { cle: 'chargesFinancieres', signe: -1, role: 'terme' },
    { cle: 'produitsExceptionnels', signe: 1, role: 'terme' },
    { cle: 'chargesExceptionnelles', signe: -1, role: 'terme' },
    { cle: 'impots', signe: -1, role: 'terme' },
    { cle: 'amortissements', signe: 1, role: 'terme' }, // ré-ajouté (capacité d'autofinancement = résultat + amortissements)
  ],
  tresorerie_nette: [
    { cle: 'valeursDisponibles', signe: 1, role: 'terme' },
    { cle: 'placementsTresorerie', signe: 1, role: 'terme' },
    { cle: 'dettesFinancieresCT', signe: -1, role: 'terme' },
  ],
  delai_clients: [
    { cle: 'creancesCT', signe: 1, role: 'numerateur' },
    { cle: 'chiffreAffaires', signe: 1, role: 'denominateur' },
  ],
  delai_fournisseurs: [
    { cle: 'dettesCommercialesCT', signe: 1, role: 'numerateur' },
    { cle: 'achats', signe: 1, role: 'denominateur' },
    { cle: 'servicesBiensDivers', signe: 1, role: 'denominateur' },
  ],
  // Comparaison de deux ratios (délai clients - délai fournisseurs, en jours) : les 4 rubriques
  // listées ici sont celles qui alimentent l'un ou l'autre délai, pas une décomposition linéaire
  // de l'écart lui-même (qui n'est pas une simple somme de montants €).
  ecart_delais: [
    { cle: 'creancesCT', signe: 1, role: 'terme' },
    { cle: 'chiffreAffaires', signe: 1, role: 'terme' },
    { cle: 'dettesCommercialesCT', signe: 1, role: 'terme' },
    { cle: 'achats', signe: 1, role: 'terme' },
    { cle: 'servicesBiensDivers', signe: 1, role: 'terme' },
  ],
  rotation_stocks: [
    { cle: 'stocks', signe: 1, role: 'numerateur' },
    { cle: 'achats', signe: 1, role: 'denominateur' },
    { cle: 'servicesBiensDivers', signe: 1, role: 'denominateur' },
  ],
};

// Pour l'import "Bilan BNB" (schéma abrégé) : code du modèle Excel Arithmos par clé "valeurs".
// Doit rester synchronisé avec le CODE_MAP d'assets/admin.js.
export const CODES_BNB_ABREGE = {
  actifsImmobilises: '20/28', stocks: '3', creancesCT: '40/41', placementsTresorerie: '50/53',
  valeursDisponibles: '54/58', regularisationActif: '490/1', capitauxPropres: '10/15',
  provisions: '16', dettesLT: '17', dettesFinancieresCT: '43', dettesCommercialesCT: '44',
  autresDettesCT: '45/48', regularisationPassif: '492/3', chiffreAffaires: '70',
  variationStocks: '71', autresProduitsExploitation: '74', achats: '60',
  servicesBiensDivers: '61', remunerations: '62', amortissements: '630',
  reductionsValeur: '631/4', autresChargesExploitation: '640/8', produitsFinanciers: '75',
  chargesFinancieres: '65', produitsExceptionnels: '76', chargesExceptionnelles: '66',
  impots: '67/77',
};

// Pour l'import "Dépôt officiel BNB" (schéma complet, voir bnb-officiel.js) : code(s) du dépôt
// officiel par clé. Certaines clés ont une variante selon que la société publie un CA (code 70)
// ou seulement une marge brute (code 9900) — les deux sont indiquées, le fichier importé utilise
// l'une ou l'autre selon ce qui est présent.
export const CODES_BNB_OFFICIEL = {
  actifsImmobilises: '20 + 21/28', stocks: '3', creancesCT: '40/41', placementsTresorerie: '50/53',
  valeursDisponibles: '54/58', regularisationActif: '490/1', capitauxPropres: '10/15',
  provisions: '16', dettesLT: '17', dettesFinancieresCT: '42 + 43', dettesCommercialesCT: '44',
  autresDettesCT: '45 + 46 + 47/48', regularisationPassif: '492/3',
  chiffreAffaires: '70 (ou 9900 si CA absent)', variationStocks: '71 (si code 70 présent)',
  autresProduitsExploitation: '74 (si code 70 présent)', achats: '60 (si code 70 présent)',
  servicesBiensDivers: '61 (si code 70 présent)', remunerations: '62',
  amortissements: '630', reductionsValeur: '631/4', autresChargesExploitation: '640/8 + 66',
  produitsFinanciers: '75/76B (ou 75)', chargesFinancieres: '65/66B (ou 65)',
  produitsExceptionnels: '—', chargesExceptionnelles: '—',
  impots: '9903 → 9904 (différence globale, non détaillée par code)',
};

function labelRubrique(cle) {
  return RUBRIQUES.find(r => r.key === cle)?.label || cle;
}

// Source affichée pour une rubrique, selon le type d'import de l'exercice — juste les chiffres
// (le code PCMN/BNB ou la plage de comptes), sans préfixe, pour rester lisible dans un tableau
// compact.
export function sourcePourCle(cle, typeImport, societeMapping) {
  if (typeImport === 'detaillee') {
    const rubrique = RUBRIQUES.find(r => r.key === cle);
    const ranges = (societeMapping && societeMapping[cle]) ? societeMapping[cle] : rubrique?.defaut;
    return ranges ? formatRangesCourt(ranges) : '—';
  }
  if (typeImport === 'bnb_officiel') {
    return CODES_BNB_OFFICIEL[cle] || '—';
  }
  return CODES_BNB_ABREGE[cle] || '—';
}

function formatRangesCourt(ranges) {
  return (ranges || []).map(r => `${r.debut}-${r.fin}`).join(', ');
}

// Détail du calcul d'un KPI : une ligne par rubrique de base impliquée, avec son montant
// (déjà signé selon sa contribution réelle au résultat), son libellé, sa source, et son rôle
// (numérateur/dénominateur/terme). Trié par poids absolu décroissant : la rubrique qui pèse le
// plus dans le résultat (en bien ou en mal) apparaît en premier.
export function detailKpi(codeKpi, valeurs, totaux, typeImport, societeMapping) {
  const deps = KPI_DEPENDANCES[codeKpi];
  if (!deps) return [];
  const v = valeurs || {};
  return deps
    .map(d => ({
      cle: d.cle,
      role: d.role,
      label: labelRubrique(d.cle),
      montant: d.signe * (v[d.cle] || 0),
      source: sourcePourCle(d.cle, typeImport, societeMapping),
    }))
    .sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant));
}
