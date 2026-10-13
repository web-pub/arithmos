# Arithmos — V13-015

## Nouveau + correctif V13-015 : tableau de bord cliquable, et ses chiffres "Accès"/"Exercices" étaient faux
- **Tuiles cliquables** : chaque tuile du tableau de bord (Sociétés, Accès résultats actifs, Exercices importés) mène maintenant directement à l'onglet correspondant d'un clic — plus besoin de chercher le bon onglet dans le menu.
- **Nouvelle tuile "Sociétés avec KPI disponibles"**, qui mène à l'onglet KPI.
- **Correctif des chiffres faux** : "Accès résultats actifs" affichait 0 tant que l'onglet Accès n'avait jamais été ouvert dans la session (le chiffre dépendait d'une liste chargée seulement à ce moment-là) ; "Exercices importés" pouvait aussi retomber sur 0 en cas d'imprévu sur la requête d'ensemble utilisée pour le compter. Les deux chiffres sont maintenant interrogés directement dans Firestore à chaque affichage du tableau de bord, indépendamment des autres onglets déjà ouverts ou non — et en cas d'échec réel de la requête, affiche "—" (donnée indisponible) plutôt qu'un 0 qui laisserait croire à tort qu'il n'y a rien.
- **Séparateur de milliers sur les compteurs du tableau de bord**, pour rester cohérent avec le reste du site (espace tous les 3 chiffres) une fois les chiffres plus élevés.

## Correctif V13-014 : 2 bugs d'affichage signalés sur les courbes des KPI
- **Courbe "Écart délais clients / fournisseurs" en rouge alors que le résultat est bon.** La couleur rouge/vert des courbes est basée sur le signe des valeurs (négatif = rouge), une règle valable pour la plupart des KPI (trésorerie, marge, résultat — négatif y est toujours défavorable). Mais pour ce KPI précis, c'est l'inverse : négatif = favorable (les clients paient avant que les fournisseurs doivent être réglés), positif = défavorable. La courbe utilisait donc la mauvaise règle, affichant un bon résultat (-11 jours, badge "Bon") en rouge. Corrigé en inversant la règle de couleur spécifiquement pour ce KPI (et, par cohérence, un écart positif et défavorable s'affichera désormais bien en rouge).
- **Courbe "Vitesse de rotation des stocks" en euros au lieu de jours.** La liste des KPI en jours (pour l'axe et l'info-bulle de la courbe) n'avait pas été mise à jour lors de l'ajout de ce nouveau KPI (V13-012) et retombait sur le format € par défaut. Corrigé.

## Correctif V13-013 : le radar "Profil global" affichait une branche à 0 pour un groupe non calculable
Signalé sur le radar "Profil global" : quand aucun des KPI d'un groupe n'est calculable pour l'exercice (ex. aucun des 3 KPI "Délais de paiement"), ce groupe n'a pas de score — mais le radar l'affichait quand même comme une branche tirée jusqu'au centre (valeur 0), ce qui se lit visuellement comme "mauvais score" alors que c'est en réalité "pas de donnée disponible", déformant tout le profil.
- Corrigé : seuls les groupes réellement calculables pour l'exercice analysé affichent une branche sur le radar — un groupe non calculable est simplement absent de l'étoile (pas de branche à 0), aussi bien à l'écran que dans l'image insérée dans l'export PDF (même graphique réutilisé).

## Nouveau dans la V13-012 : KPI "Vitesse de rotation des stocks"
- **Nouveau KPI**, dans un nouveau groupe **"Stocks"** (visible dans l'onglet KPI de l'Admin et dans "Mes résultats", avec traçabilité, courbe, export PDF/Excel comme les autres, et inclus dans le score de santé global et le radar "Profil global") : **Vitesse de rotation des stocks** = stocks (code BNB 3) ÷ coût des ventes × durée de l'exercice en jours — en combien de jours les stocks se renouvellent en moyenne.
- "Coût des ventes" n'a pas de rubrique BNB dédiée dans le schéma abrégé : approximé par achats + services et biens divers (codes 60/61), la même base que le délai de paiement fournisseurs. Comme les stocks et les achats sont tous deux hors TVA, aucune correction TVA n'est nécessaire ici (contrairement aux délais clients/fournisseurs).
- Se neutralise automatiquement ("Non calculable") pour les dépôts BNB en marge brute, pour la même raison que les autres KPI concernés par le correctif V13-010 (achats/services non disponibles).
- **Comparaison aux statistiques sectorielles NBB.Stat (secteur par code NACEBEL) demandée mais non réalisée** : aucune API publique documentée n'a été trouvée pour interroger NBB.Stat par code NACEBEL de façon automatisée (seuls les "web services" CBSO existent, réservés aux dépôts de comptes annuels bruts, avec abonnement/paiement, et sans lien avec les ratios sectoriels NBB.Stat). À la demande explicite de Mme Laruelle ("oublie cette étape si tu ne sais pas le faire en automatique"), cette fonctionnalité n'a pas été construite. Reste possible plus tard en saisie manuelle si elle le souhaite.

## Correctif V13-011 : la correction marge brute (V13-010) ne s'appliquait pas aux exercices déjà importés
Signalé sur un exercice réel : le badge "À surveiller" du délai de paiement clients affichait encore une valeur chiffrée (146 jours) calculée à partir de la marge brute, et l'onglet Chiffres BNB affichait encore "Chiffre d'affaires" en toutes lettres — alors que ce dépôt ne précise ni CA ni achats. Cause : le nouveau champ `chiffreAffairesEstMargeBrute` (V13-010) n'existe que sur les imports faits **après** ce correctif ; sur les exercices déjà en base, il est absent, donc la détection retombait par défaut sur "non marge brute" et l'ancien comportement (fausser le calcul) continuait de s'afficher.
- La détection repose désormais aussi sur la **signature caractéristique** du mode marge brute (achats et services à 0 alors qu'un montant de "chiffre d'affaires" non nul est présent, uniquement pour les dépôts officiels BNB) quand le champ n'existe pas — ça corrige automatiquement tous les exercices déjà importés, sans avoir besoin de les réimporter.
- Conséquence directe : les KPI concernés (marge nette, marge d'exploitation, les 3 KPI "Délais de paiement") repassent bien en "Non calculable" (badge neutre, pas de couleur ni de texte alarmant) sur ces exercices, et l'onglet Chiffres BNB affiche bien "Marge brute (CA non précisé)" avec l'encart d'avertissement.

## Correctif V13-010 : marge brute confondue avec le chiffre d'affaires, et lisibilité du détail des KPI
Correction demandée sur 2 points distincts (dépôt officiel BNB) :
- **Marge brute ≠ chiffre d'affaires.** Quand une société dépose à la BNB une **marge brute globale** (code 9900) plutôt que de détailler chiffre d'affaires (code 70) et achats (code 60), ce choix est volontaire et légal (ne pas divulguer le détail CA/achats à la concurrence). Mathématiquement, il est **impossible de reconstituer les achats à partir de la seule marge brute** : une infinité de couples CA/achats donnent la même marge. Plutôt que d'utiliser cette marge brute comme si c'était le chiffre d'affaires (ce qui faussait l'analyse), Arithmos :
  - marque désormais **"Non calculable"** les ratios qui ont besoin du vrai CA ou des achats — marge nette, marge d'exploitation, délai de paiement clients, délai de paiement fournisseurs, écart des délais — avec une explication explicite dans le texte d'analyse de chaque KPI plutôt qu'un chiffre trompeur ;
  - dans l'onglet **Chiffres BNB**, la ligne concernée est désormais intitulée **"Marge brute (CA non précisé)"** au lieu de "Chiffre d'affaires", avec un encart d'avertissement en haut de l'onglet qui explique la situation.
  - Un nouveau champ `chiffreAffairesEstMargeBrute` est enregistré sur l'exercice lors de l'import (dépôt officiel BNB uniquement) pour piloter ce comportement partout où l'exercice est utilisé (Admin, Mes résultats, export).
- **Détail du calcul rendu plus lisible.** Le tableau déroulant "Voir le détail du calcul" de chaque KPI était trop étroit dans les cartes KPI : le montant se retrouvait tronqué/mal aligné. Corrigé en passant à une présentation à 2 colonnes (rubrique + petit code source en dessous, puis montant), avec le montant désormais toujours aligné à droite et jamais coupé. Le préfixe "Code BNB"/"Comptes" devant la source a aussi été retiré : seuls les codes/plages sont affichés, plus concis.

## Correctif V13-009 : délais de paiement TVAC vs HTVA
Remarque pertinente : les créances et dettes commerciales (codes BNB 40/41 et 44) sont des soldes **TVA comprise**, alors que le chiffre d'affaires et les achats/services (codes 70, 60, 61) sont **hors TVA**. Sans correction, les 2 délais de paiement (V13-008) étaient donc surestimés.
- **Nouveau champ par société** : "Taux de TVA moyen (%)" dans la fiche société (21 % par défaut, modifiable — utile pour une activité à taux réduit 6 %/12 % ou à taux mixte).
- Le chiffre d'affaires et les achats/services sont désormais ramenés en TVA comprise (× (1 + taux de TVA)) avant le calcul des délais clients et fournisseurs, pour rester sur la même base que les créances/dettes.
- Le taux utilisé est maintenant mentionné dans le texte d'analyse de chaque délai ("calculé TVA comprise, à 21,0 %"), pour que ce soit transparent.

## Nouveau dans la V13-008 : délais de paiement
- **3 nouveaux KPI**, dans un nouveau groupe **"Délais de paiement"** (KPI #12 à #14, visibles dans l'onglet KPI de l'Admin et dans "Mes résultats", avec traçabilité, courbe, export PDF/Excel comme les autres) :
  - **Délai de paiement clients** : créances commerciales à un an au plus ÷ chiffre d'affaires × durée de l'exercice en jours — en combien de jours les clients paient en moyenne.
  - **Délai de paiement fournisseurs** : dettes commerciales à un an au plus ÷ (achats + services et biens divers) × durée de l'exercice en jours — en combien de jours les fournisseurs sont payés en moyenne.
  - **Écart délais clients / fournisseurs** : le 3e ratio demandé, compare les deux — différence en jours. Négatif ou nul : favorable (l'argent rentre avant de devoir payer les fournisseurs). Positif : la société doit financer ce décalage.
  - Les deux premiers s'adaptent à la durée réelle de l'exercice (un exercice de 6 mois n'affiche pas un délai 2 fois trop long).
- Le radar "Profil global" a maintenant 5 axes (ajout de "Délais de paiement"), et ce nouveau groupe compte désormais dans le **score de santé global** — comme chez Graydon, le comportement de paiement est un signal de risque à part entière. Un signal d'alerte se déclenche aussi si l'écart entre les deux délais devient important.

## Nouveau dans la V13-007 : onglet "Chiffres BNB"
- Nouvel onglet dans l'espace Admin, entre **KPI** et **Accès** : **Chiffres BNB**. Il affiche les montants importés tels quels, présentés comme un bilan déposé à la BNB — **Bilan** (Actif / Passif) et **Compte de résultats** (Produits / Charges) — sans aucun ratio ni interprétation, juste les chiffres bruts, rubrique par rubrique, avec les totaux (dont le contrôle d'équilibre actif/passif) et les résultats intermédiaires (exploitation, courant, avant impôt, de l'exercice).
- Fonctionne avec les 3 modes d'import (Bilan BNB, Dépôt officiel BNB, Balance détaillée) puisqu'il lit les mêmes valeurs déjà normalisées utilisées par les KPI.

## Correctif + refonte V13-006 : export PDF des KPI
- **Bug corrigé** : certains montants (ex. "Fonds de roulement net") faisaient planter l'affichage du texte dans le PDF — les lettres se retrouvaient éclatées une par une ("L e f o n d s..."), et le montant lui-même s'affichait tronqué/déformé (ex. "396/255 €" au lieu de "396 255 €"). Cause : le séparateur de milliers utilisé partout sur le site (un espace fin insécable, pour le format "espace tous les 3 chiffres") n'existe pas dans la police standard utilisée par le PDF — tout le bloc de texte contenant ce caractère partait en vrille. Corrigé en remplaçant ce caractère par un espace normal uniquement au moment de la génération du PDF (invisible à l'œil, aucun changement ailleurs sur le site).
- **Présentation entièrement refaite** : le PDF reprend maintenant la même logique visuelle que l'écran — carte "Score de santé" avec sa jauge, signaux d'alerte avec liseré de couleur, et chaque KPI dans une carte avec fond teinté selon son statut (vert/orange/rouge), au lieu d'un simple enchaînement de texte.
- **Graphiques insérés dans le PDF** : la jauge du score, le radar "Profil global", le graphique "Comparaison par exercice" et la courbe d'évolution de chaque KPI (quand disponible) sont maintenant inclus comme images dans le PDF — ce n'était pas le cas avant (texte seul).

## Nouveau dans la V13-005
- **Traçabilité des KPI vers les comptes PCMN/BNB** : chaque KPI (dans l'espace Admin et dans "Mes résultats") affiche désormais un lien dépliable **"Voir le détail du calcul"**. Il liste chaque rubrique comptable qui entre dans le calcul, avec :
  - sa **contribution signée** en €, triée du plus gros poids au plus petit (en valeur absolue) — pour repérer immédiatement le compte qui tire le résultat vers le haut ou vers le bas ;
  - sa **source** : le code BNB du schéma abrégé (import "Bilan BNB"), le code du dépôt officiel BNB (import "Dépôt officiel BNB"), ou la plage de comptes PCMN réellement configurée pour la société (import "Balance détaillée" — reflète le mapping propre à chaque société, pas uniquement le défaut Arithmos).
  - Objectif : pouvoir, comme avec un outil type GraydonCreditsafe, remonter d'un ratio qui pose question jusqu'au(x) compte(s) qui en sont la cause.

## Correctif V13-004
Les axes et info-bulles des nouveaux graphiques (V13-001) affichaient les montants abrégés ("24355k €") sans séparateur de milliers. Remplacé par le même format qu'ailleurs sur le site : espace tous les 3 chiffres, sans abréviation (ex. `-1 516 695 €`).

## Nouveau dans la V13-003
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
