// =======================
// BIM CHECKER TEST FRAMEWORK
// Jednoduchý testovací framework bez závislostí
// =======================

class TestFramework {
    constructor() {
        this.suites = [];
        this.currentSuite = null;
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            suites: []
        };
        this.startTime = 0;
    }

    // Vytvoření nové test suite
    describe(name, callback) {
        const suite = {
            name: name,
            tests: [],
            beforeEach: null,
            afterEach: null
        };

        this.currentSuite = suite;
        this.suites.push(suite);

        // Spustit callback pro definici testů
        callback();

        this.currentSuite = null;
    }

    // Definice jednotlivého testu
    it(description, testFn) {
        if (!this.currentSuite) {
            throw new Error('Test must be inside describe block');
        }

        this.currentSuite.tests.push({
            description: description,
            fn: testFn
        });
    }

    // Before each hook
    beforeEach(fn) {
        if (!this.currentSuite) {
            throw new Error('beforeEach must be inside describe block');
        }
        this.currentSuite.beforeEach = fn;
    }

    // After each hook
    afterEach(fn) {
        if (!this.currentSuite) {
            throw new Error('afterEach must be inside describe block');
        }
        this.currentSuite.afterEach = fn;
    }

    // Spuštění všech testů
    async run(onProgress) {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            suites: [],
            startTime: Date.now(),
            endTime: null
        };

        this.startTime = Date.now();

        let testIndex = 0;
        const totalTests = this.suites.reduce((sum, suite) => sum + suite.tests.length, 0);

        for (const suite of this.suites) {
            const suiteResult = {
                name: suite.name,
                tests: [],
                passed: 0,
                failed: 0
            };

            for (const test of suite.tests) {
                testIndex++;

                // Run beforeEach
                if (suite.beforeEach) {
                    try {
                        await suite.beforeEach();
                    } catch (error) {
                        console.error('beforeEach failed:', error);
                    }
                }

                const testResult = await this.runTest(test);
                suiteResult.tests.push(testResult);

                if (testResult.passed) {
                    suiteResult.passed++;
                    this.results.passed++;
                } else {
                    suiteResult.failed++;
                    this.results.failed++;
                }

                this.results.total++;

                // Report progress
                if (onProgress) {
                    onProgress({
                        current: testIndex,
                        total: totalTests,
                        percentage: (testIndex / totalTests) * 100
                    });
                }

                // Run afterEach
                if (suite.afterEach) {
                    try {
                        await suite.afterEach();
                    } catch (error) {
                        console.error('afterEach failed:', error);
                    }
                }
            }

            this.results.suites.push(suiteResult);
        }

        this.results.endTime = Date.now();
        this.results.duration = this.results.endTime - this.results.startTime;

        return this.results;
    }

    // Spuštění jednoho testu
    async runTest(test) {
        const result = {
            description: test.description,
            passed: false,
            error: null,
            duration: 0
        };

        const startTime = performance.now();

        try {
            await test.fn();
            result.passed = true;
        } catch (error) {
            result.passed = false;
            result.error = error.message;
            result.stack = error.stack;
        }

        result.duration = Math.round(performance.now() - startTime);

        return result;
    }

    // Vymazání všech testů
    clear() {
        this.suites = [];
        this.currentSuite = null;
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            suites: []
        };
    }
}

// =======================
// ASSERTION LIBRARY
// =======================

class Assertions {
    constructor(actual) {
        this.actual = actual;
    }

    toBe(expected) {
        if (this.actual !== expected) {
            throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(this.actual)}`);
        }
    }

    toEqual(expected) {
        if (JSON.stringify(this.actual) !== JSON.stringify(expected)) {
            throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(this.actual)}`);
        }
    }

    toBeTruthy() {
        if (!this.actual) {
            throw new Error(`Expected truthy value but got ${JSON.stringify(this.actual)}`);
        }
    }

    toBeFalsy() {
        if (this.actual) {
            throw new Error(`Expected falsy value but got ${JSON.stringify(this.actual)}`);
        }
    }

    toBeNull() {
        if (this.actual !== null) {
            throw new Error(`Expected null but got ${JSON.stringify(this.actual)}`);
        }
    }

    toBeUndefined() {
        if (this.actual !== undefined) {
            throw new Error(`Expected undefined but got ${JSON.stringify(this.actual)}`);
        }
    }

    toBeDefined() {
        if (this.actual === undefined) {
            throw new Error('Expected value to be defined');
        }
    }

    toContain(item) {
        if (Array.isArray(this.actual)) {
            if (!this.actual.includes(item)) {
                throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
            }
        } else if (typeof this.actual === 'string') {
            if (!this.actual.includes(item)) {
                throw new Error(`Expected string to contain "${item}"`);
            }
        } else {
            throw new Error('toContain works only with arrays and strings');
        }
    }

    toHaveLength(length) {
        if (this.actual.length !== length) {
            throw new Error(`Expected length ${length} but got ${this.actual.length}`);
        }
    }

    toBeGreaterThan(value) {
        if (this.actual <= value) {
            throw new Error(`Expected ${this.actual} to be greater than ${value}`);
        }
    }

    toBeLessThan(value) {
        if (this.actual >= value) {
            throw new Error(`Expected ${this.actual} to be less than ${value}`);
        }
    }

    toBeInstanceOf(className) {
        if (!(this.actual instanceof className)) {
            throw new Error(`Expected instance of ${className.name}`);
        }
    }

    toThrow(errorMessage) {
        if (typeof this.actual !== 'function') {
            throw new Error('toThrow expects a function');
        }

        try {
            this.actual();
            throw new Error('Expected function to throw an error');
        } catch (error) {
            if (errorMessage && !error.message.includes(errorMessage)) {
                throw new Error(`Expected error message to contain "${errorMessage}" but got "${error.message}"`);
            }
        }
    }

    async toThrowAsync(errorMessage) {
        if (typeof this.actual !== 'function') {
            throw new Error('toThrowAsync expects a function');
        }

        try {
            await this.actual();
            throw new Error('Expected async function to throw an error');
        } catch (error) {
            if (errorMessage && !error.message.includes(errorMessage)) {
                throw new Error(`Expected error message to contain "${errorMessage}" but got "${error.message}"`);
            }
        }
    }

    toMatch(regex) {
        if (!regex.test(this.actual)) {
            throw new Error(`Expected "${this.actual}" to match ${regex}`);
        }
    }

    toHaveProperty(property, value) {
        if (!(property in this.actual)) {
            throw new Error(`Expected object to have property "${property}"`);
        }
        if (value !== undefined && this.actual[property] !== value) {
            throw new Error(`Expected property "${property}" to be ${JSON.stringify(value)} but got ${JSON.stringify(this.actual[property])}`);
        }
    }
}

// Helper function
function expect(actual) {
    return new Assertions(actual);
}

// Export framework
window.TestFramework = TestFramework;
window.expect = expect;

// Create global test instance
window.testRunner = new TestFramework();
window.describe = (name, callback) => window.testRunner.describe(name, callback);
window.it = (description, testFn) => window.testRunner.it(description, testFn);
window.beforeEach = (fn) => window.testRunner.beforeEach(fn);
window.afterEach = (fn) => window.testRunner.afterEach(fn);
