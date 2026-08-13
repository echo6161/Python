# Phase 15 Official Codex Integration

## Boundary

`Renderer -> typed preload -> whitelisted AI IPC -> AiAssistantService ->
CodexProvider -> CodexAppServerClient -> bundled official Codex runtime`

The client owns request correlation, a ten-second control-plane timeout, response
parsing, connection error classification, model discovery, login lifecycle,
streaming, cancellation, and runtime shutdown. A transport abstraction keeps all
tests deterministic and independent of a real account or network.

`loginId` follows the official protocol as a bounded opaque string. PaperMind
does not assume it is a UUID and never interprets it as a URL, path, or command.
The pinned runtime's browser response is accepted only when it uses HTTPS on the
exact `auth.openai.com` host, without credentials or a non-default port. The URL
stays in Main and is never returned to Renderer.

## Credential and process lifecycle

- Credentials are owned and refreshed by Codex in the OS keyring.
- `CODEX_HOME` is under PaperMind user data, outside the document library and Git.
  PaperMind owns its generated `config.toml`; Codex keeps account/runtime metadata
  separately within that isolated home.
- The environment is allowlisted; API-key/token environment variables are not
  inherited.
- Codex prompt history persistence is disabled. Each PaperMind turn uses a new
  Codex thread that is deleted after completion, cancellation, or failure.
- Email/account identifiers returned by Codex are discarded. Renderer receives
  only connection state, plan label, runtime version, models, limits, and a safe
  last error.
- PaperMind starts the process lazily, keeps one connection, cancels active turns,
  deletes transient Codex threads, and terminates it during application shutdown.

## Provider semantics

- `OpenAI API`: explicit API key, HTTPS Base URL, usage-based Platform billing.
- `ChatGPT account via Codex`: official browser login, subscription-based Codex
  entitlement subject to the account's plan and current limits; no API key.
- Switching provider changes future conversations only. Existing conversation
  provider/model provenance stays fixed.
- Losing or logging out of Codex falls back to OpenAI as the selected provider;
  non-AI and local Knowledge functions remain available.

## UI states

The Settings screen expresses `connected`, `not connected`, `offline`, `session
expired`, `version mismatch`, `waiting for browser sign-in`, `login cancelled`,
and `connection error` using text and icons. Status and connection actions are
always above collapsible capability/version detail. No fake login button is shown:
the action invokes the official browser flow through Main.

## Permission profile compatibility

Codex App Server `0.147.0` rejects the former nested `readOnly.access` request
shape. PaperMind opts into the runtime's permission-profile API, discovers the
available profiles in the isolated empty working directory, and requires its
generated `papermind-research-read-only` profile before creating an ephemeral
chat thread. That profile denies filesystem-root and temporary-directory access,
reopens only the minimal platform runtime paths and PaperMind-owned empty workspace
for reads, blocks local network binding, and allows outbound network only to the
official `chatgpt.com` Codex service. There is no wildcard network rule or fallback
remote proxy. A user-configured proxy is optional and must be a credential-free
loopback HTTP URL with an explicit port. Main injects `HTTP_PROXY`/`HTTPS_PROXY`
only into the isolated Codex child; it is not a Renderer network capability.
to a built-in or broader default profile.
Turns inherit the thread profile and retain `approvalPolicy: never`; unsafe tool
events continue to be interrupted and rejected by the adapter.
