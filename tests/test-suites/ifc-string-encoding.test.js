// =======================
// IFC STRING ENCODING TESTS
// Tests for decodeIFCString and parseProperty functions
// Covers Tekla Structures export formats
// =======================

// Helper: Recreate decodeIFCString for testing
function decodeIFCString(str) {
    if (!str) return str;

    // Decode \S\X format (ISO 8859-1 supplement)
    str = str.replace(/\\S\\(.)/g, (m, char) => String.fromCharCode(char.charCodeAt(0) + 128));

    // Decode \X\XX format (ISO 8859-1 single byte)
    str = str.replace(/\\X\\([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

    // Decode \X2\XXXX...XXXX\X0\ format (UTF-16)
    str = str.replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
        let result = '';
        for (let i = 0; i < hex.length; i += 4) {
            const codePoint = parseInt(hex.substr(i, 4), 16);
            result += String.fromCharCode(codePoint);
        }
        return result;
    });

    // Decode \X4\XXXXXXXX\X0\ format (UTF-32)
    str = str.replace(/\\X4\\([0-9A-F]+)\\X0\\/gi, (m, hex) => {
        let result = '';
        for (let i = 0; i < hex.length; i += 8) {
            const codePoint = parseInt(hex.substr(i, 8), 16);
            result += String.fromCodePoint(codePoint);
        }
        return result;
    });

    return str;
}

// Helper: Recreate splitParams for testing
function splitParams(params) {
    const parts = [];
    let current = '';
    let depth = 0;
    let inString = false;

    for (let i = 0; i < params.length; i++) {
        const char = params[i];
        // IFC uses '' (double single quote) for escaped quotes, not \'
        // So we only toggle string mode on single quotes that are not part of ''
        if (char === "'") {
            if (inString && params[i + 1] === "'") {
                // This is an escaped quote (''), add both and skip next
                current += char;
                current += params[i + 1];
                i++;
                continue;
            }
            inString = !inString;
        }
        if (!inString) {
            if (char === '(') depth++;
            else if (char === ')') depth--;
            else if (char === ',' && depth === 0) {
                parts.push(current.trim());
                current = '';
                continue;
            }
        }
        current += char;
    }
    if (current) parts.push(current.trim());
    return parts;
}

// Helper: Recreate parseProperty for testing
function parseProperty(params) {
    const parts = splitParams(params);
    if (parts.length < 3) return null;
    const rawName = parts[0].replace(/'/g, '');
    const name = decodeIFCString(rawName);
    let value = parts[2] || '';

    if (value === '$' || value.trim() === '') {
        return { name, value: '' };
    }

    const stringMatch = value.match(/IFC(?:LABEL|TEXT|IDENTIFIER|DESCRIPTIVEMEASURE)\s*\(\s*'([^']*)'\s*\)/i);
    if (stringMatch) {
        value = decodeIFCString(stringMatch[1]);
        return { name, value };
    }

    const booleanMatch = value.match(/IFCBOOLEAN\s*\(\s*\.(T|F)\.\s*\)/i);
    if (booleanMatch) {
        value = booleanMatch[1].toUpperCase() === 'T' ? 'TRUE' : 'FALSE';
        return { name, value };
    }

    const logicalMatch = value.match(/IFCLOGICAL\s*\(\s*\.(T|F|U)\.\s*\)/i);
    if (logicalMatch) {
        const v = logicalMatch[1].toUpperCase();
        value = v === 'T' ? 'TRUE' : v === 'F' ? 'FALSE' : 'UNKNOWN';
        return { name, value };
    }

    const numericMatch = value.match(/IFC(?:[A-Z]+)?(?:MEASURE)?\s*\(\s*([+-]?\d+\.?\d*(?:[eE][+-]?\d+)?)\s*\)/i);
    if (numericMatch) {
        value = numericMatch[1];
        return { name, value };
    }

    return { name, value };
}


// =======================
// TEST SUITES
// =======================

describe('IFC String Encoding - \\S\\ Format (ISO 8859-1)', () => {

    it('should decode \\S\\a to á (Czech character)', () => {
        const input = 'nosn\\S\\a konstrukce';
        const result = decodeIFCString(input);
        expect(result).toBe('nosná konstrukce');
    });

    it('should decode \\S\\} to ý (Czech character)', () => {
        const input = 'trval\\S\\} stav';
        const result = decodeIFCString(input);
        expect(result).toBe('trvalý stav');
    });

    it('should decode \\S\\i to é (Czech character)', () => {
        const input = 'b\\S\\iton';
        const result = decodeIFCString(input);
        expect(result).toBe('béton');
    });

    it('should decode multiple \\S\\ sequences in one string', () => {
        const input = '\\S\\a\\S\\i\\S\\o\\S\\u';
        const result = decodeIFCString(input);
        expect(result).toBe('áéïõ');
    });

    it('should handle string with no escape sequences', () => {
        const input = 'plain text';
        const result = decodeIFCString(input);
        expect(result).toBe('plain text');
    });

    it('should handle empty string', () => {
        const result = decodeIFCString('');
        expect(result).toBe('');
    });

    it('should handle null input', () => {
        const result = decodeIFCString(null);
        expect(result).toBeNull();
    });
});


describe('IFC String Encoding - \\X\\ Format (8-bit hex)', () => {

    it('should decode \\X\\C4 to Ä (German umlaut)', () => {
        const input = '\\X\\C4nderung';
        const result = decodeIFCString(input);
        expect(result).toBe('Änderung');
    });

    it('should decode \\X\\FC to ü (German umlaut)', () => {
        const input = 'T\\X\\FCr';
        const result = decodeIFCString(input);
        expect(result).toBe('Tür');
    });

    it('should decode lowercase hex', () => {
        const input = '\\X\\fc';
        const result = decodeIFCString(input);
        expect(result).toBe('ü');
    });

    it('should decode multiple \\X\\ sequences', () => {
        const input = '\\X\\C4\\X\\D6\\X\\DC';
        const result = decodeIFCString(input);
        expect(result).toBe('ÄÖÜ');
    });
});


describe('IFC String Encoding - \\X2\\ Format (UTF-16)', () => {

    it('should decode simple UTF-16 sequence (Nevyplněno)', () => {
        const input = '\\X2\\004E0065007600790070006C006E011B006E006F\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('Nevyplněno');
    });

    it('should decode UTF-16 with Czech characters (SŽ_Výška)', () => {
        const input = '\\X2\\0053017D005F005600FD0161006B0061\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('SŽ_Výška');
    });

    it('should decode long UTF-16 sequence', () => {
        const input = '\\X2\\004400300020003500310031002C00200042011B00630068006F00760069006300650020002D002000440031\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('D0 511, Běchovice - D1');
    });

    it('should decode UTF-16 with special Czech characters (styčníková deska)', () => {
        const input = '\\X2\\007300740079010D006E00ED006B006F007600E10020006400650073006B0061\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('styčníková deska');
    });

    it('should decode UTF-16 sequence with ě character', () => {
        const input = '\\X2\\007300740061007600650062006E011B\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('stavebně');
    });

    it('should handle mixed text and \\X2\\ sequence', () => {
        const input = 'Prefix \\X2\\0048006500790021\\X0\\ Suffix';
        const result = decodeIFCString(input);
        expect(result).toBe('Prefix Hey! Suffix');
    });

    it('should decode single character UTF-16', () => {
        const input = '\\X2\\00E1\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('á');
    });
});


describe('IFC String Encoding - Mixed Formats', () => {

    it('should decode mixed \\S\\ and \\X2\\ in same string', () => {
        const input = 'nosn\\S\\a \\X2\\006B006F006E007300740072\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('nosná konstr');
    });

    it('should decode mixed \\X\\ and \\X2\\ in same string', () => {
        const input = '\\X\\C4 \\X2\\0048006500790021\\X0\\';
        const result = decodeIFCString(input);
        expect(result).toBe('Ä Hey!');
    });
});


describe('IFC Property Parsing - IFCBOOLEAN', () => {

    it('should parse IFCBOOLEAN(.T.) as TRUE', () => {
        const params = "'LoadBearing',$,IFCBOOLEAN(.T.),$";
        const result = parseProperty(params);
        expect(result.name).toBe('LoadBearing');
        expect(result.value).toBe('TRUE');
    });

    it('should parse IFCBOOLEAN(.F.) as FALSE', () => {
        const params = "'IsExternal',$,IFCBOOLEAN(.F.),$";
        const result = parseProperty(params);
        expect(result.name).toBe('IsExternal');
        expect(result.value).toBe('FALSE');
    });

    it('should parse IFCBOOLEAN with spaces', () => {
        const params = "'Test',$,IFCBOOLEAN( .T. ),$";
        const result = parseProperty(params);
        expect(result.value).toBe('TRUE');
    });
});


describe('IFC Property Parsing - IFCLOGICAL', () => {

    it('should parse IFCLOGICAL(.T.) as TRUE', () => {
        const params = "'Property',$,IFCLOGICAL(.T.),$";
        const result = parseProperty(params);
        expect(result.value).toBe('TRUE');
    });

    it('should parse IFCLOGICAL(.F.) as FALSE', () => {
        const params = "'Property',$,IFCLOGICAL(.F.),$";
        const result = parseProperty(params);
        expect(result.value).toBe('FALSE');
    });

    it('should parse IFCLOGICAL(.U.) as UNKNOWN', () => {
        const params = "'Property',$,IFCLOGICAL(.U.),$";
        const result = parseProperty(params);
        expect(result.value).toBe('UNKNOWN');
    });
});


describe('IFC Property Parsing - Numeric Values', () => {

    it('should parse IFCVOLUMEMEASURE', () => {
        const params = "'QuantityLength',$,IFCVOLUMEMEASURE(504.77),$";
        const result = parseProperty(params);
        expect(result.name).toBe('QuantityLength');
        expect(result.value).toBe('504.77');
    });

    it('should parse IFCLENGTHMEASURE', () => {
        const params = "'Length',$,IFCLENGTHMEASURE(200),$";
        const result = parseProperty(params);
        expect(result.value).toBe('200');
    });

    it('should parse IFCPLANEANGLEMEASURE', () => {
        const params = "'Slope',$,IFCPLANEANGLEMEASURE(1.5708),$";
        const result = parseProperty(params);
        expect(result.value).toBe('1.5708');
    });

    it('should parse IFCREAL', () => {
        const params = "'Value',$,IFCREAL(123.456),$";
        const result = parseProperty(params);
        expect(result.value).toBe('123.456');
    });

    it('should parse IFCINTEGER', () => {
        const params = "'Count',$,IFCINTEGER(42),$";
        const result = parseProperty(params);
        expect(result.value).toBe('42');
    });

    it('should parse scientific notation', () => {
        const params = "'Value',$,IFCREAL(1.E-05),$";
        const result = parseProperty(params);
        expect(result.value).toBe('1.E-05');
    });

    it('should parse negative numbers', () => {
        const params = "'Offset',$,IFCLENGTHMEASURE(-100.5),$";
        const result = parseProperty(params);
        expect(result.value).toBe('-100.5');
    });
});


describe('IFC Property Parsing - String Values', () => {

    it('should parse IFCLABEL with plain text', () => {
        const params = "'Material',$,IFCLABEL('CONCRETE'),$";
        const result = parseProperty(params);
        expect(result.name).toBe('Material');
        expect(result.value).toBe('CONCRETE');
    });

    it('should parse IFCLABEL with \\S\\ encoding', () => {
        const params = "'IfcCZElement',$,IFCLABEL('nosn\\S\\a konstrukce'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('nosná konstrukce');
    });

    it('should parse IFCLABEL with \\X2\\ encoding', () => {
        const params = "'IfcCZElementGroup',$,IFCLABEL('\\X2\\004E0065007600790070006C006E011B006E006F\\X0\\'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('Nevyplněno');
    });

    it('should parse IFCTEXT', () => {
        const params = "'Description',$,IFCTEXT('Some description'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('Some description');
    });

    it('should parse IFCIDENTIFIER', () => {
        const params = "'Reference',$,IFCIDENTIFIER('A0(?)'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('A0(?)');
    });
});


describe('IFC Property Parsing - Empty/Null Values', () => {

    it('should handle $ (undefined) value', () => {
        const params = "'TextureOrColour',$,$,$";
        const result = parseProperty(params);
        expect(result.name).toBe('TextureOrColour');
        expect(result.value).toBe('');
    });

    it('should handle empty string value', () => {
        const params = "'Empty',$,,$";
        const result = parseProperty(params);
        expect(result.value).toBe('');
    });
});


describe('IFC Property Parsing - Property Name Decoding', () => {

    it('should decode property name with \\X2\\ encoding', () => {
        const params = "'\\X2\\0053017D005F005600FD0161006B0061\\X0\\',$,IFCLENGTHMEASURE(200),$";
        const result = parseProperty(params);
        expect(result.name).toBe('SŽ_Výška');
        expect(result.value).toBe('200');
    });

    it('should decode property name with \\S\\ encoding', () => {
        // Note: š (U+0161) doesn't exist in ISO-8859-1, so we test with é (char 233)
        // \S\i = char(105+128) = char(233) = é
        const params = "'D\\S\\ilka',$,IFCLABEL('test'),$";
        const result = parseProperty(params);
        expect(result.name).toBe('Délka');
    });
});


describe('Tekla Structures IFC Export - Real World Examples', () => {

    it('should parse CZ_I1 PropertySet property (ifcCZElement)', () => {
        const params = "'ifcCZElement',$,IFCLABEL('\\X2\\007300740079010D006E00ED006B006F007600E10020006400650073006B0061\\X0\\'),$";
        const result = parseProperty(params);
        expect(result.name).toBe('ifcCZElement');
        expect(result.value).toBe('styčníková deska');
    });

    it('should parse CZ_I1 PropertySet property (ifcCZElementGroup)', () => {
        const params = "'ifcCZElementGroup',$,IFCLABEL('\\X2\\007300740061007600650062006E011B0020006B006F006E0073007400720075006B010D006E00ED00200159006501610065006E00ED\\X0\\'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('stavebně konstrukční řešení');
    });

    it('should parse Status with \\S\\ encoding', () => {
        const params = "'Status',$,IFCLABEL('trval\\S\\} stav'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('trvalý stav');
    });

    it('should parse beam slope from Tekla', () => {
        const params = "'Slope',$,IFCPLANEANGLEMEASURE(0.39366),$";
        const result = parseProperty(params);
        expect(result.name).toBe('Slope');
        expect(result.value).toBe('0.39366');
    });

    it('should parse construction property', () => {
        const params = "'ConstructionStart',$,IFCLABEL('10_2025'),$";
        const result = parseProperty(params);
        expect(result.value).toBe('10_2025');
    });
});


describe('splitParams - IFC Parameter Splitting', () => {

    it('should split simple parameters', () => {
        const params = "'Name',$,'Value'";
        const parts = splitParams(params);
        expect(parts.length).toBe(3);
        expect(parts[0]).toBe("'Name'");
        expect(parts[1]).toBe('$');
        expect(parts[2]).toBe("'Value'");
    });

    it('should handle nested parentheses', () => {
        const params = "'Name',$,IFCLABEL('Value'),$";
        const parts = splitParams(params);
        expect(parts.length).toBe(4);
        expect(parts[2]).toBe("IFCLABEL('Value')");
    });

    it('should correctly split \\X2\\ encoded strings ending with \\X0\\', () => {
        // This is the critical bug fix - \\X0\\' should NOT be treated as escaped quote
        const params = "'\\X2\\004300430049005F0031\\X0\\',$,IFCLABEL('R'),$";
        const parts = splitParams(params);
        expect(parts.length).toBe(4);
        expect(parts[0]).toBe("'\\X2\\004300430049005F0031\\X0\\'");
        expect(parts[1]).toBe('$');
        expect(parts[2]).toBe("IFCLABEL('R')");
        expect(parts[3]).toBe('$');
    });

    it('should correctly handle \\S\\ encoded strings ending with backslash', () => {
        const params = "'nosn\\S\\a',$,IFCLABEL('test'),$";
        const parts = splitParams(params);
        expect(parts.length).toBe(4);
        expect(parts[0]).toBe("'nosn\\S\\a'");
    });

    it('should handle IFC escaped quotes (double single quotes)', () => {
        const params = "'Name with ''quotes''',$,IFCLABEL('Value'),$";
        const parts = splitParams(params);
        expect(parts.length).toBe(4);
        expect(parts[0]).toBe("'Name with ''quotes'''");
    });

    it('should split PropertySet with property references', () => {
        const params = "'guid',$,'CCI_Klasifikace',$,(#35780,#35781,#35782)";
        const parts = splitParams(params);
        expect(parts.length).toBe(5);
        expect(parts[2]).toBe("'CCI_Klasifikace'");
        expect(parts[4]).toBe('(#35780,#35781,#35782)');
    });

    it('should handle complex Tekla UTF-16 encoded property', () => {
        const params = "'\\X2\\0053017D005F005600FD0161006B0061\\X0\\',$,IFCLENGTHMEASURE(200),$";
        const parts = splitParams(params);
        expect(parts.length).toBe(4);
        expect(parts[0]).toBe("'\\X2\\0053017D005F005600FD0161006B0061\\X0\\'");
        expect(parts[2]).toBe('IFCLENGTHMEASURE(200)');
    });
});
