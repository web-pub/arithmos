// Arithmos — Mapping de plages de comptes PCMN vers les rubriques internes (V09-001)
// Utilisé pour l'import "Balance comptable détaillée" (par opposition à l'import
// "Bilan déposé BNB" qui utilise directement les codes du schéma abrégé).
// Chaque société a son propre mapping (plans comptables différents selon les clients),
// stocké dans societes/{id}.mappingComptes = { rubriqueKey: [{debut, fin}, ...], ... }.
//
// "sens" indique le solde normal de la rubrique (débiteur ou créditeur) dans une balance
// où le solde de chaque compte est une colonne SIGNÉE (positif = débiteur, négatif = créditeur) :
// pour une rubrique normalement créditrice (passif, produits), la somme des soldes de ses
// comptes ressort négative dans cette convention -> on l'inverse pour obtenir un montant positif.

export const RUBRIQUES = [
  // ---- Bilan — Actif (débiteur) ----
  { key: 'actifsImmobilises', label: 'Actifs immobilisés', groupe: 'Bilan — Actif', sens: 'debiteur', defaut: [{ debut: 200000, fin: 289999 }] },
  { key: 'stocks', label: 'Stocks et commandes en cours', groupe: 'Bilan — Actif', sens: 'debiteur', defaut: [{ debut: 300000, fin: 379999 }] },
  { key: 'creancesCT', label: 'Créances à un an au plus', groupe: 'Bilan — Actif', sens: 'debiteur', defaut: [{ debut: 400000, fin: 419999 }] },
  { key: 'placementsTresorerie', label: 'Placements de trésorerie', groupe: 'Bilan — Actif', sens: 'debiteur', defaut: [{ debut: 500000, fin: 529999 }] },
  { key: 'valeursDisponibles', label: 'Valeurs disponibles (trésorerie)', groupe: 'Bilan — Actif', sens: 'debiteur', defaut: [{ debut: 540000, fin: 589999 }] },
  { key: 'regularisationActif', label: 'Comptes de régularisation (actif)', groupe: 'Bilan — Actif', sens: 'debiteur', defaut: [{ debut: 490000, fin: 491999 }] },

  // ---- Bilan — Passif (créditeur) ----
  { key: 'capitauxPropres', label: 'Capitaux propres', groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 100000, fin: 159999 }] },
  { key: 'provisions', label: 'Provisions et impôts différés', groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 160000, fin: 169999 }] },
  { key: 'dettesLT', label: "Dettes à plus d'un an", groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 170000, fin: 179999 }] },
  { key: 'dettesFinancieresCT', label: 'Dettes financières à un an au plus', groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 430000, fin: 439999 }] },
  { key: 'dettesCommercialesCT', label: 'Dettes commerciales à un an au plus', groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 440000, fin: 449999 }] },
  { key: 'autresDettesCT', label: 'Autres dettes à un an au plus', groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 450000, fin: 489999 }] },
  { key: 'regularisationPassif', label: 'Comptes de régularisation (passif)', groupe: 'Bilan — Passif', sens: 'crediteur', defaut: [{ debut: 492000, fin: 499999 }] },

  // ---- Compte de résultats — Produits (créditeur) ----
  { key: 'chiffreAffaires', label: "Chiffre d'affaires", groupe: 'Compte de résultats — Produits', sens: 'crediteur', defaut: [{ debut: 700000, fin: 709999 }] },
  { key: 'variationStocks', label: 'Variation des stocks en cours', groupe: 'Compte de résultats — Produits', sens: 'crediteur', defaut: [{ debut: 710000, fin: 719999 }] },
  { key: 'autresProduitsExploitation', label: "Autres produits d'exploitation", groupe: 'Compte de résultats — Produits', sens: 'crediteur', defaut: [{ debut: 740000, fin: 749999 }] },
  { key: 'produitsFinanciers', label: 'Produits financiers', groupe: 'Compte de résultats — Produits', sens: 'crediteur', defaut: [{ debut: 750000, fin: 759999 }] },
  { key: 'produitsExceptionnels', label: 'Produits exceptionnels', groupe: 'Compte de résultats — Produits', sens: 'crediteur', defaut: [{ debut: 760000, fin: 769999 }] },

  // ---- Compte de résultats — Charges (débiteur) ----
  { key: 'achats', label: 'Approvisionnements et marchandises', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 600000, fin: 609999 }] },
  { key: 'servicesBiensDivers', label: 'Services et biens divers', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 610000, fin: 619999 }] },
  { key: 'remunerations', label: 'Rémunérations, charges sociales et pensions', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 620000, fin: 629999 }] },
  { key: 'amortissements', label: 'Amortissements et réductions de valeur (immo.)', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 630000, fin: 630999 }] },
  { key: 'reductionsValeur', label: 'Réductions de valeur (stocks, créances)', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 631000, fin: 634999 }] },
  { key: 'autresChargesExploitation', label: "Autres charges d'exploitation", groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 640000, fin: 648999 }] },
  { key: 'chargesFinancieres', label: 'Charges financières', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 650000, fin: 659999 }] },
  { key: 'chargesExceptionnelles', label: 'Charges exceptionnelles', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 660000, fin: 669999 }] },
  { key: 'impots', label: 'Impôts sur le résultat', groupe: 'Compte de résultats — Charges', sens: 'debiteur', defaut: [{ debut: 670000, fin: 679999 }] },
];

export const GROUPES_MAPPING = ['Bilan — Actif', 'Bilan — Passif', 'Compte de résultats — Produits', 'Compte de résultats — Charges'];

export function mappingParDefaut() {
  const m = {};
  RUBRIQUES.forEach(r => { m[r.key] = r.defaut.map(p => ({ ...p })); });
  return m;
}

// "700000-709999, 701500-701999" -> [{debut:700000, fin:709999}, {debut:701500, fin:701999}]
export function parseRangesInput(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean).map(part => {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) return null;
    return { debut: parseInt(m[1], 10), fin: parseInt(m[2], 10) };
  }).filter(Boolean);
}

export function formatRangesInput(ranges) {
  return (ranges || []).map(r => `${r.debut}-${r.fin}`).join(', ');
}

// comptesSoldes: [{compte: number, solde: number}, ...] (solde signé : positif = débiteur, négatif = créditeur)
// mapping: societes/{id}.mappingComptes
// -> renvoie un objet "valeurs" compatible avec computeTotaux() / calculerKPI(), comme l'import BNB.
export function sommeParRubrique(comptesSoldes, mapping) {
  const valeurs = {};
  RUBRIQUES.forEach(r => {
    const ranges = (mapping && mapping[r.key]) ? mapping[r.key] : r.defaut;
    let total = 0;
    comptesSoldes.forEach(({ compte, solde }) => {
      if (ranges.some(rg => compte >= rg.debut && compte <= rg.fin)) total += solde;
    });
    // Dans une balance où le solde est signé (positif = débiteur), une rubrique normalement
    // créditrice ressort négative : on l'inverse pour obtenir le montant positif attendu.
    valeurs[r.key] = r.sens === 'crediteur' ? -total : total;
  });
  return valeurs;
}
