# Vendor Assets

`qpdf/` contains the vendored qpdf WASM browser runtime used by `qpdf-run`.

The package currently resolves these assets through explicit runner options:

- `assetBaseUrl`
- `qpdfJsUrl`
- `wasmUrl`

The published package should keep these assets addressable without relying on an application-specific public path.
