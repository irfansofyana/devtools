# Sticky Board editor bundle

This directory contains the maintainable source for Sticky Board’s rich-text editor. The static site imports the committed browser bundle at `vendor/sticky-board/tiptap-editor.mjs`; it does not fetch editor code from a CDN.

## Rebuild

```bash
npm ci
npm run build
```

After rebuilding, update the reviewed SHA-256 entry in `tests/sticky-board.test.mjs`, run `node --test tests/sticky-board.test.mjs`, and keep `vendor/sticky-board/tiptap-editor.NOTICE.md` aligned with dependency license changes.

The application stores note documents as TipTap JSON under backup schema v2. Legacy Markdown notes stay readable and migrate to structured JSON when edited.
