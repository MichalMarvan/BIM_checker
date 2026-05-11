/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/**
 * IFCHierarchy — lazy-loaded IFC class hierarchy + PredefinedType attribute positions.
 * Data sourced from build-time JSON (assets/data/ifc-hierarchy-<version>.json).
 */
window.IFCHierarchy = (function() {
    'use strict';

    const cache = new Map();        // version → { classes, childrenIndex, subtypeCache }
    const loadPromises = new Map(); // version → Promise

    function dataUrl(version) {
        return `../assets/data/ifc-hierarchy-${version}.json`;
    }

    function buildChildrenIndex(classes) {
        const index = {};
        for (const [name, entry] of Object.entries(classes)) {
            if (entry.parent) {
                if (!index[entry.parent]) index[entry.parent] = [];
                index[entry.parent].push(name);
            }
        }
        return index;
    }

    function load(version) {
        if (cache.has(version)) return Promise.resolve();
        if (loadPromises.has(version)) return loadPromises.get(version);

        const promise = fetch(dataUrl(version))
            .then(r => {
                if (!r.ok) throw new Error(`Failed to load hierarchy for ${version}: HTTP ${r.status}`);
                return r.json();
            })
            .then(data => {
                cache.set(version, {
                    classes: data.classes,
                    childrenIndex: buildChildrenIndex(data.classes),
                    subtypeCache: new Map()
                });
            });
        loadPromises.set(version, promise);
        return promise;
    }

    function isSubtypeOf(version, child, ancestor) {
        const data = cache.get(version);
        if (!data) return false;
        let cur = child;
        const seen = new Set();
        while (cur) {
            if (cur === ancestor) return true;
            if (seen.has(cur)) return false; // cycle guard
            seen.add(cur);
            cur = data.classes[cur]?.parent;
        }
        return false;
    }

    function getSubtypes(version, cls) {
        const data = cache.get(version);
        if (!data) return [];
        if (data.subtypeCache.has(cls)) return data.subtypeCache.get(cls);
        const result = [cls];
        const queue = [cls];
        while (queue.length) {
            const cur = queue.shift();
            const children = data.childrenIndex[cur] || [];
            for (const child of children) {
                result.push(child);
                queue.push(child);
            }
        }
        data.subtypeCache.set(cls, result);
        return result;
    }

    function getPredefinedTypeIndex(version, cls) {
        const data = cache.get(version);
        if (!data) return null;
        return data.classes[cls]?.predefinedTypeIndex ?? null;
    }

    function getObjectTypeIndex(version, cls) {
        const data = cache.get(version);
        if (!data) return null;
        return data.classes[cls]?.objectTypeIndex ?? null;
    }

    return { load, isSubtypeOf, getSubtypes, getPredefinedTypeIndex, getObjectTypeIndex };
})();
