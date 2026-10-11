# Test Results — 2026-10-11

Legend: **PASS** / **FAIL** / **NOT EXECUTED** (requires Google services, a real browser session on Apps Script, or a live Gemini key).

Environment: Node v24, Windows 11, Chromium-based browser pane. No Google account, Sheet, Form, trigger or API key was used. All data synthetic (`tests/synthetic-dataset.json`).

## 1. Static checks

| Check | Result |
|-------|--------|
| `node --check Code.gs` (as JS) | PASS |
| `node --check` on the single `Index.html` script block | PASS |
| No `innerHTML` / `insertAdjacentHTML` / `document.write` / `eval` in `Index.html` | PASS (0 occurrences) |
| All non-public helpers end in `_` (unreachable via `google.script.run`) | PASS (44 private, 30 public, every public one guarded or trigger-validated) |
| No API key, Sheet URL, or real feedback in the package | PASS (grep) |

## 2. Synthetic unit/integration suite — `node tests/run-tests.js`

The real `Code.gs` runs in a VM against mocked `SpreadsheetApp`, `LockService` (nested-lock detection), `PropertiesService`, `CacheService`, `UrlFetchApp` (programmable Gemini responses), `Utilities`, `Logger`, `Session`, `HtmlService`, `ScriptApp`. Test IDs map to `TEST_PLAN.md` sections.

| Test | Scenario | Result |
|------|----------|--------|
| 1.0 | Static: Code.gs parses and private helpers are underscore-suffixed | PASS |
| 11.1 | Setup: pgnSetupProject creates managed sheets with headers, non-destructively | PASS |
| 11.2 | Setup: trigger installer is idempotent | PASS |
| 1.1 | Intake: multi-concern submission creates one row per issue with exact excerpts | PASS |
| 1.2 | Intake: groups created from regex/AI topic hints with exact counts | PASS |
| 1.3 | Intake: replaying the same trigger creates no duplicate rows or AI calls | PASS |
| 1.4 | Intake: shifted response rows (deleted row) get a unique suffixed ID instead of being dropped | PASS |
| 1.5 | Intake: curly quotes/whitespace differences in AI excerpts map back to the exact original text | PASS |
| 1.6 | Intake: empty feedback is skipped without AI calls or rows | PASS |
| 1.7 | Intake: edited form question titles never lose a submission (Header Mismatch row) | PASS |
| 1.8 | Intake: fake trigger events from the client are rejected | PASS |
| 2.1 | AI failure: HTTP 429 is retried with backoff and then succeeds | PASS |
| 2.2 | AI failure: persistent HTTP 500 preserves the full submission as one AI Failed row | PASS |
| 2.3 | AI failure: HTTP 400 is not retried | PASS |
| 2.4 | AI failure: invalid JSON, empty output, safety block, foreign excerpt, no/too many issues, network exception all fall back safely | PASS |
| 2.5 | AI failure: daily call budget and length cap stop AI calls but keep the submission | PASS |
| 2.6 | Logging: execution logs never contain feedback text or the API key | PASS |
| 9.1 | Security: formula-like feedback is stored verbatim as text, never as a formula (issues, notes, corrections) | PASS |
| 9.2 | Security: prompt-injection text is passed as data (JSON string in user turn) with explicit guardrails | PASS |
| 3.1 | Corrections: Uncategorized → Finance updates executive, logs correction, keeps text, re-syncs groups | PASS |
| 3.2 | Corrections: same category is a no-op; re-correction makes the newest example win; invalid inputs rejected | PASS |
| 3.3 | Corrections: relevance requires real keyword overlap; conflicting duplicates resolve to newest | PASS |
| 4.1 | Grouping: manual assignment persists through automatic sync; explicit ungroup persists; counts exact | PASS |
| 4.2 | Grouping: cross-category assignment and unknown IDs are rejected | PASS |
| 4.3 | Grouping: merge moves issues, archives source (count 0), keeps notes, logs a system note, no resurrection, invalid merges rejected | PASS |
| 5.1 | Action log: add, idempotent retry, soft delete, restore (text/time unchanged, metadata updated), validation | PASS |
| 6.1 | Group management: priority/status persist; invalid values rejected; action notes never close issues | PASS |
| 7.1 | Brief: zero actions → explicit "no actions recorded" regardless of model text | PASS |
| 7.2 | Brief: deleted notes never reach the model; context is minimized to summaries | PASS |
| 7.3 | Brief: malformed model output falls back; identical context served from cache; archived/invalid group rejected | PASS |
| 9.3 | Security: unauthorized accounts are denied on all 22 remote endpoints and on doGet | PASS |
| 9.4 | Security: allowlist property, blank-caller policy and owner access behave as documented | PASS |
| 8.1 | Dashboard data: shape, ISO dates, case-normalized categories, archived flags, legacy aliases | PASS |
| 8.2 | Dashboard data: full submission text is retrievable and shifted rows are detected | PASS |
| 1.9 | Recovery: pgnReprocessMissingSubmissions re-ingests responses that have no issue rows | PASS |
| 10.1 | Scale: 1,000 issues sync with ≤ 6 reads and ≤ 6 writes; dashboard load reads once and never writes | PASS |
| 10.2 | Concurrency: lock contention produces a friendly error and no partial writes; lock always released | PASS |
| 8.3 | Issue management: urgency/status validation and persistence | PASS |
| 1.10 | Rule-based fallback: whole-word keyword matching and paragraph splitting | PASS |
| 1.11 | Excerpt locator: exact, whitespace/quote-normalized and trailing-punctuation tolerant | PASS |
| 4.4 | Grouping: ambiguous regex matches stay ungrouped; AI topic hint only accepted for known titles | PASS |

**41 passed, 0 failed.**

## 3. Browser pass — real `Index.html` + real `Code.gs` via emulated `google.script.run`

Built with `node tests/build-preview.js`, served by `tests/serve.js`, viewed in a Chromium pane at 1280×1000 and 375×812.

| TEST_PLAN § | Check | Result |
|-------------|-------|--------|
| 8 | Logo renders; header, nav, footer, branding intact | PASS |
| 8 | Overview counts consistent with data (9 issues / 5 submissions / 5 active groups / 9 in review) | PASS |
| 8 | Search (text, IDs, group IDs), category, urgency, status, method filters; reset | PASS |
| 8 | Date filters use local calendar date (5 matches local vs 3 if UTC were used) | PASS |
| 8 | Issue detail: all fields, original text, category editor preview, group assignment list (same category only), management selects, action editor | PASS |
| 8 | "View full submission" shows the complete form response | PASS |
| 5 | Save note → appears with Delete; inline two-step confirm (Confirm button receives focus) → note moves to Deleted Notes with "Deleted … by president@example.com" → Restore → back in active list with "Restored …" | PASS |
| 7 | Leadership brief renders four sections + counts; request payload contains the active note and **not** the deleted note | PASS |
| 4/6 | Group page: priority/status shown; merge with confirm → redirected to surviving group (2 reports), source listed under Archived with "Merged Into", archived page hides management/brief controls and links to survivor; system note on target | PASS |
| 8 | Keyboard: focus table row → Enter opens the record; heading receives focus after navigation; browser Back returns to the list with correct nav state | PASS |
| 9 | Refresh as a non-allowlisted account → "Unable to load database: Not authorized … (caller-not-allowlisted)" error state, refresh re-enabled | PASS |
| 8 | 375 px viewport: no horizontal page overflow on overview, complaints, issue and group pages; tables scroll inside their wrappers | PASS |
| 8 | Console: no errors from the dashboard (only stale errors from an earlier broken build of the harness itself) | PASS |

## 4. NOT EXECUTED (require your Google environment) — with exact live steps

| TEST_PLAN § | What | How to run |
|-------------|------|-----------|
| 1 | Real Form → Sheet → trigger → Gemini → rows | `SETUP.md` §5 step 4. Expect `PGN-000n-A…`, method "Gemini AI", groups updated. Submit the same text again: new ID, no error. |
| 2 | Real Gemini 429/500/timeout | Temporarily set `PGN_GEMINI_DAILY_LIMIT=0`, submit: row saved as "AI Failed" with full text, log says "budget". Remove the property. Also set `GEMINI_MODEL` to a bogus name once: expect HTTP 404 in log, row preserved. |
| 2 | Gemini model availability (`gemini-3.1-flash-lite`, `v1beta`, `responseSchema`/`systemInstruction` acceptance) | Run `testStructuredGemini`. If it fails with HTTP 400, check the log message and try `GEMINI_MODEL` = another Flash model. |
| 3 | Correction learning with the live model | `testPGNGeminiCorrectionLearning` after making one real correction. Expect the example in the log and the classification to respect it. |
| 7 | Brief quality with 0 / plans-only / completed notes | Generate three briefs on one synthetic group; confirm the "actions" section never claims completion that the notes do not state. |
| 9 | Deployment access from a second account | `SETUP.md` §5 step 6. |
| 9 | `Session.getActiveUser()` visibility for the owner | `testPGNAuthorization` → `callerVisible: true`. |
| 9 | RichTextValue + "@" format behaviour on real Sheets | After step 4, type `=1+1` as feedback in a synthetic submission; the cell must show the literal text. |
| 10 | Concurrent live submissions / 6-minute limit at 1,000 rows | Submit 3 responses within a few seconds; check Executions for lock waits (none should fail). |
| 11 | Fresh-account recreation | `SETUP.md` §B. |
| 8 | Screen-reader pass (NVDA/VoiceOver) | Manual. Structure is in place (labels, aria-live, aria-current, focus management). |

## 5. Known limitations observed during testing

- Browser form-state restoration can re-apply previously chosen filter values after a page reload (Chrome behaviour, not a bug). The Reset button clears them.
- The preview harness emulates `google.script.run` with a 120 ms delay; real Apps Script latency is 0.5–3 s per call, so the "Updating dashboard…" messages will be visible longer.
