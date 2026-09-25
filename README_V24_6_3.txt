MON BUDGET V24.6.3 — À VENIR NOUVELLE GÉNÉRATION

Nouvelle timeline dans Prévoir :
- prochaines dépenses récurrentes classées par date
- montant de chaque charge
- aujourd'hui / demain / dans X jours
- total des charges encore connues
- total prévu dans les 7 prochains jours
- disponible prudent estimé après chaque prélèvement
- disponible prudent final après toutes les charges connues
- mise en évidence d'une échéance proche
- alerte visuelle si une charge fait passer le disponible sous zéro
- rappel séparé des charges fixes prévues mais non détaillées

Cohérence financière :
- le moteur ne déduit pas deux fois les charges récurrentes
- financialSnapshot.safeAvailable contient déjà les charges futures
- la timeline les rajoute temporairement au point de départ puis les retire une par une
- la dernière ligne doit donc retomber sur le disponible prudent réel
- les charges déjà comptabilisées et celles ignorées pour le mois sont exclues
- les mois clôturés n'affichent pas de fausses charges futures

Navigation :
- le Centre d'actions ouvre maintenant directement cette timeline
- bouton « Gérer » vers l'éditeur des dépenses récurrentes
- le petit aperçu « À venir » de l'accueil utilise le même moteur

Aucun changement à Supabase / déconnexion.
