# Arithmos — V14-001

## Nouveau dans cette version
- **Page "Fonctionnalités" séparée** : la section "Comment ça marche" (les 5 étapes, import → accès) quitte la page d'accueil et vit maintenant sur sa propre page publique (`fonctionnalites.html`), accessible depuis le menu et le bouton "Voir le fonctionnement" du hero. La page d'accueil redevient plus courte (hero + bandeau Accès).
  - Le contenu reste modifiable depuis l'onglet **Contenu** de l'Admin, au même endroit qu'avant (juste renommé "Page Fonctionnalités — Comment ça marche").
- **Comparatif sur 2 exercices (2024/2025)** : confirmé fonctionnel une fois le correctif Chart.js de la V13-002 appliqué — le radar "Profil global" superpose l'exercice précédent en pointillés, et "Comparaison par exercice" affiche les deux années côte à côte, dès que 2 exercices ou plus sont importés pour une société.

## Correctif V13-002 (inclus)
Les graphiques de la V13-001 restaient vides : l'URL Chart.js pointait vers la version 4.4.4, inexistante sur le CDN cdnjs (seules 4.4.0/4.4.1 existent pour cette série). Corrigé en 4.4.1.

## Pas de nouvelle règle Firestore à republier
Aucun changement de structure de données.

## Pas encore construit
Aucun chantier en attente pour le moment.

## Déploiement
Structure à plat, un seul sous-dossier `assets/` — inchangé depuis V01. Connecté au projet Firebase `arithmos-hla`.
