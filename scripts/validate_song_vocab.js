const fs = require("fs");
const path = require("path");

const songId = process.argv[2];

if (!songId) {
  console.error("Usage: node scripts/validate_song_vocab.js bolly_001");
  process.exit(1);
}

const rootDir = path.join(__dirname, "..");
const songPath = path.join(rootDir, "data", "bollywood", "songs", `${songId}.json`);

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isArray(value) {
  return Array.isArray(value);
}

function pushIssue(arr, level, message) {
  arr.push({ level, message });
}

function validateRequiredRootFields(song, issues) {
  const requiredStringFields = ["id", "title", "film", "emotion", "register", "key_phrase"];
  for (const field of requiredStringFields) {
    if (!isNonEmptyString(song[field])) {
      pushIssue(issues, "error", `Missing or empty root field: ${field}`);
    }
  }

  if (song.schema_version !== 2) {
    pushIssue(issues, "error", `schema_version must be 2`);
  }

  if (!Number.isFinite(song.year)) {
    pushIssue(issues, "error", `year must be a number`);
  }

  const requiredArrayFields = ["singer", "lyricist", "composer", "notes", "tags", "expressions", "vocab_candidates"];
  for (const field of requiredArrayFields) {
    if (!isArray(song[field])) {
      pushIssue(issues, "error", `${field} must be an array`);
    }
  }

  if (!song.meta || typeof song.meta !== "object") {
    pushIssue(issues, "error", `meta must exist and be an object`);
  }
}

function validateExpressions(song, issues) {
  const expressions = Array.isArray(song.expressions) ? song.expressions : [];
  const count = expressions.length;

  if (count < 3 || count > 4) {
    pushIssue(issues, "error", `expressions must contain 3 to 4 items. Current: ${count}`);
  }

  let hasMetaphorOrCollocation = false;

  expressions.forEach((item, index) => {
    const prefix = `expressions[${index}]`;

    if (!item || typeof item !== "object") {
      pushIssue(issues, "error", `${prefix} must be an object`);
      return;
    }

    if (!isNonEmptyString(item.text)) {
      pushIssue(issues, "error", `${prefix}.text is required`);
    }

    if (!isNonEmptyString(item.normalized)) {
      pushIssue(issues, "error", `${prefix}.normalized is required`);
    }

    if (!isNonEmptyString(item.meaning_ja)) {
      pushIssue(issues, "error", `${prefix}.meaning_ja is required`);
    }

    if (!isNonEmptyString(item.type)) {
      pushIssue(issues, "error", `${prefix}.type is required`);
    } else {
      if (item.type === "metaphor" || item.type === "collocation") {
        hasMetaphorOrCollocation = true;
      }
    }

    if (![2, 3, 4].includes(item.importance)) {
      pushIssue(issues, "error", `${prefix}.importance must be 2, 3, or 4`);
    }

    if (!isNonEmptyString(item.status)) {
      pushIssue(issues, "error", `${prefix}.status is required`);
    }
  });

  if (!hasMetaphorOrCollocation) {
    pushIssue(issues, "warning", `expressions should include at least one metaphor or collocation`);
  }
}

function validateVocab(song, issues) {
  const vocab = Array.isArray(song.vocab_candidates) ? song.vocab_candidates : [];
  const count = vocab.length;

  if (count < 10 || count > 15) {
    pushIssue(issues, "error", `vocab_candidates must contain 10 to 15 items. Current: ${count}`);
  }

  let count4 = 0;
  let count3 = 0;
  let count2 = 0;

  const seenNormalized = new Set();

  vocab.forEach((item, index) => {
    const prefix = `vocab_candidates[${index}]`;

    if (!item || typeof item !== "object") {
      pushIssue(issues, "error", `${prefix} must be an object`);
      return;
    }

    if (!isNonEmptyString(item.word)) {
      pushIssue(issues, "error", `${prefix}.word is required`);
    }

    if (!isNonEmptyString(item.normalized)) {
      pushIssue(issues, "error", `${prefix}.normalized is required`);
    } else {
      if (seenNormalized.has(item.normalized)) {
        pushIssue(issues, "error", `${prefix}.normalized is duplicated: ${item.normalized}`);
      }
      seenNormalized.add(item.normalized);
    }

    if (!isNonEmptyString(item.pos)) {
      pushIssue(issues, "error", `${prefix}.pos is required`);
    }

    if (!isNonEmptyString(item.meaning_ja)) {
      pushIssue(issues, "error", `${prefix}.meaning_ja is required`);
    }

    if (![2, 3, 4].includes(item.importance)) {
      pushIssue(issues, "error", `${prefix}.importance must be 2, 3, or 4`);
    } else {
      if (item.importance === 4) count4 += 1;
      if (item.importance === 3) count3 += 1;
      if (item.importance === 2) count2 += 1;
    }

    if (!isNonEmptyString(item.status)) {
      pushIssue(issues, "error", `${prefix}.status is required`);
    }
  });

  if (count4 < 4 || count4 > 6) {
    pushIssue(issues, "warning", `importance 4 should usually be 4 to 6 items. Current: ${count4}`);
  }

  if (count3 < 4 || count3 > 6) {
    pushIssue(issues, "warning", `importance 3 should usually be 4 to 6 items. Current: ${count3}`);
  }

  if (count2 < 2 || count2 > 4) {
    pushIssue(issues, "warning", `importance 2 should usually be 2 to 4 items. Current: ${count2}`);
  }
}

function validateMeta(song, issues) {
  const meta = song.meta || {};

  if (meta.copyright_safe !== true) {
    pushIssue(issues, "warning", `meta.copyright_safe should be true`);
  }

  if (meta.lyrics_included !== false) {
    pushIssue(issues, "warning", `meta.lyrics_included should be false`);
  }

  if (!isNonEmptyString(meta.source_type)) {
    pushIssue(issues, "warning", `meta.source_type should be set`);
  }

  if (typeof meta.dedupe_ready !== "boolean") {
    pushIssue(issues, "warning", `meta.dedupe_ready should be boolean`);
  }
}

function printIssues(issues) {
  const errors = issues.filter(i => i.level === "error");
  const warnings = issues.filter(i => i.level === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    console.log("Validation passed with no issues.");
    return;
  }

  if (errors.length > 0) {
    console.log("Errors:");
    for (const issue of errors) {
      console.log(`  - ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const issue of warnings) {
      console.log(`  - ${issue.message}`);
    }
  }
}

function main() {
  const song = loadJson(songPath);
  const issues = [];

  validateRequiredRootFields(song, issues);
  validateExpressions(song, issues);
  validateVocab(song, issues);
  validateMeta(song, issues);

  printIssues(issues);

  const hasErrors = issues.some(i => i.level === "error");
  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validation succeeded: ${songId}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}