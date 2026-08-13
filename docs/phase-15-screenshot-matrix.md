# Phase 15 Screenshot Matrix

Fixture: Playwright desktop fixture with deterministic Mock OpenAI and connected
Mock Codex provider states. No real account, email, credential, API call, or network.

| Viewport | State | Artifact | Checks |
| --- | --- | --- | --- |
| 1536x1024 | Connected provider selection | `screenshots/phase-15/provider-connected-1536x1024.png` | Current provider, status, action, capabilities/limits visible; no large promotional card |
| 1280x800 | Connected provider selection | `screenshots/phase-15/provider-connected-1280x800.png` | Status and provider switching remain usable without page-level horizontal scroll |
| 1024x768 | Connected provider selection | `screenshots/phase-15/provider-connected-1024x768.png` | Main state/action and security warning are not hidden or clipped; auxiliary detail remains collapsible |
| 1280x800 | Expired session recovery | `screenshots/phase-15/provider-session-expired-1280x800.png` | Explicit text/icon state and official browser-login action; no WebView or fake credential form |
| 1280x800 | Signed-out recovery | `screenshots/phase-15/provider-not-connected-1280x800.png` | Not-connected copy remains distinct from expired state and offers the same official browser flow |

Generation command:

`playwright test tests/e2e/app.spec.ts --grep "official provider status"`

Result: all five artifacts were generated from deterministic fixtures. The three
connected viewports show current provider, connection status, switch action,
security boundary, and collapsible limits with no page-level horizontal scroll.
At 1024x768 the primary state and actions remain visible without clipping. The
expired fixture uses explicit icon/text semantics and exposes only the official
browser sign-in action; no account field, WebView, URL, or credential is present.
