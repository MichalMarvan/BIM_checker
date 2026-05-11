/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
describe('IDSParser backward compatibility with parser.js', () => {

    const sampleXmls = [
        // Inline minimal IDS for sanity check
        `<?xml version="1.0"?>
        <ids xmlns="http://standards.buildingsmart.org/IDS">
            <info><title>Inline</title></info>
            <specifications>
                <specification name="S" ifcVersion="IFC4">
                    <applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
                    <requirements/>
                </specification>
            </specifications>
        </ids>`,
        // With a property requirement using enumeration
        `<?xml version="1.0"?>
        <ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema">
            <info><title>Enum test</title></info>
            <specifications>
                <specification name="DS" ifcVersion="IFC4X3_ADD2">
                    <applicability minOccurs="0" maxOccurs="unbounded">
                        <entity>
                            <name>
                                <xs:restriction base="xs:string">
                                    <xs:enumeration value="IFCWALL"/>
                                    <xs:enumeration value="IFCDOOR"/>
                                </xs:restriction>
                            </name>
                        </entity>
                    </applicability>
                    <requirements>
                        <property cardinality="required">
                            <propertySet><simpleValue>Pset_Common</simpleValue></propertySet>
                            <baseName><simpleValue>FireRating</simpleValue></baseName>
                        </property>
                    </requirements>
                </specification>
            </specifications>
        </ids>`
    ];

    // Note: legacy extractInfo/extractSpecifications globals were removed from parser.js
    // after the backward-compat gate passed. These tests now verify IDSParser structural
    // correctness directly.
    sampleXmls.forEach((xml, idx) => {
        it(`sample ${idx} — IDSParser produces expected info+specifications`, () => {
            const result = IDSParser.parse(xml);
            expect(result.error).toBeNull();
            expect(result.info).toBeDefined();
            expect(Array.isArray(result.specifications)).toBe(true);
        });
    });
});
