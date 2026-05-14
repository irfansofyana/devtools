/**
 * Devtools — homepage search, category sidebar, keyboard shortcuts.
 *
 * Behaviour:
 * - Reads `data-category` from each `.tool-card` in the HTML (no DOM injection
 *   of category tags at runtime — the chips are already in the markup).
 * - Renders a category list with counts into the sidebar.
 * - Wires search input + category clicks to filter the grid.
 * - Persists the active category in localStorage.
 * - Ctrl/Cmd+K focuses the search input; Esc clears it.
 * - Hamburger toggles the sidebar on mobile.
 */

const TOOL_CATEGORIES = [
    { id: 'all',         label: 'All Tools',  icon: 'fa-th-large' },
    { id: 'text',        label: 'Text',       icon: 'fa-align-left' },
    { id: 'encoding',    label: 'Encoding',   icon: 'fa-exchange-alt' },
    { id: 'data format', label: 'Data',       icon: 'fa-database' },
    { id: 'web',         label: 'Web',        icon: 'fa-globe' },
    { id: 'crypto',      label: 'Crypto',     icon: 'fa-shield-alt' },
    { id: 'time',        label: 'Time',       icon: 'fa-clock' },
    { id: 'visual',      label: 'Visual',     icon: 'fa-image' },
    { id: 'api',         label: 'API',        icon: 'fa-plug' },
    { id: 'network',     label: 'Network',    icon: 'fa-network-wired' },
];

const STORAGE_KEY = 'devtools-active-category';

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('tools-grid');
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll('.tool-card'));
    const searchInput = document.getElementById('tool-search');
    const clearBtn = document.getElementById('search-clear');
    const navContainer = document.getElementById('category-nav');
    const topBarTitle = document.querySelector('.top-bar__title');
    const toolCountEl = document.getElementById('tool-count');

    // Update total tool count in hero strip
    if (toolCountEl) {
        toolCountEl.textContent = `${cards.length} tools`;
    }

    let activeCategory = loadActiveCategory();
    let activeQuery = '';

    renderSidebar();
    applyFilter();
    setupSearch();
    setupKeyboardShortcuts();
    setupMobileSidebar();

    function renderSidebar() {
        if (!navContainer) return;
        const counts = countByCategory(cards);
        navContainer.innerHTML = '';
        TOOL_CATEGORIES.forEach(cat => {
            const count = cat.id === 'all' ? cards.length : (counts[cat.id] || 0);
            if (cat.id !== 'all' && count === 0) return;
            const link = document.createElement('button');
            link.type = 'button';
            link.className = 'sidebar__link';
            link.dataset.category = cat.id;
            link.setAttribute('aria-pressed', String(cat.id === activeCategory));
            if (cat.id === activeCategory) link.classList.add('is-active');
            link.innerHTML = `
                <span class="sidebar__link-label">
                    <span class="sidebar__link-icon"><i class="fas ${cat.icon}" aria-hidden="true"></i></span>
                    ${cat.label}
                </span>
                <span class="sidebar__count">${count}</span>
            `;
            link.addEventListener('click', () => {
                setActiveCategory(cat.id);
                closeMobileSidebar();
            });
            navContainer.appendChild(link);
        });
    }

    function countByCategory(allCards) {
        return allCards.reduce((acc, card) => {
            const c = card.getAttribute('data-category') || 'other';
            acc[c] = (acc[c] || 0) + 1;
            return acc;
        }, {});
    }

    function setActiveCategory(id) {
        activeCategory = id;
        try { localStorage.setItem(STORAGE_KEY, id); } catch (_) { /* ignore */ }
        navContainer.querySelectorAll('.sidebar__link').forEach(el => {
            const isActive = el.dataset.category === id;
            el.classList.toggle('is-active', isActive);
            el.setAttribute('aria-pressed', String(isActive));
        });
        if (topBarTitle) {
            const cat = TOOL_CATEGORIES.find(c => c.id === id);
            topBarTitle.textContent = cat ? cat.label : 'All Tools';
        }
        applyFilter();
    }

    function loadActiveCategory() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored && TOOL_CATEGORIES.some(c => c.id === stored)) return stored;
        } catch (_) { /* ignore */ }
        return 'all';
    }

    function setupSearch() {
        if (!searchInput) return;
        searchInput.addEventListener('input', () => {
            activeQuery = searchInput.value.trim().toLowerCase();
            if (clearBtn) clearBtn.classList.toggle('hidden', activeQuery.length === 0);
            applyFilter();
        });
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                activeQuery = '';
                clearBtn.classList.add('hidden');
                applyFilter();
                searchInput.focus();
            });
        }
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().includes('MAC');
            const cmdK = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k';
            if (cmdK) {
                e.preventDefault();
                searchInput?.focus();
                searchInput?.select();
            }
            if (e.key === 'Escape' && document.activeElement === searchInput) {
                searchInput.value = '';
                activeQuery = '';
                clearBtn?.classList.add('hidden');
                applyFilter();
                searchInput.blur();
            }
        });
    }

    function setupMobileSidebar() {
        const toggle = document.getElementById('sidebar-toggle');
        const scrim = document.getElementById('sidebar-scrim');
        if (!toggle) return;
        toggle.addEventListener('click', () => {
            const open = !document.body.classList.contains('sidebar-open');
            document.body.classList.toggle('sidebar-open', open);
            toggle.setAttribute('aria-expanded', String(open));
        });
        scrim?.addEventListener('click', closeMobileSidebar);
    }

    function closeMobileSidebar() {
        if (!document.body.classList.contains('sidebar-open')) return;
        document.body.classList.remove('sidebar-open');
        document.getElementById('sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    }

    function applyFilter() {
        const noResults = document.getElementById('no-results-message');
        let visible = 0;
        cards.forEach(card => {
            const cat = card.getAttribute('data-category') || 'other';
            const title = card.querySelector('.tool-card__title, h3')?.textContent.toLowerCase() || '';
            const desc = card.querySelector('.tool-card__desc, p')?.textContent.toLowerCase() || '';
            const matchesCat = activeCategory === 'all' || cat === activeCategory;
            const matchesQuery = activeQuery === '' ||
                title.includes(activeQuery) || desc.includes(activeQuery);
            const show = matchesCat && matchesQuery;
            card.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        if (noResults) noResults.classList.toggle('hidden', visible !== 0);
    }
});
