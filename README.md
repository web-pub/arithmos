# Arithmos — V11-001

## Nouveau dans cette version
- **Import "Dépôt officiel BNB"** : un 3e mode d'import, à côté du bilan BNB (modèle Excel) et de la balance détaillée.
  - On importe **directement le fichier .csv téléchargé depuis le site de la BNB** (Centrale des bilans) après le dépôt des comptes annuels — **aucune saisie manuelle, aucun modèle Excel à remplir**.
  - Le nom de la société, son numéro d'entreprise et les dates de la période sont lus automatiquement dans le fichier et proposés dès que le fichier est choisi (modifiables si besoin).
  - La vérification de cohérence (fichier ≠ société sélectionnée) se base désormais sur le **numéro d'entreprise** quand il est disponible — plus fiable qu'une comparaison de nom.
  - Les totaux du bilan et des résultats sont repris **directement des sous-totaux officiels du dépôt** (plus fiable qu'un recalcul à partir des rubriques détaillées, et insensible aux variantes de présentation d'un dépôt à l'autre) ; un calcul de secours à partir des rubriques s'applique seulement si un sous-total attendu manque dans le fichier.
  - **Cas "marge brute"** : certaines sociétés déposent leurs comptes sans détailler le chiffre d'affaires (code 70), en ne donnant que la marge brute (code 9900). Dans ce cas, Arithmos utilise la marge brute à la place du chiffre d'affaires pour les KPI qui en dépendent (marge nette, marge d'exploitation...) — moins précis, mais évite de laisser ces KPI vides. Un message le signale à l'import.
  - **Limite connue** : le fichier BNB ne contient pas toujours les totaux de l'année précédente pour toutes les rubriques (seulement pour quelques détails comme le capital ou les mouvements d'immobilisations) — l'import automatique de l'exercice N-1 à partir d'un seul dépôt n'a donc pas été construit ; chaque exercice (y compris les exercices antérieurs) s'importe séparément, comme avant.
  - Formats des 2 autres fichiers BNB (XBRL, PDF) : non utilisés comme source d'import — le CSV contient les mêmes données de façon bien plus simple et fiable à exploiter.

## Pas de nouvelle règle Firestore à republier
Le champ `typeImport` peut désormais valoir `"bnb_officiel"` en plus de `"bnb"`/`"detaillee"` — simple valeur de texte, déjà couverte par les règles actuelles.

## Pas encore construit
Aucun chantier en attente pour le moment.

## Déploiement
Structure à plat, un seul sous-dossier `assets/` — inchangé depuis V01. Connecté au projet Firebase `arithmos-hla`.
