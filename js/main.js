/**
 * Main JavaScript functionality for Devtools
 */
document.addEventListener('DOMContentLoaded', () => {
    // Set current year in footer
    const currentYearElement = document.getElementById('current-year');
    if (currentYearElement) {
        currentYearElement.textContent = new Date().getFullYear();
    }

    // Initialize copy to clipboard functionality
    initCopyToClipboard();
});

/**
 * Initialize copy to clipboard functionality for all elements with data-copy attribute
 */
function initCopyToClipboard() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-copy]');
        if (!target) return;
        
        const textToCopy = document.getElementById(target.dataset.copy)?.value || '';
        if (!textToCopy) return;
        
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                // Show success feedback
                const originalText = target.textContent;
                target.textContent = 'Copied!';
                target.classList.add('copied');
                
                // Reset after 2 seconds
                setTimeout(() => {
                    target.textContent = originalText;
                    target.classList.remove('copied');
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
            });
    });
}

/**
 * Show an error message
 * @param {string} message - The error message to display
 * @param {string} elementId - The ID of the element to show the error in
 */
function showError(message, elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        // Hide after 5 seconds
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Show a success message
 * @param {string} message - The success message to display
 * @param {string} elementId - The ID of the element to show the message in
 */
function showSuccess(message, elementId) {
    const successElement = document.getElementById(elementId);
    if (successElement) {
        successElement.textContent = message;
        successElement.classList.remove('hidden');
        
        // Hide after 5 seconds
        setTimeout(() => {
            successElement.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Utility function to create a download link for text content
 * @param {string} content - The content to download
 * @param {string} filename - The filename for the download
 * @param {string} mimeType - The MIME type of the content
 */
function downloadTextFile(content, filename, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
