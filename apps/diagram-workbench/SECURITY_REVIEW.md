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
- Workspace restore validates the complete backup and board object graph for prototype-sensitive keys, rejects duplicate element identities, malformed base64 file payloads, unsupported future built-in-library markers, and invalid Excalidraw app state, enforces pinned Excalidraw type schemas and internal scene/file references, and only then performs one atomic IndexedDB replacement transaction. Replacement inputs are cloned and serialized before opening the transaction; request failures are observed and the transaction is aborted and drained before the original error is rethrown.
- The first-party default library uses original editable shapes, not redistributed vendor icon artwork. Its migration reads, merges, and writes library data plus the seed-version marker inside one IndexedDB read/write transaction. Normal library edits persist through a serialized retryable delta queue that computes intent from consecutive successful editor snapshots while applying each delta to the transaction's current database state; externally merged results stay in storage and are not injected back through Excalidraw's change callback as new local intent. Every workspace operation flushes both scene and library queues before reading or replacing data. Optional-pack installation updates both library items and pack metadata atomically, so stale tabs cannot erase a completed migration or mutate a restored workspace afterward. Local `.excalidrawlib` imports are capped at 50 MiB, parsed by the pinned Excalidraw loader, merged additively in an exclusive atomic settings update, and rejected without a partial write when malformed. Legacy imports receive deterministic IDs to make exact re-imports idempotent. Backup restore preserves the marker and accepts older backups where it is absent.
- Production application assets and fonts are self-hosted; user-initiated community-library installation may fetch the selected `.excalidrawlib` from Excalidraw's allowlisted official library service.
- Excalidraw embeddables use a local-only renderer and reject remote embed validation, preventing restored diagrams from auto-loading third-party frames.
- The app is isolated under `/tools/diagram-workbench/` and does not add its bundle to other routes.

## Decision

The advisories are accepted for this local-first release because the reported vulnerable APIs are not reachable in the installed conversion path. This is not a claim that the dependency tree is vulnerability-free. Re-run the audit whenever Excalidraw, the Mermaid converter, Mermaid, Langium, Chevrotain, Lodash, or Nano ID changes; remove this acceptance as soon as an upstream compatible fix exists.

Do not apply npm's suggested downgrade to Excalidraw `0.17.6`: it is an API regression, not a verified security remediation for this dependency graph.
