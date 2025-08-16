# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Devtools is a collection of 30+ web-based developer tools deployed via GitHub Pages. It's a static site built with vanilla HTML, CSS, and JavaScript that provides utilities for text processing, data conversion, encoding/decoding, API testing, and more.

## Development Commands

Since this is a static HTML/CSS/JavaScript project, no build system is required:

```bash
# Local development - simply open index.html in a browser
open index.html

# Deploy to GitHub Pages (handled automatically via GitHub Actions)
git push origin main
```

## Architecture Overview

### File Structure
- `index.html` - Main homepage with tool navigation
- `tools/` - Individual tool HTML pages (30+ tools)
- `css/` - Stylesheets with CSS custom properties and theme system
- `js/` - JavaScript modules for shared functionality
- `assets/` - Static assets (icons, images)

### Core JavaScript Architecture

**Main modules:**
- `js/main.js` - Core utilities (clipboard, error handling, file downloads)
- `js/search.js` - Tool search and category filtering system
- `js/theme.js` - Dark/light theme switcher with persistence

**Tool Categories:**
Tools are organized into categories defined in `js/search.js:toolCategories`:
- Text (string manipulation, diff, vim editor)
- Encoding (base64, URL, hex conversion)
- Data Format (JSON, YAML, CSV conversion/visualization)
- Web (URL parsing, CURL constructor, JWT decoder)
- Crypto (hash generation, UUID, passwords)
- Time (timestamps, crontab)
- Visual (QR codes, markdown preview, diagrams)
- API (mock data, regex testing)

### Theme System

The project uses CSS custom properties for theming:
- `css/styles.css` - Base styles with CSS variables
- `css/theme.css` - Light/dark theme definitions
- Theme persistence via localStorage with system preference fallback
- Smooth transitions and animations for theme switching

### Tool Development Pattern

Each tool follows a consistent structure:
1. HTML page in `tools/` directory
2. Shared header/navigation/theme toggle
3. Tool-specific functionality in `<script>` tags
4. Uses shared utilities from `js/main.js`
5. Consistent styling with CSS custom properties

## Key Implementation Guidelines

### Adding New Tools

1. Create HTML file in `tools/` directory
2. Follow existing tool template structure
3. Include shared CSS and JavaScript references
4. Add tool to category mapping in `js/search.js:toolCategories`
5. Add navigation link to `index.html`

### Theme Support

- Use CSS custom properties for colors/spacing
- Support both light and dark themes
- Test theme switching functionality
- Include proper accessibility attributes

### JavaScript Conventions

- Use vanilla JavaScript (no frameworks)
- Implement error handling with `showError()` utility
- Use `downloadTextFile()` for file downloads
- Implement copy-to-clipboard with `data-copy` attribute pattern

### Accessibility

- Include proper ARIA labels and roles
- Support keyboard navigation
- Maintain color contrast ratios
- Provide alternative text for visual elements

## Advanced Features

### Vim Editor Tool
- Uses CodeMirror 5 with Vim keybindings
- Syntax highlighting for multiple languages
- Advanced features: line numbers, code folding, search/replace
- Theme integration with light/dark CodeMirror themes

### CSV Visualizer
- Uses Papa Parse library for CSV parsing
- Dynamic table generation with sorting
- Export functionality to HTML/CSV formats
- Configurable parsing options

## Cursor Rules Integration

The project includes Cursor IDE rules in `.cursor/rules/`:
- Development workflow guidelines
- Task management integration
- Code formatting standards
- Rule creation and maintenance guidelines
- can you always update @README.md after update or implement any tools?