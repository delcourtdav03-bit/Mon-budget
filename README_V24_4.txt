MON BUDGET V24.4 — STABILISATION FINANCIÈRE

Objectif :
Aucune nouvelle fonctionnalité. Cette version sécurise la base existante.

Corrections / stabilisation :
- moteur commun pour les revenus, dépenses et épargne du mois ;
- séparation stricte par compte dans les statistiques premium et annuelles ;
- épargne "déjà de côté" toujours hors budget mensuel ;
- épargne du mois réservée une seule fois ;
- charges récurrentes restantes réservées une seule fois ;
- récurrents correctement appliqués sur tous les comptes ;
- projection de fin de mois basée sur le rythme des dépenses variables,
  pour éviter de reprojeter les grosses charges fixes déjà payées ;
- correction de l'estimation d'épargne du mois suivant ;
- sécurisation des montants importés/anciens (chaînes, valeurs invalides, négatifs) ;
- barres/progressions d'épargne protégées contre les valeurs négatives ;
- édition/suppression des opérations sauvegardée explicitement ;
- contrôle interne silencieux de cohérence financière.

Compatibilité :
- même clé de stockage locale pour conserver les données existantes ;
- même DA et mêmes fonctionnalités ;
- nouveau logo conservé ;
- migration automatique prudente des anciennes données.

Fichiers :
- index.html
- style.css
- app.js
- manifest.json
- service-worker.js
- config.js
- supabase_setup.sql (si présent)
- icônes/logo
- qa_financial_engine.js
