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
        // Validation mód přichází v T4 — zatím jen upozornění, žádná akce.
        console.warn('[viewer-link-receiver] validation mód zatím není implementován (T4)');
        status('⚠ Zobrazení validace v 3D bude brzy dostupné', 'info');
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
