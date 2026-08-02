# Diagram Workbench dependency security review

`npm audit --omit=dev` reports one high and eight moderate transitive advisories in the pinned Excalidraw/Mermaid dependency graph. No newer stable release of either `@excalidraw/excalidraw` or `@excalidraw/mermaid-to-excalidraw` is currently published.

## Findings and reachability

### `lodash-es` through Mermaid parser / Chevrotain

The high advisory concerns code injection through attacker-controlled `_.template` import-key names. The moderate advisories concern prototype pollution through `_.unset` and `_.omit` paths.

Repository inspection found no calls to `template`, `unset`, or `omit` in the installed runtime paths under `@mermaid-js`, `langium`, `chevrotain`, or `@chevrotain`. The vulnerable package is present transitively, but the advisory entry points are not used by the diagram conversion path.

### `nanoid` through Excalidraw and Mermaid conversion

The advisory concerns predictable output when the library receives non-integer size values. Inspected call sites invoke zero-argument `nanoid()` only; user input does not control the size argument.

## Compensating controls

- Mermaid conversion runs only after explicit user action.
- Mermaid input is local, never uploaded, and capped at 20,000 characters.
- The application has no account, collaboration, remote storage, analytics, or credential-bearing API.
- Workspace restore validates the complete backup and board object graph for prototype-sensitive keys, rejects duplicate element identities, enforces pinned Excalidraw type schemas and internal scene/file references, and only then performs one atomic IndexedDB replacement transaction.
- Production assets and fonts are self-hosted; runtime CDNs are not used.
- Excalidraw embeddables use a local-only renderer and reject remote embed validation, preventing restored diagrams from auto-loading third-party frames.
- The app is isolated under `/tools/diagram-workbench/` and does not add its bundle to other routes.

## Decision

The advisories are accepted for this local-first release because the reported vulnerable APIs are not reachable in the installed conversion path. This is not a claim that the dependency tree is vulnerability-free. Re-run the audit whenever Excalidraw, the Mermaid converter, Mermaid, Langium, Chevrotain, Lodash, or Nano ID changes; remove this acceptance as soon as an upstream compatible fix exists.

Do not apply npm's suggested downgrade to Excalidraw `0.17.6`: it is an API regression, not a verified security remediation for this dependency graph.
