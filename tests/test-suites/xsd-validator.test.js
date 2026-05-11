/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IDSXSDValidator', () => {
    const TIMEOUT = 10000;

    const validIDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS"
         xmlns:xs="http://www.w3.org/2001/XMLSchema"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
    <ids:info>
        <ids:title>Valid Test IDS</ids:title>
        <ids:author>test@example.com</ids:author>
        <ids:date>2026-01-01</ids:date>
    </ids:info>
    <ids:specifications>
        <ids:specification name="Wall Check" ifcVersion="IFC4">
            <ids:applicability minOccurs="0" maxOccurs="unbounded">
                <ids:entity>
                    <ids:name>
                        <ids:simpleValue>IFCWALL</ids:simpleValue>
                    </ids:name>
                </ids:entity>
            </ids:applicability>
            <ids:requirements>
                <ids:property cardinality="required" dataType="IFCTEXT">
                    <ids:propertySet>
                        <ids:simpleValue>Pset_WallCommon</ids:simpleValue>
                    </ids:propertySet>
                    <ids:baseName>
                        <ids:simpleValue>IsExternal</ids:simpleValue>
                    </ids:baseName>
                </ids:property>
            </ids:requirements>
        </ids:specification>
    </ids:specifications>
</ids:ids>`;

    const invalidIDS = `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS"
         xmlns:xs="http://www.w3.org/2001/XMLSchema"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ids:info>
        <ids:title>Invalid Test IDS</ids:title>
    </ids:info>
    <ids:specifications>
        <ids:specification fooAttr="bar" ifcVersion="IFC4">
            <ids:applicability minOccurs="0" maxOccurs="unbounded"/>
            <ids:requirements/>
        </ids:specification>
    </ids:specifications>
</ids:ids>`;

    it('should expose IDSXSDValidator global', () => {
        expect(typeof window.IDSXSDValidator).toBe('object');
        expect(typeof window.IDSXSDValidator.validate).toBe('function');
        expect(typeof window.IDSXSDValidator.init).toBe('function');
    });

    it('should report valid IDS as valid', async () => {
        const result = await IDSXSDValidator.validate(validIDS);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    }, TIMEOUT);

    it('should report invalid IDS with error details', async () => {
        const result = await IDSXSDValidator.validate(invalidIDS);
        expect(result.valid).toBe(false);
        expect(result.errors.length > 0).toBe(true);
    }, TIMEOUT);

    it('should include message in errors', async () => {
        const result = await IDSXSDValidator.validate(invalidIDS);
        expect(result.errors[0].message).toBeDefined();
        expect(typeof result.errors[0].message).toBe('string');
        expect(result.errors[0].message.length > 0).toBe(true);
    }, TIMEOUT);

    it('should include line numbers in errors when available', async () => {
        const result = await IDSXSDValidator.validate(invalidIDS);
        const withLines = result.errors.filter(e => e.line !== null);
        expect(withLines.length > 0).toBe(true);
    }, TIMEOUT);
});
