// Globální proměnná pro uchování IDS dat
let currentIDSData = null;

// Event listeners
document.getElementById('fileUploadArea').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', handleFileSelect);

// Drag and drop
const uploadArea = document.getElementById('fileUploadArea');

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.name.match(/\.(ids|xml)$/i)) {
        showError(t('parser.error.invalidFile'));
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            parseIDS(e.target.result);
        } catch (error) {
            showError(t('parser.error.parsingError') + ' ' + error.message);
        }
    };
    reader.readAsText(file);
}

function parseIDS(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // Kontrola chyb parsování
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        showError(t('parser.error.invalidXml'));
        return;
    }

    // Zpracování IDS dat
    currentIDSData = {
        xml: xmlString,
        doc: xmlDoc,
        info: extractInfo(xmlDoc),
        specifications: extractSpecifications(xmlDoc)
    };

    // Zobrazení vizualizace
    displayIDS();
    document.getElementById('visualizationSection').style.display = 'block';
    hideError();
}

function extractInfo(xmlDoc) {
    const info = {};
    const infoElement = xmlDoc.querySelector('info');

    if (infoElement) {
        info.title = infoElement.querySelector('title')?.textContent || t('parser.info.noTitle');
        info.copyright = infoElement.querySelector('copyright')?.textContent || '';
        info.version = infoElement.querySelector('version')?.textContent || '';
        info.description = infoElement.querySelector('description')?.textContent || '';
        info.author = infoElement.querySelector('author')?.textContent || '';
        info.date = infoElement.querySelector('date')?.textContent || '';
        info.purpose = infoElement.querySelector('purpose')?.textContent || '';
        info.milestone = infoElement.querySelector('milestone')?.textContent || '';
    }

    return info;
}

function extractSpecifications(xmlDoc) {
    const specifications = [];
    const specElements = xmlDoc.querySelectorAll('specification');

    specElements.forEach((spec, index) => {
        const specification = {
            name: spec.getAttribute('name') || `${t('parser.info.noSpec')} ${index + 1}`,
            ifcVersion: spec.getAttribute('ifcVersion') || t('parser.info.unspecified'),
            // minOccurs: spec.getAttribute('minOccurs'), // Not allowed on <specification>
            // maxOccurs: spec.getAttribute('maxOccurs'), // Not allowed on <specification>
            identifier: spec.getAttribute('identifier') || '',
            description: spec.getAttribute('description') || '',
            instructions: spec.getAttribute('instructions') || '',
            applicability: extractFacets(spec.querySelector('applicability')),
            requirements: extractFacets(spec.querySelector('requirements'))
        };
        specifications.push(specification);
    });

    return specifications;
}

function extractFacets(facetsElement) {
    if (!facetsElement) {
        return [];
    }

    const facets = [];
    const facetTypes = ['entity', 'partOf', 'classification', 'attribute', 'property', 'material'];

    facetTypes.forEach(type => {
        const elements = facetsElement.querySelectorAll(type);
        elements.forEach(elem => {
            facets.push(extractFacet(elem, type));
        });
    });

    return facets;
}

function extractFacet(element, type) {
    const facet = { type };

    // Extrakce různých částí facetu
    const nameElem = element.querySelector('name');
    const baseNameElem = element.querySelector('baseName');

    if (type === 'property') {
        if (baseNameElem) {
            facet.baseName = extractValue(baseNameElem);
        }
    } else {
        if (nameElem) {
            facet.name = extractValue(nameElem);
        }
    }

    const valueElem = element.querySelector('value');
    if (valueElem) {
        facet.value = extractValue(valueElem);
    }

    // Pro property - propertySet
    if (type === 'property') {
        const propSetElem = element.querySelector('propertySet, propertyset');
        if (propSetElem) {
            facet.propertySet = extractValue(propSetElem);
        }
    }

    // Pro partOf - relation
    if (type === 'partOf') {
        const relationElem = element.querySelector('relation');
        if (relationElem) {
            facet.relation = extractValue(relationElem);
        }
    }

    // Pro classification - system
    if (type === 'classification') {
        const systemElem = element.querySelector('system');
        if (systemElem) {
            facet.system = extractValue(systemElem);
        }
    }

    // Predefined type
    const predefinedElem = element.querySelector('predefinedType');
    if (predefinedElem) {
        facet.predefinedType = extractValue(predefinedElem);
    }

    // Cardinality
    facet.cardinality = element.getAttribute('cardinality') || 'required';

                // minOccurs/maxOccurs are not allowed on individual facets by XSD
                // const minOccurs = element.getAttribute('minOccurs');
                // const maxOccurs = element.getAttribute('maxOccurs');
                // if (minOccurs) {
                //     facet.minOccurs = minOccurs;
                // }
                // if (maxOccurs) {
                //     facet.maxOccurs = maxOccurs;
                // }
    return facet;
}

function extractValue(element) {
    // Simple value
    const simpleValue = element.querySelector('simpleValue');
    if (simpleValue) {
        return { type: 'simple', value: simpleValue.textContent };
    }

    // Direct xs:restriction (your IDS format)
    if (element.querySelector('restriction')) {
        const restriction = element.querySelector('restriction');
        return extractRestriction(restriction);
    }

    // Check if element itself is xs:restriction
    const nsRestriction = element.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'restriction')[0];
    if (nsRestriction) {
        return extractRestriction(nsRestriction);
    }

    return { type: 'simple', value: element.textContent };
}

function extractRestriction(restriction) {
    const result = { type: 'restriction' };

    // Pattern (regex) - check both namespaces
    let pattern = restriction.querySelector('pattern');
    if (!pattern) {
        pattern = restriction.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'pattern')[0];
    }
    if (pattern) {
        // Get value from attribute (your format) or text content
        result.pattern = pattern.getAttribute('value') || pattern.textContent;
        result.isRegex = true;
    }

    let enumeration = restriction.querySelectorAll('enumeration'); // Look for xs:enumeration
    if (!enumeration.length) {
        enumeration = restriction.getElementsByTagNameNS('http://www.w3.org/2001/XMLSchema', 'enumeration');
    }
    if (enumeration.length > 0) {
        result.type = 'enumeration'; // Explicitly set type for clarity
        result.values = Array.from(enumeration).map(enumElem => enumElem.getAttribute('value'));
    }

    // Bounds (numeric ranges)
    const minInclusive = restriction.querySelector('minInclusive');
    const maxInclusive = restriction.querySelector('maxInclusive');
    const minExclusive = restriction.querySelector('minExclusive');
    const maxExclusive = restriction.querySelector('maxExclusive');

    if (minInclusive) {
        result.minInclusive = minInclusive.textContent;
    }
    if (maxInclusive) {
        result.maxInclusive = maxInclusive.textContent;
    }
    if (minExclusive) {
        result.minExclusive = minExclusive.textContent;
    }
    if (maxExclusive) {
        result.maxExclusive = maxExclusive.textContent;
    }

    // Length restrictions
    const minLength = restriction.querySelector('minLength');
    const maxLength = restriction.querySelector('maxLength');
    const length = restriction.querySelector('length');

    if (minLength) {
        result.minLength = minLength.textContent;
    }
    if (maxLength) {
        result.maxLength = maxLength.textContent;
    }
    if (length) {
        result.length = length.textContent;
    }

    return result;
}

function displayIDS() {
    displayInfo();
    displaySpecifications();
    displayTree();
    displayRawXML();
}

function displayInfo() {
    const info = currentIDSData.info;
    let hasInfo = false;
    let infoContent = '<div class="ids-info-grid">';

    if (info.title) {
        infoContent += `<div class="info-item"><div class="info-label">${escapeHtml(t('parser.info.name'))}</div><div class="info-value">${escapeHtml(info.title)}</div></div>`;
        hasInfo = true;
    }
    if (info.version) {
        infoContent += `<div class="info-item"><div class="info-label">${escapeHtml(t('parser.info.version'))}</div><div class="info-value">${escapeHtml(info.version)}</div></div>`;
        hasInfo = true;
    }
    if (info.author) {
        infoContent += `<div class="info-item"><div class="info-label">${escapeHtml(t('parser.info.author'))}</div><div class="info-value">${escapeHtml(info.author)}</div></div>`;
        hasInfo = true;
    }
    if (info.date) {
        infoContent += `<div class="info-item"><div class="info-label">${escapeHtml(t('parser.info.date'))}</div><div class="info-value">${escapeHtml(info.date)}</div></div>`;
        hasInfo = true;
    }
    if (info.purpose) {
        infoContent += `<div class="info-item"><div class="info-label">${escapeHtml(t('parser.info.purpose'))}</div><div class="info-value">${escapeHtml(info.purpose)}</div></div>`;
        hasInfo = true;
    }
    if (info.milestone) {
        infoContent += `<div class="info-item"><div class="info-label">${escapeHtml(t('parser.info.milestone'))}</div><div class="info-value">${escapeHtml(info.milestone)}</div></div>`;
        hasInfo = true;
    }

    infoContent += '</div>';

    if (info.description) {
        infoContent += `<div class="info-item" style="margin-top: 1rem;"><div class="info-label">${escapeHtml(t('parser.info.description'))}</div><div class="info-value">${escapeHtml(info.description)}</div></div>`;
        hasInfo = true;
    }

    const infoHTML = `
                <div style="cursor: pointer;" data-action="toggle-info-section">
                    <h3 style="user-select: none; display: flex; align-items: center; gap: 0.5rem;">
                        <span class="expand-icon" id="info-expand" style="font-size: 0.875rem;">▼</span>
                        📋 ${escapeHtml(t('parser.info.idsFileInfo'))}
                    </h3>
                </div>
                <div id="info-content">
                    ${hasInfo ? infoContent : `<p style="color: #718096;">${escapeHtml(t('parser.info.noInfo'))}</p>`}
                </div>
            `;

    document.getElementById('idsInfo').innerHTML = infoHTML;
}

function toggleInfoSection() {
    const content = document.getElementById('info-content');
    const expandIcon = document.getElementById('info-expand');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        expandIcon.textContent = '▼';
    } else {
        content.style.display = 'none';
        expandIcon.textContent = '▶';
    }
}

function displaySpecifications() {
    const container = document.getElementById('specificationsContainer');
    const specs = currentIDSData.specifications;

    let html = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="margin: 0;">📐 ${escapeHtml(t('parser.specs.title'))} (${specs.length})</h3>
                    <div>
                        <button class="sample-button" style="padding: 0.5rem 1rem; font-size: 0.875rem;" data-action="expand-all-specs">${escapeHtml(t('parser.specs.expandAll'))}</button>
                        <button class="sample-button" style="padding: 0.5rem 1rem; font-size: 0.875rem; background: #e2e8f0; color: #4a5568;" data-action="collapse-all-specs">${escapeHtml(t('parser.specs.collapseAll'))}</button>
                    </div>
                </div>
            `;

    specs.forEach((spec, index) => {
        // Determine specification cardinality from minOccurs/maxOccurs
        const specCardinality = getSpecificationCardinality(spec);
        const cardinalityBadge = getCardinalityBadge(specCardinality);

        html += `
                    <div class="specification-card collapsed" id="spec-${index}">
                        <div class="spec-header" data-action="toggle-specification" data-spec-index="${index}">
                            <h4>
                                <span class="expand-icon">▶</span>
                                ${escapeHtml(spec.name)}
                            </h4>
                            <div class="spec-badges" style="display: flex; align-items: center; gap: 8px;">
                                ${cardinalityBadge}
                                <span class="spec-badge">IFC ${escapeHtml(spec.ifcVersion)}</span>
                            </div>
                        </div>
                        <div class="spec-content">
                            <div class="facet-section">
                                <div class="facet-header">
                                    <span class="facet-icon applicability-icon">✓</span>
                                    ${escapeHtml(t('parser.specs.applicability'))}
                                </div>
                                ${formatFacets(spec.applicability, false)}
                            </div>
                            <div class="facet-section">
                                <div class="facet-header">
                                    <span class="facet-icon requirements-icon">!</span>
                                    ${escapeHtml(t('parser.specs.requirements'))}
                                </div>
                                ${formatFacets(spec.requirements, true)}
                            </div>
                        </div>
                    </div>
                `;
    });

    container.innerHTML = html;
}

function toggleSpecification(index) {
    const card = document.getElementById(`spec-${index}`);
    card.classList.toggle('collapsed');
}

function expandAllSpecs() {
    document.querySelectorAll('.specification-card').forEach(card => {
        card.classList.remove('collapsed');
    });
}

function collapseAllSpecs() {
    document.querySelectorAll('.specification-card').forEach(card => {
        card.classList.add('collapsed');
    });
}

function formatFacets(facets, isRequirements = false) {
    if (!facets || facets.length === 0) {
        return `<div class="facet-item">${escapeHtml(t('parser.specs.noFacets'))}</div>`;
    }

    return facets.map(facet => {
        // Show cardinality badge for requirements facets (not entity, which is always required)
        const showCardinalityBadge = isRequirements && facet.type !== 'entity' && facet.cardinality;
        const cardinalityBadge = showCardinalityBadge ? getFacetCardinalityBadge(facet.cardinality) : '';

        let html = '<div class="facet-item">';
        html += `<div class="facet-type">${getFacetTypeName(facet.type)}${cardinalityBadge}</div>`;
        html += '<div class="facet-details">';

        // Zobrazení názvu (pro non-property facety)
        if (facet.name) {
            html += `${escapeHtml(t('parser.facet.name'))} <span class="facet-value">${formatValue(facet.name)}</span><br>`;
        }

        // Zobrazení property setu (první pro property)
        if (facet.propertySet) {
            html += `${escapeHtml(t('parser.facet.propertySet'))} <span class="facet-value">${formatValue(facet.propertySet)}</span><br>`;
        }

        // Zobrazení baseName (název property - pod propertySet)
        if (facet.baseName) {
            html += `${escapeHtml(t('parser.facet.name'))} <span class="facet-value">${formatValue(facet.baseName)}</span><br>`;
        }

        // Zobrazení hodnoty
        if (facet.value) {
            html += `${escapeHtml(t('parser.facet.value'))} <span class="facet-value">${formatValue(facet.value)}</span>`;
        }

        // Zobrazení relace
        if (facet.relation) {
            html += `${escapeHtml(t('parser.facet.relation'))} <span class="facet-value">${formatValue(facet.relation)}</span>`;
        }

        // Zobrazení systému
        if (facet.system) {
            html += `${escapeHtml(t('parser.facet.system'))} <span class="facet-value">${formatValue(facet.system)}</span>`;
        }

        // Zobrazení predefined type
        if (facet.predefinedType) {
            html += `<br>${escapeHtml(t('parser.facet.predefinedType'))} <span class="facet-value">${formatValue(facet.predefinedType)}</span>`;
        }

        html += '</div></div>';
        return html;
    }).join('');
}

function formatValue(value) {
    if (value.type === 'simple') {
        return escapeHtml(value.value);
    } else if (value.type === 'restriction') {
        let result = '';
        if (value.isRegex && value.pattern) {
            // Regex pattern display
            result = `<div class="regex-label">
                        <span class="regex-icon">🔍</span>
                        ${escapeHtml(t('parser.regex.label'))}
                        <span class="regex-help">
                            <span class="regex-help-icon">?</span>
                            <div class="regex-tooltip">
                                <strong>${escapeHtml(t('parser.regex.chars'))}</strong>
                                <table>
                                    <tr><td>^</td><td>${escapeHtml(t('regex.start'))}</td></tr>
                                    <tr><td>$</td><td>${escapeHtml(t('regex.end'))}</td></tr>
                                    <tr><td>.</td><td>${escapeHtml(t('regex.anyChar'))}</td></tr>
                                    <tr><td>*</td><td>${escapeHtml(t('regex.zeroOrMore'))}</td></tr>
                                    <tr><td>+</td><td>${escapeHtml(t('regex.oneOrMore'))}</td></tr>
                                    <tr><td>?</td><td>${escapeHtml(t('regex.optional'))}</td></tr>
                                    <tr><td>[A-Z]</td><td>${escapeHtml(t('regex.uppercase'))}</td></tr>
                                    <tr><td>[a-z]</td><td>${escapeHtml(t('regex.lowercase'))}</td></tr>
                                    <tr><td>\\d</td><td>${escapeHtml(t('regex.digit'))}</td></tr>
                                    <tr><td>\\w</td><td>${escapeHtml(t('regex.wordChar'))}</td></tr>
                                    <tr><td>{n}</td><td>${escapeHtml(t('regex.exactN'))}</td></tr>
                                    <tr><td>{n,m}</td><td>${escapeHtml(t('regex.nToM'))}</td></tr>
                                </table>
                            </div>
                        </span>
                    </div>`;
            result += `<div class="regex-pattern">${escapeHtml(value.pattern)}</div>`;

            // Try to explain common regex patterns
            const explanation = explainRegex(value.pattern);
            if (explanation) {
                result += `<div style="margin-top: 0.5rem; font-size: 0.875rem; color: #718096;">
                            <strong>${escapeHtml(t('parser.regex.explanation'))}</strong> ${escapeHtml(explanation)}
                        </div>`;
            }
        } else if (value.options) {
            result = `${escapeHtml(t('parser.restriction.options'))} <ul class="restriction-list">`;
            value.options.forEach(opt => {
                result += `<li>${escapeHtml(opt)}</li>`;
            });
            result += '</ul>';
        } else if (value.minInclusive || value.maxInclusive) {
            result = `${escapeHtml(t('parser.restriction.range'))} ${escapeHtml(value.minInclusive || '-∞')} ${escapeHtml(t('regex.range.to'))} ${escapeHtml(value.maxInclusive || '+∞')}`;
        } else if (value.minExclusive || value.maxExclusive) {
            result = `${escapeHtml(t('parser.restriction.range'))} >${escapeHtml(value.minExclusive || '-∞')} ${escapeHtml(t('regex.range.to'))} <${escapeHtml(value.maxExclusive || '+∞')}`;
        } else if (value.minLength || value.maxLength || value.length) {
            if (value.length) {
                result = `${escapeHtml(t('parser.restriction.exactLength'))} ${escapeHtml(value.length)} ${escapeHtml(t('parser.restriction.chars'))}`;
            } else {
                result = `${escapeHtml(t('parser.restriction.length'))} ${escapeHtml(value.minLength || '0')} ${escapeHtml(t('regex.range.to'))} ${escapeHtml(value.maxLength || '∞')} ${escapeHtml(t('parser.restriction.chars'))}`;
            }
        }
        return result;
    }
    return escapeHtml(value.value || '');
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function explainRegex(pattern) {
    // Common regex patterns explanation - use translation keys
    const explanations = {
        '^[A-Z]{3}\\d{3}$': t('regex.explain.3letters3digits'),
        '^\\d+$': t('regex.explain.digitsOnly'),
        '^[A-Za-z]+$': t('regex.explain.lettersOnly'),
        '^\\d{4}-\\d{2}-\\d{2}$': t('regex.explain.dateFormat'),
        '^[\\w\\s]+$': t('regex.explain.wordSpaces'),
        '^\\w+@\\w+\\.\\w+$': t('regex.explain.emailBasic'),
        '^\\+?\\d{1,3}[- ]?\\d{3}[- ]?\\d{3}[- ]?\\d{3}$': t('regex.explain.phoneNumber'),
        '^SO\\d{6}': t('regex.explain.soPrefix'),
        '^[a-zá-ž].*$': t('regex.explain.lowercaseStart'),
        'PDPS': `${t('regex.explain.exactText')} "PDPS"`,
        'OTSKP': `${t('regex.explain.exactText')} "OTSKP"`,
        'CCI': `${t('regex.explain.exactText')} "CCI"`,
        'R': `${t('regex.explain.exactLetter')} "R"`,
        'sejmutí ornice': `${t('regex.explain.exactText')} "sejmutí ornice"`
    };

    if (explanations[pattern]) {
        return explanations[pattern];
    }

    // Try to provide generic explanation based on pattern components
    let explanation = '';
    if (pattern.startsWith('^') && pattern.endsWith('$')) {
        explanation = t('regex.explain.mustMatch') + ' ';
    } else if (pattern.startsWith('^')) {
        explanation = t('regex.explain.startsWith') + ' ';
    }

    // Czech characters
    if (pattern.includes('á-ž') || pattern.includes('Á-Ž')) {
        explanation += t('regex.explain.czechChars') + ' ';
    }

    if (pattern.includes('\\d')) {
        explanation += t('regex.explain.containsDigits') + ' ';
    }
    if (pattern.includes('[A-Z]') || pattern.includes('[a-z]')) {
        explanation += t('regex.explain.containsLetters') + ' ';
    }
    if (pattern.includes('+')) {
        explanation += t('regex.explain.oneOrMoreOccur') + ' ';
    }
    if (pattern.includes('*')) {
        explanation += t('regex.explain.zeroOrMoreOccur') + ' ';
    }
    if (pattern.includes('?')) {
        explanation += t('regex.explain.optionalPart') + ' ';
    }
    if (pattern.includes('.*')) {
        explanation += t('regex.explain.anyText') + ' ';
    }
    if (pattern.includes('{')) {
        const match = pattern.match(/\{(\d+)(,(\d+)?)?\}/);
        if (match) {
            if (match[3]) {
                explanation += `${match[1]} ${t('regex.explain.nToMOccur')} ${match[3]} ${t('regex.explain.occurrences')} `;
            } else if (match[2]) {
                explanation += `${t('regex.explain.minOccur')} ${match[1]} ${t('regex.explain.occurrences')} `;
            } else {
                explanation += `${t('regex.explain.exactOccur')} ${match[1]} ${t('regex.explain.occurrences')} `;
            }
        }
    }

    return explanation.trim() || null;
}

function getFacetTypeName(type) {
    const typeNames = {
        'entity': `🏗️ ${escapeHtml(t('parser.facetType.entity'))}`,
        'partOf': `🔗 ${escapeHtml(t('parser.facetType.partOf'))}`,
        'classification': `📑 ${escapeHtml(t('parser.facetType.classification'))}`,
        'attribute': `📌 ${escapeHtml(t('parser.facetType.attribute'))}`,
        'property': `🏷️ ${escapeHtml(t('parser.facetType.property'))}`,
        'material': `🧱 ${escapeHtml(t('parser.facetType.material'))}`
    };
    return typeNames[type] || escapeHtml(type);
}

/**
         * Determine specification cardinality from minOccurs/maxOccurs
         */
function getSpecificationCardinality(spec) {
    if (spec.minOccurs === '0' && spec.maxOccurs === '0') {
        return 'prohibited';
    } else if (spec.minOccurs === '0') {
        return 'optional';
    }
    return 'required'; // default
}

/**
         * Generate cardinality badge HTML
         */
function getCardinalityBadge(cardinality) {
    const styles = {
        'required': 'background: #48bb78; color: white;',
        'optional': 'background: #ed8936; color: white;',
        'prohibited': 'background: #f56565; color: white;'
    };
    const labels = {
        'required': t('cardinality.required'),
        'optional': t('cardinality.optional'),
        'prohibited': t('cardinality.prohibited')
    };
    const style = styles[cardinality] || styles['required'];
    const label = labels[cardinality] || labels['required'];
    return `<span class="cardinality-badge" style="${style} padding: 4px 10px; border-radius: 12px; font-size: 0.8em; font-weight: 600; margin-right: 10px;">${escapeHtml(label)}</span>`;
}

/**
         * Generate facet cardinality badge HTML (smaller)
         */
function getFacetCardinalityBadge(cardinality) {
    const styles = {
        'required': 'background: #48bb78; color: white;',
        'optional': 'background: #ed8936; color: white;',
        'prohibited': 'background: #f56565; color: white;'
    };
    const labels = {
        'required': 'REQ',
        'optional': 'OPT',
        'prohibited': 'PROH'
    };
    const style = styles[cardinality] || styles['required'];
    const label = labels[cardinality] || labels['required'];
    return `<span class="facet-cardinality-badge" style="${style} padding: 2px 6px; border-radius: 8px; font-size: 0.75em; font-weight: 600; margin-left: 8px;">${escapeHtml(label)}</span>`;
}

function displayTree() {
    const treeView = document.getElementById('treeView');
    const tree = generateTreeView(currentIDSData.doc.documentElement, 0);
    treeView.innerHTML = tree;
}

function generateTreeView(node, level) {
    if (node.nodeType !== 1) {
        return '';
    } // Pouze element nodes

    let html = '';
    const hasChildren = node.children.length > 0;
    const nodeValue = node.childNodes.length === 1 && node.childNodes[0].nodeType === 3 ? node.textContent.trim() : '';
    const nodeId = 'node-' + Math.random().toString(36).substr(2, 9);

    html += `<div class="tree-node ${level === 0 ? 'tree-root' : ''} ${hasChildren && level > 0 ? 'collapsed' : ''}" id="${escapeHtml(nodeId)}">`;
    html += `<div data-action="toggle-tree-node" data-node-id="${escapeHtml(nodeId)}" style="margin-left: ${level * 20}px">`;

    if (hasChildren) {
        html += `<span class="tree-expand">${level > 0 ? '▶' : '▼'}</span> `;
    } else {
        html += '<span class="tree-expand">-</span> ';
    }

    html += `<span class="tree-label">${escapeHtml(node.nodeName)}</span>`;

    // Zobrazení atributů
    if (node.attributes.length > 0) {
        const attrs = Array.from(node.attributes)
            .map(attr => `${escapeHtml(attr.name)}="${escapeHtml(attr.value)}"`)
            .join(' ');
        html += ` <span class="tree-bracket">[${attrs}]</span>`;
    }

    // Zobrazení hodnoty
    if (nodeValue && !hasChildren) {
        html += `: <span class="tree-value">${escapeHtml(nodeValue)}</span>`;
    }

    html += '</div>';

    // Rekurzivně pro děti
    if (hasChildren) {
        html += '<div class="tree-children">';
        Array.from(node.children).forEach(child => {
            html += generateTreeView(child, level + 1);
        });
        html += '</div>';
    }

    html += '</div>';

    return html;
}

function toggleTreeNode(nodeId) {
    const node = document.getElementById(nodeId);
    if (node) {
        node.classList.toggle('collapsed');
        const expandIcon = node.querySelector('.tree-expand');
        if (expandIcon && expandIcon.textContent !== '-') {
            expandIcon.textContent = node.classList.contains('collapsed') ? '▶' : '▼';
        }
    }
}

function displayRawXML() {
    const rawXML = document.getElementById('rawXML');
    rawXML.textContent = formatXML(currentIDSData.xml);
}

function formatXML(xml) {
    const PADDING = ' '.repeat(2);
    const reg = /(>)(<)(\/*)/g;
    let pad = 0;

    xml = xml.replace(reg, '$1\r\n$2$3');

    return xml.split('\r\n').map(node => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/) && pad > 0) {
            pad -= 1;
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }

        const padding = PADDING.repeat(pad);
        pad += indent;

        return padding + node;
    }).join('\r\n');
}

function switchTab(tabName) {
    // Přepnutí tabů
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Aktivace vybraného tabu
    event.target.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
}

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function loadSampleIDS() {
    const sampleXML = `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS" 
         xmlns:xs="http://www.w3.org/2001/XMLSchema" 
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ids:info>
        <ids:title>Ukázkový IDS - Komplexní požadavky</ids:title>
        <ids:copyright>BuildingSMART</ids:copyright>
        <ids:version>1.0</ids:version>
        <ids:description>Příklad IDS souboru s různými typy požadavků včetně regex</ids:description>
        <ids:author>IDS Vizualizér</ids:author>
        <ids:date>2024-01-01</ids:date>
        <ids:purpose>Demonstrace</ids:purpose>
    </ids:info>
    
    <ids:specifications>
        <ids:specification name="Protipožární vlastnosti stěn" ifcVersion="IFC4">
            <ids:applicability>
                <ids:entity>
                    <ids:name>
                        <ids:simpleValue>IfcWall</ids:simpleValue>
                    </ids:name>
                </ids:entity>
            </ids:applicability>
            <ids:requirements>
                <ids:property cardinality="required">
                    <ids:propertySet>
                        <ids:simpleValue>Pset_WallCommon</ids:simpleValue>
                    </ids:propertySet>
                    <ids:name>
                        <ids:simpleValue>FireRating</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:restriction>
                            <ids:options>
                                <ids:option>REI30</ids:option>
                                <ids:option>REI60</ids:option>
                                <ids:option>REI90</ids:option>
                                <ids:option>REI120</ids:option>
                            </ids:options>
                        </ids:restriction>
                    </ids:value>
                </ids:property>
            </ids:requirements>
        </ids:specification>
        
        <ids:specification name="Kódování místností" ifcVersion="IFC4">
            <ids:applicability>
                <ids:entity>
                    <ids:name>
                        <ids:simpleValue>IfcSpace</ids:simpleValue>
                    </ids:name>
                </ids:entity>
            </ids:applicability>
            <ids:requirements>
                <ids:attribute cardinality="required">
                    <ids:name>
                        <ids:simpleValue>Name</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:restriction>
                            <ids:pattern>^[A-Z]{3}\\d{3}$</ids:pattern>
                        </ids:restriction>
                    </ids:value>
                </ids:attribute>
                <ids:property cardinality="required">
                    <ids:propertySet>
                        <ids:simpleValue>Pset_SpaceCommon</ids:simpleValue>
                    </ids:propertySet>
                    <ids:name>
                        <ids:simpleValue>Reference</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:restriction>
                            <ids:pattern>^\\d{2}-[A-Z]{2}-\\d{4}$</ids:pattern>
                        </ids:restriction>
                    </ids:value>
                </ids:property>
            </ids:requirements>
        </ids:specification>
        
        <ids:specification name="Nosné stěny" ifcVersion="IFC4">
            <ids:applicability>
                <ids:entity>
                    <ids:name>
                        <ids:simpleValue>IfcWall</ids:simpleValue>
                    </ids:name>
                </ids:entity>
                <ids:property>
                    <ids:propertySet>
                        <ids:simpleValue>Pset_WallCommon</ids:simpleValue>
                    </ids:propertySet>
                    <ids:name>
                        <ids:simpleValue>LoadBearing</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:simpleValue>TRUE</ids:simpleValue>
                    </ids:value>
                </ids:property>
            </ids:applicability>
            <ids:requirements>
                <ids:material cardinality="required">
                    <ids:value>
                        <ids:restriction>
                            <ids:options>
                                <ids:option>Beton</ids:option>
                                <ids:option>Železobeton</ids:option>
                                <ids:option>Cihla</ids:option>
                            </ids:options>
                        </ids:restriction>
                    </ids:value>
                </ids:material>
                <ids:property cardinality="required">
                    <ids:propertySet>
                        <ids:simpleValue>Pset_WallCommon</ids:simpleValue>
                    </ids:propertySet>
                    <ids:name>
                        <ids:simpleValue>ThermalTransmittance</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:restriction>
                            <ids:maxInclusive>0.3</ids:maxInclusive>
                        </ids:restriction>
                    </ids:value>
                </ids:property>
            </ids:requirements>
        </ids:specification>
        
        <ids:specification name="Identifikace zařízení" ifcVersion="IFC4">
            <ids:applicability>
                <ids:entity>
                    <ids:name>
                        <ids:restriction>
                            <ids:pattern>^IfcFlow.*Terminal$</ids:pattern>
                        </ids:restriction>
                    </ids:name>
                </ids:entity>
            </ids:applicability>
            <ids:requirements>
                <ids:attribute cardinality="required">
                    <ids:name>
                        <ids:simpleValue>Tag</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:restriction>
                            <ids:pattern>^[A-Z]{2}-\\d{4}-[A-Z]\\d{2}$</ids:pattern>
                        </ids:restriction>
                    </ids:value>
                </ids:attribute>
                <ids:property cardinality="optional">
                    <ids:propertySet>
                        <ids:simpleValue>Pset_ManufacturerTypeInformation</ids:simpleValue>
                    </ids:propertySet>
                    <ids:name>
                        <ids:simpleValue>ModelReference</ids:simpleValue>
                    </ids:name>
                    <ids:value>
                        <ids:restriction>
                            <ids:minLength>5</ids:minLength>
                            <ids:maxLength>20</ids:maxLength>
                        </ids:restriction>
                    </ids:value>
                </ids:property>
            </ids:requirements>
        </ids:specification>
    </ids:specifications>
</ids:ids>`;

    parseIDS(sampleXML);
}

// Initialize IDS Editor
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing IDS Editor...');
    if (typeof idsEditorCore !== 'undefined') {
        idsEditorCore.initialize();
        console.log('IDS Editor initialized');
    } else {
        console.error('idsEditorCore not found!');
    }
});

// Connect existing parseIDS with editor
const originalParseIDS = parseIDS;
parseIDS = function(xmlText) {
    console.log('parseIDS called');
    const result = originalParseIDS(xmlText);

    // Load into editor if available
    if (typeof idsEditorCore !== 'undefined' && typeof currentIDSData !== 'undefined') {
        console.log('Loading data into editor...', currentIDSData);
        const parsedData = {
            title: currentIDSData.info.title,
            copyright: currentIDSData.info.copyright,
            version: currentIDSData.info.version,
            description: currentIDSData.info.description,
            author: currentIDSData.info.author,
            date: currentIDSData.info.date,
            purpose: currentIDSData.info.purpose,
            milestone: currentIDSData.info.milestone,
            specifications: currentIDSData.specifications
        };
        idsEditorCore.loadIDS(parsedData);
        console.log('Data loaded into editor');
    } else {
        console.error('Editor or currentIDSData not available', {
            editor: typeof idsEditorCore,
            data: typeof currentIDSData
        });
    }

    // Dispatch event for wizard
    window.dispatchEvent(new CustomEvent('ids:loaded'));

    return result;
};
// Storage variables
let idsStorageDB = null;
let idsStorageData = null;
let expandedIdsStorageFolders = new Set(['root']);
let selectedIdsFile = null;

// Initialize IndexedDB
async function initIdsStorageDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('bim_checker_storage', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('storage')) {
                db.createObjectStore('storage', { keyPath: 'key' });
            }
        };
    });
}

// Open storage picker modal
async function openStoragePicker() {
    if (!idsStorageDB) {
        idsStorageDB = await initIdsStorageDB();
    }

    selectedIdsFile = null;
    expandedIdsStorageFolders = new Set(['root']);
    await renderIdsStorageTree();
    document.getElementById('idsStorageModal').classList.add('active');
}

// Close storage picker modal
function closeIdsStoragePicker() {
    document.getElementById('idsStorageModal').classList.remove('active');
}

// Toggle folder expand/collapse
function toggleIdsStorageFolder(folderId) {
    if (expandedIdsStorageFolders.has(folderId)) {
        expandedIdsStorageFolders.delete(folderId);
    } else {
        expandedIdsStorageFolders.add(folderId);
    }
    renderIdsStorageTree();
}

// Render storage tree
async function renderIdsStorageTree() {
    try {
        const transaction = idsStorageDB.transaction(['storage'], 'readonly');
        const store = transaction.objectStore('storage');
        const request = store.get('ids_files');

        request.onsuccess = () => {
            idsStorageData = request.result?.value;

            if (!idsStorageData || !idsStorageData.files || Object.keys(idsStorageData.files).length === 0) {
                document.getElementById('idsStorageFileTree').innerHTML = `<p class="storage-empty-message">${escapeHtml(t('parser.storage.noFiles'))}</p>`;
                return;
            }

            const html = renderIdsStorageFolderRecursive('root', 0);
            document.getElementById('idsStorageFileTree').innerHTML = html;
            updateSelectedIdsFileName();
        };

        request.onerror = () => {
            console.error('Error loading storage:', request.error);
            document.getElementById('idsStorageFileTree').innerHTML = `<p class="storage-error-message">${escapeHtml(t('parser.storage.error'))}</p>`;
        };
    } catch (e) {
        console.error('Error loading storage:', e);
        document.getElementById('idsStorageFileTree').innerHTML = `<p class="storage-error-message">${escapeHtml(t('parser.storage.error'))}</p>`;
    }
}

// Render folder recursively
function renderIdsStorageFolderRecursive(folderId, level) {
    const folder = idsStorageData.folders[folderId];
    if (!folder) {
        return '';
    }

    const isExpanded = expandedIdsStorageFolders.has(folderId);
    const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
    const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';

    let html = '';

    // Folder header (only if not root)
    if (folderId !== 'root') {
        const allFolderFiles = getAllIdsFilesInFolder(folderId);

        html += `
                    <div style="margin-bottom: 8px;">
                        <div class="tree-folder-header" style="margin-left: ${level * 20}px;">
                            <span data-action="toggle-ids-storage-folder" data-folder-id="${escapeHtml(folderId)}" class="tree-folder-arrow">${arrow}</span>
                            <span data-action="toggle-ids-storage-folder" data-folder-id="${escapeHtml(folderId)}" class="tree-folder-name">
                                📁 ${escapeHtml(folder.name)}
                                ${allFolderFiles.length > 0 ? `<span class="tree-folder-count">(${allFolderFiles.length} ${escapeHtml(t('parser.storage.fileCount'))})</span>` : ''}
                            </span>
                        </div>
                `;
    }

    // Content (only if expanded)
    if (isExpanded) {
        // Render child folders first
        if (folder.children && folder.children.length > 0) {
            const sortedChildren = folder.children
                .map(id => idsStorageData.folders[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            sortedChildren.forEach(childFolder => {
                html += renderIdsStorageFolderRecursive(childFolder.id, level + 1);
            });
        }

        // Render files
        if (folder.files && folder.files.length > 0) {
            const files = folder.files
                .map(id => idsStorageData.files[id])
                .filter(f => f)
                .sort((a, b) => a.name.localeCompare(b.name));

            files.forEach(file => {
                const isSelected = selectedIdsFile === file.id;
                const sizeKB = (file.size / 1024).toFixed(1);
                html += `
                            <div class="tree-file-item ${isSelected ? 'selected' : ''}"
                                 data-action="select-ids-file" data-file-id="${escapeHtml(file.id)}"
                                 style="margin-left: ${(level + 1) * 20}px;">
                                <input type="radio" name="idsFileSelection" ${isSelected ? 'checked' : ''} data-action="select-ids-file-radio" data-file-id="${escapeHtml(file.id)}" style="margin-right: 10px;">
                                <span class="tree-file-name">📄 ${escapeHtml(file.name)}</span>
                                <span class="tree-file-size">${escapeHtml(sizeKB)} KB</span>
                            </div>
                        `;
            });
        }
    }

    if (folderId !== 'root') {
        html += '</div>';
    }

    return html;
}

// Get all files in folder recursively
function getAllIdsFilesInFolder(folderId) {
    const folder = idsStorageData.folders[folderId];
    if (!folder) {
        return [];
    }

    let files = [...(folder.files || [])];

    if (folder.children) {
        folder.children.forEach(childId => {
            files = files.concat(getAllIdsFilesInFolder(childId));
        });
    }

    return files;
}

// Select IDS file
function selectIdsFile(fileId) {
    selectedIdsFile = fileId;
    renderIdsStorageTree();
}

// Update selected file name display
function updateSelectedIdsFileName() {
    const display = document.getElementById('selectedIdsFileName');
    if (selectedIdsFile && idsStorageData.files[selectedIdsFile]) {
        display.textContent = idsStorageData.files[selectedIdsFile].name;
        display.classList.add('file-selected');
    } else {
        display.textContent = t('parser.storage.none');
        display.classList.remove('file-selected');
    }
}

// Load selected IDS file from storage
async function loadSelectedIdsFromStorage() {
    if (!selectedIdsFile) {
        alert(t('validator.error.selectIds'));
        return;
    }

    const fileMetadata = idsStorageData.files[selectedIdsFile];
    if (!fileMetadata) {
        alert(t('validator.error.fileNotFound'));
        return;
    }

    try {
        // Load file content separately (NEW: separate storage optimization!)
        const contentTransaction = idsStorageDB.transaction(['storage'], 'readonly');
        const contentStore = contentTransaction.objectStore('storage');
        const contentRequest = contentStore.get(`ids_files_file_${selectedIdsFile}`);

        const fileContent = await new Promise((resolve, reject) => {
            contentRequest.onsuccess = () => resolve(contentRequest.result?.value);
            contentRequest.onerror = () => reject(contentRequest.error);
        });

        if (fileContent) {
            closeIdsStoragePicker();
            parseIDS(fileContent);
        } else {
            alert(t('validator.error.fileNotFound'));
        }
    } catch (e) {
        console.error('Error loading file content:', e);
        alert(t('validator.error.fileNotFound'));
    }
}

// Click on overlay to close
document.getElementById('idsStorageModal').addEventListener('click', (e) => {
    if (e.target.id === 'idsStorageModal') {
        closeIdsStoragePicker();
    }
});

// Re-render content when language changes
window.addEventListener('languageChanged', () => {
    if (currentIDSData) {
        displayInfo();
        displaySpecifications();
    }
});

// Event delegation for dynamically generated content
document.addEventListener('click', (e) => {
    const target = e.target;
    const actionElement = target.closest('[data-action]');

    if (!actionElement) {
        return;
    }

    const action = actionElement.dataset.action;

    switch (action) {
        case 'toggle-info-section':
            toggleInfoSection();
            break;

        case 'expand-all-specs':
            expandAllSpecs();
            break;

        case 'collapse-all-specs':
            collapseAllSpecs();
            break;

        case 'toggle-specification': {
            const index = parseInt(actionElement.dataset.specIndex, 10);
            if (!isNaN(index)) {
                toggleSpecification(index);
            }
            break;
        }

        case 'toggle-tree-node': {
            const nodeId = actionElement.dataset.nodeId;
            if (nodeId) {
                toggleTreeNode(nodeId);
            }
            break;
        }

        case 'toggle-ids-storage-folder': {
            const folderId = actionElement.dataset.folderId;
            if (folderId) {
                toggleIdsStorageFolder(folderId);
            }
            break;
        }

        case 'select-ids-file': {
            const fileId = actionElement.dataset.fileId;
            if (fileId) {
                selectIdsFile(fileId);
            }
            break;
        }

        case 'select-ids-file-radio': {
            e.stopPropagation();
            e.preventDefault();
            const fileId = actionElement.dataset.fileId;
            if (fileId) {
                selectIdsFile(fileId);
            }
            break;
        }
    }
});
