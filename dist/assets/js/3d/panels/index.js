// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Michal Marvan
//
// Central registry of every floating panel. Panels are lazy-loaded so we
// don't ship 20 modules on first page hit.

import { registerPanel } from '../ui/panel-manager.js';

const PANELS = {
  // Tools that bind to interactions on the canvas — they expose a button
  // in the toolbar but don't show a side panel; they just toggle a mode.
  select:        { mode: true },
  orbit:         { mode: true },

  // Tools that open a right-hand panel
  search:        { loader: () => import('./search-panel.js') },
  measure:       { loader: () => import('./measure-panel.js') },
  clip:          { loader: () => import('./section-panel.js') },
  walk:          { loader: () => import('./walk-panel.js') },
  color:         { loader: () => import('./color-panel.js') },
  sets:          { loader: () => import('./selection-sets-panel.js') },
  schedule:      { loader: () => import('./schedule-panel.js') },
  viewpoints:    { loader: () => import('./viewpoints-panel.js') },
  pins:          { loader: () => import('./pins-panel.js') },
  issues:        { loader: () => import('./issues-panel.js') },
  screenshot:    { loader: () => import('./screenshot-panel.js') },
  pdf:           { loader: () => import('./pdf-panel.js') },
  share:         { loader: () => import('./share-panel.js') },
  clash:         { loader: () => import('./clash-panel.js') },
  alignment:     { loader: () => import('./alignment-panel.js') },
  diff:          { loader: () => import('./diff-panel.js') },
  ask:           { loader: () => import('./ask-panel.js') },
  timeline:      { loader: () => import('./timeline-panel.js') },
  'three-tiles': { loader: () => import('./three-tiles-panel.js') },
  'ids-templates': { loader: () => import('./ids-templates-panel.js') },
  display:       { loader: () => import('./display-panel.js') },
  georef:        { loader: () => import('./georef-panel.js') },
  spatial:       { loader: () => import('./spatial-panel.js') },
  'entity-detail': { loader: () => import('./entity-detail-panel.js') },
};

let registered = false;

export function ensureRegistered() {
  if (registered) return;
  registered = true;
  for (const [toolId, spec] of Object.entries(PANELS)) {
    if (spec.loader) registerPanel(toolId, spec.loader);
  }
}

export function requiresEngine(toolId) {
  return !(PANELS[toolId] && PANELS[toolId].mode === true);
}

export function knownTools() {
  return Object.keys(PANELS);
}
