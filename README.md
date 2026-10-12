# Arithmos — V08-001

## Nouveau dans cette version
- **Export des KPI**, dans l'onglet **KPI** (Admin/Super Admin) et dans l'espace **Mes résultats** (comptes à accès limité) :
  - **Export PDF** : rapport mis en page (société, exercice, groupes Liquidité/Solvabilité/Rentabilité/Trésorerie, valeur, statut et analyse de chaque indicateur), prêt à imprimer ou à envoyer
  - **Export Excel (.xlsx)** : mêmes données sous forme de tableau, pour retravailler les chiffres
  - les deux exports portent sur la société et l'exercice actuellement sélectionnés à l'écran
  - fonctionne à l'identique côté Admin et côté comptes "Accès résultats"

## Pas de nouvelle règle Firestore à republier
Cette fonctionnalité ne lit/écrit rien en plus dans Firestore : elle réutilise les KPI déjà calculés côté navigateur.

## Décision
Pas de lien WhatsApp "mot de passe oublié" pour ce site (confirmé) — le lien mailto actuel sous le champ mot de passe reste donc la solution définitive pour Arithmos.

## Pas encore construit
Aucun chantier en attente pour le moment.

## Déploiement
Structure à plat, un seul sous-dossier `assets/` — inchangé depuis V01. Connecté au projet Firebase `arithmos-hla`.
