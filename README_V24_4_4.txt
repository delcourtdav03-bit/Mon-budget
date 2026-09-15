MON BUDGET V24.4.4 — AUTH UX FIX

Correction ciblée de l’écran compte/cloud :
- le bouton créait déjà les comptes, mais le retour visuel était masqué derrière l’écran de connexion ;
- message d’état maintenant visible directement dans l’écran de connexion ;
- toast placé au-dessus de l’écran de connexion ;
- champs et boutons explicitement interactifs sur mobile ;
- état "en cours" pendant connexion/création ;
- bouton "Continuer sans compte" pour ne jamais bloquer l’accès à l’application ;
- redirection Supabase vers GitHub Pages ;
- cache PWA renouvelé.

Important : les emails reçus lors des essais précédents montrent que Supabase recevait déjà la création de compte. Le problème principal était l’UX/feedback et la redirection.
