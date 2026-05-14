/**
 * Devtools — homepage search.
 *
 * - Filters tool cards by query (matches title + description).
 * - Hides entire sections that have no matching cards.
 * - Ctrl/Cmd+K focuses search; Esc clears it.
 */

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('tool-search');
    const clearBtn = document.getElementById('search-clear');
    const sections = Array.from(document.querySelectorAll('.section'));
    const noResults = document.getElementById('no-results-message');
    if (!input || sections.length === 0) return;

    const cards = sections.flatMap(s => Array.from(s.querySelectorAll('.tool-card')));

    function applyFilter(q) {
        const query = q.trim().toLowerCase();
        let totalVisible = 0;

        sections.forEach(section => {
            const sectionCards = Array.from(section.querySelectorAll('.tool-card'));
            let visibleInSection = 0;

            sectionCards.forEach(card => {
                const title = card.querySelector('.tool-card__title')?.textContent.toLowerCase() || '';
                const desc = card.querySelector('.tool-card__desc')?.textContent.toLowerCase() || '';
                const match = query === '' || title.includes(query) || desc.includes(query);
                card.hidden = !match;
                if (match) visibleInSection++;
            });

            section.hidden = visibleInSection === 0;
            totalVisible += visibleInSection;
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
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            input.focus();
            input.select();
        }
        if (e.key === 'Escape' && document.activeElement === input) {
            input.value = '';
            clearBtn?.classList.add('hidden');
            applyFilter('');
            input.blur();
        }
    });

    const countEl = document.getElementById('tool-count');
    if (countEl) countEl.textContent = String(cards.length);
});
