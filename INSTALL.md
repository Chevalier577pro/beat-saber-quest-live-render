# Installation Beat Saber Live Replay

## Prérequis
- Beat Saber Quest avec ModsBeforeFriday et le mod `DiscordRichPresence`
- PC sur le même réseau Wi-Fi
- Node.js 18+

## 1. Serveur local
```bash
cd c:\Users\Alexandre\Documents\DRP\ReplayLive\server
npm install ws
node server.js
```
Le serveur écoute sur `http://0.0.0.0:8081` et WebSocket `ws://<pc>:8081/replay`.

## 2. Viewer
Ouvrir `ReplayLive\viewer_advanced.html` dans un navigateur. Cliquer Démarrer.

## 3. Mod Quest
- Activer `Replay Live Enabled` dans les réglages du mod
- Le mod envoie les poses via POST `http://<PC>:8081/replay/pose`
- Les données sont diffusées en temps réel au viewer

## 4. Tests
- Vérifier connexion WebSocket dans la console navigateur
- Vérifier logs serveur pour réception POST
- Vérifier que la caméra et les sabres bougent

## Notes
- La vue première personne du jeu n’est pas modifiée
- Pas d’Unity requis
- Architecture réutilise le dispatcher HTTP existant du mod
