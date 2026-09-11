MON BUDGET V24.2 — QUICK ADD FIX

Correction du bouton + en haut à droite :
- Dépense ouvre maintenant le vrai formulaire rapide
- Revenu navigue correctement vers Activité
- Transfert navigue correctement vers Activité
- Scanner de ticket navigue correctement vers Activité
- Mettre de côté navigue correctement vers Prévoir
- navigation rendue robuste : elle ne dépend plus du texte visible des onglets

Cause du bug :
l'application cherchait encore l'ancien libellé "Opérations", alors que l'onglet a été renommé "Activité".
