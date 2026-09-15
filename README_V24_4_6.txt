MON BUDGET V24.4.6 — PASSWORD RECOVERY

Correction du flux "Mot de passe oublié ?"

Nouveau fonctionnement :
1. Dans Réglages > Compte / Cloud, saisir son email.
2. Appuyer sur "Mot de passe oublié ?".
3. Supabase envoie un email de récupération.
4. Cliquer sur le NOUVEAU lien reçu.
5. Mon Budget s'ouvre sur GitHub Pages.
6. Une vraie fenêtre "Nouveau mot de passe" s'affiche.
7. Saisir et confirmer le nouveau mot de passe.
8. Le mot de passe est mis à jour via Supabase.

Corrections techniques :
- listener PASSWORD_RECOVERY enregistré avant getSession();
- fallback de détection du lien de récupération dans l'URL;
- suppression du prompt() mobile fragile;
- écran de récupération dédié;
- confirmation du mot de passe;
- erreurs réseau/Supabase visibles;
- fonctionnement local-first conservé.
