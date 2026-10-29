# Známá omezení

- IFC parser není plný obecný STEP/EXPRESS validátor. Je zaměřený na data
  potřebná pro tabulku, IDS a vlastní 3D pipeline.
- 3D geometrická podpora není totožná s datovou podporou IFC schématu. Obecné
  CSG se může zobrazit aproximovaně prvním operandem a nepodporované položky se
  reportují v diagnostice modelu.
- Velmi velké IFC soubory jsou omezené pamětí a GPU konkrétního zařízení.
  Výkonové prahy jsou budgety, nikoli garance pro každý exportér.
- File System Access API není univerzální; IndexedDB je fallback.
- Offline jádro nezahrnuje online mapové dlaždice, bSDD/EPSG, vzdálené AI ani
  první stažení volitelného embedding modelu.
- CSP stále povoluje inline skripty a styly kvůli legacy event handlerům.
- Úpravy standardních IFC PSet/property názvů mohou vytvořit model nekompatibilní
  s navazujícími nástroji; export proto vyžaduje vědomé rozhodnutí uživatele.
- buildingSMART corpus test je implementační konformance test, nikoli formální
  certifikace produktu.
- Nezávislá diferenciální validace proti druhému IDS enginu a široký veřejně
  licencovaný IFC corpus z více autorovacích nástrojů zůstávají dlouhodobou
  validační prací.
