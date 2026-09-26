MON BUDGET V24.7.3 — VÉRIFIER MON SOLDE

But :
Comparer occasionnellement le solde réel du compte bancaire avec ce que
Mon Budget déduit des opérations enregistrées.

Première vérification :
- l'utilisateur entre le solde réel
- ce montant devient un point de référence
- aucune dépense/revenu n'est créé

Vérifications suivantes :
- Mon Budget reprend le dernier solde réel validé
- il calcule le net de tous les revenus, dépenses et transferts enregistrés depuis
- il estime le solde bancaire attendu
- l'utilisateur entre le solde réel de sa banque
- l'app affiche l'écart

Interprétation :
- écart <= 1 € : cohérent
- solde réel plus bas : dépense/transfert probablement manquant
- solde réel plus haut : revenu/remboursement/transfert probablement manquant

Ajustement :
- l'utilisateur peut volontairement convertir l'écart en opération
  « Ajustement de solde »
- cette action demande une confirmation
- sinon il peut simplement recalibrer sans créer d'opération

Modèle :
- seuls income / expense / transfer_in / transfer_out influencent le solde bancaire
- les écritures d'épargne conceptuelles ne sont pas comptées comme mouvements bancaires
  afin d'éviter de les déduire deux fois si un transfert réel existe
- historique limité aux 12 dernières vérifications par compte

Sécurité :
- copie de récupération locale avant un recalibrage/ajustement
- aucun accès bancaire
- aucune connexion bancaire
- aucun calcul financier mensuel existant modifié
