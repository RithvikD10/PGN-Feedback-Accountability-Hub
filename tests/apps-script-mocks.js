/**
 * In-memory mocks of the Google Apps Script services used by Code.gs.
 * Works in Node (module.exports) and in the browser (window.PGNMocks).
 *
 * Only synthetic data is ever used with these mocks. They emulate:
 * - SpreadsheetApp / Spreadsheet / Sheet / Range (values, rich text,
 *   number formats, a "formula" flag for injection tests, call counters)
 * - LockService (detects nested lock acquisition = programming error)
 * - PropertiesService, CacheService, Utilities, Logger, Session,
 *   HtmlService, ScriptApp, UrlFetchApp (programmable responses)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PGNMocks = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clone(value) {
    return value instanceof Date ? new Date(value.getTime()) : value;
  }

  function isEmpty(value) {
    return value === undefined || value === null || value === "";
  }

  class RichTextValue {
    constructor(text) { this.text = String(text); }
    getText() { return this.text; }
  }

  class RichTextValueBuilder {
    constructor() { this.text = ""; }
    setText(text) { this.text = String(text); return this; }
    build() { return new RichTextValue(this.text); }
  }

  class Range {
    constructor(sheet, row, column, numRows, numColumns) {
      this.sheet = sheet;
      this.row = row;
      this.column = column;
      this.numRows = numRows;
      this.numColumns = numColumns;
    }
    getRow() { return this.row; }
    getColumn() { return this.column; }
    getSheet() { return this.sheet; }
    getValues() {
      this.sheet.stats.reads++;
      const out = [];
      for (let r = 0; r < this.numRows; r++) {
        const rowValues = [];
        for (let c = 0; c < this.numColumns; c++) {
          rowValues.push(clone(this.sheet._get(this.row + r, this.column + c)));
        }
        out.push(rowValues);
      }
      return out;
    }
    getDisplayValues() {
      return this.getValues().map(row => row.map(v =>
        v instanceof Date ? v.toISOString() : String(v == null ? "" : v)
      ));
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(values) {
      this.sheet.stats.writes++;
      if (values.length !== this.numRows || values.some(r => r.length !== this.numColumns)) {
        throw new Error(
          "The number of rows or columns in the data does not match the range (" +
          this.sheet.name + " " + this.row + "," + this.column + " " +
          this.numRows + "x" + this.numColumns + " vs " +
          values.length + "x" + (values[0] ? values[0].length : 0) + ")"
        );
      }
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numColumns; c++) {
          this.sheet._set(this.row + r, this.column + c, values[r][c], false);
        }
      }
      return this;
    }
    setValue(value) { return this.setValues([[value]]); }
    setRichTextValues(values) {
      this.sheet.stats.writes++;
      if (values.length !== this.numRows || values.some(r => r.length !== this.numColumns)) {
        throw new Error("Rich text dimensions do not match the range.");
      }
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numColumns; c++) {
          const v = values[r][c];
          if (!(v instanceof RichTextValue)) throw new Error("Expected RichTextValue.");
          this.sheet._set(this.row + r, this.column + c, v.getText(), true);
        }
      }
      return this;
    }
    setRichTextValue(value) { return this.setRichTextValues([[value]]); }
    setNumberFormat(format) {
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numColumns; c++) {
          this.sheet.formats[(this.row + r) + ":" + (this.column + c)] = format;
        }
      }
      return this;
    }
    clearContent() {
      for (let r = 0; r < this.numRows; r++) {
        for (let c = 0; c < this.numColumns; c++) {
          this.sheet._set(this.row + r, this.column + c, "", false);
        }
      }
      return this;
    }
    setFontWeight() { return this; }
    setBackground() { return this; }
    setFontColor() { return this; }
    setWrap() { return this; }
  }

  class Sheet {
    constructor(name) {
      this.name = name;
      this.cells = new Map();     // "r:c" -> value
      this.textCells = new Set(); // cells written as rich text
      this.formulas = new Set();  // cells that Sheets would evaluate as formulas
      this.formats = {};
      this.frozenRows = 0;
      this.maxRow = 0;
      this.maxCol = 0;
      this.stats = { reads: 0, writes: 0 };
    }
    getName() { return this.name; }
    _get(row, col) {
      const v = this.cells.get(row + ":" + col);
      return v === undefined ? "" : v;
    }
    _set(row, col, value, richText) {
      const key = row + ":" + col;
      if (value === undefined || value === null) value = "";
      this.cells.set(key, clone(value));
      this.formulas.delete(key);
      if (richText) {
        this.textCells.add(key);
      } else {
        this.textCells.delete(key);
        // Emulate Google Sheets: a string beginning with "=" written
        // into a cell that is not plain-text formatted becomes a formula.
        if (typeof value === "string" && /^\s*=/.test(value) && this.formats[key] !== "@") {
          this.formulas.add(key);
        }
      }
      if (!isEmpty(value)) {
        this.maxRow = Math.max(this.maxRow, row);
        this.maxCol = Math.max(this.maxCol, col);
      }
    }
    getLastRow() {
      let last = 0;
      this.cells.forEach((v, key) => {
        if (!isEmpty(v)) last = Math.max(last, Number(key.split(":")[0]));
      });
      return last;
    }
    getLastColumn() {
      let last = 0;
      this.cells.forEach((v, key) => {
        if (!isEmpty(v)) last = Math.max(last, Number(key.split(":")[1]));
      });
      return last;
    }
    getRange(row, column, numRows, numColumns) {
      if (typeof row === "string") throw new Error("A1 notation not supported in mock: " + row);
      if (row < 1 || column < 1) throw new Error("Range out of bounds.");
      return new Range(this, row, column, numRows || 1, numColumns || 1);
    }
    appendRow(values) {
      const row = this.getLastRow() + 1;
      values.forEach((v, i) => this._set(row, i + 1, v, false));
      return this;
    }
    setFrozenRows(n) { this.frozenRows = n; return this; }
    setColumnWidth() { return this; }
    deleteRow(row) {
      const next = new Map();
      this.cells.forEach((v, key) => {
        const [r, c] = key.split(":").map(Number);
        if (r === row) return;
        next.set((r > row ? r - 1 : r) + ":" + c, v);
      });
      this.cells = next;
      return this;
    }
    // Test helper: all rows as arrays (row 1 = headers)
    dump(width) {
      const out = [];
      const last = this.getLastRow();
      for (let r = 1; r <= last; r++) {
        const row = [];
        for (let c = 1; c <= width; c++) row.push(this._get(r, c));
        out.push(row);
      }
      return out;
    }
  }

  class Spreadsheet {
    constructor() { this.sheets = []; }
    getSheetByName(name) { return this.sheets.find(s => s.name === name) || null; }
    insertSheet(name) {
      if (this.getSheetByName(name)) throw new Error("Sheet exists: " + name);
      const sheet = new Sheet(name);
      this.sheets.push(sheet);
      return sheet;
    }
    getSheets() { return this.sheets.slice(); }
  }

  function createEnvironment(options) {
    options = options || {};
    const env = {};
    env.spreadsheet = new Spreadsheet();
    env.logs = [];
    env.properties = Object.assign({}, options.properties || {});
    env.cache = new Map();
    env.sleeps = [];
    env.triggers = [];
    env.session = Object.assign({
      effectiveUser: "president@example.com",
      activeUser: "president@example.com",
      timeZone: "America/New_York"
    }, options.session || {});
    env.fetch = {
      calls: [],
      // handler(url, options, callIndex) -> { code, body }
      handler: () => ({ code: 500, body: "{}" }),
      queue: []
    };
    env.lock = { held: false, contention: false, acquisitions: 0 };

    const SpreadsheetApp = {
      getActiveSpreadsheet: () => env.spreadsheet,
      flush: () => {},
      newRichTextValue: () => new RichTextValueBuilder()
    };

    const LockService = {
      getScriptLock: () => ({
        tryLock: () => {
          if (env.lock.contention) return false;
          if (env.lock.held) {
            throw new Error("Nested lock acquisition detected (lock discipline bug).");
          }
          env.lock.held = true;
          env.lock.acquisitions++;
          return true;
        },
        waitLock: function (ms) {
          if (!this.tryLock(ms)) throw new Error("Lock timeout");
        },
        releaseLock: () => { env.lock.held = false; },
        hasLock: () => env.lock.held
      })
    };

    const PropertiesService = {
      getScriptProperties: () => ({
        getProperty: key => Object.prototype.hasOwnProperty.call(env.properties, key)
          ? env.properties[key] : null,
        setProperty: (key, value) => { env.properties[key] = String(value); },
        deleteProperty: key => { delete env.properties[key]; },
        getProperties: () => Object.assign({}, env.properties)
      })
    };

    const CacheService = {
      getScriptCache: () => ({
        get: key => env.cache.has(key) ? env.cache.get(key) : null,
        put: (key, value) => { env.cache.set(key, String(value)); },
        remove: key => { env.cache.delete(key); }
      })
    };

    function pad(n, w) { return String(n).padStart(w, "0"); }
    function formatDate(date, tz, pattern) {
      const d = date instanceof Date ? date : new Date(date);
      const map = {
        yyyy: d.getFullYear(), MM: pad(d.getMonth() + 1, 2), dd: pad(d.getDate(), 2),
        HH: pad(d.getHours(), 2), mm: pad(d.getMinutes(), 2), ss: pad(d.getSeconds(), 2)
      };
      return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, token => map[token]);
    }
    let uuidCounter = 0;
    function uuid() {
      uuidCounter++;
      const hex = pad(uuidCounter.toString(16), 12);
      return "00000000-0000-4000-8000-" + hex;
    }
    function digest(text) {
      // Deterministic 16-byte pseudo-digest (not cryptographic; cache keys only).
      const bytes = new Array(16).fill(0);
      const s = String(text);
      for (let i = 0; i < s.length; i++) {
        bytes[i % 16] = (bytes[i % 16] * 31 + s.charCodeAt(i)) & 0xff;
      }
      return bytes.map(b => (b > 127 ? b - 256 : b));
    }
    const Utilities = {
      getUuid: uuid,
      formatDate,
      sleep: ms => { env.sleeps.push(ms); },
      computeDigest: (alg, text) => digest(text),
      DigestAlgorithm: { MD5: "MD5" },
      Charset: { UTF_8: "UTF_8" }
    };

    const Logger = { log: message => { env.logs.push(String(message)); } };

    const Session = {
      getEffectiveUser: () => ({ getEmail: () => env.session.effectiveUser }),
      getActiveUser: () => ({ getEmail: () => env.session.activeUser }),
      getScriptTimeZone: () => env.session.timeZone
    };

    class HtmlOutput {
      constructor(content) { this.content = content; this.title = ""; this.meta = []; }
      setTitle(title) { this.title = title; return this; }
      addMetaTag(name, content) { this.meta.push([name, content]); return this; }
      getContent() { return this.content; }
    }
    const HtmlService = {
      createHtmlOutputFromFile: name => new HtmlOutput("<!-- file:" + name + " -->"),
      createHtmlOutput: html => new HtmlOutput(html)
    };

    const ScriptApp = {
      getProjectTriggers: () => env.triggers.map(t => ({ getHandlerFunction: () => t })),
      newTrigger: fn => ({
        forSpreadsheet: () => ({ onFormSubmit: () => ({ create: () => { env.triggers.push(fn); } }) })
      })
    };

    const UrlFetchApp = {
      fetch: (url, fetchOptions) => {
        const index = env.fetch.calls.length;
        env.fetch.calls.push({ url, options: fetchOptions, payload: JSON.parse(fetchOptions.payload) });
        const response = env.fetch.queue.length
          ? env.fetch.queue.shift()
          : env.fetch.handler(url, fetchOptions, index);
        if (response instanceof Error) throw response;
        return {
          getResponseCode: () => response.code,
          getContentText: () => typeof response.body === "string" ? response.body : JSON.stringify(response.body)
        };
      }
    };

    env.globals = {
      SpreadsheetApp, LockService, PropertiesService, CacheService, Utilities,
      Logger, Session, HtmlService, ScriptApp, UrlFetchApp
    };

    // Builds a Gemini-style success envelope from an object.
    env.geminiOk = object => ({
      code: 200,
      body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(object) }] } }] }
    });
    env.geminiRaw = text => ({
      code: 200,
      body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] }
    });

    // Builds a fake form-submit trigger event for a response row.
    env.formEvent = rowNumber => {
      const sheet = env.spreadsheet.getSheetByName("Form Responses 1");
      return { range: sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn() || 1) };
    };

    return env;
  }

  return { createEnvironment, Sheet, Spreadsheet, RichTextValue };
});
