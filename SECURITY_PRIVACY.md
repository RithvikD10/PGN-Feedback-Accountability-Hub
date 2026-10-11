# Security & Privacy — PGN Feedback & Accountability Hub

This document describes the threat model, the controls implemented in `Code.gs` / `Index.html`, the controls that only Google settings can provide, and the limits that remain. Read it before changing the deployment settings.

## 1. Threat model

| Actor | Goal | Primary control | Code control |
|-------|------|-----------------|--------------|
| Any member (Form respondent) | Exfiltrate sheet data via formula injection; inject instructions into the AI; exhaust Gemini quota; flood the sheet | Private Sheet; Form limits | RichTextValue writes (no formulas), feedback as JSON data in the user turn + explicit system rules, daily call budget, length cap, structured output |
| Another Google account | Open the dashboard or call backend functions | Web app "Only myself" | `pgnAssertAuthorized_()` on every endpoint and `doGet`; private `_` helpers |
| Spreadsheet editor | Read the Gemini key; change records | Keep the Sheet owner-only | Nothing can stop an owner-level editor; see §5 |
| Google / Gemini | Retain or train on feedback | Paid-tier API, member disclosure | Data minimisation (briefs send summaries only; deleted notes never sent) |
| The President (accidental) | Duplicate writes, demo data in live sheets, lost submissions | — | Idempotent note tokens, demo-write guard, replay detection, recovery function |

## 2. Access control

**Primary control (Google):** Deploy as *Execute as: Me* and *Who has access: Only myself*. Google then refuses the URL to anyone else before any code runs.

**Defense in depth (code):** every function the dashboard can call starts with `pgnAssertAuthorized_()`:

1. `caller = Session.getActiveUser().getEmail()` (lower-cased).
2. `allowed = { owner (Session.getEffectiveUser()) } ∪ PGN_ALLOWED_EMAILS`.
3. Allowed if `caller` is in `allowed`.
4. If `caller` is blank: denied, unless Script Property `PGN_ALLOW_BLANK_CALLER` is `"true"`.
5. `doGet` renders a static "Access denied" page instead of the dashboard when denied.

Why blank callers matter: under *Execute as Me*, Google only reveals the active user's e-mail when that user is the owner or in the owner's Workspace domain. The President (owner) therefore sees their own e-mail; an outside consumer account sees nothing and is denied. `PGN_ALLOW_BLANK_CALLER=true` must only ever be set while access is "Only myself" (then the only possible blank caller is Google's own redirect of the owner). **Never** set it together with a wider access level, because anonymous callers would then pass.

Functions ending in `_` cannot be called through `google.script.run`. Editor-only functions (`pgnSetupProject`, `test…`, `pgnReprocessMissingSubmissions`, …) are still guarded because they are technically remote-callable.

**What this does not do:** it cannot distinguish the President from someone using the President's signed-in browser. Use Google 2-step verification and lock the device.

## 3. Secrets

- `GEMINI_API_KEY` lives only in Script Properties. It is read inside `pgnCallGemini_()` and sent as the `x-goog-api-key` header. It is never logged, never returned to the client, never in the repository.
- Anyone who can open the Apps Script editor (i.e. every editor of the bound spreadsheet) can read Script Properties. Keep the spreadsheet shared with **no one**. Share dashboard access via `PGN_ALLOWED_EMAILS` plus a wider deployment setting only after a live test with a second account.
- Rotate the key if the Sheet or script was ever shared.

## 4. Data handling

| Data | Where stored | Sent to Gemini? |
|------|--------------|-----------------|
| Full form response | `Form Responses 1` (Google Forms) | Yes, once, for classification (≤ 8,000 chars) |
| Extracted excerpts + summaries | `Categorized Issues` | Excerpts: no (only at classification time). Summaries: yes, in briefs and as correction examples |
| Action notes | `Presidential Action Log` | Active notes only, in briefs (≤ 15, ≤ 350 chars each). Deleted notes never |
| Corrections | `Classification Corrections` | Summary + category only, ≤ 5 most relevant |
| Execution logs | Apps Script | Counts, IDs, HTTP status, finishReason, coverage %. Never text, never keys |

Prompt injection: feedback is passed as a JSON string in the *user* turn; rules live in `systemInstruction`; output is constrained by `responseSchema`; every excerpt must map back to the original text or the whole submission falls back to a single reviewable row. The brief prompt states that record text is untrusted. These reduce but cannot eliminate instruction-following by the model; AI output never changes records.

Formula injection: all user text is written with `setRichTextValues` plus "@" number format. Rich text cells cannot evaluate. The original text is stored unchanged (no apostrophe prefix).

XSS: the dashboard builds every node with `textContent`; there is no `innerHTML`, `insertAdjacentHTML`, `eval` or `document.write`. AI output is rendered as text.

## 5. Integrity limits

- Sheet editors can change any cell, including action-log history. The log is an aid to accountability, not evidence. Optional: run `SpreadsheetApp` protections (see `SETUP.md` §9) so edits outside the dashboard at least warn.
- `Deleted By` stores the signed-in dashboard e-mail when Google exposes it; otherwise "Presidential Dashboard". It is not a cryptographic identity.
- Group counts are recomputed from the issue rows on every change and can be rebuilt any time with `pgnRecalculateGroupCounts()`.

## 6. Availability / abuse

- Daily Gemini budget (`CONFIG.GEMINI_DAILY_CALL_LIMIT`, default 150; override `PGN_GEMINI_DAILY_LIMIT`). Beyond it, submissions are still saved ("AI Failed") and can be reprocessed later with `pgnReprocessMissingSubmissions()` after deleting those rows, or simply reviewed manually.
- Retries with backoff on 429/5xx; one lock per operation with a 30 s wait and a friendly error.
- Consumer accounts: 90 minutes of trigger runtime per day; each AI submission uses roughly 3–10 s. A Form flood is the main DoS vector; Google Forms offers no rate limit, so the practical defence is the AI budget plus the fact that rule-free rows are cheap to store.

## 7. Anonymity (not a code property)

- In the Form: *Settings → Responses → Collect email addresses: Off*; *Limit to 1 response: Off* (it forces sign-in); *Allow response editing: Off*.
- Timestamps, writing style and specific details can identify a respondent. The dashboard never shows respondent identity because none is stored; the President should still treat excerpts as sensitive.
- The Form description should state that responses are processed by Google's Gemini API.

## 8. CSRF / replay

`google.script.run` calls are authenticated by Google's session and are not reachable from third-party pages. Replays of the trigger are detected by submission ID + timestamp. Duplicate note submissions are suppressed by an hour-long idempotency token. Mutations validate every ID (`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`) and every enumerated value server-side.

## 9. Checklist before real feedback

- [ ] Web app: Execute as Me / Only myself.
- [ ] Spreadsheet shared with nobody; Form "collect email" off.
- [ ] `GEMINI_API_KEY` set; billing tier decided; members informed.
- [ ] `testPGNAuthorization` logged `authorized: true`.
- [ ] Opened the dashboard from a second account (expected: Google's own access error or the "Access denied" page).
- [ ] Demo rows (`AI-DEMO-…`) removed; `PGN_ALLOW_DEMO_WRITES` unset.
