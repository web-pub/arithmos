# Arithmos — V09-001

## Nouveau dans cette version
- **Import "Balance comptable détaillée"**, en plus de l'import "Bilan BNB" existant :
  - à l'import d'un exercice (onglet **Comptes annuels**), un choix "Bilan déposé (BNB)" / "Balance comptable détaillée" détermine le modèle Excel attendu
  - le modèle détaillé accepte une ligne par compte (numéro de compte PCMN à 6 chiffres + solde signé — positif si le compte est normalement débiteur, négatif s'il est normalement créditeur), comme un export direct d'un logiciel compta (BOB, Winbooks…)
  - les comptes sont additionnés automatiquement dans chaque rubrique interne (actifs immobilisés, stocks, créances, capitaux propres…) selon un **mapping de plages de comptes propre à chaque société** ("de compte X à compte Y")
  - ce mapping est préconfiguré avec des valeurs par défaut standards (classes du PCMN belge) dès la création d'une société, et modifiable à tout moment depuis **Sociétés → Mapping comptable** (plusieurs plages possibles par rubrique, séparées par une virgule)
  - une fois agrégé, le résultat alimente exactement le même moteur de KPI que l'import BNB — aucun changement côté onglet KPI
  - la liste des exercices importés indique désormais la source ("Bilan BNB" ou "Balance détaillée") de chaque exercice

## Corrigé dans cette version
- **Bug corrigé** : la reconnaissance du nom de société et de l'année indiqués dans le fichier Excel (message d'avertissement en cas d'écart avec la société/l'année sélectionnée à l'import) ne fonctionnait pas — elle regardait la mauvaise colonne depuis la première version de l'import. C'est corrigé pour le bilan BNB, et fait correctement dès le départ pour la balance détaillée.

## Pas de nouvelle règle Firestore à republier
Le mapping comptable est un simple champ supplémentaire (`mappingComptes`) sur le document `societes/{id}` existant, déjà couvert par les règles actuelles (lecture/écriture réservées à l'Admin/Super Admin, hors lecture déjà ouverte aux comptes "lecteur" autorisés).

## Pas encore construit
Aucun chantier en attente pour le moment.

## Déploiement
Structure à plat, un seul sous-dossier `assets/` — inchangé depuis V01. Connecté au projet Firebase `arithmos-hla`.
