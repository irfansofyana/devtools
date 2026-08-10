# Third-party notices

The PDF workbench vendors pinned browser assets so document bytes do not need to be sent to a CDN or application server. Upstream license files are retained beside each package.

## PDF Inspector WASM 0.1.3

- Project: <https://github.com/firecrawl/pdf-inspector>
- Package: `@firecrawl/pdf-inspector-wasm@0.1.3`
- License: MIT
- Local path: `vendor/pdf-inspector/0.1.3/`
- SHA-256 (`pdf_inspector_wasm.mjs`): `fb2b477ffda8dc1f3fe445273e82076d710f253770bae4cc5eb2907179101993`
- SHA-256 (`pdf_inspector_wasm_bg.wasm`): `8208c6c288b7a4e6656400bf6963b1278a279d6dee6a25f21d79ea3604c16db8`

The published JavaScript entry was renamed from `.js` to `.mjs`; its contents are otherwise unchanged.

## pdf-lib 1.17.1

- Project: <https://github.com/Hopding/pdf-lib>
- Package: `pdf-lib@1.17.1`
- License: MIT
- Local path: `vendor/pdf-lib/1.17.1/`
- SHA-256 (`pdf-lib.mjs`): `72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969`

The published ESM bundle was renamed from `.js` to `.mjs`; its contents are otherwise unchanged.

## qpdf-run 0.2.1 and QPDF

- Wrapper: <https://github.com/RabbitHols/qpdf-run>
- Package: `qpdf-run@0.2.1`
- Wrapper license: MIT
- QPDF project: <https://github.com/qpdf/qpdf>
- Embedded QPDF runtime version: `11.10.0`
- Corresponding QPDF source release: <https://github.com/qpdf/qpdf/releases/tag/v11.10.0>
- Browser artifact source: <https://registry.npmjs.org/qpdf-run/-/qpdf-run-0.2.1.tgz>
- QPDF license: Apache License 2.0 or Artistic License 2.0
- Local path: `vendor/qpdf-run/0.2.1/`
- SHA-256 (`qpdf.js`): `35df3cad3919f370dd86970e1ea3fc8bd57f744be23a50a773f17abcbf1d9ffc`
- SHA-256 (`qpdf.wasm`): `86cba3db67ce3add2dd4b3533dd0614dade0b4e98b14a229bfda90306c053dd3`

The qpdf-run MIT license and the QPDF license/notice files are retained in their respective vendor directories. The npm package does not publish the WASM build flags or a separate build commit; the exact shipped artifact is pinned by package version and SHA-256 above. The local wrapper includes one defensive patch that terminates its worker when initialization fails or times out.

## Diagram Workbench

The isolated Diagram Workbench is built from the lockfile at `apps/diagram-workbench/package-lock.json`. Its principal runtime packages are:

- `@excalidraw/excalidraw@0.18.1` — MIT; upstream: <https://github.com/excalidraw/excalidraw>; license retained at `apps/diagram-workbench/licenses/excalidraw-MIT.txt`.
- `@excalidraw/mermaid-to-excalidraw@2.2.2` — MIT; upstream: <https://github.com/excalidraw/mermaid-to-excalidraw>; license retained at `apps/diagram-workbench/licenses/mermaid-to-excalidraw-MIT.txt`. Mermaid conversion is loaded only when requested.
- `react@18.3.1` and `react-dom@18.3.1` — MIT; upstream: <https://github.com/facebook/react>; license retained at `apps/diagram-workbench/licenses/react-MIT.txt`.
- `idb@8.0.3` — ISC; upstream: <https://github.com/jakearchibald/idb>; license retained at `apps/diagram-workbench/licenses/idb-ISC.txt`.
- `@dagrejs/dagre@3.0.0` — MIT; upstream: <https://github.com/dagrejs/dagre>; license retained at `apps/diagram-workbench/licenses/dagre-MIT.txt`.
- `fflate@0.8.3` — MIT; upstream: <https://github.com/101arrowz/fflate>; license retained at `apps/diagram-workbench/licenses/fflate-MIT.txt`.
- `vite@7.3.6` — MIT, build-time only; upstream: <https://github.com/vitejs/vite>; license retained at `apps/diagram-workbench/licenses/vite-MIT.txt`.

The generated application and editor assets are served from this repository; no runtime CDN is required. The built-in Irfan Core component library is first-party original editable artwork and does not redistribute AWS, Kubernetes, or other vendor logo files. Product and service names remain trademarks of their respective owners; their descriptive use does not imply affiliation or endorsement, and those trademarks are not licensed under this repository's MIT license.

## Excalidraw community component packs

Three optional `.excalidrawlib` files are redistributed from `excalidraw/excalidraw-libraries` revision `92e1979e8157da0ad9c2bd912c01ea9381d1733f`: Software Architecture, System Design, and C4 Architecture. The repository MIT license is retained at `apps/diagram-workbench/licenses/excalidraw-libraries-MIT.txt`.

Exact source paths, authors, SHA-256 hashes, and the review policy are recorded in `apps/diagram-workbench/COMPONENT_PACKS.md`. The C4 pack is attributed to its library author and to Simon Brown’s C4 model at <https://c4model.com/>; the C4 website identifies its content as CC BY 4.0.

AWS, Google Cloud, Azure, and Kubernetes community packs are not redistributed in v1 because repository inclusion does not establish standalone rights to repackage branded artwork. The workbench links to current official provider sources instead.

## Sticky Board

The Sticky Board serves pinned browser libraries from `vendor/sticky-board/` so Markdown notes and code snippets do not require runtime CDN requests:

- `marked@18.0.9` — MIT; upstream: <https://github.com/markedjs/marked>
- `DOMPurify@3.4.13` — Apache-2.0/MPL-2.0; upstream: <https://github.com/cure53/DOMPurify>
- `PrismJS@1.30.0` — MIT; upstream: <https://github.com/PrismJS/prism>

Markdown output is sanitized before insertion. Remote images, frames, forms, and embedded objects are excluded from note rendering.
Integrity is enforced by `tests/sticky-board.test.mjs`, which records SHA-256 digests for every vendored Sticky Board runtime file.
