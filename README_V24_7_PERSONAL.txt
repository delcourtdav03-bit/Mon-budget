MON BUDGET V24.7 — PERSONAL EDITION

Direction :
Version pensée d'abord pour une utilisation personnelle et pour quelques proches.
Aucune logique SaaS, abonnement, paiement ou back-office n'a été ajoutée.

Corrections / finition :
- Déconnexion Supabase limitée à l'appareil courant.
  Se déconnecter sur un téléphone ne doit plus fermer volontairement les autres sessions.
- Charges récurrentes compatibles avec les jours 29, 30 et 31.
  Pour les mois plus courts, l'échéance est ramenée au dernier jour réel du mois.
- Activité : une date invalide affiche « Sans date » au lieu de produire une date cassée.
- Automatisation : les boutons de suggestion n'injectent plus directement les noms de commerçants dans le JavaScript inline.
- Comparaison mensuelle : pendant le mois courant, comparaison avec le mois précédent au même nombre de jours écoulés.
- Assistant Budget : utilise la même comparaison équitable.
- Coach hebdomadaire : ne mélange plus silencieusement les 7 derniers jours avec la prévision d'un ancien mois affiché.
- Catégories du coach : noms personnalisés respectés.

Sécurité personnelle :
- 3 snapshots quotidiens locaux maximum conservés automatiquement.
- 3 snapshots manuels maximum.
- anciennes sauvegardes de récupération limitées aux 5 plus récentes.
- nouveau panneau « Sécurité de mes données » dans Réglages.
- bouton « Créer un point » pour faire un point de restauration avant une modification importante.
- import JSON crée d'abord des copies de sécurité.
- export JSON renommé proprement avec la date.

Mobile :
- espace bas amélioré pour la navigation gestuelle.
- quelques cibles tactiles principales légèrement agrandies.

Aucune nouvelle fonction commerciale.
Les fonctions financières existantes restent présentes.
