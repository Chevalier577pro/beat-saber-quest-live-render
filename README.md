# Beat Saber Live Replay – Rendu 3D en direct

Ce dossier décrit l’évolution du projet `beat-saber-quest-live-render` vers une reconstruction 3D temps réel, à la manière d’un Replay de Beat Saber, mais pendant le jeu.

## État actuel du projet existant

Le projet GitHub héberge un serveur Render `RenderLiveServer/` qui :
- Relaye via WebSocket sécurisé `wss://…/ingest` le RTMP du Quest vers MediaMTX
- Sert un lecteur HLS sur `public/index.html` + `player.js`
- Reçoit la présence Discord via POST `/api/presence` avec authentification Bearer `STREAM_KEY`
- Le mod Quest `BSQ_DiscordRichPresence-main` :
  - Envoie l’activité Discord via `QuestDiscord::HandleEvent` ou `SendPresenceEvent` vers le companion desktop
  - En mode Quest Discord App, utilise un helper JNI qui transmet l’activité à Discord native
  - Heartbeat local vers `http://127.0.0.1:18745/heartbeat` quand `QuestAutoLive` est activé
  - Récupère les stats via MetaCore : score, notes manquées, bad cuts, bombs, combo, temps

L’architecture conserve :
- Transmission locale Wi-Fi faible latence
- Protocole JSON structuré
- Pas de modification de la vue première personne

## Architecture proposée

A. Mod Quest – capteurs
- Récupérer les transformations du Headset et des deux contrôleurs via les API Unity/OVR
  `OVRManager.instance.trackingOriginType` + composants `Transform` des objets `LeftHand`/`RightHand`/`Main Camera`
- Récupérer le jeu en cours : `StandardLevelGameplayManager`, `BeatmapObjectManager`
- Lire la liste des notes en cours / passées via `BeatmapObjects` et `NoteController`
- Émettre à 60 Hz un snapshot compact JSON.

B. Transmission
- Réutiliser le canal heartbeat local `127.0.0.1:18745` pour le flux de replay, ou ouvrir un WebSocket local
- Protocole binaire/JSON léger, avec numéro de séquence et horodatage audio `AudioTimeSyncController.songTime`
- Gestion reconnexion automatique

C. Moteur de rendu externe
- Page navigateur Three.js sans Unity
- Reconstitution du joueur : capsule + deux sabres avec matériel PBR
- Reconstitution des blocs/obstacles à partir des métadonnées de beatmap
- Caméras : troisième personne, libre, latérale, frontale avec zoom

## Contraintes respectées
- Pas d’Unity installé
- Pas de remplacement inutile des technologies existantes
- Compatibilité Meta Quest 3
- Vue première personne inchangée
- Pas de fabrication de données non accessibles

## Étapes
1. Positions casque + contrôleurs
2. Transmission au moteur 3D
3. Affichage joueur 3D + sabres
4. Reconstitution blocs/obstacles
5. Caméras troisième personne
6. Intégration et tests perf
