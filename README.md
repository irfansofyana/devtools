# tools.

A focused collection of browser utilities for the small digital jobs that should not need an account, an install, or a heavyweight app.

**Live:** [tools.irfansp.dev](https://tools.irfansp.dev) · **Tools:** 52 · **Stack:** vanilla HTML, CSS, and JavaScript

[![tools. homepage](assets/images/screenshot.png)](https://tools.irfansp.dev)

## What is here

- **Writing and text** — case conversion, sorting, escaping, diffing, and a Vim editor
- **Encoding and conversion** — Base64, URLs, HTML entities, ASCII, hex, CSV, JSON, YAML, XML, and SQL
- **Security and privacy** — hashes, HMAC, UUID/ULID, passwords, and encrypted secret sharing
- **PDF** — structured Markdown extraction, merge, page organization, images, encryption, metadata, and watermarks
- **Visual and documents** — QR codes, Markdown, Mermaid, OCR, colors, and ASCII art
- **Developer and network** — API mocks, regex, timestamps, cron, IP lookup, TLS checks, and subnet calculations

The homepage is built for quick retrieval: search by tool name or task, use `/` or `Ctrl/Cmd + K` to focus search, then use the arrow keys and Enter to open a result.

## Product principles

- **Fast to enter, fast to leave.** The interface stays out of the task.
- **No sign-in.** Open a tool and use it immediately.
- **Local where practical.** Most transformations happen in the browser. Network tools and some library-backed tools may call external services or CDNs; each tool should be treated according to what it actually does.
- **Works across themes and screen sizes.** The shared workbench supports light/dark modes, keyboard navigation, and responsive layouts.
- **No framework tax.** The project remains deployable as static files.

## Run locally

```bash
git clone https://github.com/irfansofyana/tools.git
cd tools
python3 -m http.server 4173
```

Open [http://localhost:4173](http://localhost:4173).

## Test

The regression suite uses Node's built-in test runner—no install step required.

```bash
node --test tests/*.test.mjs
```

## Structure

```text
.
├── index.html              # Searchable tool catalog
├── tools/                  # 52 standalone tool pages
├── css/
│   ├── styles.css          # Tokens, reset, and typography
│   ├── theme.css           # Light and dark palettes
│   ├── layout.css          # Page shell and responsive layout
│   ├── components.css      # Shared controls and feedback
│   ├── workbench.css       # Catalog and tool-workspace system
│   └── pdf-tools.css       # Shared PDF workbench interface
├── js/
│   ├── main.js             # Shared tool-page enhancements
│   ├── search.js           # Filtering and keyboard navigation
│   ├── theme.js            # Theme persistence
│   └── pdf-*.mjs           # Local PDF engines and controllers
├── apps/
│   └── diagram-workbench/   # Isolated React/Vite Excalidraw application
├── vendor/                 # Pinned browser libraries and WASM
├── assets/                 # Logo, favicon, and screenshots
└── tests/                  # Static and behavior regressions
```

## Add a tool

1. Add the standalone HTML page under `tools/`.
2. Load the shared styles in this order: `styles.css`, `theme.css`, `layout.css`, `components.css`, `workbench.css`.
3. Add the tool to the matching category in `index.html`.
4. Keep the page usable with a keyboard and in both themes.
5. Update the tool count and run the tests.

## Diagram Workbench

The Diagram Workbench is deliberately isolated from the vanilla catalog:

- Source: `apps/diagram-workbench/`
- Production route: `/tools/diagram-workbench/`
- Editor engine: `@excalidraw/excalidraw@0.18.1`
- Build: Vite; generated route files are ignored locally and produced in the Pages workflow
- Persistence: versioned IndexedDB stores named board metadata, serialized scenes, embedded files, and library settings
- Privacy: no accounts, analytics, uploads, collaboration, or runtime CDN dependencies
- Recovery: debounced autosave is browser convenience; portable `.excalidraw`, PNG, SVG, documentation ZIP, and complete-workspace exports remain available
- Restore safety: workspace backups are structurally validated, prototype-sensitive identifiers are rejected, and IndexedDB replacement is atomic
- Components: 36 first-party AWS, Kubernetes, AI/LLM, and architecture-pattern items are seeded locally and ready without installation; optional community packs remain local, revision-pinned, and checksum-verified; branded artwork with unclear redistribution rights is deferred; see `apps/diagram-workbench/COMPONENT_PACKS.md`
- Dependency audit: reviewed residual transitive parser advisories and mitigations are recorded in `apps/diagram-workbench/SECURITY_REVIEW.md`

Local development:

```bash
cd apps/diagram-workbench
npm ci
npm test
npm run build
cd ../..
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tools/diagram-workbench/`. The build output is not committed; the GitHub Pages workflow builds it before Jekyll packages the site.

## Vendored PDF engines

PDF processing is lazy-loaded only on PDF tool pages. The pinned browser engines, licenses, and integrity hashes are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). PDF files are processed locally; the password tools require the correct password and do not bypass encryption.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution workflow.

## License

[MIT](LICENSE)
