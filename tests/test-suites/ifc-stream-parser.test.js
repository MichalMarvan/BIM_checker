/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Copyright (C) 2025 Michal Marvan */
// =======================
// IFC STREAM PARSER TESTS
// =======================

describe('IFC Stream Parser', () => {
    let parser;

    beforeEach(() => {
        parser = new IFCStreamParser({
            chunkSize: 1024,
            onEntity: () => {},
            onProgress: () => {},
            onComplete: () => {}
        });
    });

    it('should create parser instance', () => {
        expect(parser).toBeDefined();
        expect(parser).toBeInstanceOf(IFCStreamParser);
    });

    it('should have default chunk size', () => {
        const defaultParser = new IFCStreamParser();
        expect(defaultParser.chunkSize).toBe(1024 * 1024);
    });

    it('should parse simple IFC entity', () => {
        const line = "#123 = IFCWALL('2Xd7f8$3jDwBD4L9fK3J4x',#5,'Wall-001',$,$,#10,#11,'8A3B2C1D');";
        const entity = parser.parseEntity(line);
        
        expect(entity).toBeDefined();
        expect(entity.id).toBe(123);
        expect(entity.type).toBe('IFCWALL');
        expect(entity.line).toBe(line);
    });

    it('should return null for invalid entity', () => {
        const invalidLine = "INVALID_LINE";
        const entity = parser.parseEntity(invalidLine);
        
        expect(entity).toBeNull();
    });

    it('should parse entity with complex arguments', () => {
        const line = "#456 = IFCPROPERTYSINGLEVALUE('Name',$,IFCLABEL('TestValue'),$);";
        const entity = parser.parseEntity(line);
        
        expect(entity).toBeDefined();
        expect(entity.id).toBe(456);
        expect(entity.type).toBe('IFCPROPERTYSINGLEVALUE');
    });

    it('should parse string value correctly', () => {
        const value = parser.parseValue("'TestString'");
        expect(value).toBe('TestString');
    });

    it('should parse reference value correctly', () => {
        const value = parser.parseValue('#123');
        expect(value).toEqual({ ref: 123 });
    });

    it('should parse number value correctly', () => {
        const value = parser.parseValue('42.5');
        expect(value).toBe(42.5);
    });

    it('should parse boolean .T. correctly', () => {
        const value = parser.parseValue('.T.');
        expect(value).toBe(true);
    });

    it('should parse boolean .F. correctly', () => {
        const value = parser.parseValue('.F.');
        expect(value).toBe(false);
    });

    it('should parse null value $ correctly', () => {
        const value = parser.parseValue('$');
        expect(value).toBeNull();
    });

    it('should parse undefined value * correctly', () => {
        const value = parser.parseValue('*');
        expect(value).toBeUndefined();
    });

    it('should parse arguments with commas', () => {
        const args = parser.parseArguments("'Name','Description',123");
        expect(args).toHaveLength(3);
        expect(args[0]).toBe('Name');
        expect(args[1]).toBe('Description');
        expect(args[2]).toBe(123);
    });

    it('should handle nested parentheses in arguments', () => {
        const args = parser.parseArguments("#1,(#2,#3),#4");
        expect(args).toHaveLength(3);
    });

    it('should handle empty arguments (no fields, same as splitParams)', () => {
        const args = parser.parseArguments("");
        expect(args).toHaveLength(0);
    });

    it('should keep empty fields so attribute positions stay stable', () => {
        const args = parser.parseArguments("'a',,#3");
        expect(args).toHaveLength(3);
        expect(args[1]).toBe('');
    });

    it('should not treat backslash before a quote as an escape (\\X0\\ encoding)', () => {
        const args = parser.parseArguments("'S\\X2\\017D\\X0\\',$,IFCTEXT('RS'),$");
        expect(args).toHaveLength(4);
        expect(args[0]).toBe('S\\X2\\017D\\X0\\');
    });

    it('parseText splits records on ; outside strings and comments', () => {
        const seen = [];
        const p = new IFCStreamParser({ onEntity: e => seen.push(e) });
        p.parseText("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n/* #0 note */\n#1=IFCWALL('a;b',/* x */$);#2=IFCSLAB('it''s',\n  $);\nENDSEC;\n#3=IFCBEAM($);", 7);
        expect(seen.length).toBe(2);
        expect(seen[0].arguments[0]).toBe('a;b');
        expect(seen[0].arguments.length).toBe(2);
        expect(seen[1].arguments[0]).toBe("it's");
    });

    it('should not process lines before DATA section', () => {
        parser.headerProcessed = false;
        parser.processLine('HEADER;');
        expect(parser.entityCount).toBe(0);
    });

    it('should start processing after DATA section', () => {
        parser.headerProcessed = false;
        parser.processLine('DATA;');
        expect(parser.headerProcessed).toBe(true);
    });

    it('should stop processing at ENDSEC', () => {
        parser.headerProcessed = true;
        const entity = parser.processLine('ENDSEC;');
        expect(entity).toBeUndefined();
    });

    it('should increment entity count on valid entity', () => {
        parser.headerProcessed = true;
        parser.onEntity = () => {};
        parser.processLine("#1 = IFCWALL('test');");
        expect(parser.entityCount).toBe(1);
    });

    it('should handle malformed entities gracefully', () => {
        const malformed = "#999 = INVALID ENTITY (missing parentheses";
        const entity = parser.parseEntity(malformed);
        expect(entity).toBeNull();
    });

    it('should parse entity with trailing semicolon', () => {
        const line = "#100 = IFCSITE('test');";
        const entity = parser.parseEntity(line);
        expect(entity).toBeDefined();
        expect(entity.id).toBe(100);
    });

    it('should parse entity without trailing semicolon', () => {
        const line = "#100 = IFCSITE('test')";
        const entity = parser.parseEntity(line);
        expect(entity).toBeDefined();
        expect(entity.id).toBe(100);
    });
});
