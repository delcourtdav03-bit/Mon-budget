MON BUDGET V24.7.1 — NAVIGATION FIX

Correction mobile :
- barre du bas placée sur une couche dédiée
- z-index explicite
- les cartes/textes normaux restent toujours sous la navigation
- fond de navigation rendu quasi opaque
- disparition de l'effet où le texte semble traverser la barre
- espace supplémentaire en bas de chaque écran
- prise en compte de la safe area Android/iPhone
- overlays, feuilles, login et modales restent au-dessus de la navigation

La navigation reste fixe en bas, mais le contenu ne donne plus l'impression
de passer devant/derrière de manière incohérente.

Aucun calcul financier modifié.
Aucune donnée, sauvegarde ou logique Supabase modifiée.
