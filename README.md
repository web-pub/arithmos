# Arithmos — V13-001

## Nouveau dans cette version
- **Graphiques beaucoup plus visuels** dans l'onglet KPI (Admin) et dans Mes résultats, via Chart.js (chargée depuis un CDN, même méthode que XLSX.js/jsPDF pour les exports — pas d'installation).
  - Le **score de santé financière** s'affiche maintenant comme une **jauge** colorée (demi-cercle) avec la note au centre, plutôt qu'un simple texte.
  - Un nouveau graphique **"Profil global"** : un radar à 4 axes (Liquidité, Solvabilité, Rentabilité, Trésorerie), avec l'exercice précédent superposé en pointillés quand il existe — pour voir d'un coup d'œil où une société est forte ou fragile, et comment ça évolue.
  - Un nouveau graphique **"Comparaison par exercice"** : des barres groupées (chiffre d'affaires, résultat de l'exercice, total actif) sur tous les exercices importés, dès qu'il y en a au moins 2.
  - Les petites courbes d'évolution par KPI (sparklines) sont remplacées par de **vraies courbes agrandies**, avec grille, dégradé de couleur et info-bulle au survol — dès qu'au moins 2 exercices existent pour ce KPI (sinon, le message "pas assez de données" reste affiché comme avant).
  - Ces graphiques sont aussi recalculés automatiquement en changeant de société ou d'exercice dans les menus déroulants.

## Pas de nouvelle règle Firestore à republier
Aucun changement de structure de données — uniquement de l'affichage.

## Pas encore construit
Aucun chantier en attente pour le moment.

## Déploiement
Structure à plat, un seul sous-dossier `assets/` — inchangé depuis V01. Connecté au projet Firebase `arithmos-hla`.
