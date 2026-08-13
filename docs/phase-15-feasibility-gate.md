# Phase 15 Feasibility Gate

- Verdict: **SUPPORTED**
- Checked: 2026-08-12
- Integration: official Codex App Server
- Pinned package/runtime: `@openai/codex-sdk` / Codex `0.147.0`

## Official facts

1. OpenAI documents Codex App Server as the protocol surface for rich clients,
   including account authentication, model discovery, threads, turns, streamed
   events, and interruption.
2. The documented ChatGPT login method opens an official browser authorization
   flow. Account read/logout and login completion notifications are public
   protocol methods.
3. Codex supports OS keyring credential storage. Its open-source implementation
   scopes the keyring account name using the canonical Codex home directory.
4. Codex configuration supports disabling prompt history persistence.
5. ChatGPT subscription access and OpenAI Platform API-key billing are distinct.

Official sources checked:

- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/codex-sdk
- https://github.com/openai/codex/blob/main/codex-rs/login/src/auth/storage.rs
- https://github.com/openai/codex/blob/main/codex-rs/message-history/src/lib.rs

## Verified locally

- The official Windows Codex `0.147.0` executable is present through the pinned
  package and accepts `app-server --help`.
- A strict-config App Server initialized over stdio from an isolated probe home.
- Protocol behavior is covered by an in-memory transport; no test uses a real
  account, subscription, credential, paid request, or network.

## Inferences

- App Server is suitable as a narrow text-generation provider only because
  PaperMind adds its own allowlisted IPC, empty working directory, restricted
  read-only sandbox, tool rejection, and bounded ContextBuilder. These are
  PaperMind controls, not claims that Codex itself lacks tool capabilities.
- A distinct Codex home plus the current keyring implementation isolates
  PaperMind login/logout from another Codex client. This must be regression
  tested when upgrading the pinned runtime.

## Unknowns and limitations

- Account plan, model catalog, quotas, and availability are runtime-discovered
  and may change. PaperMind makes no entitlement or unlimited-usage promise.
- An official interactive login and one minimal generation require the user's
  browser action and are not automated or performed during this phase.
- App Server has a larger evolving protocol surface. PaperMind supports only
  the methods and version pinned in the adapter; mismatches fail visibly.

## Gate decision

Proceed with the official adapter. Keep the existing OpenAI API provider fully
available, show the two billing/auth models separately, and fail closed rather
than falling back to a web hack or private endpoint.
