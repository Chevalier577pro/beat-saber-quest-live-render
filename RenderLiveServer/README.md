# Site de live Beat Saber sur Render

Ce service héberge **toute la diffusion vidéo sur Render**. Le Quest ne se connecte
pas en RTMP directement à Render : l'APK transporte le RTMP dans une connexion
WebSocket sécurisée (`wss://`) sur l'unique port HTTPS public de Render. Le site
convertit le flux en HLS et l'affiche sur sa page d'accueil. Aucun PC n'est
nécessaire pendant la partie.

## Déploiement

1. Créer un dépôt GitHub contenant `render.yaml` à la racine et le dossier
   `RenderLiveServer/` de ce paquet. Ne pas envoyer `node_modules/`.
2. Dans Render, choisir **New → Blueprint** et sélectionner ce dépôt.
3. Quand Render demande `STREAM_KEY`, entrer une chaîne secrète d'au moins
   20 caractères. Conserver cette valeur : c'est la clé à saisir dans l'APK.
4. Attendre que le déploiement soit opérationnel et copier l'adresse publique
   HTTPS du service, par exemple `https://quest-beat-saber-live-xxxx.onrender.com`.
5. Installer l'APK `QuestLiveCompanion-0.2.0.apk` sur le Quest. Dans
   **Quest Live Companion**, saisir l'adresse HTTPS du site Render dans le
   premier champ et **la même `STREAM_KEY`** dans le second ; enregistrer.
6. Dans Beat Saber, sous **Mods → Discord Presence**, saisir la même adresse
   HTTPS dans **Live Viewer URL** et activer **Auto Start Quest Live**.
7. Au lancement de Beat Saber, attendre le réveil éventuel du service Render,
   puis accepter l'autorisation de capture du Quest. Le bouton Discord ouvre
   directement la page du live. Aucune adresse RTMP n'est à rechercher.

La clé est un secret. Elle va uniquement dans la variable d'environnement
Render et dans l'APK ; elle ne va jamais dans l'URL Discord ou dans le dépôt.

## Limites

Render Free s'endort après 15 minutes d'inactivité et peut prendre environ une
minute pour se réveiller. L'APK attend jusqu'à 100 secondes avant de demander
l'autorisation de capture. Render peut aussi redémarrer une instance gratuite à
tout moment, ce qui coupe le direct en cours. Le trafic vidéo sortant compte
dans l'utilisation de bande passante Render ; chaque spectateur consomme du
trafic. Le site ne conserve pas d'enregistrement.

Le service doit rester sur **une seule instance** : le relais d'envoi et le
lecteur HLS utilisent le même serveur MediaMTX local. Pour plusieurs instances
ou une diffusion plus robuste, il faut une architecture avec stockage et
répartition de flux adaptés.

## Développement local

Le site utilise Node 22, `ws`, `hls.js` et MediaMTX 1.21.3. Le Dockerfile copie
le binaire MediaMTX officiel dans l'image Node. `npm test` vérifie
l'authentification et le transport bidirectionnel du tunnel ainsi que les
routes web. `mediamtx.yml` a été validé avec MediaMTX 1.21.3. Un essai complet
sur un vrai Quest et sur un service Render déployé reste nécessaire.
