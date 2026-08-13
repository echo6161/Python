# ADR 0002: Official ChatGPT Account Integration Through Codex App Server

- Status: Accepted (`SUPPORTED`)
- Gate checked: 2026-08-12
- PaperMind phase: 15
- Bundled runtime: `@openai/codex-sdk` / Codex `0.147.0`

## Decision

PaperMind may use a ChatGPT account only through the publicly documented Codex
App Server protocol. The integration is a second `AiProvider` behind the existing
Main-process `AiGateway`; it is not an embedded ChatGPT web client.

Renderer communicates only through domain-specific typed preload calls:
status/refresh, provider selection, start/cancel login, logout, and the existing
bounded chat operations. Main starts the bundled official Codex runtime over
stdio, opens only a validated `https://auth.openai.com` browser login URL, and never
returns that URL or credentials to Renderer.

PaperMind gives Codex an isolated `CODEX_HOME`, forces
`cli_auth_credentials_store="keyring"`, and uses an empty working directory.
Codex prompt history persistence is disabled with `history.persistence="none"`.
Generation runs with approval `never` and a generated permission profile that
denies broad filesystem and temporary-directory access, allows minimal runtime
paths plus the isolated empty workspace as read-only, blocks local network binding,
and allows outbound network only to the official `chatgpt.com` Codex service.
PaperMind rejects any command, file-change, MCP, dynamic-tool, collaboration,
web-search, or image-view item and interrupts the turn.

## Official facts

1. Codex App Server is the official interface for embedding authentication,
   streamed events, cancellation, and account lifecycle in a product.
2. `account/login/start` with `type: "chatgpt"` returns a browser authorization
   URL and later emits completion/account notifications.
3. `account/read`, `account/logout`, `model/list`, `thread/start`, `turn/start`,
   `turn/interrupt`, and streamed assistant deltas are documented public methods.
4. OpenAI distinguishes ChatGPT subscription access from usage-based API-key
   access. API usage is billed separately.
5. Codex can store cached credentials in the OS keyring.

Sources checked on 2026-08-12:

- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/codex-sdk
- https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs
- https://github.com/openai/codex/blob/main/codex-rs/message-history/src/lib.rs

## Inferences and unknowns

- The protocol surface is much broader than Research Chat needs. PaperMind's
  narrow adapter and tool-event fail-closed rule are product security controls,
  not claims that App Server lacks those capabilities.
- Model and plan availability are discovered per account and may change.
- The pinned runtime is the compatibility boundary. A future upgrade requires
  protocol, packaging, login, streaming, cancellation, and screenshot regression
  tests. PaperMind must show `version mismatch` rather than silently falling back
  to a private endpoint.
- PaperMind does not promise that every ChatGPT plan includes every model or an
  unlimited amount of Codex usage.

## Rejected alternatives

- Scraping or embedding `chatgpt.com`, WebView login, browser-cookie/profile
  access, private endpoints, copied session tokens, and externally managed token
  injection are prohibited.
- Reusing the user's normal `~/.codex` profile was rejected. An isolated profile
  avoids reading or logging out other Codex clients.
- Treating a ChatGPT subscription as an OpenAI Platform API key was rejected.
