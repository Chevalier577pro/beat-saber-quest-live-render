# Protocole Replay Live

## Principes
- JSON léger, horodaté avec `songTime` de `AudioTimeSyncController`
- Séquence monotone `seq`
- Fréquence cible 60 Hz pour pose, 10 Hz pour objets

## Messages

### Snapshot pose
```json
{
  "t": "pose",
  "seq": 1234,
  "songTime": 12.345,
  "head": { "p": [x,y,z], "q": [x,y,z,w] },
  "left": { "p": [x,y,z], "q": [x,y,z,w] },
  "right": { "p": [x,y,z], "q": [x,y,z,w] },
  "saberColors": { "left": "#00ffff", "right": "#ff00ff" }
}
```

### Objets beatmap
```json
{
  "t": "objects",
  "seq": 567,
  "songTime": 12.345,
  "objects": [
    { "id": "note-1", "type": "note", "cutDirection": 1, "lineIndex": 0, "lineLayer": 1, "time": 12.500, "pos": [x,y,z], "color": 0 },
    { "id": "obstacle-2", "type": "wall", "time": 12.400, "duration": 2.0, "width": 1, "height": 2, "pos": [x,y,z] }
  ]
}
```

### Métadonnées partie
```json
{
  "t": "meta",
  "songTime": 12.345,
  "beatmap": { "title": "...", "author": "...", "difficulty": "Expert+" },
  "player": { "score": 12345, "combo": 42 }
}
```

## Transport
- WebSocket `ws://<quest-local-ip>:8081/replay` depuis le mod vers le PC
- Fallback HTTP POST `http://<pc>:18745/replay` si WebSocket indisponible
- Authentification via `STREAM_KEY` existant
