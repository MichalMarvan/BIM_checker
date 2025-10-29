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
                showError('Prosím vyberte IDS nebo XML soubor');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    parseIDS(e.target.result);
                } catch (error) {
                    showError('Chyba při parsování souboru: ' + error.message);
                }
            };
            reader.readAsText(file);
        }
        
        function parseIDS(xmlString) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            
            // Kontrola chyb parsování
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
                showError('Neplatný XML soubor');
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
                info.title = infoElement.querySelector('title')?.textContent || 'Bez názvu';
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
                    name: spec.getAttribute('name') || `Specifikace ${index + 1}`,
                    ifcVersion: spec.getAttribute('ifcVersion') || 'Nespecifikováno',
                    applicability: extractFacets(spec.querySelector('applicability')),
                    requirements: extractFacets(spec.querySelector('requirements'))
                };
                specifications.push(specification);
            });
            
            return specifications;
        }
        
        function extractFacets(facetsElement) {
            if (!facetsElement) return [];
            
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
            const baseNameElem = element.querySelector('baseName'); // Pro váš formát

            if (type === 'property') {
                // Pro property používáme baseName místo name
                if (baseNameElem) {
                    facet.baseName = extractValue(baseNameElem);
                } else if (nameElem) {
                    facet.baseName = extractValue(nameElem);
                }
            } else {
                // Pro ostatní facety používáme name
                if (nameElem) {
                    facet.name = extractValue(nameElem);
                } else if (baseNameElem) {
                    facet.name = extractValue(baseNameElem);
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
            
            // minOccurs/maxOccurs
            const minOccurs = element.getAttribute('minOccurs');
            const maxOccurs = element.getAttribute('maxOccurs');
            if (minOccurs) facet.minOccurs = minOccurs;
            if (maxOccurs) facet.maxOccurs = maxOccurs;
            
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
            
            // Options (enumeration)
            const options = restriction.querySelectorAll('option');
            if (options.length > 0) {
                result.options = Array.from(options).map(opt => opt.textContent);
            }
            
            // Bounds (numeric ranges)
            const minInclusive = restriction.querySelector('minInclusive');
            const maxInclusive = restriction.querySelector('maxInclusive');
            const minExclusive = restriction.querySelector('minExclusive');
            const maxExclusive = restriction.querySelector('maxExclusive');
            
            if (minInclusive) result.minInclusive = minInclusive.textContent;
            if (maxInclusive) result.maxInclusive = maxInclusive.textContent;
            if (minExclusive) result.minExclusive = minExclusive.textContent;
            if (maxExclusive) result.maxExclusive = maxExclusive.textContent;
            
            // Length restrictions
            const minLength = restriction.querySelector('minLength');
            const maxLength = restriction.querySelector('maxLength');
            const length = restriction.querySelector('length');
            
            if (minLength) result.minLength = minLength.textContent;
            if (maxLength) result.maxLength = maxLength.textContent;
            if (length) result.length = length.textContent;
            
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
                infoContent += `<div class="info-item"><div class="info-label">Název</div><div class="info-value">${info.title}</div></div>`;
                hasInfo = true;
            }
            if (info.version) {
                infoContent += `<div class="info-item"><div class="info-label">Verze</div><div class="info-value">${info.version}</div></div>`;
                hasInfo = true;
            }
            if (info.author) {
                infoContent += `<div class="info-item"><div class="info-label">Autor</div><div class="info-value">${info.author}</div></div>`;
                hasInfo = true;
            }
            if (info.date) {
                infoContent += `<div class="info-item"><div class="info-label">Datum</div><div class="info-value">${info.date}</div></div>`;
                hasInfo = true;
            }
            if (info.purpose) {
                infoContent += `<div class="info-item"><div class="info-label">Účel</div><div class="info-value">${info.purpose}</div></div>`;
                hasInfo = true;
            }
            if (info.milestone) {
                infoContent += `<div class="info-item"><div class="info-label">Milestone</div><div class="info-value">${info.milestone}</div></div>`;
                hasInfo = true;
            }
            
            infoContent += '</div>';
            
            if (info.description) {
                infoContent += `<div class="info-item" style="margin-top: 1rem;"><div class="info-label">Popis</div><div class="info-value">${info.description}</div></div>`;
                hasInfo = true;
            }
            
            const infoHTML = `
                <div style="cursor: pointer;" onclick="toggleInfoSection()">
                    <h3 style="user-select: none; display: flex; align-items: center; gap: 0.5rem;">
                        <span class="expand-icon" id="info-expand" style="font-size: 0.875rem;">▼</span>
                        📋 Informace o IDS souboru
                    </h3>
                </div>
                <div id="info-content">
                    ${hasInfo ? infoContent : '<p style="color: #718096;">Žádné informace nejsou k dispozici</p>'}
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
                    <h3 style="margin: 0;">📐 Specifikace (${specs.length})</h3>
                    <div>
                        <button class="sample-button" style="padding: 0.5rem 1rem; font-size: 0.875rem;" onclick="expandAllSpecs()">Rozbalit vše</button>
                        <button class="sample-button" style="padding: 0.5rem 1rem; font-size: 0.875rem; background: #e2e8f0; color: #4a5568;" onclick="collapseAllSpecs()">Sbalit vše</button>
                    </div>
                </div>
            `;
            
            specs.forEach((spec, index) => {
                html += `
                    <div class="specification-card collapsed" id="spec-${index}">
                        <div class="spec-header" onclick="toggleSpecification(${index})">
                            <h4>
                                <span class="expand-icon">▶</span>
                                ${spec.name}
                            </h4>
                            <span class="spec-badge">IFC ${spec.ifcVersion}</span>
                        </div>
                        <div class="spec-content">
                            <div class="facet-section">
                                <div class="facet-header">
                                    <span class="facet-icon applicability-icon">✓</span>
                                    Použitelnost (Applicability)
                                </div>
                                ${formatFacets(spec.applicability)}
                            </div>
                            <div class="facet-section">
                                <div class="facet-header">
                                    <span class="facet-icon requirements-icon">!</span>
                                    Požadavky (Requirements)
                                </div>
                                ${formatFacets(spec.requirements)}
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
        
        function formatFacets(facets) {
            if (!facets || facets.length === 0) {
                return '<div class="facet-item">Žádné facety</div>';
            }
            
            return facets.map(facet => {
                let html = '<div class="facet-item">';
                html += `<div class="facet-type">${getFacetTypeName(facet.type)}</div>`;
                html += '<div class="facet-details">';
                
                // Zobrazení názvu
                if (facet.name) {
                    html += `Název: <span class="facet-value">${formatValue(facet.name)}</span><br>`;
                }
                
                // Zobrazení property setu
                if (facet.propertySet) {
                    html += `Property Set: <span class="facet-value">${formatValue(facet.propertySet)}</span><br>`;
                }
                
                // Zobrazení hodnoty
                if (facet.value) {
                    html += `Hodnota: <span class="facet-value">${formatValue(facet.value)}</span>`;
                }
                
                // Zobrazení relace
                if (facet.relation) {
                    html += `Relace: <span class="facet-value">${formatValue(facet.relation)}</span>`;
                }
                
                // Zobrazení systému
                if (facet.system) {
                    html += `Systém: <span class="facet-value">${formatValue(facet.system)}</span>`;
                }
                
                // Zobrazení predefined type
                if (facet.predefinedType) {
                    html += `<br>Předdefinovaný typ: <span class="facet-value">${formatValue(facet.predefinedType)}</span>`;
                }
                
                // Zobrazení kardinality
                if (facet.cardinality !== 'required') {
                    html += `<br>Kardinalita: <span class="facet-value">${facet.cardinality}</span>`;
                }
                
                html += '</div></div>';
                return html;
            }).join('');
        }
        
        function formatValue(value) {
            if (value.type === 'simple') {
                return value.value;
            } else if (value.type === 'restriction') {
                let result = '';
                if (value.isRegex && value.pattern) {
                    // Regex pattern display
                    result = `<div class="regex-label">
                        <span class="regex-icon">🔍</span> 
                        Regulární výraz (regex):
                        <span class="regex-help">
                            <span class="regex-help-icon">?</span>
                            <div class="regex-tooltip">
                                <strong>Regex znaky:</strong>
                                <table>
                                    <tr><td>^</td><td>Začátek řetězce</td></tr>
                                    <tr><td>$</td><td>Konec řetězce</td></tr>
                                    <tr><td>.</td><td>Jakýkoliv znak</td></tr>
                                    <tr><td>*</td><td>0 nebo více</td></tr>
                                    <tr><td>+</td><td>1 nebo více</td></tr>
                                    <tr><td>?</td><td>0 nebo 1</td></tr>
                                    <tr><td>[A-Z]</td><td>Velká písmena</td></tr>
                                    <tr><td>[a-z]</td><td>Malá písmena</td></tr>
                                    <tr><td>\\d</td><td>Číslice</td></tr>
                                    <tr><td>\\w</td><td>Písmeno/číslice/_</td></tr>
                                    <tr><td>{n}</td><td>Přesně n výskytů</td></tr>
                                    <tr><td>{n,m}</td><td>n až m výskytů</td></tr>
                                </table>
                            </div>
                        </span>
                    </div>`;
                    result += `<div class="regex-pattern">${escapeHtml(value.pattern)}</div>`;
                    
                    // Try to explain common regex patterns
                    const explanation = explainRegex(value.pattern);
                    if (explanation) {
                        result += `<div style="margin-top: 0.5rem; font-size: 0.875rem; color: #718096;">
                            <strong>Vysvětlení:</strong> ${explanation}
                        </div>`;
                    }
                } else if (value.options) {
                    result = `Možnosti: <ul class="restriction-list">`;
                    value.options.forEach(opt => {
                        result += `<li>${opt}</li>`;
                    });
                    result += '</ul>';
                } else if (value.minInclusive || value.maxInclusive) {
                    result = `Rozsah: ${value.minInclusive || '-∞'} až ${value.maxInclusive || '+∞'}`;
                } else if (value.minExclusive || value.maxExclusive) {
                    result = `Rozsah: >${value.minExclusive || '-∞'} až <${value.maxExclusive || '+∞'}`;
                } else if (value.minLength || value.maxLength || value.length) {
                    if (value.length) {
                        result = `Přesná délka: ${value.length} znaků`;
                    } else {
                        result = `Délka: ${value.minLength || '0'} až ${value.maxLength || '∞'} znaků`;
                    }
                }
                return result;
            }
            return value.value || '';
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
            // Common regex patterns explanation
            const explanations = {
                '^[A-Z]{3}\\d{3}$': 'Přesně 3 velká písmena následovaná 3 číslicemi',
                '^\\d+$': 'Pouze číslice (jedno nebo více)',
                '^[A-Za-z]+$': 'Pouze písmena (jedno nebo více)',
                '^\\d{4}-\\d{2}-\\d{2}$': 'Datum ve formátu YYYY-MM-DD',
                '^[\\w\\s]+$': 'Písmena, číslice, podtržítka a mezery',
                '^\\w+@\\w+\\.\\w+$': 'Základní formát emailové adresy',
                '^\\+?\\d{1,3}[- ]?\\d{3}[- ]?\\d{3}[- ]?\\d{3}$': 'Telefonní číslo s volitelnou předvolbou',
                '^SO\\d{6}': 'Začíná "SO" následováno 6 číslicemi',
                '^[a-zá-ž].*$': 'Začíná malým písmenem (včetně českých znaků)',
                'PDPS': 'Přesně text "PDPS"',
                'OTSKP': 'Přesně text "OTSKP"',
                'CCI': 'Přesně text "CCI"',
                'R': 'Přesně písmeno "R"',
                'sejmutí ornice': 'Přesně text "sejmutí ornice"'
            };
            
            if (explanations[pattern]) {
                return explanations[pattern];
            }
            
            // Try to provide generic explanation based on pattern components
            let explanation = '';
            if (pattern.startsWith('^') && pattern.endsWith('$')) {
                explanation = 'Musí odpovídat celému řetězci. ';
            } else if (pattern.startsWith('^')) {
                explanation = 'Začíná: ';
            }
            
            // Czech characters
            if (pattern.includes('á-ž') || pattern.includes('Á-Ž')) {
                explanation += 'Obsahuje české znaky. ';
            }
            
            if (pattern.includes('\\d')) {
                explanation += 'Obsahuje číslice. ';
            }
            if (pattern.includes('[A-Z]') || pattern.includes('[a-z]')) {
                explanation += 'Obsahuje písmena. ';
            }
            if (pattern.includes('+')) {
                explanation += 'Jeden nebo více výskytů. ';
            }
            if (pattern.includes('*')) {
                explanation += 'Nula nebo více výskytů. ';
            }
            if (pattern.includes('?')) {
                explanation += 'Volitelná část. ';
            }
            if (pattern.includes('.*')) {
                explanation += 'Libovolný text. ';
            }
            if (pattern.includes('{')) {
                const match = pattern.match(/\{(\d+)(,(\d+)?)?\}/);
                if (match) {
                    if (match[3]) {
                        explanation += `${match[1]} až ${match[3]} výskytů. `;
                    } else if (match[2]) {
                        explanation += `Minimálně ${match[1]} výskytů. `;
                    } else {
                        explanation += `Přesně ${match[1]} výskytů. `;
                    }
                }
            }
            
            return explanation.trim() || null;
        }
        
        function getFacetTypeName(type) {
            const typeNames = {
                'entity': '🏗️ Entita',
                'partOf': '🔗 Část',
                'classification': '📑 Klasifikace',
                'attribute': '📌 Atribut',
                'property': '🏷️ Vlastnost',
                'material': '🧱 Materiál'
            };
            return typeNames[type] || type;
        }
        
        function displayTree() {
            const treeView = document.getElementById('treeView');
            const tree = generateTreeView(currentIDSData.doc.documentElement, 0);
            treeView.innerHTML = tree;
        }
        
        function generateTreeView(node, level) {
            if (node.nodeType !== 1) return ''; // Pouze element nodes
            
            let html = '';
            const hasChildren = node.children.length > 0;
            const nodeValue = node.childNodes.length === 1 && node.childNodes[0].nodeType === 3 ? node.textContent.trim() : '';
            const nodeId = 'node-' + Math.random().toString(36).substr(2, 9);
            
            html += `<div class="tree-node ${level === 0 ? 'tree-root' : ''} ${hasChildren && level > 0 ? 'collapsed' : ''}" id="${nodeId}">`;
            html += `<div onclick="toggleTreeNode('${nodeId}')" style="margin-left: ${level * 20}px">`;
            
            if (hasChildren) {
                html += `<span class="tree-expand">${level > 0 ? '▶' : '▼'}</span> `;
            } else {
                html += `<span class="tree-expand">-</span> `;
            }
            
            html += `<span class="tree-label">${node.nodeName}</span>`;
            
            // Zobrazení atributů
            if (node.attributes.length > 0) {
                const attrs = Array.from(node.attributes)
                    .map(attr => `${attr.name}="${attr.value}"`)
                    .join(' ');
                html += ` <span class="tree-bracket">[${attrs}]</span>`;
            }
            
            // Zobrazení hodnoty
            if (nodeValue && !hasChildren) {
                html += `: <span class="tree-value">${nodeValue}</span>`;
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
            document.getElementById('idsStorageModal').style.display = 'flex';
        }

        // Close storage picker modal
        function closeIdsStoragePicker() {
            document.getElementById('idsStorageModal').style.display = 'none';
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
                const request = store.get('bim_checker_ids_storage');

                request.onsuccess = () => {
                    idsStorageData = request.result?.value;

                    if (!idsStorageData || !idsStorageData.files || Object.keys(idsStorageData.files).length === 0) {
                        document.getElementById('idsStorageFileTree').innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 40px;">Žádné IDS soubory v úložišti</p>';
                        return;
                    }

                    const html = renderIdsStorageFolderRecursive('root', 0);
                    document.getElementById('idsStorageFileTree').innerHTML = html;
                    updateSelectedIdsFileName();
                };

                request.onerror = () => {
                    console.error('Error loading storage:', request.error);
                    document.getElementById('idsStorageFileTree').innerHTML = '<p style="color: red;">Chyba při načítání úložiště</p>';
                };
            } catch (e) {
                console.error('Error loading storage:', e);
                document.getElementById('idsStorageFileTree').innerHTML = '<p style="color: red;">Chyba při načítání úložiště</p>';
            }
        }

        // Render folder recursively
        function renderIdsStorageFolderRecursive(folderId, level) {
            const folder = idsStorageData.folders[folderId];
            if (!folder) return '';

            const isExpanded = expandedIdsStorageFolders.has(folderId);
            const hasChildren = (folder.children && folder.children.length > 0) || (folder.files && folder.files.length > 0);
            const arrow = hasChildren ? (isExpanded ? '▼' : '▶') : '';

            let html = '';

            // Folder header (only if not root)
            if (folderId !== 'root') {
                const allFolderFiles = getAllIdsFilesInFolder(folderId);

                html += `
                    <div style="margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; padding: 8px; background: #f0f0f0; border-radius: 6px; cursor: pointer; margin-left: ${level * 20}px;">
                            <span onclick="toggleIdsStorageFolder('${folderId}')" style="margin-right: 8px; color: #667eea; font-weight: bold; width: 16px; display: inline-block;">${arrow}</span>
                            <span onclick="toggleIdsStorageFolder('${folderId}')" style="flex: 1; font-weight: 600; color: #2d3748;">
                                📁 ${folder.name}
                                ${allFolderFiles.length > 0 ? `<span style="color: #a0aec0; font-size: 0.9em; margin-left: 8px;">(${allFolderFiles.length} souborů)</span>` : ''}
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
                            <div class="storage-file-item ${isSelected ? 'selected' : ''}"
                                 onclick="selectIdsFile('${file.id}')"
                                 style="padding: 8px; margin: 4px 0; cursor: pointer; border-radius: 6px; background: white; border: 2px solid ${isSelected ? '#667eea' : '#e9ecef'}; display: flex; align-items: center; margin-left: ${(level + 1) * 20}px; transition: all 0.2s;">
                                <input type="radio" name="idsFileSelection" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); event.preventDefault(); selectIdsFile('${file.id}');" style="margin-right: 10px;">
                                <span style="flex: 1;">📄 ${file.name}</span>
                                <span style="color: #a0aec0; font-size: 0.9em;">${sizeKB} KB</span>
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
            if (!folder) return [];

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
                display.style.color = '#667eea';
                display.style.fontWeight = '600';
            } else {
                display.textContent = 'Žádný';
                display.style.color = '#6c757d';
                display.style.fontWeight = 'normal';
            }
        }

        // Load selected IDS file from storage
        function loadSelectedIdsFromStorage() {
            if (!selectedIdsFile) {
                alert('Vyberte IDS soubor!');
                return;
            }

            const file = idsStorageData.files[selectedIdsFile];
            if (!file) {
                alert('Soubor nenalezen!');
                return;
            }

            closeIdsStoragePicker();
            parseIDS(file.content);
        }

        // Click on overlay to close
        document.getElementById('idsStorageModal').addEventListener('click', (e) => {
            if (e.target.id === 'idsStorageModal') {
                closeIdsStoragePicker();
            }
        });
