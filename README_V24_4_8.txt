MON BUDGET V24.4.8 — RESET LOCAL

Nouveau :
Réglages > Zone dangereuse > Réinitialiser toutes les données de cet appareil

Le reset efface :
- opérations / revenus / dépenses
- comptes locaux
- budgets
- épargne / enveloppes
- objectifs
- récurrents
- anciennes sauvegardes Mon Budget présentes dans localStorage
- sauvegardes de récupération locales

Le reset conserve :
- thème de l'application
- préférence de synchronisation automatique
- données stockées dans Supabase

Sécurité :
- impossible de lancer le reset tant qu'un compte cloud est connecté
- double confirmation
- saisie obligatoire du mot RESET
- aucun push d'un état vide vers Supabase
