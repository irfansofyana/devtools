# AnyDoc browser wrapper

## Goal

Add a general document-to-Markdown utility to `tools.irfansp.dev` using Firecrawl's MIT-licensed AnyDoc browser package.

## Accepted scope

- Add the tool directly to `irfansofyana/tools`; no separate repository.
- Convert every format supported by `@firecrawl/anydoc-wasm@0.2.4`: Word, PowerPoint, Excel, OpenDocument, RTF, EPUB, CSV, and PDF.
- Process files locally in a disposable Web Worker using pinned, self-hosted WASM assets.
- Provide plain-text Markdown output with copy and download actions.
- For scanned or image-only PDFs, report the pages that require OCR and link to the existing PDF Inspector and OCR tools.

## Non-goals

- Do not call Firecrawl Parse or any other hosted OCR service.
- Do not claim that AnyDoc's browser package performs OCR.
- Do not render converted Markdown as trusted HTML.
- Do not add a separate AnyDoc repository or backend.

## Trust boundary

The selected document is transferred from the page to a local worker. The worker loads the vendored AnyDoc module and WASM from the same origin. No document bytes are sent over the network. AnyDoc's hosted OCR option is deliberately absent.

## Test seams

1. Catalog and page structure expose the complete format scope and accurate local-processing claim.
2. The worker imports pinned local WASM, converts real CSV bytes, and rejects unsupported bytes.
3. An image-only PDF produces a `needsOcr` error naming its page instead of fabricated Markdown.
4. The controller owns a disposable worker, terminates it after each run, and presents OCR-required state honestly.
5. Browser verification covers a successful CSV conversion, scanned-PDF failure state, keyboard-accessible controls, mobile layout, and console/network errors.

## Delivery tasks

1. Pin and document AnyDoc 0.2.4 browser assets and hashes.
2. Add focused engine and integration regressions.
3. Build the static page, controller, and worker.
4. Add the catalog entry and documentation updates.
5. Run the full automated gate and live browser checks.
6. Obtain independent review, fix verified findings, push a PR, and verify deployment after merge approval.

## Verification and review handoff

Verified locally:

- Full repository test suite passes.
- New controller, worker, and engine tests parse and pass.
- Browser success path converts a CSV to Markdown using the shipped WASM.
- Browser failure path reports page 1 of an image-only PDF as requiring OCR.
- The 390 px layout has no horizontal overflow; browser console remained clean.
- Runtime inspection found no outbound document upload.

Independent review:

- Accepted: repository guidance still said 53 tools — updated both references in `AGENTS.md` to 54.
- Rejected: none.
- Final verdict: clean against the exact pre-commit working tree; no blocking security, logic, standards, or specification findings.
