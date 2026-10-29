/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
/** Versioned contract shared by the IDS Excel importer, exporter and template. */
const IDSExcelFormat = Object.freeze({
    ID: 'BIM_CHECKER_IDS_EXCEL',
    CURRENT_VERSION: 2,
    LEGACY_VERSION: 1,
    IDS_SCHEMA_VERSION: '1.0',
    FIELDS: Object.freeze({
        id: '_bim_checker_format',
        version: '_bim_checker_format_version',
        idsSchema: '_ids_schema_version'
    }),

    markerRows() {
        return [
            { Field: this.FIELDS.id, Value: this.ID },
            { Field: this.FIELDS.version, Value: this.CURRENT_VERSION },
            { Field: this.FIELDS.idsSchema, Value: this.IDS_SCHEMA_VERSION }
        ];
    },

    inspect(infoRows) {
        const values = new Map((infoRows || []).map(row => [
            String(row.Field || row.field || '').trim().toLowerCase(),
            row.Value ?? row.value ?? ''
        ]));
        const id = String(values.get(this.FIELDS.id) || '').trim();
        const rawVersion = values.get(this.FIELDS.version);
        const parsedVersion = rawVersion === undefined || rawVersion === '' ? this.LEGACY_VERSION : Number(rawVersion);
        return {
            id,
            marked: Boolean(id),
            version: Number.isInteger(parsedVersion) ? parsedVersion : null,
            idsSchemaVersion: String(values.get(this.FIELDS.idsSchema) || '').trim() || null
        };
    }
});

if (typeof window !== 'undefined') {
    window.IDSExcelFormat = IDSExcelFormat;
}

