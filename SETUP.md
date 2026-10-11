# Setup & Deployment — PGN Feedback & Accountability Hub

Two paths: **A. Upgrade the existing project** (keep data) and **B. Recreate from scratch under a new Google account**. Both end with the same verification steps.

## A. Upgrade an existing deployment

1. **Back up.** File → Make a copy of the spreadsheet (copies the bound script too). Note the current web app URL.
2. **Replace code.** In the Apps Script editor replace the entire contents of `Code.gs` and `Index.html` with the files in this package. Save.
3. **Script Properties** (Project Settings → Script Properties): keep `GEMINI_API_KEY`. Optional keys are listed in §4.
4. **Run `pgnSetupProject`** from the editor (authorise when prompted). It is non-destructive: it creates missing managed sheets, fills only blank header cells (e.g. column N "Manual Group Override", action-log columns F–I), and reports whether the trigger and key exist. Read the log.
5. **Trigger.** Keep the existing *From spreadsheet → On form submit* trigger for `processFormSubmission`. If the log says none exists, run `pgnInstallFormTrigger` once.
6. **Deploy.** Deploy → Manage deployments → edit → *New version* → Deploy. Access stays *Execute as Me / Only myself*. The `/exec` URL is unchanged; `/dev` reflects saved edits immediately.
7. **Verify** (§5).

Existing rows are fully compatible: the schema is unchanged (issues A:N, groups A:J, corrections A:E, action log A:I). Old dashboards still work through the `getPGNManagementDataV2` alias until you redeploy.

## B. Recreate on a new Google account

1. **Form.** Create a Google Form with exactly these questions (titles must match `CONFIG` or be updated there):
   - *What type of feedback are you submitting?* (multiple choice, e.g. Complaint / Suggestion for improvement / Praise)
   - *What would you like PGN to know?* (paragraph, required)
   Settings → Responses: **Collect email addresses: Off**, Limit to 1 response: Off, Allow response editing: Off. Add a description telling respondents that submissions are processed with Google's Gemini API by the President only.
2. **Sheet.** Form → Responses → *Link to Sheets* → create a new spreadsheet. The tab must be named `Form Responses 1` (default).
3. **Script.** Spreadsheet → Extensions → Apps Script. Delete the default code. Create `Code.gs` and an HTML file named exactly `Index` (`Index.html`) with the package contents. Save.
4. **Script Properties.** Add `GEMINI_API_KEY` (from Google AI Studio or a Cloud project with the Generative Language API enabled). Decide on billing tier (see `SECURITY_PRIVACY.md` §7).
5. **Run `pgnSetupProject`**, authorise the scopes (Sheets, external requests, triggers, user identity), then run **`pgnInstallFormTrigger`**. Run `pgnSetupProject` again: `trigger: true`, `apiKey: true`, warnings empty.
6. **Deploy.** Deploy → New deployment → type *Web app*: Execute as **Me**, Who has access **Only myself** → Deploy. Open the URL.
7. **Verify** (§5).

## 4. Script Properties reference

| Key | Required | Meaning |
|-----|----------|---------|
| `GEMINI_API_KEY` | Yes for AI | Gemini API key. Never commit it. |
| `GEMINI_MODEL` | No | Overrides `CONFIG.MODEL` (`gemini-3.1-flash-lite`) without a code change, e.g. if that model is unavailable in your region/tier. |
| `PGN_ALLOWED_EMAILS` | No | Comma-separated extra dashboard viewers (only meaningful once access is widened). |
| `PGN_ALLOW_BLANK_CALLER` | No | `true` only if the President is denied on their own "Only myself" deployment (see §6). |
| `PGN_GEMINI_DAILY_LIMIT` | No | Overrides the daily AI call cap (default 150). |
| `PGN_ALLOW_DEMO_WRITES` | No | `true` lets `testSaveGeminiIssues` write a demo row. Remove afterwards. |

`CONFIG` at the top of `Code.gs` holds non-secret settings (sheet names, question titles, caps, `USE_GEMINI_FOR_FORMS`, `USE_AI_TOPIC_HINTS`).

## 5. Verification after deployment (do these in order)

1. Editor → run `testPGNAuthorization`. Expected log: `authorized: true`, `callerVisible: true`.
2. Editor → run `testStructuredGemini` (synthetic text, no writes). Expected: JSON with three issues. If it logs HTTP 404/400, set `GEMINI_MODEL` to an available model.
3. Open the web app URL. Expected: dashboard loads, footer shows *Signed in as <your email>*.
4. Submit a synthetic Form response with two concerns. Within ~10 s: `Categorized Issues` gains rows `PGN-000n-A/B`, `Recurring Issues` updates, dashboard refresh shows them.
5. In the dashboard: correct a category, add a note, delete and restore it, generate a brief. All should succeed and persist after Refresh.
6. From a different Google account open the URL. Expected: Google's "You need permission" page (deployment control) — never the dashboard.
7. Delete the synthetic rows from `Categorized Issues`, `Recurring Issues` (or leave groups), `Presidential Action Log`, `Classification Corrections`, and the Form response. Then run `pgnRecalculateGroupCounts`.

## 6. If the President is denied on their own dashboard

Google normally exposes the owner's e-mail to the script when the owner runs it. If the dashboard shows *Not authorized (caller-identity-unavailable)*:

1. Confirm the deployment is **Only myself**.
2. Add Script Property `PGN_ALLOW_BLANK_CALLER` = `true`.
3. Reload. Remove the property again before ever widening access.

## 7. Widening access later (optional, not recommended without a review)

1. Add the e-mails to `PGN_ALLOWED_EMAILS`.
2. Change *Who has access* to *Anyone with a Google account* (keep *Execute as Me*).
3. Test with one allowed and one non-allowed account. If an **allowed** consumer account is denied with `caller-identity-unavailable`, Google is hiding their identity under Execute-as-Me; the only safe alternative is a Workspace domain deployment. Do **not** set `PGN_ALLOW_BLANK_CALLER` in this configuration.

## 8. Operations

- **Recover missed submissions:** editor → `pgnReprocessMissingSubmissions` (processes up to 20 per run; re-run until `remaining: 0`).
- **Rebuild counts:** `pgnRecalculateGroupCounts`. **Re-run grouping:** `syncRecurringIssues` (never changes manual assignments).
- **Budget exhausted:** rows are saved as *AI Failed* and listed in the Review Queue; raise `PGN_GEMINI_DAILY_LIMIT` or review manually.
- **Logs:** Apps Script → Executions. Logs contain IDs, counts and HTTP statuses only.
- **Never delete rows from `Form Responses 1`.** If it happens, IDs after that row get a timestamp suffix automatically; nothing is lost.

## 9. Optional hardening

- Protect the managed sheets (Data → Protect sheets and ranges → "Show a warning") so manual edits outside the dashboard are deliberate.
- Set a Cloud project with billing for the Gemini API to avoid free-tier data use terms.
- Keep `USE_GEMINI_FOR_FORMS: false` until §5 step 2 passes; the rule-based splitter still files every submission.

## 10. Local synthetic tests (no Google account needed)

```bash
node tests/run-tests.js
```

```bash
node tests/build-preview.js && node tests/serve.js
```

The second command serves `http://127.0.0.1:8765/` — the real dashboard running against the real backend code on an in-memory spreadsheet with fictional data.
