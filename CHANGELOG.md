# Changelog

## 0.7.0 — 2026-10-06

- Add `SourceContext` and `createSourceContext(initial?)` for independent citation state per conversation, including snapshots and restoration. Pass `sources` to `webFetch` and `webSearch`; callers that omit it keep the existing process-wide context.
- Register cache hits in the active source context and reject cancelled fetches before consuming cached content.
- Include UTF-8 title bytes in the fetch cache capacity to prevent large titles from bypassing the 50 MiB limit.
- Add concurrency, snapshot, cancellation and cache-eviction regression coverage.
- Add Linux/macOS CI, independent tarball validation for ESM/CJS/TypeScript/CLI/MCP, and GitHub OIDC publishing of the verified archive.

Existing SDK calls and CLI/MCP inputs remain compatible. Only clear a source context after its in-flight calls have settled; the application owns snapshot persistence.
