MON BUDGET V24.6.4 — NOTIFICATIONS INTELLIGENTES

Objectif :
Alerter uniquement quand une information mérite réellement l'attention.

Types d'alertes :
1. Charges proches
   - aujourd'hui / demain si la charge est significative
   - jusqu'à 3 jours pour une charge plus importante
   - seuil adapté au revenu mensuel

2. Budget de catégorie
   - première alerte à partir de 90 %
   - alerte distincte si le plafond est dépassé

3. Risque de fin de mois
   - uniquement lorsque le moteur passe en risque élevé,
     disponible prudent négatif ou fin de mois probable négative
   - pas de notification pour un simple risque moyen

4. Épargne
   - seulement dans les 5 derniers jours du mois
   - uniquement si l'objectif mensuel est encore incomplet

Anti-spam :
- une même alerte possède un identifiant stable
- elle n'est pas répétée à chaque render / ouverture
- maximum une notification envoyée par vérification
- historique technique limité aux 80 derniers marqueurs

Préférences :
- chaque famille d'alertes peut être activée/désactivée
- préférences stockées localement sur l'appareil
- bouton de test
- bouton « Vérifier maintenant »

Limite technique assumée :
Cette version n'utilise pas de serveur push.
Les alertes sont donc vérifiées quand l'application est ouverte, relancée
ou revient au premier plan. Une PWA complètement fermée ne peut pas garantir
une notification planifiée sans infrastructure push supplémentaire.

Service worker :
- clic sur une notification → focus de l'application ou ouverture de la PWA

Aucune modification de la logique Supabase / déconnexion.
