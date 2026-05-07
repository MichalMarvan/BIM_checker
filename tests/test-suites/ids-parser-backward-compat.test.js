describe('IDSParser backward compatibility with parser.js', () => {

    function deepEqual(a, b) {
        return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
    }

    function normalize(obj) {
        if (Array.isArray(obj)) return obj.map(normalize);
        if (obj && typeof obj === 'object') {
            const sorted = {};
            for (const k of Object.keys(obj).sort()) {
                if (k === 'doc' || k === 'xml') continue; // skip raw refs
                sorted[k] = normalize(obj[k]);
            }
            return sorted;
        }
        return obj;
    }

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

    sampleXmls.forEach((xml, idx) => {
        it(`sample ${idx} — IDSParser output matches legacy parser.js`, () => {
            const doc = new DOMParser().parseFromString(xml, 'text/xml');

            // Legacy path: parser.js exposes extractInfo + extractSpecifications as globals
            const legacy = {
                info: typeof extractInfo === 'function' ? extractInfo(doc) : null,
                specifications: typeof extractSpecifications === 'function' ? extractSpecifications(doc) : null
            };

            // New path
            const fresh = IDSParser.parse(xml);

            const legacyShape = { info: legacy.info, specifications: legacy.specifications };
            const freshShape = { info: fresh.info, specifications: fresh.specifications };

            const same = deepEqual(legacyShape, freshShape);
            if (!same) {
                console.log('LEGACY:', JSON.stringify(normalize(legacyShape), null, 2));
                console.log('FRESH:',  JSON.stringify(normalize(freshShape), null, 2));
            }
            expect(same).toBe(true);
        });
    });
});
