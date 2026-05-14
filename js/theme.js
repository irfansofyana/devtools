/**
 * Devtools — theme switcher.
 * - Persists choice in localStorage (key: Devtools-theme).
 * - Falls back to prefers-color-scheme.
 * - Updates aria-pressed and aria-label on the toggle button so screen
 *   readers describe state rather than reading raw emoji.
 * - Respects prefers-reduced-motion (no spin animation).
 */
(function () {
    const STORAGE_KEY = 'Devtools-theme';
    const root = document.documentElement;

    // Apply initial theme as early as possible to avoid FOUC.
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initial = saved || (prefersDark ? 'dark' : 'light');
        root.setAttribute('data-theme', initial);
    } catch (_) {
        // ignore — storage might be unavailable
    }

    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;

        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReduced) {
            btn.style.transition = 'transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        }

        updateButtonState(btn, root.getAttribute('data-theme'));

        btn.addEventListener('click', () => {
            const current = root.getAttribute('data-theme') || 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* ignore */ }
            updateButtonState(btn, next);

            if (!prefersReduced) {
                btn.style.transform = 'rotate(360deg)';
                setTimeout(() => { btn.style.transform = ''; }, 400);
            }
        });

        // Follow OS theme if user hasn't explicitly chosen.
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            try {
                if (localStorage.getItem(STORAGE_KEY)) return;
            } catch (_) { /* ignore */ }
            const next = e.matches ? 'dark' : 'light';
            root.setAttribute('data-theme', next);
            updateButtonState(btn, next);
        });
    });

    function updateButtonState(btn, theme) {
        const isDark = theme === 'dark';
        btn.setAttribute('aria-pressed', String(isDark));
        btn.setAttribute('aria-label',
            isDark ? 'Switch to light theme' : 'Switch to dark theme');
        btn.setAttribute('title',
            isDark ? 'Switch to light theme' : 'Switch to dark theme');
    }
})();
