MON BUDGET V24.6 — STABILISATION FINANCIÈRE

Objectif :
Faire passer l'application d'un prototype très complet à une base financière plus fiable.

Corrections majeures :
1. Charges fixes prévues
   - Le champ « Charges fixes prévues » du Plan du mois influence maintenant réellement le disponible prudent.
   - Les charges récurrentes connues sont déduites en premier.
   - Seul le reste non couvert du plan fixe est réservé ensuite.
   - Aucun double comptage entre plan fixe et récurrents.

2. Charges récurrentes
   - Consulter un ancien mois ne crée plus automatiquement de nouvelles dépenses.
   - Seul le mois courant peut auto-générer une charge arrivée à échéance.
   - Si une charge auto-générée est supprimée, elle est considérée comme « ignorée pour ce mois » et n'est pas recréée en boucle.
   - Les mois passés ne conservent plus de fausses réserves de charges futures.

3. Transferts
   - Supprimer un transfert supprime désormais les deux côtés.
   - Modifier son montant met à jour les deux comptes.
   - Le diagnostic repère les transferts orphelins ou incohérents.

4. Sauvegarde / cloud
   - Un simple render ou changement de mois ne déclenche plus une sauvegarde/synchronisation si les données n'ont réellement pas changé.
   - Réduction des écritures cloud inutiles.
   - La logique de déconnexion Supabase n'a pas été modifiée.

5. Score budget
   - Le score affiché sur l'accueil et celui du bilan mensuel utilisent désormais la même logique.
   - Le score tient compte des dépenses/revenus, de l'épargne prévue, du disponible prudent et des budgets de catégories.

6. Santé des données
   Nouveau panneau dans Réglages :
   - équation du disponible prudent
   - valeurs financières invalides
   - opérations liées à des comptes introuvables
   - identifiants dupliqués
   - transferts incomplets
   - charges récurrentes dupliquées
   - références d'épargne cassées
   - résumé des réserves fixes et épargne

Aucune donnée n'est supprimée automatiquement par l'audit.
Aucun changement à la déconnexion Supabase.
