# Arithmos — V03-002

## Nouveau dans cette version
- **Connexion par identifiant** (même système que le site des Cabots) : la page de connexion demande un **Identifiant** (ex. `HeleneL`) et non plus une adresse e-mail. En coulisses, une table Firestore `identifiants/{identifiant}` fait le lien vers l'e-mail réel utilisé par Firebase Authentication — la personne ne tape jamais son e-mail pour se connecter, mais le "Mot de passe oublié" et le changement de mot de passe continuent de fonctionner par e-mail en interne.
- Création/modification d'un accès (onglet Accès) : la table `identifiants` est tenue à jour automatiquement (création, changement d'identifiant, suppression à la révocation).

## ⚠️ Bootstrap de ton compte Super Admin — mis à jour
Reprends les mêmes étapes que précédemment (Authentication + document `users/{ton-uid}`), **plus une étape supplémentaire** :

1. Firebase Console → Authentication → Add user → utilise ton e-mail réel (`helene.laruelle@gmail.com`) + un mot de passe → copie le **User UID**
2. Firestore → collection `users` → document avec cet UID → champs `role: "superadmin"`, `prenom`, `nom`, `email: "helene.laruelle@gmail.com"`
3. **Nouveau** : Firestore → collection `identifiants` → document avec pour ID ton identifiant **en minuscules** (ex. `helenel`) → champ `email: "helene.laruelle@gmail.com"`
4. (Optionnel) `users/{ton-uid}/private/credentials` → `motDePasseClair`
5. Sur `login.html`, connecte-toi avec l'**identifiant** choisi à l'étape 3 (ex. `HeleneL`, la casse n'a pas d'importance) + le mot de passe de l'étape 1

Si tu avais déjà créé ton compte avant cette version, il te manque juste l'étape 3 — sans elle, la connexion par identifiant ne trouvera pas ton e-mail.

## Pas encore construit (prochains chantiers)
1. **Moteur de calcul des KPI** selon le droit belge (liquidité, solvabilité, rentabilité, trésorerie…) à partir des exercices importés
2. Restitution chiffrée + analyse en langage clair + graphique
3. Contenu des pages publiques/légales éditable depuis l'Admin
4. Historique des connexions (Maintenance)
5. Lien WhatsApp "mot de passe oublié" (en attente du numéro)

## Déploiement
Structure à plat, un seul sous-dossier `assets/` — inchangé depuis V01. Connecté au projet Firebase `arithmos-hla`. Pense à republier `firestore.rules` dans la console (nouvelle règle `identifiants`).
