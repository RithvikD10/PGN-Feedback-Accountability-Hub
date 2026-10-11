# PGN Feedback & Accountability Hub

Private Google Apps Script application for Phi Gamma Nu presidential leadership. Google Forms feedback lands in Google Sheets, Gemini splits and classifies each concern to an executive area, recurring issues are grouped and counted, the President corrects classifications (which inform future AI prompts), records dated action notes, and can request an on-demand AI Leadership Brief.

**Status:** audited and rewritten 2026-10-11. Synthetic tests pass (41/41) and the dashboard was exercised in a browser against the real backend logic. Live verification on your Google account is still required — see `TEST_RESULTS.md` §4 and `SETUP.md` §5.

## Files

| File | Purpose |
|------|---------|
| `Code.gs` | Complete Apps Script backend: intake trigger, Gemini transport, grouping, management RPCs, authorization, setup/admin and editor tests. |
| `Index.html` | Complete dashboard (single script, embedded PGN logo). |
| `SETUP.md` | Upgrade and from-scratch deployment, Script Properties, verification, operations. |
| `SECURITY_PRIVACY.md` | Threat model, controls, limits, pre-launch checklist. |
| `AUDIT_REPORT.md` | Severity-ranked findings with original file/line references and fixes. |
| `TEST_RESULTS.md` | PASS / FAIL / NOT EXECUTED with live test scripts. |
| `TEST_PLAN.md` | Test matrix (updated). |
| `IMPROVEMENTS.md` | Implemented, critical-remaining and optional improvements. |
| `tests/` | Node test harness: Apps Script mocks, 41-scenario suite, synthetic dataset, browser preview builder and static server. No dependencies. |
| `CLAUDE_MASTER_AUDIT.md` | The audit brief (unchanged). |

## Architecture

```
Google Form ──> Form Responses 1 ──(On form submit trigger)──> processFormSubmission
                                                                 │ lock
                                                                 ├─ pgnSaveIssues_  ──> Gemini (classification, structured JSON)
                                                                 │                      fallback: single "AI Failed" row (full text kept)
                                                                 └─ pgnSyncRecurringIssues_ (regex + validated AI topic hints, batched)
Dashboard (Index.html) ──google.script.run──> guarded RPCs ──> Sheets
                                               └─ generatePGNLeadershipBrief ──> Gemini (summaries + active notes only)
```

Sheets: `Categorized Issues` (A:N), `Recurring Issues` (A:J), `Classification Corrections` (A:E), `Presidential Action Log` (A:I). Headers are listed in `PGN_SHEET_HEADERS` in `Code.gs`; `pgnSetupProject()` creates missing sheets.

## Quick start

1. Follow `SETUP.md` (A for upgrade, B for a new account).
2. Run `pgnSetupProject`, `pgnInstallFormTrigger`, `testPGNAuthorization`, `testStructuredGemini` from the editor.
3. Deploy as **Execute as Me / Only myself**; open the URL; submit a synthetic Form response.

## Local tests (no Google account)

```bash
node tests/run-tests.js
```

```bash
node tests/build-preview.js && node tests/serve.js
```

## Important constraints

- Anonymity depends on Form settings and member behaviour; the system stores no identity but timestamps and wording can identify people.
- Feedback and summaries are sent to Google's Gemini API. Review billing tier and data-use terms, and tell members.
- Corrections guide Gemini through prompt examples; they do not retrain any model.
- Action notes document steps; they never change an issue's status. Deleted notes are hidden, excluded from AI, and restorable.
- Group counts always equal the number of linked issue rows; manual assignments are never overridden by automatic grouping.
- Direct spreadsheet editors bypass all validation. Keep the Sheet owner-only.
- Never publish member feedback, IDs, Sheet URLs, API keys or personal details in a repository.
