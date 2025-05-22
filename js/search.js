/**
 * Tool search and filtering functionality
 */

// Tool categories with their associated tools
const toolCategories = {
    'Text': [
        'String Case Converter', 'Line Sort/Dedupe', 'Backslash Escape/Unescape', 
        'Random String Generator', 'Text Diff Utility'
    ],
    'Encoding': [
        'Base64 Encoder/Decoder', 'URL Encoder/Decoder', 'ASCII <> HEX Converter'
    ],
    'Data Format': [
        'JSON Beautifier/Minifier', 'JSON <-> YAML Converter', 'CSV <> JSON Converter',
        'JSON to Protobuf', 'JSON/YAML Explorer'
    ],
    'Web': [
        'URL Parser', 'URL to Markdown', 'CURL Constructor', 'JWT Decoder'
    ],
    'Crypto': [
        'Hash Generator', 'UUID Generator', 'Password Generator'
    ],
    'Time': [
        'Timestamp Converter', 'Crontab Generator'
    ],
    'Visual': [
        'QR Code Reader/Generator', 'Markdown Preview', 'Mermaid Diagram Editor',
        'OCR Tool', 'Color Converter'
    ],
    'API': [
        'API Mock Data Generator', 'Regex Tester'
    ]
};

// Initialize search and filtering functionality
document.addEventListener('DOMContentLoaded', () => {
    initializeSearchAndFilter();
});

/**
 * Initialize the search and filtering functionality
 */
function initializeSearchAndFilter() {
    // Get the tools grid element
    const toolsGrid = document.querySelector('.tools-grid');
    if (!toolsGrid) return;
    
    // Get all tool cards
    const toolCards = Array.from(document.querySelectorAll('.tool-card'));
    
    // Create search and filter container
    const searchFilterContainer = document.createElement('div');
    searchFilterContainer.className = 'search-filter-container mb-3';
    
    // Create search input
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'tool-search';
    searchInput.className = 'search-input';
    searchInput.placeholder = 'Search tools...';
    searchInput.setAttribute('aria-label', 'Search tools');
    
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fas fa-search search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    
    const clearButton = document.createElement('button');
    clearButton.className = 'search-clear-btn hidden';
    clearButton.innerHTML = '&times;';
    clearButton.setAttribute('aria-label', 'Clear search');
    clearButton.setAttribute('type', 'button');
    
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(searchIcon);
    searchContainer.appendChild(clearButton);
    
    // Add event listener for clear button
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.classList.add('hidden');
        filterTools('', categorySelect.value);
        searchInput.focus();
    });
    
    // Show/hide clear button based on input
    searchInput.addEventListener('input', () => {
        if (searchInput.value.length > 0) {
            clearButton.classList.remove('hidden');
            searchIcon.style.right = 'calc(var(--spacing-md) * 4)';
        } else {
            clearButton.classList.add('hidden');
            searchIcon.style.right = 'var(--spacing-md)';
        }
    });
    
    // Create category filter
    const filterContainer = document.createElement('div');
    filterContainer.className = 'filter-container';
    
    const filterLabel = document.createElement('span');
    filterLabel.className = 'filter-label';
    filterLabel.textContent = 'Filter by:';
    
    const categorySelect = document.createElement('select');
    categorySelect.id = 'category-filter';
    categorySelect.className = 'category-select';
    categorySelect.setAttribute('aria-label', 'Filter by category');
    
    // Add "All" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All Categories';
    categorySelect.appendChild(allOption);
    
    // Add category options
    Object.keys(toolCategories).forEach(category => {
        const option = document.createElement('option');
        option.value = category.toLowerCase();
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    
    filterContainer.appendChild(filterLabel);
    filterContainer.appendChild(categorySelect);
    
    // Add search and filter to container
    searchFilterContainer.appendChild(searchContainer);
    searchFilterContainer.appendChild(filterContainer);
    
    // Add tag to each tool card
    toolCards.forEach(card => {
        const toolName = card.querySelector('h3').textContent;
        let toolCategory = 'Other';
        
        // Find the category for this tool
        for (const [category, tools] of Object.entries(toolCategories)) {
            if (tools.some(tool => toolName.includes(tool))) {
                toolCategory = category;
                break;
            }
        }
        
        // Add category as a data attribute
        card.setAttribute('data-category', toolCategory.toLowerCase());
        
        // Add category tag to the card
        const tagElement = document.createElement('span');
        tagElement.className = 'category-tag';
        tagElement.textContent = toolCategory;
        card.appendChild(tagElement);
    });
    
    // Insert search and filter before the tools grid
    const toolsSection = document.querySelector('.tools .container');
    toolsSection.insertBefore(searchFilterContainer, toolsSection.querySelector('h2').nextSibling);
    
    // Add event listeners for search and filter
    searchInput.addEventListener('input', () => {
        filterTools(searchInput.value, categorySelect.value);
    });
    
    categorySelect.addEventListener('change', () => {
        filterTools(searchInput.value, categorySelect.value);
    });
    
    // Initial filter (show all)
    filterTools('', 'all');
}

/**
 * Filter tools based on search text and category
 * @param {string} searchText - The search text
 * @param {string} category - The selected category
 */
function filterTools(searchText, category) {
    const toolCards = Array.from(document.querySelectorAll('.tool-card'));
    const noResultsMessage = document.getElementById('no-results-message') || createNoResultsMessage();
    
    searchText = searchText.toLowerCase();
    let visibleCount = 0;
    
    toolCards.forEach(card => {
        const toolName = card.querySelector('h3').textContent.toLowerCase();
        const toolDescription = card.querySelector('p').textContent.toLowerCase();
        const toolCategory = card.getAttribute('data-category');
        
        const matchesSearch = toolName.includes(searchText) || toolDescription.includes(searchText);
        const matchesCategory = category === 'all' || toolCategory === category;
        
        if (matchesSearch && matchesCategory) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Show/hide no results message
    if (visibleCount === 0) {
        noResultsMessage.style.display = 'block';
    } else {
        noResultsMessage.style.display = 'none';
    }
}

/**
 * Create a "no results" message element
 * @returns {HTMLElement} The created element
 */
function createNoResultsMessage() {
    const toolsGrid = document.querySelector('.tools-grid');
    const message = document.createElement('div');
    message.id = 'no-results-message';
    message.className = 'no-results-message';
    message.textContent = 'No tools match your search criteria.';
    message.style.display = 'none';
    
    toolsGrid.parentNode.insertBefore(message, toolsGrid.nextSibling);
    return message;
}
