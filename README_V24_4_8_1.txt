MON BUDGET V24.4.8.1 — RESET FIX

Correction :
- le bouton Réinitialiser est maintenant autonome dans index.html
- il fonctionne même si un ancien app.js était encore en cache
- double confirmation
- si un compte Supabase est connecté, déconnexion locale de cet appareil
- suppression des données locales Mon Budget
- aucune suppression des données stockées dans Supabase
- rechargement complet après reset
- cache-busting app.js/style.css/config.js
