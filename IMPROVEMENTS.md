# Improvements — implemented, critical remaining, optional

## 1. Implemented in this package

**Security**
- Server-side authorization on every endpoint and on `doGet`; private helpers unreachable remotely; allowlist and fail-closed blank-caller policy.
- RichTextValue writes: formula injection impossible, original text preserved exactly.
- Gemini: system/user separation, structured output schema, retries with backoff, daily budget, length cap, safety thresholds tuned so harsh-but-legitimate complaints are not silently blocked.
- Demo-write guard; idempotent note saves; strict ID/enum validation on all inputs; no feedback or keys in logs.

**Correctness**
- One lock per operation; batched reads/writes (1,000 issues sync in ≤ 6 calls); counts recomputed in one write.
- Replay vs. collision detection; header-mismatch fallback; missing-submission recovery function; full-submission viewer.
- Excerpt locator tolerant of quote/whitespace normalisation; duplicate excerpt removal; coverage logging.
- Correction relevance thresholds, newest-decision-wins, contradiction collapse.
- Merge audit trail (Merged status, pointer, system note, no resurrection); archived groups visible with notes.
- Brief: guaranteed "no actions recorded" text, newest complaints, deleted notes excluded, cache.
- Case normalisation of categories; AI topic hints (validated against known titles) as a fallback to regex grouping.

**UX / accessibility / performance**
- Single dashboard script; hash routing (back button, deep links); keyboard-operable rows with real links; labelled controls; inline confirmations; focus management; `aria-live` status; skip link; AA contrast; method filter; archived section; linked action log; reset filters; viewer e-mail in footer.

## 2. Critical before relying on it with real feedback (not code)

1. **Live verification** of the NOT EXECUTED items in `TEST_RESULTS.md` §4, especially authorization visibility (`testPGNAuthorization`) and model availability (`testStructuredGemini`).
2. **Gemini billing tier and member disclosure** (free tier may use prompts for product improvement).
3. **Form settings** (no e-mail collection) and spreadsheet sharing (owner only).

## 3. Optional improvements, in priority order

| Priority | Improvement | Why | Effort |
|----------|-------------|-----|--------|
| High | Paginate or lazy-load the issue list in `getPGNManagementData` once rows exceed ~2,000 | Each dashboard load currently ships every issue (fine to ~1,500 rows; ~1 MB beyond) | Medium |
| High | Protected ranges on managed sheets (warning mode) via a `pgnProtectSheets()` helper | Reduces accidental manual edits that bypass validation | Low |
| Medium | Editable "President Notes" (issue column L, group column J) from the dashboard | Columns exist but are read-only in the UI | Low |
| Medium | Weekly digest e-mail to the President (new issues, review queue size, budget used) via a time trigger | Pull model today; nothing alerts the President to new feedback | Low |
| Medium | Embedding-based grouping (Gemini `embedContent`) with a similarity threshold, surfaced as *suggestions* the President confirms | Regex + title hints still miss paraphrases | Medium |
| Medium | Export (CSV) of filtered complaints and action log from the dashboard | Reporting to executives without sharing the Sheet | Low |
| Medium | Bulk actions (set urgency/status on multiple selected issues) | Review queue triage at scale | Medium |
| Low | Move `RECURRING_TOPICS` and `CATEGORY_RULES` into a "Config" sheet | Non-developers could add topics | Medium |
| Low | Per-executive read-only views (requires widened access + domain accounts) | VPs see only their category | High (security review first) |
| Low | Trend charts (issues per week by category) | Overview is counts only | Low |
| Low | Dark-mode styles | Dashboard is light-only | Low |
| Low | Unit tests for `Index.html` rendering functions in jsdom | Browser pass is manual today | Medium |

## 4. Explicitly rejected

- **Auto-resolving issues from action notes.** Violates the acceptance criteria; notes remain documentation only.
- **Sending full original text to Gemini for briefs.** Summaries are sufficient and minimise data exposure.
- **Storing respondent identity of any kind.** Out of scope by design.
- **Hard-deleting notes or groups from the dashboard.** Soft delete / archive only; the Sheet remains the system of record.
