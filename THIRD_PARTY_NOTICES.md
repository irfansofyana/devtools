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
