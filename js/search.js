/**
 * tools. — homepage search.
 * - Filters tool rows by query (matches name + description).
 * - Hides sections that have no matching rows.
 * - Ctrl/Cmd+K or "/" focuses the search input. Esc clears it.
 */

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('tool-search');
    const clearBtn = document.getElementById('search-clear');
    const sections = Array.from(document.querySelectorAll('.section'));
    const noResults = document.getElementById('no-results-message');
    const searchStatus = document.getElementById('search-status');
    if (!input || sections.length === 0) return;

    const tools = sections.flatMap(s => Array.from(s.querySelectorAll('.tool')));
    let activeResultIndex = -1;

    tools.forEach((tool, index) => {
        const link = tool.querySelector('.tool__link');
        if (link && !link.id) link.id = `tool-result-${index}`;
    });

    function visibleLinks() {
        return tools
            .filter(tool => !tool.hidden && !tool.closest('.section')?.hidden)
            .map(tool => tool.querySelector('.tool__link'))
            .filter(Boolean);
    }

    function setActiveResult(nextIndex) {
        const links = visibleLinks();
        tools.forEach(tool => tool.querySelector('.tool__link')?.classList.remove('is-active'));

        if (links.length === 0) {
            activeResultIndex = -1;
            input.removeAttribute('aria-activedescendant');
            return;
        }

        activeResultIndex = (nextIndex + links.length) % links.length;
        const activeLink = links[activeResultIndex];
        activeLink.classList.add('is-active');
        input.setAttribute('aria-activedescendant', activeLink.id);
        activeLink.scrollIntoView({ block: 'nearest' });
    }

    function applyFilter(q) {
        const query = q.trim().toLowerCase();
        let totalVisible = 0;

        sections.forEach(section => {
            const rows = Array.from(section.querySelectorAll('.tool'));
            let visible = 0;
            rows.forEach(row => {
                const name = row.querySelector('.tool__name')?.textContent.toLowerCase() || '';
                const desc = row.querySelector('.tool__desc')?.textContent.toLowerCase() || '';
                const match = query === '' || name.includes(query) || desc.includes(query);
                row.hidden = !match;
                if (match) visible++;
            });
            section.hidden = visible === 0;
            totalVisible += visible;
        });

        if (noResults) noResults.classList.toggle('hidden', totalVisible !== 0);
        document.body.classList.toggle('is-searching', query !== '');
        activeResultIndex = -1;
        input.removeAttribute('aria-activedescendant');
        tools.forEach(tool => tool.querySelector('.tool__link')?.classList.remove('is-active'));

        if (searchStatus) {
            const noun = totalVisible === 1 ? 'tool' : 'tools';
            searchStatus.innerHTML = query
                ? `<strong>${totalVisible}</strong> matching ${noun}`
                : `<strong>${totalVisible}</strong> ${noun} available`;
        }
    }

    input.addEventListener('input', () => {
        const q = input.value;
        clearBtn?.classList.toggle('hidden', q.length === 0);
        applyFilter(q);
    });

    clearBtn?.addEventListener('click', () => {
        input.value = '';
        clearBtn.classList.add('hidden');
        applyFilter('');
        input.focus();
    });

    document.addEventListener('keydown', (e) => {
        const target = e.target;
        const isTyping = target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target?.isContentEditable;

        const isMac = navigator.platform.toUpperCase().includes('MAC');
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            input.focus();
            input.select();
            return;
        }

        if (e.key === '/' && !isTyping) {
            e.preventDefault();
            input.focus();
            return;
        }

        if (e.key === 'Escape' && document.activeElement === input) {
            input.value = '';
            clearBtn?.classList.add('hidden');
            applyFilter('');
            input.blur();
            return;
        }

        if (document.activeElement === input && e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveResult(activeResultIndex + 1);
            return;
        }

        if (document.activeElement === input && e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveResult(activeResultIndex <= 0 ? visibleLinks().length - 1 : activeResultIndex - 1);
            return;
        }

        if (document.activeElement === input && e.key === 'Enter' && activeResultIndex >= 0) {
            const activeLink = visibleLinks()[activeResultIndex];
            if (activeLink) {
                e.preventDefault();
                activeLink.click();
            }
        }
    });

    const countEl = document.getElementById('tool-count');
    if (countEl) countEl.textContent = String(tools.length);
});
