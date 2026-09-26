# Mon Budget — audit et correctifs V24.7.6

Analyse du 26 septembre 2026, à partir de la V24.7.5 « Saisie express intelligente ».

## Corrections

| Problème confirmé dans le code d’origine | Correction |
| --- | --- |
| À 00 h 30 en Belgique, une opération pouvait être datée de la veille avec la date UTC. | Les saisies et dates par défaut utilisent la date locale. Les horodatages techniques restent en UTC. |
| Une épargne mensuelle explicitement réglée sur 0 € était remplacée par les mensualités des objectifs. | Une valeur explicite de zéro est respectée ; les objectifs servent de valeur de repli uniquement sans plan d’épargne défini. |
| La catégorie choisie manuellement dans la saisie express pouvait être écrasée par une règle au moment de l’enregistrement. | Le choix manuel reste prioritaire. |
| Une saisie d’épargne négative était acceptée par le gestionnaire d’ajout. | Les ajouts doivent être strictement positifs et finis. |
| Un objectif à 90 € sur 100 €, crédité de 20 €, ne gardait que 100 €. L’annulation pouvait ensuite retirer trop d’argent. | Le montant réel, ici 110 €, est conservé ; la jauge visuelle reste plafonnée à 100 %. |
| L’ajout « 12,50 » dans un objectif était ignoré. | La virgule décimale est acceptée. |
| Après un dépôt de 100 € et un retrait de 80 €, supprimer le dépôt faisait passer une enveloppe à −80 €. Le solde libre pouvait aussi être désynchronisé. | Une suppression ou diminution consommant une somme déjà retirée est bloquée avec une explication. |
| Des dates impossibles, comme le 31 février, étaient acceptées dans les imports. | Validation du calendrier, y compris les années bissextiles. |
| Un fichier JSON quelconque pouvait être interprété comme un budget vide et remplacer les données. | Vérification de la structure avant remplacement. Les sauvegardes de sécurité existantes sont conservées. |
| Plusieurs anciens affichages interprétaient du HTML dans les noms de comptes, objectifs, récurrents, modèles ou catégories. | Échappement des libellés dans ces affichages. Ce contrôle ciblé ne constitue pas un audit de sécurité exhaustif. |
| Un échec de sauvegarde locale n’était visible que dans la console. | Avertissement persistant dans l’application, avec indication d’exporter un JSON. Il disparaît après une sauvegarde réussie. |
| Le service worker mettait en cache toute requête GET, pouvait retourner du HTML à la place d’un script et supprimait les caches des autres applications du même domaine. | Cache limité à l’application et à ses ressources, absence de cache des erreurs HTTP et des services externes, repli HTML réservé aux navigations, nettoyage limité aux caches Mon Budget. |

## Vérifications effectuées

- 28 tests du code applicatif réel dans un environnement DOM simulé (jsdom), tous réussis.
- 7 contrôles du service worker avec réseau/cache simulés, tous réussis.
- Syntaxe JavaScript vérifiée, y compris les scripts de l’aperçu autonome.
- Parcours contrôlés : saisie express, persistance locale, calculs de réserve, épargne existante, objectifs, enveloppes, imports JSON et dates d’import, navigation, récurrents sans doublons, modification/suppression des deux côtés d’un transfert.
- Les tests et leurs résultats sont inclus dans le dossier `tests`. Ils n’utilisent aucune donnée personnelle.

Reproduction : installer Node.js et jsdom, puis lancer `node tests/audit.cjs` et `node tests/service-worker.cjs` depuis le dossier extrait. L’ancien `qa_financial_engine.js` ne testait qu’une formule recopiée ; les nouveaux tests exécutent les fonctions d’`app.js`.

## Limites

Le navigateur Chromium n’a pas pu être installé dans l’environnement de contrôle. Aucune validation visuelle, tactile, Android ou de l’installation PWA réelle n’est donc revendiquée. La connexion Supabase, la synchronisation entre appareils, l’OCR, la caméra, les notifications système et le chargement XLSX externe n’ont pas été testés en conditions réelles. Les tests d’import portent sur le traitement local et les dates, pas sur tous les formats de classeurs.

Les corrections n’inventent pas les données déjà perdues par une ancienne version (par exemple un objectif auparavant plafonné). Elles n’ont pas modifié les données du téléphone ni celles du cloud. Les plans mensuels et les objectifs restent partagés entre les comptes comme dans la version d’origine ; cette organisation n’a pas été repensée dans ce correctif.

## Installation

1. Depuis l’application actuellement utilisée, exporter une sauvegarde JSON dans Réglages.
2. Remplacer les fichiers du site existant par le contenu de ce ZIP, en conservant la même adresse pour retrouver le stockage local. La configuration cloud existante est conservée.
3. Recharger l’application connectée à Internet et vérifier que le badge indique V24.7.6. Le cache PWA porte un nouveau numéro.
4. L’aperçu HTML est pratique pour découvrir les corrections, mais ouvrir un autre fichier ou une autre adresse ne garantit pas l’accès aux données de l’application installée.

Aucun déploiement sur le site ou le téléphone n’a été effectué dans cet audit.
