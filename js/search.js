/**
 * Devtools — homepage search.
 * - Filters tool rows by query (matches name + description).
 * - Hides sections that have no matching rows.
 * - Ctrl/Cmd+K or "/" focuses the search input. Esc clears it.
 */

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('tool-search');
    const clearBtn = document.getElementById('search-clear');
    const sections = Array.from(document.querySelectorAll('.section'));
    const noResults = document.getElementById('no-results-message');
    if (!input || sections.length === 0) return;

    const tools = sections.flatMap(s => Array.from(s.querySelectorAll('.tool')));

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
        }
    });

    const countEl = document.getElementById('tool-count');
    if (countEl) countEl.textContent = String(tools.length);
});
