# Plan d’implémentation Beat Saber Live Replay

## Phase 0 – Validation données accessibles
- Vérifier via `StandardLevelGameplayManager` et `GameplayCoreSceneSetup` l’accès aux transforms du headset et des contrôleurs
- Confirmer que `AudioTimeSyncController.songTime` est disponible en jeu
- Vérifier que `BeatmapObjectManager` expose les notes/obstacles à venir

## Phase 1 – Récupération pose
- Hook `Update` du gameplay, lire `OVRManager` tracking et `Transform` des mains
- Construire `Replay::Pose` avec horodatage `songTime`
- Émission JSON via `WebUtils::PostAsync` vers `http://<PC>:8081/replay/pose`

## Phase 2 – Transmission
- Ajouter un WebSocket serveur léger sur le PC `ws://:8081/replay`
- Réutiliser le mécanisme heartbeat `127.0.0.1:18745` si nécessaire pour l’authentification
- Implémenter buffer de réémission et gestion pertes

## Phase 3 – Rendu 3D
- Viewer Three.js `viewer_index.html`
- Rig joueur : capsule + tête + deux sabres
- Interpolation Catmull-Rom pour lisser les poses

## Phase 4 – Objets
- Envoyer `objects` à 10 Hz
- Instancier meshes cubes/walls avec couleur selon type
- Synchroniser disparition après `songTime`

## Phase 5 – Caméras
- Modes troisième personne, libre, latérale, frontale
- Contrôles souris, zoom, hauteur

## Phase 6 – Intégration
- Ajouter option dans UI mod `Replay Live` on/off
- Tests performance sur Quest 3
- Documentation installation
