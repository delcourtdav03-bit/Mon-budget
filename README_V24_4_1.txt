MON BUDGET V24.4.1 — SUPABASE CONNECTÉ

Configuration intégrée :
Project URL :
https://gjjvhxgsvotracqhpkgf.supabase.co

Publishable key :
sb_publishable_aKFUnHeME3sUYqVSs8f2Ag_uhzcqudP

IMPORTANT
- La Publishable key est prévue pour être utilisée côté navigateur.
- Aucune service_role / secret key n'est incluse.
- L'URL utilisée dans config.js est l'URL de base du projet, sans /rest/v1/.

PROCHAINE ÉTAPE DANS SUPABASE
1. Ouvrir le projet Mon Budget.
2. Aller dans SQL Editor.
3. Créer une nouvelle requête.
4. Copier tout le contenu de supabase_setup.sql.
5. Exécuter la requête.

Le script crée :
- public.budget_snapshots
- 1 ligne de données maximum par utilisateur
- Row Level Security (RLS)
- politiques empêchant un utilisateur de lire/modifier les données d'un autre.

APRÈS ÇA
On pourra tester :
- création d'un compte
- connexion
- déconnexion
- sauvegarde cloud
- récupération cloud
- séparation entre deux utilisateurs

Aucune donnée locale existante n'est volontairement supprimée.
