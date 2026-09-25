MON BUDGET V24.6.1 — ONBOARDING INTELLIGENT

Objectif :
Permettre à un nouvel utilisateur de rendre l'application utile en 2–3 minutes.

Parcours en 5 étapes :
1. Revenu mensuel prévu
   - option explicite pour indiquer si ce revenu est déjà réellement arrivé ce mois-ci
   - aucun revenu réel n'est créé sans cette validation

2. Charges fixes
   - un seul total mensuel simple
   - ce montant alimente le Plan du mois et le moteur prudent V24.6

3. Épargne
   - objectif mensuel
   - raccourcis 5 %, 10 %, 15 %, 20 %
   - aperçu instantané de ce qu'il restera après fixes + épargne

4. Budgets variables
   - Courses, Transport, Loisirs, Shopping, Enfant, Autres
   - proposition automatique à partir du reste disponible
   - l'algorithme conserve volontairement 15 % de marge non affectée
   - avertissement si les plafonds choisis dépassent la marge

5. Résumé
   - revenu
   - charges fixes
   - épargne
   - reste à piloter
   - diagnostic simple avant validation

Sécurité :
- les étapes ne modifient pas les vraies données avant le bouton final
- une sauvegarde locale de sécurité est créée avant une reconfiguration
- l'onboarding ne s'affiche pas automatiquement chez un utilisateur qui possède déjà des données
- bouton « Reconfigurer avec le guide » ajouté au Plan du mois
- aucune modification de la logique Supabase / déconnexion
