// Arithmos — Helpers de période pour les exercices importés (V10-001)
// Un exercice n'est plus forcément une année civile complète : dateDebut/dateFin/nombreMois
// sont stockés explicitement. Les exercices importés avant V10-001 n'ont pas ces champs :
// on les traite alors comme une année civile complète (12 mois), pour rester compatibles.

// Lit une date ISO "AAAA-MM-JJ" sans passer par new Date() (qui l'interprète en UTC et peut
// décaler le jour/mois affiché selon le fuseau horaire du visiteur).
function decoupeISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { annee: y, mois: m, jour: d };
}

export function nombreMoisEntre(dateDebut, dateFin) {
  const d = decoupeISO(dateDebut);
  const f = decoupeISO(dateFin);
  return (f.annee - d.annee) * 12 + (f.mois - d.mois) + 1;
}

// Renvoie {dateDebut, dateFin, nombreMois, annee} toujours renseignés, même pour un
// exercice ancien qui n'a que le champ "annee" (traité comme année civile complète).
export function periodeDe(exercice) {
  if (exercice.dateDebut && exercice.dateFin) {
    return {
      dateDebut: exercice.dateDebut,
      dateFin: exercice.dateFin,
      nombreMois: exercice.nombreMois || nombreMoisEntre(exercice.dateDebut, exercice.dateFin),
      annee: exercice.annee || parseInt(exercice.dateFin.slice(0, 4), 10),
    };
  }
  const annee = exercice.annee;
  return { dateDebut: `${annee}-01-01`, dateFin: `${annee}-12-31`, nombreMois: 12, annee };
}

function formatMoisAnnee(iso) {
  const { annee, mois } = decoupeISO(iso);
  return String(mois).padStart(2, '0') + '/' + annee;
}

function estAnneeCivileComplete(p) {
  const d = decoupeISO(p.dateDebut);
  return p.nombreMois === 12 && d.mois === 1 && d.jour === 1;
}

// Libellé long, utilisé dans les sélecteurs et en tête de l'onglet KPI/Résultats.
// Ex. "2024 (12 mois)" pour une année complète, "01/2024 → 06/2024 (6 mois)" sinon.
export function labelPeriode(exercice) {
  const p = periodeDe(exercice);
  if (estAnneeCivileComplete(p)) return `${p.annee} (12 mois)`;
  return `${formatMoisAnnee(p.dateDebut)} → ${formatMoisAnnee(p.dateFin)} (${p.nombreMois} mois)`;
}

// Libellé court, utilisé comme repère sur l'axe des graphiques (sparklines).
export function labelCourtPeriode(exercice) {
  const p = periodeDe(exercice);
  if (estAnneeCivileComplete(p)) return String(p.annee);
  const { mois } = decoupeISO(p.dateFin);
  return String(mois).padStart(2, '0') + '/' + String(p.annee).slice(2);
}
