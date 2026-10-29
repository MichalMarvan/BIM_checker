# Soukromí a síťová komunikace / Privacy and network access

Platnost: 22. července 2026

## Česky

BIM Checker zpracovává načtené IFC a IDS soubory primárně ve vašem prohlížeči. Soubory jsou uloženy buď v IndexedDB daného prohlížeče, nebo – pokud tuto možnost sami povolíte – v připojené místní složce přes File System Access API. Běžné parsování, editace, validace a export soubory automaticky neodesílají na server BIM Checkeru.

Některé volitelné funkce potřebují síť:

- bSDD hledání odesílá hledaný text a filtry do buildingSMART Data Dictionary, případně přes omezený proxy endpoint BIM Checkeru;
- kontrola nové verze se dotazuje GitHub Releases;
- hlášení chyby odešle až po vašem potvrzení zadaný popis, kroky a zobrazená technická metadata do Cloudflare Function a následně do GitHub Issues;
- podkladové mapy, vyhledání EPSG a volitelný model pro 3D sémantické hledání komunikují s uvedeným poskytovatelem (např. mapový server, epsg.io nebo Hugging Face); JavaScript knihovny těchto 3D funkcí jsou součástí aplikace;
- AI chat odesílá prompt na endpoint vybraného poskytovatele. Pokud výslovně povolíte AI nástroje, mohou být poskytovateli odeslány také jejich textové výsledky obsahující BIM data. Celé soubory se automaticky nepřikládají.

Vzdálený AI endpoint vyžaduje před prvním odesláním v každé relaci potvrzení. Vzdálení agenti nemají ve výchozím stavu povolený žádný nástroj nad lokálními daty. API klíče jsou uchovávány pouze v `sessionStorage` aktuální karty/relace a nejsou trvale ukládány do IndexedDB. Zavřením relace je nutné klíč zadat znovu.

Aplikace neobsahuje vlastní analytické ani reklamní trackery. Externí poskytovatelé však při použití jejich volitelné služby běžně obdrží síťové údaje, například IP adresu, a zpracovávají data podle svých podmínek. Pro maximálně lokální režim nepoužívejte online funkce a používejte lokální AI endpoint (např. Ollama). Jádro aplikace i JavaScript pokročilých 3D funkcí jsou součástí offline balíčku; bez sítě zůstávají nedostupná pouze online data a první stažení volitelného embedding modelu.

Data aplikace lze odstranit vymazáním dat webu v prohlížeči. Soubory v připojené místní složce spravujete přímo ve svém souborovém systému.

## English

BIM Checker processes loaded IFC and IDS files primarily in your browser. Files are stored in browser IndexedDB or, when you explicitly enable it, in a connected local folder through the File System Access API. Normal parsing, editing, validation, and export do not automatically upload files to a BIM Checker server.

Optional online features include bSDD search, GitHub release checks, user-confirmed bug reports, basemap tiles, EPSG lookup, an optional semantic-search model download, and configured AI endpoints. Advanced 3D JavaScript libraries are shipped locally. AI prompts are sent to the selected provider. Text results from explicitly enabled tools may also contain BIM data and be sent to that provider; complete files are not attached automatically.

Remote AI access requires confirmation once per browser session and remote agents have no local-data tools enabled by default. API keys are held only in the current session's `sessionStorage`, not persistently in IndexedDB. The app has no first-party advertising or analytics tracker, but optional external providers receive ordinary network information and process submitted data under their own terms.

For the most local setup, avoid optional online features and use a local AI endpoint such as Ollama. The application core and advanced 3D JavaScript are included in the offline package; online data and the first optional embedding-model download remain unavailable without a network. Site data can be removed through your browser's site-data controls; files in a connected folder remain under your filesystem control.
