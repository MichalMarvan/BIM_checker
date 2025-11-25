// =======================
// TEST RUNNER UI
// =======================

let currentFilter = 'all';
let testResults = null;

async function runAllTests() {
    const resultsDiv = document.getElementById('testResults');
    const progressFill = document.getElementById('progressFill');
    
    // Show loading
    resultsDiv.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <div>Spouštím testy...</div>
        </div>
    `;

    // Reset stats
    updateStats(0, 0, 0, 0);

    try {
        // Run tests with progress callback
        testResults = await window.testRunner.run((progress) => {
            progressFill.style.width = progress.percentage + '%';
        });

        // Display results
        displayResults(testResults);
        
        // Update stats
        updateStats(
            testResults.total,
            testResults.passed,
            testResults.failed,
            testResults.duration
        );

        // Reset progress bar
        setTimeout(() => {
            progressFill.style.width = '0%';
        }, 1000);

    } catch (error) {
        resultsDiv.innerHTML = `
            <div class="test-error">
                <strong>Chyba při spouštění testů:</strong><br>
                ${error.message}
            </div>
        `;
    }
}

function displayResults(results) {
    const resultsDiv = document.getElementById('testResults');
    
    if (!results || results.suites.length === 0) {
        resultsDiv.innerHTML = `
            <div class="loading">
                <div>Žádné testy k zobrazení</div>
            </div>
        `;
        return;
    }

    let html = '';

    for (const suite of results.suites) {
        const suiteId = 'suite-' + suite.name.replace(/\s+/g, '-').toLowerCase();
        const suitePassed = suite.failed === 0;

        html += `
            <div class="test-suite" data-suite="${suite.name}">
                <div class="suite-header" onclick="toggleSuite('${suiteId}')">
                    <div>
                        <span style="font-size: 1.2em; margin-right: 10px;">
                            ${suitePassed ? '✓' : '✗'}
                        </span>
                        ${suite.name}
                    </div>
                    <div class="suite-stats">
                        <span style="color: #22c55e; margin-right: 10px;">✓ ${suite.passed}</span>
                        <span style="color: #ef4444;">✗ ${suite.failed}</span>
                    </div>
                </div>
                <div class="suite-content" id="${suiteId}">
        `;

        for (const test of suite.tests) {
            const testClass = test.passed ? 'passed' : 'failed';
            const testIcon = test.passed ? '✓' : '✗';

            html += `
                <div class="test-case ${testClass}" data-status="${testClass}">
                    <div class="test-icon">${testIcon}</div>
                    <div class="test-info">
                        <div class="test-name">${test.description}</div>
                        <div class="test-duration">⏱️ ${test.duration}ms</div>
                        ${test.error ? `
                            <div class="test-error">
                                <strong>Error:</strong> ${escapeHtml(test.error)}
                                ${test.stack ? `<br><br><strong>Stack:</strong><br>${escapeHtml(test.stack)}` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;
    }

    resultsDiv.innerHTML = html;

    // Apply current filter
    applyFilter(currentFilter);
}

function toggleSuite(suiteId) {
    const content = document.getElementById(suiteId);
    content.classList.toggle('expanded');
}

function updateStats(total, passed, failed, time) {
    document.getElementById('totalTests').textContent = total;
    document.getElementById('passedTests').textContent = passed;
    document.getElementById('failedTests').textContent = failed;
    document.getElementById('totalTime').textContent = time + 'ms';
}

function clearResults() {
    document.getElementById('testResults').innerHTML = `
        <div class="loading">
            <div>Klikněte na "Spustit všechny testy" pro zahájení testování</div>
        </div>
    `;
    updateStats(0, 0, 0, 0);
    document.getElementById('progressFill').style.width = '0%';
}

function filterTests(filter) {
    currentFilter = filter;
    
    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) {
            btn.classList.add('active');
        }
    });

    applyFilter(filter);
}

function applyFilter(filter) {
    const testCases = document.querySelectorAll('.test-case');
    const suites = document.querySelectorAll('.test-suite');

    if (filter === 'all') {
        testCases.forEach(tc => tc.style.display = '');
        suites.forEach(suite => suite.style.display = '');
    } else {
        testCases.forEach(tc => {
            if (tc.dataset.status === filter) {
                tc.style.display = '';
            } else {
                tc.style.display = 'none';
            }
        });

        // Hide suites with no visible tests
        suites.forEach(suite => {
            const visibleTests = suite.querySelectorAll(`.test-case[data-status="${filter}"]`);
            if (visibleTests.length === 0 && filter !== 'all') {
                suite.style.display = 'none';
            } else {
                suite.style.display = '';
            }
        });
    }
}

function exportResults() {
    if (!testResults) {
        alert('Nejprve spusťte testy');
        return;
    }

    const dataStr = JSON.stringify(testResults, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `test-results-${new Date().toISOString()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-expand first suite on load
window.addEventListener('load', () => {
    setTimeout(() => {
        const firstSuite = document.querySelector('.suite-content');
        if (firstSuite) {
            firstSuite.classList.add('expanded');
        }
    }, 100);
});
