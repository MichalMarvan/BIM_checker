# Externí IFC corpus

Tato složka je vstupním bodem pro výkonové a kompatibilitní zkoušky skutečných
IFC exportů. Samotné modely nejsou součástí repozitáře, protože jejich licence,
důvěrnost a velikost se liší podle zdroje.

Pro release kontrolu použijte pouze modely, které smíte zpracovat a jejichž
původ je zaznamenaný. Doporučené pokrytí:

- IFC2X3, IFC4 a IFC4X3;
- architektura, konstrukce, TZB a infrastruktura;
- alespoň dva různé autorovací/exportní nástroje na schéma;
- malé, střední a velké soubory;
- pokročilé reprezentace uvedené v `docs/3D_GEOMETRY_SUPPORT.md`.

Soubory lze předat výkonovému testu přímo:

```bash
npm run test:performance -- tests/fixtures/ifc-corpus/model-a.ifc tests/fixtures/ifc-corpus/model-b.ifc
```

Pro každý model evidujte mimo repozitář název, SHA-256, velikost, schéma,
exportér, licenci/oprávnění a očekávaná omezení. Výsledek testu vznikne v
`test-results/performance-ifc.json`. Úspěch na tomto corpus není formální
certifikace IFC implementace.
