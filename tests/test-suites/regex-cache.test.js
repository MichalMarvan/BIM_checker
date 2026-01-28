// =======================
// REGEX CACHE TESTS
// =======================

describe('Regex Cache', () => {

    it('should return compiled regex for pattern', () => {
        const regex = RegexCache.get('IFCWALL.*');
        expect(regex).toBeDefined();
        expect(regex instanceof RegExp).toBe(true);
    });

    it('should return same instance for same pattern', () => {
        const regex1 = RegexCache.get('IFCDOOR');
        const regex2 = RegexCache.get('IFCDOOR');
        expect(regex1).toBe(regex2);
    });

    it('should return different instances for different patterns', () => {
        const regex1 = RegexCache.get('IFCWALL');
        const regex2 = RegexCache.get('IFCDOOR');
        expect(regex1 !== regex2).toBe(true);
    });

    it('should handle regex with flags', () => {
        const regex = RegexCache.get('test', 'gi');
        expect(regex.flags).toContain('g');
        expect(regex.flags).toContain('i');
    });

    it('should cache regex with flags separately', () => {
        const regex1 = RegexCache.get('test', 'i');
        const regex2 = RegexCache.get('test', 'g');
        expect(regex1 !== regex2).toBe(true);
    });

    it('should clear cache', () => {
        RegexCache.get('pattern1');
        RegexCache.get('pattern2');
        expect(RegexCache.size()).toBeGreaterThan(0);

        RegexCache.clear();
        expect(RegexCache.size()).toBe(0);
    });

    it('should handle invalid regex gracefully', () => {
        expect(() => RegexCache.get('[invalid')).toThrow();
    });

});
