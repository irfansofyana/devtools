/**
 * Enhanced theme switcher functionality for Devtools
 * Handles light/dark theme preferences and persistence with smooth transitions
 */
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const root = document.documentElement;
    
    // Check for saved theme preference or use preferred color scheme
    const savedTheme = localStorage.getItem('Devtools-theme');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Set initial theme without transition (on page load)
    root.style.transition = 'none';
    if (savedTheme) {
        root.setAttribute('data-theme', savedTheme);
    } else if (prefersDarkScheme) {
        root.setAttribute('data-theme', 'dark');
    }
    
    // Force a reflow to ensure the transition: none is applied
    // before we remove it to allow transitions again
    root.offsetHeight;
    root.style.transition = '';
    
    // Add animation class to theme toggle button
    themeToggleBtn.classList.add('theme-toggle-animated');
    
    // Toggle theme when button is clicked with animation
    themeToggleBtn.addEventListener('click', () => {
        // Add animation class to button
        themeToggleBtn.classList.add('theme-toggle-spin');
        
        // Get current theme and determine new theme
        const currentTheme = root.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        // Apply a subtle fade effect to the whole page during transition
        document.body.classList.add('theme-transitioning');
        
        // Set the new theme after a small delay for visual effect
        setTimeout(() => {
            root.setAttribute('data-theme', newTheme);
            localStorage.setItem('Devtools-theme', newTheme);
            
            // Remove the fade effect after the transition completes
            setTimeout(() => {
                document.body.classList.remove('theme-transitioning');
            }, 300);
            
            // Remove the spin animation class after it completes
            setTimeout(() => {
                themeToggleBtn.classList.remove('theme-toggle-spin');
            }, 500);
        }, 50);
    });
    
    // Add theme transition styles dynamically
    const style = document.createElement('style');
    style.textContent = `
        .theme-toggle-animated {
            transition: transform 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }
        
        .theme-toggle-spin {
            transform: rotate(180deg);
        }
        
        .theme-transitioning {
            transition: opacity 0.3s ease;
            opacity: 0.92;
        }
    `;
    document.head.appendChild(style);
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('Devtools-theme')) {
            // Only auto-switch if user hasn't manually set a preference
            const newTheme = e.matches ? 'dark' : 'light';
            root.setAttribute('data-theme', newTheme);
        }
    });
});
