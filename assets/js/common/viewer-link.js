/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2026 Michal Marvan */
/* ===========================================
   BIM CHECKER - VIEWER LINK (odesílatel)
   Sdílený odesílatel akcí do 3D vieweru.

   Používají ho CLASSIC stránky (validator, Multi-File viewer).
   Přijímací (receiver) strana je ES modul:
     assets/js/3d/viewer-link-receiver.js  (vzniká v T3)
   Konstanty CHANNEL / WINDOW_NAME / KEY_PREFIX MUSÍ zůstat
   synchronizované s receiverem — receiver si je definuje sám
   (jako ES modul), ale hodnoty musí být totožné.
   =========================================== */

(function () {
    'use strict';

    // Sdílené konstanty — musí být totožné s viewer-link-receiver.js (T3).
    const CHANNEL = 'bim-3d-viewer-link';           // BroadcastChannel jméno
    const WINDOW_NAME = 'bim-3d-viewer';            // jméno okna 3D vieweru (window.open target)
    const KEY_PREFIX = 'bim-3d-viewer-handoff:';    // prefix sessionStorage klíčů pro handoff

    const ACK_TIMEOUT_MS = 1200;                    // dle spec §B: čekání na ack (delší kvůli pomalým/backgroundovaným tabům)

    // ---------------------------------------
    // Payload buildery (čisté funkce, bez DOM)
    // ---------------------------------------

    // Payload pro jeden konkrétní element (jeden GUID v jednom souboru).
    function buildElementPayload(opts) {
        opts = opts || {};
        const fileId = (opts.fileId === undefined) ? null : opts.fileId;
        return {
            version: 1,
            mode: 'element',
            source: opts.source,
            element: { fileName: opts.fileName, guid: opts.guid, fileId: fileId },
            files: [{ fileId: fileId, fileName: opts.fileName }]
        };
    }

    // Payload pro více elementů; seznam souborů se dedupikuje dle fileName.
    function buildElementsPayload(opts) {
        opts = opts || {};
        const items = opts.items || [];
        const elements = items.map(function (it) {
            return {
                fileName: it.fileName,
                guid: it.guid,
                fileId: (it.fileId === undefined) ? null : it.fileId
            };
        });
        return {
            version: 1,
            mode: 'element',
            source: opts.source,
            elements: elements,
            files: dedupFiles(items)
        };
    }

    // Payload z výsledků validace; ponechá jen statusy 'pass' / 'fail'.
    function buildValidationPayload(opts) {
        opts = opts || {};
        const items = (opts.items || []).filter(function (it) {
            return it.status === 'pass' || it.status === 'fail';
        });
        return {
            version: 1,
            mode: 'validation',
            source: opts.source,
            validation: {
                title: opts.title,
                items: items.map(function (it) {
                    return { fileName: it.fileName, guid: it.guid, status: it.status };
                })
            },
            files: dedupFiles(items)
        };
    }

    // Dedup seznamu souborů dle fileName (zachová první výskyt fileId).
    function dedupFiles(items) {
        const seen = Object.create(null);
        const files = [];
        (items || []).forEach(function (it) {
            if (!it || it.fileName === undefined || it.fileName === null) {
                return;
            }
            if (seen[it.fileName]) {
                return;
            }
            seen[it.fileName] = true;
            files.push({
                fileId: (it.fileId === undefined) ? null : it.fileId,
                fileName: it.fileName
            });
        });
        return files;
    }

    // Unikátní klíč pro handoff přes sessionStorage.
    function makeHandoffKey() {
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 10);
        return KEY_PREFIX + ts + ':' + rand;
    }

    // ---------------------------------------
    // send() — doručení payloadu do 3D vieweru
    // ---------------------------------------
    //
    // POZOR: window.open smí volat jen kontext s aktivní user-gesture
    // (klik). send() proto voláme z click handlerů — jinak prohlížeč
    // otevření okna zablokuje.
    //
    // Postup dle spec §B:
    //   1) pošli akci přes BroadcastChannel a čekej na ack (400 ms)
    //   2) ack přišel → viewer už běží → refokus okna → 'live'
    //   3) timeout → ulož payload do sessionStorage a otevři viewer
    //      s ?handoff=<key> → 'opened'
    // Kanál se v OBOU větvích po použití zavře.
    function send(payload) {
        return new Promise(function (resolve) {
            const id = makeHandoffKey();
            let channel = null;
            let settled = false;
            let timer = null;

            function cleanup() {
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                if (channel) {
                    try {
                        channel.close();
                    } catch {
                        /* kanál už zavřen */
                    }
                    channel = null;
                }
            }

            function onLive() {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                // Refokus běžícího okna (bez navigace).
                try {
                    window.open('', WINDOW_NAME);
                } catch {
                    /* popup blokován */
                }
                resolve('live');
            }

            function onHandoff() {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                // Použij totéž id jako u BroadcastChannel akce — klíč handoffu.
                try {
                    sessionStorage.setItem(id, JSON.stringify(payload));
                } catch {
                    /* sessionStorage nedostupný */
                }
                try {
                    window.open(buildViewerUrl(id), WINDOW_NAME);
                } catch {
                    /* popup blokován */
                }
                resolve('opened');
            }

            try {
                channel = new BroadcastChannel(CHANNEL);
                channel.onmessage = function (ev) {
                    const msg = ev && ev.data;
                    if (msg && msg.type === 'ack' && msg.id === id) {
                        onLive();
                    }
                };
                channel.postMessage({ type: 'action', id: id, payload: payload });
                timer = setTimeout(onHandoff, ACK_TIMEOUT_MS);
            } catch {
                // BroadcastChannel nedostupný → rovnou handoff.
                onHandoff();
            }
        });
    }

    // URL 3D vieweru s handoff klíčem.
    // Stránky běží v pages/ → relativní '3d-viewer.html?...' funguje.
    // Pojistka: pokud pathname neobsahuje '/pages/', prefixuj 'pages/'.
    function buildViewerUrl(key) {
        let pathname = '';
        try {
            pathname = (window.location && window.location.pathname) || '';
        } catch {
            pathname = '';
        }
        const base = (pathname.indexOf('/pages/') === -1) ? 'pages/3d-viewer.html' : '3d-viewer.html';
        return base + '?handoff=' + encodeURIComponent(key);
    }

    window.ViewerLink = {
        CHANNEL: CHANNEL,
        WINDOW_NAME: WINDOW_NAME,
        KEY_PREFIX: KEY_PREFIX,
        buildElementPayload: buildElementPayload,
        buildElementsPayload: buildElementsPayload,
        buildValidationPayload: buildValidationPayload,
        makeHandoffKey: makeHandoffKey,
        send: send
    };
})();
