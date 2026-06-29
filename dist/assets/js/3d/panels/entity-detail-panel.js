// Full properties of the currently selected entity (or first of N).
// Layout: card-style sections — Identity / Atributy / per-PSet (collapsible).

export default class EntityDetailPanel {
  constructor({ engine, host, titleEl, ctx }) {
    this.engine = engine;
    this.host = host;
    this.titleEl = titleEl;
    this.ctx = ctx || {};
    this._handler = null;
    // Remember collapsed PSet names so re-render keeps user's toggles.
    this._collapsed = new Set();
  }

  mount() {
    this._render();
    this._handler = () => this._render();
    this.engine.on?.('selectionChanged', this._handler);
  }

  _render() {
    const sel = this.engine.getSelectedEntities?.() || this.ctx.selection || [];
    if (sel.length === 0) {
      this.titleEl.textContent = 'Detail prvku';
      this.host.innerHTML = `
        <div class="v3d-panel__empty">
          <div class="v3d-panel__empty-icon">👆</div>
          <p>Žádný vybraný prvek.<br>Klikněte na prvek ve scéně.</p>
        </div>`;
      return;
    }
    const first = sel[0];
    const meta = this.engine.getEntityMeta?.(first.modelId, first.expressId) || {};
    const props = this.engine.getProperties?.(first.modelId, first.expressId);
    const related = this.engine.getRelatedData?.(first.modelId, first.expressId) || {};
    const quantities = this.engine.getQuantities?.(first.modelId, first.expressId) || { ifc: [] };
    this.titleEl.textContent = sel.length > 1 ? `Detail (${sel.length})` : 'Detail prvku';

    const ifcType = meta.ifcType || props?.category || '?';
    const name = meta.name || props?.name || '—';
    const guid = meta.guid || props?.guid || '';
    const modelName = this._modelName(first.modelId);

    const blocks = [];

    // Engine without property support → degrade with a warn note.
    if (typeof this.engine.getProperties !== 'function') {
      blocks.push('<div class="v3d-panel__msg v3d-panel__msg--warn">Engine neposkytuje vlastnosti prvků — zobrazuje se jen identita.</div>');
    }

    // ── Identity ─────────────────────────────────────────────────────────
    blocks.push(`
      <section class="v3d-ent-card">
        <header class="v3d-ent-card__head">
          <span class="v3d-ent-card__icon" aria-hidden="true">⌖</span>
          <span class="v3d-ent-card__title">${escapeHtml(ifcType)}</span>
        </header>
        <div class="v3d-ent-card__body">
          ${row('Jméno', name)}
          ${row('IFC soubor', modelName || first.modelId, { full: true })}
          ${row('Express ID', String(first.expressId), { code: true })}
          ${guid ? row('GUID', guid, { code: true, full: true }) : ''}
          ${modelName ? row('Model ID', first.modelId, { code: true, mute: true }) : ''}
        </div>
      </section>
    `);

    // ── Atributy (entity-level, excluding values already shown in Identity) ─
    const identityAttrs = new Set(['Name', 'GlobalId']);
    const attrs = (props?.attributes || []).filter(a => !identityAttrs.has(a.name) && a.value !== null && a.value !== undefined);
    if (attrs.length > 0) {
      blocks.push(`
        <section class="v3d-ent-card">
          <header class="v3d-ent-card__head">
            <span class="v3d-ent-card__icon" aria-hidden="true">≡</span>
            <span class="v3d-ent-card__title">Atributy</span>
            <span class="v3d-ent-card__count">${attrs.length}</span>
          </header>
          <div class="v3d-ent-card__body">
            ${attrs.map(a => row(a.name, formatValue(a.value))).join('')}
          </div>
        </section>
      `);
    }

    // ── IFC quantities (QTO/BaseQuantities) ──────────────────────────────
    const ifcQuantities = quantities.ifc || [];
    if (ifcQuantities.length > 0) {
      blocks.push(`
        <section class="v3d-ent-card">
          <header class="v3d-ent-card__head">
            <span class="v3d-ent-card__icon" aria-hidden="true">∑</span>
            <span class="v3d-ent-card__title">QTO / množství</span>
            <span class="v3d-ent-card__count">${ifcQuantities.length}</span>
          </header>
          <div class="v3d-ent-card__body">
            ${ifcQuantities.map(q => row(q.name, formatQuantity(q))).join('')}
          </div>
        </section>
      `);
    }

    // ── Materials ────────────────────────────────────────────────────────
    const materials = related.materials || [];
    if (materials.length > 0) {
      const rowsHtml = materials.flatMap(materialRows).join('');
      blocks.push(`
        <section class="v3d-ent-card">
          <header class="v3d-ent-card__head">
            <span class="v3d-ent-card__icon" aria-hidden="true">◩</span>
            <span class="v3d-ent-card__title">Materiály</span>
            <span class="v3d-ent-card__count">${materials.length}</span>
          </header>
          <div class="v3d-ent-card__body">${rowsHtml}</div>
        </section>
      `);
    }

    // ── Classifications ─────────────────────────────────────────────────
    const classifications = related.classifications || [];
    if (classifications.length > 0) {
      blocks.push(`
        <section class="v3d-ent-card">
          <header class="v3d-ent-card__head">
            <span class="v3d-ent-card__icon" aria-hidden="true">⌗</span>
            <span class="v3d-ent-card__title">Klasifikace</span>
            <span class="v3d-ent-card__count">${classifications.length}</span>
          </header>
          <div class="v3d-ent-card__body">
            ${classifications.map(c => row(c.system || 'Klasifikace', formatClassification(c), { full: true })).join('')}
          </div>
        </section>
      `);
    }

    // ── Per-PSet (collapsible) ───────────────────────────────────────────
    for (const ps of (props?.propertySets || [])) {
      const collapsed = this._collapsed.has(ps.name);
      const rowsHtml = (ps.properties || []).length === 0
        ? '<p class="v3d-ent-card__empty">Prázdný PSet</p>'
        : ps.properties.map(p => row(p.name, formatValue(p.value))).join('');
      blocks.push(`
        <section class="v3d-ent-card v3d-ent-card--collapsible ${collapsed ? 'is-collapsed' : ''}" data-pset="${escapeAttr(ps.name)}">
          <header class="v3d-ent-card__head v3d-ent-card__head--clickable" data-toggle>
            <svg class="v3d-ent-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="v3d-ent-card__title">${escapeHtml(ps.name)}</span>
            <span class="v3d-ent-card__count">${ps.properties?.length || 0}</span>
          </header>
          <div class="v3d-ent-card__body">${rowsHtml}</div>
        </section>
      `);
    }

    // ── Type-level PSet data (read-only) ─────────────────────────────────
    for (const ps of (related.typePropertySets || [])) {
      const collapseKey = `type:${ps.typeId}:${ps.name}`;
      const collapsed = this._collapsed.has(collapseKey);
      const rowsHtml = (ps.properties || []).length === 0
        ? '<p class="v3d-ent-card__empty">Prázdný typový PSet</p>'
        : ps.properties.map(p => row(p.name, formatValue(p.value))).join('');
      blocks.push(`
        <section class="v3d-ent-card v3d-ent-card--collapsible ${collapsed ? 'is-collapsed' : ''}" data-pset="${escapeAttr(collapseKey)}">
          <header class="v3d-ent-card__head v3d-ent-card__head--clickable" data-toggle>
            <svg class="v3d-ent-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            <span class="v3d-ent-card__title">Typ: ${escapeHtml(ps.name)}</span>
            <span class="v3d-ent-card__count">${ps.properties?.length || 0}</span>
          </header>
          <div class="v3d-ent-card__body">
            ${row('IfcType', `${ps.typeName} (#${ps.typeId})`, { full: true, mute: true })}
            ${rowsHtml}
          </div>
        </section>
      `);
    }

    if (props && (props.propertySets || []).length === 0 && (related.typePropertySets || []).length === 0) {
      blocks.push('<p class="v3d-panel__hint">Prvek nemá žádné property sety.</p>');
    }

    // ── Multi-select tail ───────────────────────────────────────────────
    if (sel.length > 1) {
      blocks.push(`
        <section class="v3d-ent-card">
          <header class="v3d-ent-card__head">
            <span class="v3d-ent-card__icon" aria-hidden="true">∷</span>
            <span class="v3d-ent-card__title">Další vybrané</span>
            <span class="v3d-ent-card__count">${sel.length - 1}</span>
          </header>
          <div class="v3d-ent-card__body v3d-ent-card__body--tight">
            ${sel.slice(1, 21).map((s, i) => `
              <div class="v3d-ent-row v3d-ent-row--clickable" data-mid="${escapeAttr(s.modelId)}" data-eid="${s.expressId}">
                <span class="v3d-ent-row__key">${escapeHtml(s.ifcType || '?')}</span>
                <span class="v3d-ent-row__val v3d-ent-row__val--code">#${s.expressId}</span>
              </div>
            `).join('')}
            ${sel.length > 21 ? `<p class="v3d-ent-card__empty">…a dalších ${sel.length - 21}</p>` : ''}
          </div>
        </section>
      `);
    }

    this.host.innerHTML = blocks.join('');

    // Wire PSet toggles
    this.host.querySelectorAll('[data-toggle]').forEach(head => {
      head.addEventListener('click', () => {
        const sec = head.closest('.v3d-ent-card');
        const psetName = sec?.dataset.pset;
        if (!psetName) return;
        const willCollapse = !sec.classList.contains('is-collapsed');
        sec.classList.toggle('is-collapsed', willCollapse);
        if (willCollapse) this._collapsed.add(psetName);
        else this._collapsed.delete(psetName);
      });
    });

    // Wire multi-select tail clicks → select that entity (single)
    this.host.querySelectorAll('[data-mid][data-eid]').forEach(r => {
      r.addEventListener('click', () => {
        this.engine.selectEntities?.([{ modelId: r.dataset.mid, expressId: parseInt(r.dataset.eid, 10) }], 'replace');
      });
    });
  }

  destroy() {
    if (this._handler) this.engine.off?.('selectionChanged', this._handler);
  }

  _modelName(modelId) {
    const models = this.engine.getModels?.() || [];
    return models.find(m => m.modelId === modelId)?.name || '';
  }
}

function row(key, value, opts = {}) {
  const cls = [
    'v3d-ent-row',
    opts.full ? 'v3d-ent-row--full' : '',
  ].filter(Boolean).join(' ');
  const valCls = [
    'v3d-ent-row__val',
    opts.code ? 'v3d-ent-row__val--code' : '',
    opts.mute ? 'v3d-ent-row__val--mute' : '',
  ].filter(Boolean).join(' ');
  return `
    <div class="${cls}">
      <span class="v3d-ent-row__key">${escapeHtml(key)}</span>
      <span class="${valCls}" title="${escapeAttr(String(value))}">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function formatQuantity(q) {
  const kind = q.kind ? ` ${q.kind}` : '';
  return `${formatValue(q.value)}${kind}`;
}

function formatClassification(c) {
  const parts = [];
  if (c.code) parts.push(c.code);
  if (c.name) parts.push(c.name);
  if (c.uri) parts.push(c.uri);
  return parts.join(' · ') || '—';
}

function materialRows(material) {
  const rows = [];
  if (material.layers && material.layers.length > 0) {
    rows.push(row(material.name || material.type, `${material.layers.length} vrstev`, { full: true }));
    for (const layer of material.layers) {
      rows.push(row(layer.name || 'Vrstva', formatMaterialPart(layer), { full: true }));
    }
    return rows;
  }
  if (material.constituents && material.constituents.length > 0) {
    rows.push(row(material.name || material.type, `${material.constituents.length} složek`, { full: true }));
    for (const part of material.constituents) {
      rows.push(row(part.name || 'Složka', formatMaterialPart(part), { full: true }));
    }
    return rows;
  }
  if (material.profiles && material.profiles.length > 0) {
    rows.push(row(material.name || material.type, `${material.profiles.length} profilů`, { full: true }));
    for (const profile of material.profiles) {
      rows.push(row(profile.name || 'Profil', formatMaterialPart(profile), { full: true }));
    }
    return rows;
  }
  rows.push(row(material.type || 'Materiál', material.name || '—', { full: true }));
  return rows;
}

function formatMaterialPart(part) {
  const parts = [];
  if (part.materialName && part.materialName !== part.name) parts.push(part.materialName);
  if (part.thickness !== null && part.thickness !== undefined) parts.push(`${part.thickness} tl.`);
  if (part.fraction !== null && part.fraction !== undefined) parts.push(`${part.fraction} podíl`);
  if (part.category) parts.push(part.category);
  return parts.join(' · ') || part.name || '—';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}
