/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
/* ===========================================
   BIM CHECKER - VIEWER LINK (přijímací strana)
   Přijímá akce z classic stránek (validator, Multi-File viewer) a promítne
   je do 3D vieweru: zajistí soubory (načtení ze storage když je třeba),
   rozliší GUIDy na expressId a zvýrazní / zaostří prvky.

   Odesílatel je CLASSIC skript:
     assets/js/common/viewer-link.js  (T2)
   Konstanty CHANNEL / WINDOW_NAME / KEY_PREFIX MUSÍ zůstat synchronizované
   s odesílatelem — hodnoty jsou totožné.

   Dvě cesty doručení (viz spec §B / §C1):
     1) živý kanál — okno vieweru už běží: na BroadcastChannel akci
        OKAMŽITĚ odpovíme ack (odesílatel čeká jen 400 ms), pak akci provedeme.
     2) boot handoff — okno se právě otevřelo s ?handoff=<key>: payload
        přečteme ze sessionStorage a rovnou provedeme.
   =========================================== */

// Sdílené konstanty — musí být totožné s viewer-link.js (T2).
const CHANNEL = 'bim-3d-viewer-link';           // BroadcastChannel jméno
const WINDOW_NAME = 'bim-3d-viewer';            // jméno okna 3D vieweru
const HANDOFF_PARAM = 'handoff';                // URL parametr s klíčem handoffu

// Barvy validace (spec §C1.4): prošlé zeleně, neprošlé červeně.
const COLOR_PASS = '#22c55e';
const COLOR_FAIL = '#ef4444';
const DIM_ALPHA = 0.15;                          // ztlumení nevalidovaných prvků
const DIM_GUARD = 60000;                         // nad tento počet ztlumení přeskočíme

// Stav aktuálně zobrazené validace — jen jedna může být aktivní naráz.
// Drží chip (DOM overlay) a přesný seznam ztlumených prvků, aby úklid uměl
// vrátit opacity právě těm prvkům, které ztlumil (žádné jiné).
let activeValidation = null; // { chip: HTMLElement|null, dimmed: Array<{modelId, expressId}> }

/**
 * Inicializuje přijímací stranu viewer-linku.
 *
 * Pozn. k signatuře: engine se předává jako `getEngine` (async accessor), ne
 * jako hotová instance. Důvod — 3D engine se v této stránce vytváří LÍNĚ až
 * při první potřebě (viz hlavička viewer-page.js: lazy init chrání UI před
 * chybou importu). Přijímač tak engine zhmotní až když opravdu přijde akce,
 * takže samotné otevření stránky bez handoffu render-loop nespustí.
 *
 * @param {Object} deps
 * @param {Function} deps.getEngine         — () => Promise<IfcEngine> (idempotentní, cached)
 * @param {Function} deps.loadFileByMeta    — (fileMeta) => Promise<modelId> (= loadIfcFromStorage)
 * @param {Function} deps.getLoadedModels   — () => Map<modelId, {name, fileId}>
 * @param {Function} [deps.setStatus]       — (text, kind?) => void; status pill vieweru
 */
export function initViewerLink({ getEngine, loadFileByMeta, getLoadedModels, setStatus }) {
    if (typeof getEngine !== 'function') {
        console.warn('[viewer-link-receiver] chybí getEngine — přijímací strana nespuštěna');
        return;
    }
    const status = (typeof setStatus === 'function') ? setStatus : () => {};

    // Pojmenuj okno, aby ho odesílatel uměl refokusovat (window.open('', name)).
    // Přepíšeme jen prázdné jméno — respektujeme případné existující target.
    try {
        if (!window.name) window.name = WINDOW_NAME;
    } catch {
        /* window.name nedostupné — refokus okna nebude fungovat, ale akce ano */
    }

    // Serializace akcí — druhá akce počká na dokončení první, aby se nepřekrývalo
    // načítání souborů dvou paralelních payloadů. Engine si vyzvedneme až tady
    // (uvnitř fronty), takže lazy init proběhne až s první reálnou akcí.
    let queue = Promise.resolve();
    const runActionQueued = (payload) => {
        queue = queue.then(async () => {
            const engine = await getEngine();
            return runAction(payload, { engine, loadFileByMeta, getLoadedModels, status });
        }).catch((err) => {
            console.error('[viewer-link-receiver] runAction selhal:', err);
            status('✗ Akce z tabulky/validátoru selhala', 'error');
        });
        return queue;
    };

    // --- Živý kanál ---
    try {
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (ev) => {
            const msg = ev && ev.data;
            if (!msg || msg.type !== 'action') return;
            // ack MUSÍ odejít dřív než jakákoli async práce — odesílatel čeká
            // jen 400 ms; id se vrací verbatim (= klíč handoffu).
            try {
                channel.postMessage({ type: 'ack', id: msg.id });
            } catch (e) {
                console.warn('[viewer-link-receiver] ack se nepodařilo odeslat:', e);
            }
            runActionQueued(msg.payload);
        };
    } catch (e) {
        console.warn('[viewer-link-receiver] BroadcastChannel nedostupný:', e);
    }

    // --- Boot handoff ---
    // Payload přečteme hned (jednorázový klíč ze sessionStorage), akci ale
    // provedeme přes frontu — engine se zhmotní až uvnitř runActionQueued.
    const bootPayload = readBootPayload();
    if (bootPayload) runActionQueued(bootPayload);
}

/**
 * Přečte boot payload z ?handoff=<key> → sessionStorage a klíč zase odstraní
 * (jednorázový handoff). Vrací null, když parametr chybí, klíč není ve
 * storage, nebo je JSON poškozený.
 */
function readBootPayload() {
    let key = null;
    try {
        key = new URLSearchParams(window.location.search).get(HANDOFF_PARAM);
    } catch {
        return null;
    }
    if (!key) return null;
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        sessionStorage.removeItem(key);
        return JSON.parse(raw);
    } catch (e) {
        console.warn('[viewer-link-receiver] neplatný boot payload:', e);
        return null;
    }
}

/**
 * Provede jednu akci: zajistí soubory, rozliší GUIDy a promítne je do vieweru.
 * Neznámý version/mode → warn + status, nikdy nehází výjimku ven.
 */
async function runAction(payload, ctx) {
    if (!payload || typeof payload !== 'object') return;
    const { status } = ctx;

    if (payload.version !== 1) {
        console.warn('[viewer-link-receiver] neznámá verze payloadu:', payload.version);
        status('⚠ Neznámá verze akce z tabulky/validátoru', 'error');
        return;
    }

    // Zajistit soubory (načíst chybějící ze storage) → mapa fileId/fileName → modelId.
    const modelsByFile = await ensureFiles(payload.files || [], ctx);

    if (payload.mode === 'element') {
        await applyElementMode(payload, modelsByFile, ctx);
        return;
    }

    if (payload.mode === 'validation') {
        await applyValidationMode(payload, modelsByFile, ctx);
        return;
    }

    console.warn('[viewer-link-receiver] neznámý mód akce:', payload.mode);
    status('⚠ Neznámý typ akce z tabulky/validátoru', 'error');
}

/** Normalizuje id na string; null/undefined/'' vrací jako '' (= chybí). */
function normId(v) {
    if (v === null || v === undefined) return '';
    return String(v);
}

/**
 * Zajistí, že všechny soubory z payloadu jsou načtené ve vieweru.
 * Pro každý `files[]` záznam:
 *   - už načtený → převezmi modelId z getLoadedModels (match fileId, pak jméno),
 *   - nenačtený → najdi ve storage (BIMStorage.getFiles) a načti,
 *   - nenalezený → status „Soubor X není ve storage" a pokračuj.
 *
 * @returns {Promise<{byFileId: Map, byName: Map}>} lookupy fileId/fileName → modelId
 */
async function ensureFiles(files, ctx) {
    const { loadFileByMeta, getLoadedModels, status } = ctx;
    const byFileId = new Map();
    const byName = new Map();

    const indexLoaded = () => {
        byFileId.clear();
        byName.clear();
        const loaded = getLoadedModels() || new Map();
        for (const [modelId, info] of loaded) {
            if (info && normId(info.fileId)) byFileId.set(normId(info.fileId), modelId);
            if (info && info.name) byName.set(info.name, modelId);
        }
    };
    indexLoaded();

    // Storage inicializujeme líně — jen když je opravdu potřeba něco dohledat.
    // Vzor převzat z assets/js/ifc/viewer-handoff.js (BIMStorage je window global).
    let storageFiles = null;
    const getStorageFiles = async () => {
        if (storageFiles) return storageFiles;
        if (!window.BIMStorage) {
            console.warn('[viewer-link-receiver] BIMStorage není dostupné');
            storageFiles = [];
            return storageFiles;
        }
        await window.BIMStorageBackendRestore?.ready;
        await window.BIMStorage.init?.();
        storageFiles = await window.BIMStorage.getFiles('ifc');
        return storageFiles;
    };

    for (const file of files) {
        if (!file) continue;
        const fileId = normId(file.fileId);
        const fileName = file.fileName || file.name || '';

        // Už načtený? (fileId přednostně, pak jméno)
        if (fileId && byFileId.has(fileId)) continue;
        if (fileName && byName.has(fileName)) continue;

        // Dohledat ve storage.
        let meta = null;
        try {
            const list = await getStorageFiles();
            meta = (fileId ? list.find(f => normId(f.id) === fileId) : null)
                || (fileName ? list.find(f => f.name === fileName) : null)
                || null;
        } catch (e) {
            console.warn('[viewer-link-receiver] čtení storage selhalo:', e);
        }

        if (!meta) {
            console.warn('[viewer-link-receiver] soubor není ve storage:', fileName || fileId);
            status(`Soubor ${fileName || fileId} není ve storage`, 'error');
            continue;
        }

        try {
            await loadFileByMeta(meta);
        } catch (e) {
            console.warn('[viewer-link-receiver] načtení souboru selhalo:', fileName || fileId, e);
            status(`Soubor ${meta.name || fileName} se nepodařilo načíst`, 'error');
        }
    }

    // Přeindexovat — načtení výše přidalo nové modely do getLoadedModels.
    indexLoaded();
    return { byFileId, byName };
}

/** Najde modelId pro záznam elementu podle fileId (přednostně) nebo jména. */
function modelIdForElement(el, modelsByFile) {
    const fileId = normId(el.fileId);
    if (fileId && modelsByFile.byFileId.has(fileId)) return modelsByFile.byFileId.get(fileId);
    if (el.fileName && modelsByFile.byName.has(el.fileName)) return modelsByFile.byName.get(el.fileName);
    return null;
}

/**
 * mode element: rozliší GUIDy per model, vybere prvky a zaostří.
 * Jeden prvek → focus na něj; více prvků → select všech + focus na první.
 */
async function applyElementMode(payload, modelsByFile, ctx) {
    const { engine, status } = ctx;

    // Normalizace: buď jeden `element`, nebo pole `elements`.
    const elements = Array.isArray(payload.elements)
        ? payload.elements
        : (payload.element ? [payload.element] : []);

    // Seskup GUIDy podle modelu (podle fileId/jména), ať resolveGuids voláme
    // jednou per model.
    const guidsByModel = new Map();
    for (const el of elements) {
        if (!el || !el.guid) continue;
        const modelId = modelIdForElement(el, modelsByFile);
        if (!modelId) {
            console.warn('[viewer-link-receiver] pro prvek nenalezen model:', el.fileName || el.fileId);
            continue;
        }
        if (!guidsByModel.has(modelId)) guidsByModel.set(modelId, []);
        guidsByModel.get(modelId).push(String(el.guid));
    }

    // Rozliš GUIDy → expressId a poskládej výběr {modelId, expressId}.
    const items = [];
    for (const [modelId, guids] of guidsByModel) {
        let resolved = new Map();
        try {
            resolved = engine.resolveGuids(modelId, guids) || new Map();
        } catch (e) {
            console.warn('[viewer-link-receiver] resolveGuids selhal:', e);
        }
        for (const expressId of resolved.values()) {
            items.push({ modelId, expressId });
        }
    }

    if (items.length === 0) {
        status('Prvek z tabulky se v modelu nenašel', 'error');
        return;
    }

    engine.selectEntities(items, 'replace');
    // Jeden prvek → zaostři na něj; více → zaostři na první (fit-to-selection
    // API zatím není, focus prvního je konzistentní s entity-bar chováním).
    const first = items[0];
    try {
        engine.focusEntity(first.modelId, first.expressId);
    } catch (e) {
        console.warn('[viewer-link-receiver] focusEntity selhal:', e);
    }

    const fromValidator = payload.source === 'validator';
    status(fromValidator ? 'Prvek zvýrazněn z validátoru' : 'Prvek zvýrazněn z tabulky', 'success');
}

/**
 * mode validation: obarví prošlé zeleně / neprošlé červeně, ztlumí ostatní a
 * ukáže plovoucí legendu (chip) nad canvasem s tlačítkem Zrušit.
 *
 * Postup (spec §C1.4 + §C2):
 *   1) úklid případné předchozí validace (chip + highlighty + opacity),
 *   2) seskupení GUIDů per model + resolveGuids → expressId,
 *   3) clearHighlights → highlight(items) s barvami pass/fail,
 *   4) ztlumení ostatních prvků zapojených modelů (search minus validovaní),
 *      s výkonnostní pojistkou DIM_GUARD,
 *   5) chip s počty ROZLIŠENÝCH prvků + „(K nenalezeno)" + status pill.
 */
async function applyValidationMode(payload, modelsByFile, ctx) {
    const { engine, status } = ctx;
    const validation = payload.validation || {};
    const rawItems = Array.isArray(validation.items) ? validation.items : [];

    // 1) Úklid předchozí validace — highlighty, opacity i chip. Idempotentní.
    clearValidationDisplay(engine);

    // 2) Seskup GUIDy per model (jeden resolveGuids na model), zapamatuj status.
    // guidStatusByModel: modelId → Map<guid, 'pass'|'fail'> (poslední status vyhrává;
    // fail má přednost, aby prvek failnutý v ≥1 spec zůstal červený).
    const guidStatusByModel = new Map();
    for (const it of rawItems) {
        if (!it || !it.guid) continue;
        const st = it.status === 'fail' ? 'fail' : (it.status === 'pass' ? 'pass' : null);
        if (!st) continue; // jen pass/fail, ostatní statusy ignoruj
        const modelId = modelIdForElement(it, modelsByFile);
        if (!modelId) {
            console.warn('[viewer-link-receiver] pro validovaný prvek nenalezen model:', it.fileName || it.fileId);
            continue;
        }
        if (!guidStatusByModel.has(modelId)) guidStatusByModel.set(modelId, new Map());
        const perModel = guidStatusByModel.get(modelId);
        const guid = String(it.guid);
        // fail přebíjí pass; pass nenahradí už zapsaný fail.
        if (st === 'fail' || !perModel.has(guid)) perModel.set(guid, st);
    }

    // 3) Rozliš GUIDy → expressId, poskládej highlight položky a validovanou množinu.
    const highlightItems = [];              // {modelId, expressId, color}
    const validatedByModel = new Map();     // modelId → Set<expressId> (pass i fail)
    let passCount = 0, failCount = 0, notFoundCount = 0;

    for (const [modelId, perModel] of guidStatusByModel) {
        let resolved = new Map();
        try {
            resolved = engine.resolveGuids(modelId, [...perModel.keys()]) || new Map();
        } catch (e) {
            console.warn('[viewer-link-receiver] resolveGuids (validace) selhal:', e);
        }
        const set = new Set();
        for (const [guid, st] of perModel) {
            const expressId = resolved.get(guid);
            if (expressId === undefined) { notFoundCount++; continue; }
            set.add(expressId);
            highlightItems.push({ modelId, expressId, color: st === 'fail' ? COLOR_FAIL : COLOR_PASS });
            if (st === 'fail') failCount++; else passCount++;
        }
        validatedByModel.set(modelId, set);
    }

    if (highlightItems.length === 0) {
        status('Validované prvky se v modelu nenašly', 'error');
        return;
    }

    // 4) Obarvení. clearHighlights kvůli jistotě (předchozí úklid už proběhl).
    try {
        engine.clearHighlights?.();
        engine.highlight(highlightItems);
    } catch (e) {
        console.warn('[viewer-link-receiver] highlight (validace) selhal:', e);
    }

    // 5) Ztlumení ostatních prvků zapojených modelů (všechny entity minus validované).
    // Escape hatch: engine nemá setEntityOpacity → degraduj (jen obarvení, bez ztlumení).
    let dimSkipped = false;
    const dimmed = [];
    if (typeof engine.setEntityOpacity === 'function') {
        const others = [];
        for (const modelId of validatedByModel.keys()) {
            const set = validatedByModel.get(modelId);
            let hits = [];
            try {
                // Vysoký limit — search() má default limit 5000; pro ztlumení
                // potřebujeme VŠECHNY prvky modelu, jinak by část zůstala nesehnaná.
                hits = engine.search({ modelId, limit: 1e9 }) || [];
            } catch (e) {
                console.warn('[viewer-link-receiver] search (ztlumení) selhal:', e);
            }
            for (const h of hits) {
                if (set.has(h.expressId)) continue; // nevaliduj přes validované (pass i fail)
                others.push({ modelId, expressId: h.expressId });
            }
        }
        if (others.length > DIM_GUARD) {
            dimSkipped = true; // pojistka pro velké modely — obarvíme, neztlumíme
        } else if (others.length > 0) {
            try {
                engine.setEntityOpacity(others, DIM_ALPHA);
                dimmed.push(...others);
            } catch (e) {
                console.warn('[viewer-link-receiver] setEntityOpacity (ztlumení) selhal:', e);
            }
        }
    }

    // 6) Legenda (chip) + status pill. Počty = ROZLIŠENÉ prvky.
    activeValidation = { chip: null, dimmed };
    activeValidation.chip = buildValidationChip({
        title: validation.title || '',
        passCount, failCount, notFoundCount, dimSkipped,
        onCancel: () => clearValidationDisplay(engine),
    });

    status(`Validace: ${passCount} ✓ / ${failCount} ✗`, 'success');
}

/**
 * Úklid zobrazené validace: odstraní chip, zruší highlighty a vrátí opacity
 * PRÁVĚ těm prvkům, které jsme ztlumili (uložený seznam). Idempotentní —
 * volání bez aktivní validace je no-op.
 */
function clearValidationDisplay(engine) {
    if (activeValidation) {
        if (activeValidation.chip) {
            try { activeValidation.chip.remove(); } catch { /* chip už mohl zmizet */ }
        }
        if (activeValidation.dimmed && activeValidation.dimmed.length
            && typeof engine?.setEntityOpacity === 'function') {
            try { engine.setEntityOpacity(activeValidation.dimmed, 1); } catch (e) {
                console.warn('[viewer-link-receiver] obnova opacity selhala:', e);
            }
        }
        activeValidation = null;
        try { engine?.clearHighlights?.(); } catch (e) {
            console.warn('[viewer-link-receiver] clearHighlights (úklid) selhal:', e);
        }
    }
}

/**
 * Postaví plovoucí legendu (chip) nad canvasem. Dynamické texty přes textContent
 * (title z payloadu je nedůvěryhodný → žádné innerHTML). Vrací DOM element, nebo
 * null když canvas host není v DOM (chip se pak neukáže, ale validace platí).
 */
function buildValidationChip({ title, passCount, failCount, notFoundCount, dimSkipped, onCancel }) {
    const host = document.querySelector('.v3d-canvas-host');
    if (!host) {
        console.warn('[viewer-link-receiver] canvas host nenalezen — legenda se nezobrazí');
        return null;
    }

    const chip = document.createElement('div');
    chip.className = 'v3d-validation-chip';

    if (title) {
        const titleEl = document.createElement('span');
        titleEl.className = 'v3d-validation-chip__title';
        titleEl.textContent = title;
        chip.appendChild(titleEl);
    }

    const counts = document.createElement('span');
    counts.className = 'v3d-validation-chip__counts';
    let text = `Validace: ${passCount} ✓ · ${failCount} ✗`;
    if (notFoundCount > 0) text += ` (${notFoundCount} nenalezeno)`;
    if (dimSkipped) text += ' (ztlumení vynecháno — velký model)';
    counts.textContent = text;
    chip.appendChild(counts);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'v3d-validation-chip__close';
    btn.textContent = '✕ Zrušit';
    btn.addEventListener('click', () => { onCancel?.(); });
    chip.appendChild(btn);

    host.appendChild(chip);
    return chip;
}
