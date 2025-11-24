/* ===========================================
   BIM CHECKER - VIRTUAL TREE VIEW
   Efficient tree rendering for large datasets
   =========================================== */

class VirtualTreeView {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            itemHeight: options.itemHeight || 30,
            visibleItems: options.visibleItems || 20,
            renderItem: options.renderItem || this.defaultRenderItem,
            onSelect: options.onSelect || (() => {}),
            onExpand: options.onExpand || (() => {}),
            onCollapse: options.onCollapse || (() => {}),
            ...options
        };
        
        this.data = [];
        this.flatData = [];
        this.expandedNodes = new Set();
        this.selectedNodes = new Set();
        this.scrollTop = 0;
        this.startIndex = 0;
        this.endIndex = 0;
        
        this.init();
    }

    init() {
        // Create structure
        this.container.innerHTML = `
            <div class="virtual-tree" style="position: relative; overflow-y: auto; height: 100%;">
                <div class="virtual-tree-scroll" style="position: relative;">
                    <div class="virtual-tree-content" style="position: absolute; top: 0; left: 0; right: 0;"></div>
                </div>
            </div>
        `;
        
        this.treeElement = this.container.querySelector('.virtual-tree');
        this.scrollElement = this.container.querySelector('.virtual-tree-scroll');
        this.contentElement = this.container.querySelector('.virtual-tree-content');
        
        // Set up event listeners
        this.treeElement.addEventListener('scroll', this.handleScroll.bind(this));
        this.contentElement.addEventListener('click', this.handleClick.bind(this));
    }

    setData(data) {
        this.data = data;
        this.flattenData();
        this.render();
    }

    flattenData() {
        this.flatData = [];
        
        const flatten = (nodes, level = 0, parent = null) => {
            for (let node of nodes) {
                const flatNode = {
                    ...node,
                    level,
                    parent,
                    visible: parent ? this.expandedNodes.has(parent.id) : true
                };
                
                this.flatData.push(flatNode);
                
                if (node.children && this.expandedNodes.has(node.id)) {
                    flatten(node.children, level + 1, node);
                }
            }
        };
        
        flatten(this.data);
    }

    handleScroll() {
        this.scrollTop = this.treeElement.scrollTop;
        this.render();
    }

    handleClick(event) {
        const target = event.target;
        const nodeElement = target.closest('.tree-node');
        
        if (!nodeElement) return;
        
        const nodeId = nodeElement.dataset.id;
        const node = this.flatData.find(n => n.id === nodeId);
        
        if (!node) return;
        
        // Handle expand/collapse
        if (target.classList.contains('tree-expand')) {
            this.toggleExpand(node);
        }
        // Handle selection
        else {
            this.selectNode(node);
        }
    }

    toggleExpand(node) {
        if (this.expandedNodes.has(node.id)) {
            this.expandedNodes.delete(node.id);
            this.options.onCollapse(node);
        } else {
            this.expandedNodes.add(node.id);
            this.options.onExpand(node);
        }
        
        this.flattenData();
        this.render();
    }

    selectNode(node) {
        // Clear previous selection if single select
        if (!this.options.multiSelect) {
            this.selectedNodes.clear();
        }
        
        if (this.selectedNodes.has(node.id)) {
            this.selectedNodes.delete(node.id);
        } else {
            this.selectedNodes.add(node.id);
        }
        
        this.options.onSelect(node, this.selectedNodes);
        this.render();
    }

    render() {
        // Get visible nodes
        const visibleNodes = this.flatData.filter(node => {
            let current = node;
            while (current.parent) {
                if (!this.expandedNodes.has(current.parent.id)) {
                    return false;
                }
                current = current.parent;
            }
            return true;
        });
        
        // Calculate visible range
        const totalHeight = visibleNodes.length * this.options.itemHeight;
        const viewportHeight = this.treeElement.clientHeight;
        
        this.startIndex = Math.floor(this.scrollTop / this.options.itemHeight);
        this.endIndex = Math.min(
            visibleNodes.length,
            this.startIndex + Math.ceil(viewportHeight / this.options.itemHeight) + 1
        );
        
        // Set scroll height
        this.scrollElement.style.height = `${totalHeight}px`;
        
        // Render visible items
        let html = '';
        for (let i = this.startIndex; i < this.endIndex; i++) {
            const node = visibleNodes[i];
            if (!node) continue;
            
            const top = i * this.options.itemHeight;
            html += this.renderNode(node, top);
        }
        
        this.contentElement.innerHTML = html;
    }

    renderNode(node, top) {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node.id);
        const isSelected = this.selectedNodes.has(node.id);
        
        const indent = node.level * 20;
        const expandIcon = hasChildren ? 
            (isExpanded ? '▼' : '▶') : '&nbsp;';
        
        return `
            <div class="tree-node ${isSelected ? 'selected' : ''}" 
                 data-id="${node.id}"
                 style="position: absolute; top: ${top}px; left: 0; right: 0; height: ${this.options.itemHeight}px; padding-left: ${indent}px;">
                <span class="tree-expand">${expandIcon}</span>
                <span class="tree-icon">${node.icon || '📄'}</span>
                <span class="tree-label">${node.label || node.name}</span>
                ${node.badge ? `<span class="tree-badge">${node.badge}</span>` : ''}
            </div>
        `;
    }

    defaultRenderItem(node) {
        return node.label || node.name || node.id;
    }

    expandAll() {
        const addToExpanded = (nodes) => {
            for (let node of nodes) {
                if (node.children && node.children.length > 0) {
                    this.expandedNodes.add(node.id);
                    addToExpanded(node.children);
                }
            }
        };
        
        addToExpanded(this.data);
        this.flattenData();
        this.render();
    }

    collapseAll() {
        this.expandedNodes.clear();
        this.flattenData();
        this.render();
    }

    search(query) {
        const results = [];
        const searchInNodes = (nodes, path = []) => {
            for (let node of nodes) {
                const currentPath = [...path, node];
                
                if (node.label && node.label.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        node,
                        path: currentPath
                    });
                }
                
                if (node.children) {
                    searchInNodes(node.children, currentPath);
                }
            }
        };
        
        searchInNodes(this.data);
        
        // Expand paths to results
        for (let result of results) {
            for (let node of result.path) {
                if (node.children) {
                    this.expandedNodes.add(node.id);
                }
            }
        }
        
        this.flattenData();
        this.render();
        
        return results;
    }

    getSelectedNodes() {
        return Array.from(this.selectedNodes).map(id => 
            this.flatData.find(node => node.id === id)
        ).filter(Boolean);
    }

    destroy() {
        this.treeElement.removeEventListener('scroll', this.handleScroll);
        this.contentElement.removeEventListener('click', this.handleClick);
        this.container.innerHTML = '';
    }
}

// Export for use
window.VirtualTreeView = VirtualTreeView;
