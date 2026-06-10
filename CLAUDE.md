# Projekt: BIM_checker

## Účel
BIM_checker

## Mapa repozitáře
- `src/` – core aplikační logika
- `docs/` – architektura a rozhodnutí
- `.claude/skills/` – reusable workflow pro Claude Code
- `PLAN.md` – plán práce s checklistem

## Pravidla
- Před commitem spusť testy
- Drž kód čistý – žádné zakomentované bloky
- Každý commit odkazuje na plán pokud je to relevantní

## Stack
html, css, js, bim

## Příkazy
- Testy: `TODO`
- Lint: `TODO`
- Build: `TODO`

## Workflow
- Skills jsou v `.claude/skills/` – použij je pro review, refaktoring, debugging
- Plán práce je v `PLAN.md` – aktualizuj po každém milestonu
- Architektura je v `docs/architecture.md`

## Vizuální kontrola 3D vieweru (Chrome MCP)
- Pokud je k dispozici Chrome přes MCP (`mcp__chrome-devtools__*` nástroje), po **každém kole oprav**
  v 3D vieweru se na výsledek skutečně podívej: udělej screenshot přes
  `mcp__chrome-devtools__take_screenshot` a zkontroluj konzoli přes `list_console_messages`.
- Toto pravidlo platí jen když je Chrome MCP spuštěný – jinak použij `scripts/debug-3d-load.js`.
- Testovací model: `models/D.2.1.4/D214_SO112201.ifc` (symlink `models/` v rootu repa).
