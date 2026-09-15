V24.4.2 — Auth Diagnostic

Cette version ne change pas la logique financière.
Elle rend les erreurs d'authentification Supabase visibles dans la carte Compte utilisateur.

Si le bouton Créer un compte échoue, l'application indique maintenant si :
- l'email ou le mot de passe manque ;
- le mot de passe est trop court ;
- Supabase refuse la création du compte ;
- la librairie Supabase ne s'est pas chargée ;
- une erreur réseau empêche l'appel.

Pour un vrai test d'authentification, privilégier la version hébergée (GitHub Pages/Cloudflare)
plutôt que le fichier preview de ChatGPT.
