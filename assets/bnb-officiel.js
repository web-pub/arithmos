// Arithmos — Import "Dépôt officiel BNB" (V11-001)
// Lit directement le fichier CSV téléchargé depuis le site de la Banque Nationale de Belgique
// (Centrale des bilans) après le dépôt des comptes annuels — aucune saisie manuelle, aucun
// mapping à configurer : le fichier officiel utilise des codes fixes (schéma complet, modèles
// comme "m81-f"), identiques pour toutes les sociétés.
//
// Le fichier commence par des lignes de métadonnées ("Entity name", dates de la période...),
// suivies de paires "code","valeur" une par ligne.

// Découpe une ligne CSV à 2 colonnes entre guillemets (gère les guillemets doublés "" et les
// virgules éventuelles à l'intérieur d'un champ, ex. une forme juridique).
function parseCsvLine(line) {
  const cells = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

export function parseBnbOfficiel(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '').map(parseCsvLine);

  const codes = {};
  let societeFichier = '', numeroEntrepriseFichier = '', dateDebutFichier = null, dateFinFichier = null;

  lines.forEach(([a, b]) => {
    if (a === undefined) return;
    if (a === 'Entity name') societeFichier = b || '';
    else if (a === 'Entity number') numeroEntrepriseFichier = b || '';
    else if (a === 'Accounting period start date') dateDebutFichier = b || null;
    else if (a === 'Accounting period end date') dateFinFichier = b || null;
    else if (/^[0-9]/.test(a) && b !== undefined && b !== '') {
      const n = parseFloat(b);
      if (!isNaN(n)) codes[a] = n;
    }
  });

  const has = (code) => Object.prototype.hasOwnProperty.call(codes, code);
  const get = (code) => (codes[code] || 0);

  // Chiffre d'affaires : code officiel "70" si disponible, sinon repli sur la "marge brute"
  // (code "9900") pour les sociétés ayant choisi cette présentation simplifiée du compte de
  // résultats (choix confirmé avec l'utilisatrice — moins précis mais permet quand même de
  // calculer les KPI basés sur le chiffre d'affaires, plutôt que de les laisser vides).
  const chiffreAffairesEstMargeBrute = !has('70') && has('9900');
  const chiffreAffaires = has('70') ? get('70') : get('9900');

  const valeurs = {
    actifsImmobilises: get('20') + get('21/28'),
    stocks: get('3'),
    creancesCT: get('40/41'),
    placementsTresorerie: get('50/53'),
    valeursDisponibles: get('54/58'),
    regularisationActif: get('490/1'),
    capitauxPropres: get('10/15'),
    provisions: get('16'),
    dettesLT: get('17'),
    // Schéma complet : "42" (dettes à LT échéant dans l'année) est de nature financière à court
    // terme, regroupé avec "43" (dettes financières) pour correspondre à la rubrique abrégée.
    dettesFinancieresCT: get('42') + get('43'),
    dettesCommercialesCT: get('44'),
    autresDettesCT: get('45') + get('46') + get('47/48'),
    regularisationPassif: get('492/3'),
    chiffreAffaires,
    variationStocks: has('70') ? get('71') : 0,
    autresProduitsExploitation: has('70') ? get('74') : 0,
    achats: has('70') ? get('60') : 0,
    servicesBiensDivers: has('70') ? get('61') : 0,
    remunerations: get('62'),
    amortissements: get('630'),
    reductionsValeur: get('631/4'),
    // Depuis la réforme 2020 du schéma complet, les anciennes charges "exceptionnelles" (code 66)
    // sont des charges d'exploitation ou financières non récurrentes — regroupées ici avec "640/8".
    autresChargesExploitation: get('640/8') + get('66'),
    produitsFinanciers: has('75/76B') ? get('75/76B') : get('75'),
    chargesFinancieres: has('65/66B') ? get('65/66B') : get('65'),
    produitsExceptionnels: 0,
    chargesExceptionnelles: 0,
  };

  // Les totaux (bilan et résultats) sont repris directement des sous-totaux officiels du dépôt
  // plutôt que recalculés à partir des rubriques détaillées : plus fiable, et insensible aux
  // variantes de présentation (marge brute, éléments non récurrents...) d'un dépôt à l'autre.
  // Repli à 0 si un sous-total attendu est absent — admin.js recalcule alors à partir des
  // rubriques détaillées (comme pour les autres modes d'import).
  const totaux = {
    totalActif: get('20/58'),
    totalPassif: get('10/49'),
    resultatExploitation: get('9901') - get('9902'),
    resultatCourant: get('9903'),
    resultatAvantImpot: get('9903') + get('780') - get('680'),
    resultatExercice: get('9904'),
  };

  return {
    valeurs, totaux, societeFichier, numeroEntrepriseFichier,
    dateDebutFichier, dateFinFichier, chiffreAffairesEstMargeBrute,
    nbCodes: Object.keys(codes).length,
  };
}
