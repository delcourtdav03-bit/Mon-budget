MON BUDGET V24.4.7 — LOCAL RECOVERY

But :
Récupérer les données locales qui semblent avoir disparu après les tests cloud/Supabase.

Fonctionnement :
- Réglages > Retrouver mes anciennes données
- "Scanner mes anciennes données"
- L'app cherche toutes les clés localStorage contenant "monBudget"
- Les sauvegardes sont classées par quantité de données
- Aperçu possible avant restauration
- Restauration volontaire uniquement
- La source n'est jamais supprimée
- Une copie de sécurité de l'état actuel est créée avant restauration

Sécurité supplémentaire :
- avant un pull cloud, une copie de sécurité locale est créée
- avant le chargement d'un workspace utilisateur, une copie de sécurité locale est créée

IMPORTANT :
La récupération doit être testée sur le MÊME domaine GitHub Pages et le MÊME navigateur/appareil
où les données existaient. Un fichier HTML téléchargé n'a pas accès au même localStorage.
