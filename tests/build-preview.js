#!/usr/bin/env node
/**
 * Builds tests/dashboard-preview.html: the real Index.html wired to the
 * real Code.gs running against the in-memory mocks, with a bridge that
 * emulates google.script.run (async, JSON-serialized, private functions
 * unreachable). Lets the dashboard be exercised in any browser without
 * Google services. Synthetic data only.
 *
 *   node tests/build-preview.js && node tests/serve.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "Index.html"), "utf8");
const mocks = fs.readFileSync(path.join(__dirname, "apps-script-mocks.js"), "utf8");
const code = fs.readFileSync(path.join(ROOT, "Code.gs"), "utf8");
const dataset = fs.readFileSync(path.join(__dirname, "synthetic-dataset.json"), "utf8");

const bridge = `
<script>${mocks.replace(/<\/script>/g, "<\\/script>")}</script>
<script>
(function () {
  const env = PGNMocks.createEnvironment({
    properties: { GEMINI_API_KEY: "TEST-KEY-NOT-REAL" },
    session: { effectiveUser: "president@example.com", activeUser: "president@example.com", timeZone: "America/New_York" }
  });
  Object.assign(window, env.globals);
  window.__pgnEnv = env;
  window.__pgnDataset = ${dataset};
})();
</script>
<script>${code.replace(/<\/script>/g, "<\\/script>")}</script>
<script>
(function () {
  const env = window.__pgnEnv;
  const DATASET = window.__pgnDataset;
  env.fetch.handler = function (url, options) {
    const payload = JSON.parse(options.payload);
    const system = payload.systemInstruction.parts[0].text;
    const user = payload.contents[0].parts[0].text;
    if (/leadership brief/i.test(system)) {
      const records = JSON.parse(user.split("\\n").slice(1).join("\\n"));
      return env.geminiOk({
        concern: "Members report " + records.complaints.length + " related concern(s) about " + records.group.title.toLowerCase() + ".",
        actions: records.activeActions.length ? "Notes document: " + records.activeActions.map(a => a.text).join(" / ") : "",
        uncertainties: "The records do not show whether any step changed member experience.",
        nextStep: "Consider confirming next steps at the next executive meeting."
      });
    }
    const feedback = JSON.parse(user.split("\\n").slice(1).join("\\n"));
    const entry = DATASET.submissions.find(s => s.feedback === feedback);
    if (entry) return env.geminiOk(entry.gemini);
    return env.geminiOk({ issues: [{ category: "Uncategorized", summary: feedback.slice(0, 60), originalText: feedback, topic: null }] });
  };

  // Seed: Form Responses + full pipeline through the real backend.
  const form = env.spreadsheet.insertSheet("Form Responses 1");
  form.getRange(1, 1, 1, 3).setValues([DATASET.formHeaders]);
  pgnSetupProject();
  let clock = new Date("2026-09-28T23:30:00-04:00").getTime();
  DATASET.submissions.forEach(function (s, index) {
    clock += 11 * 3600 * 1000;
    const row = form.getLastRow() + 1;
    form.getRange(row, 1, 1, 3).setValues([[new Date(clock), s.type, s.feedback]]);
    processFormSubmission(env.formEvent(row));
  });
  const data = pgnLoadManagementData_();
  const finance = data.groups.find(g => g.title === "Cost of Membership");
  if (finance) {
    addPGNActionNote("Group", finance.id, "Asked the VP of Finance to prepare a dues breakdown for the next chapter meeting.");
    const removed = addPGNActionNote("Group", finance.id, "Draft note that was deleted on purpose (should only appear under Deleted Notes).");
    deletePGNActionNote(removed.logId);
    pgnSetRecurringGroupManagement(finance.id, "High", "In Progress");
  }
  addPGNActionNote("Issue", "PGN-0001-A", "Discussed company speaker pipeline with the VP of Externals.");
  updatePGNIssueCategory("PGN-0003-A", "Finance");

  // google.script.run emulation: async, JSON round-trip, private functions unreachable.
  function newRunner() {
    const handlers = { success: null, failure: null };
    const runner = new Proxy({}, {
      get: function (_, name) {
        if (name === "withSuccessHandler") return fn => { handlers.success = fn; return runner; };
        if (name === "withFailureHandler") return fn => { handlers.failure = fn; return runner; };
        if (name === "withUserObject") return () => runner;
        return function () {
          const args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
          setTimeout(function () {
            try {
              if (/_$/.test(name) || typeof window[name] !== "function") {
                throw new Error("ScriptError: " + name + " is not a public function.");
              }
              const result = window[name].apply(null, args);
              const serialized = result === undefined ? null : JSON.parse(JSON.stringify(result));
              if (handlers.success) handlers.success(serialized);
            } catch (error) {
              if (handlers.failure) handlers.failure(new Error(error && error.message || String(error)));
            }
          }, 120);
        };
      }
    });
    return runner;
  }
  window.google = { script: { get run() { return newRunner(); } } };
})();
</script>
`;

const marker = "<script>\n(function () {\n  \"use strict\";";
if (!html.includes(marker)) throw new Error("Could not find the dashboard script marker in Index.html");
// Function replacement: inlined code contains "$&", which a string
// replacement would expand.
const output = html.replace(marker, () => bridge + marker);
fs.writeFileSync(path.join(__dirname, "dashboard-preview.html"), output);
console.log("Wrote tests/dashboard-preview.html (" + output.length + " bytes)");
