# Podpora prohlížečů a capabilities

CI ověřuje Chromium v desktopovém a mobilním viewportu. Firefox a Safari jsou
podporované pro základní práci, ale některé capability poskytuje konkrétní
prohlížeč nebo operační systém odlišně. Aplikace proto detekuje funkce, nikoli
jen název prohlížeče.

| Funkce | Chromium (Chrome/Edge) | Firefox | Safari |
|---|---:|---:|---:|
| IFC/IDS parser, editor a validace | Ano | Ano | Ano |
| IndexedDB projektové úložiště | Ano | Ano | Ano |
| Web Workers | Ano | Ano | Ano |
| 3D WebGL viewer | Ano | Ano, podle GPU | Ano, podle GPU |
| Offline service worker/PWA | Ano | Ano, instalace se liší | Částečně podle OS |
| Připojení lokální projektové složky | Ano | Bez garantované podpory | Bez garantované podpory |
| BroadcastChannel propojení stránek | Ano | Ano | Ano v moderních verzích |
| Lokální Ollama z HTTPS webu | Závisí na CORS/mixed-content | Závisí na CORS/mixed-content | Závisí na CORS/mixed-content |

Pokud File System Access API chybí, aplikace automaticky používá IndexedDB.
Bez WebGL zůstávají dostupné tabulkové IFC nástroje a IDS validace, nikoli 3D
rendering. Bez internetu funguje precache jádra; explicitně online funkce
(bSDD, mapy, EPSG, vzdálené AI a první stažení embedding modelu) nejsou dostupné.
