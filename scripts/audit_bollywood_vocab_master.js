/**
 * audit_bollywood_vocab_master.js
 *
 * Bollywood vocab master 監査スクリプト
 *
 * 実行:
 *   node scripts/audit_bollywood_vocab_master.js
 *
 * 入力:
 *   data/bollywood/vocab_master.json
 *
 * 出力:
 *   data/bollywood/audit/vocab_master_audit.json
 *
 * 注意:
 *   このスクリプトは読み取り専用です。
 *   vocab_master.json は変更しません。
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const MASTER_PATH = path.join(ROOT, "data", "bollywood", "vocab_master.json");
const AUDIT_DIR = path.join(ROOT, "data", "bollywood", "audit");
const OUT_PATH = path.join(AUDIT_DIR, "vocab_master_audit.json");

const VALID_IMPORTANCE = new Set([1, 2, 3, 4]);
const VALID_SONG_ID_RE = /^bolly_(\d{3})$/;
const MIN_SONG_NO = 1;
const MAX_SONG_NO = 46;

const REQUIRED_FIELDS = [
  "word",
  "normalized",
  "meaning_ja",
  "pos",
  "importance",
  "sourceSongIds",
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`JSON parse error in ${filePath}: ${err.message}`);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function toKey(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pushGrouped(map, key, item) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(item);
}

function groupDuplicates(map) {
  return Array.from(map.entries())
    .filter(([, items]) => items.length >= 2)
    .map(([key, items]) => ({
      key,
      count: items.length,
      items,
    }));
}

function normalizeForLooseCompare(value) {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .normalize("NFC")
    .replace(/\u200c/g, "")
    .replace(/\u200d/g, "")
    .replace(/[़]/g, "")
    .replace(/[ँं]/g, "ं")
    .replace(/क़/g, "क")
    .replace(/ख़/g, "ख")
    .replace(/ग़/g, "ग")
    .replace(/ज़/g, "ज")
    .replace(/ड़/g, "ड")
    .replace(/ढ़/g, "ढ")
    .replace(/फ़/g, "फ")
    .replace(/ऱ/g, "र")
    .replace(/ळ/g, "ल");
}

function audit() {
  const data = readJson(MASTER_PATH);

  if (!Array.isArray(data)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const errors = [];
  const warnings = [];
  const info = [];

  const idMap = new Map();
  const wordMap = new Map();
  const displayMap = new Map();
  const normalizedMap = new Map();
  const looseNormalizedMap = new Map();

  const posCounts = {};
  const importanceCounts = {};
  const sourceSongCounts = {};

  const missingRequiredFields = [];
  const blankFields = [];
  const invalidImportance = [];
  const invalidVariants = [];
  const invalidSourceSongIds = [];
  const emptySourceSongIds = [];
  const suspiciousDisplayNormalized = [];
  const normalizationReview = [];

  data.forEach((entry, index) => {
    const ref = {
      index,
      id: entry.id ?? null,
      word: entry.word ?? null,
      display: entry.display ?? null,
      normalized: entry.normalized ?? null,
    };

    // required fields
    REQUIRED_FIELDS.forEach((field) => {
      if (!(field in entry)) {
        missingRequiredFields.push({
          ...ref,
          field,
        });
      }
    });

    // blank string fields
    ["word", "display", "normalized", "meaning_ja", "pos"].forEach(
      (field) => {
        if (field in entry && isBlank(entry[field])) {
          blankFields.push({
            ...ref,
            field,
            value: entry[field],
          });
        }
      }
    );

    // grouping
    pushGrouped(idMap, toKey(entry.id), ref);
    pushGrouped(wordMap, toKey(entry.word), ref);
    pushGrouped(displayMap, toKey(entry.display), ref);
    pushGrouped(normalizedMap, toKey(entry.normalized), ref);

    const looseKey = normalizeForLooseCompare(entry.normalized || entry.display || entry.word);
    pushGrouped(looseNormalizedMap, looseKey, ref);

    // pos count
    if (!isBlank(entry.pos)) {
      posCounts[entry.pos] = (posCounts[entry.pos] || 0) + 1;
    }

    // importance
    if (!VALID_IMPORTANCE.has(entry.importance)) {
      invalidImportance.push({
        ...ref,
        importance: entry.importance,
      });
    } else {
      importanceCounts[entry.importance] =
        (importanceCounts[entry.importance] || 0) + 1;
    }

    // variants
    if ("variants" in entry && !Array.isArray(entry.variants)) {
      invalidVariants.push({
        ...ref,
        variantsType: typeof entry.variants,
      });
    }

    // sourceSongIds
    if (!Array.isArray(entry.sourceSongIds)) {
      invalidSourceSongIds.push({
        ...ref,
        reason: "sourceSongIds is not an array",
        sourceSongIds: entry.sourceSongIds,
      });
    } else if (entry.sourceSongIds.length === 0) {
      emptySourceSongIds.push(ref);
    } else {
      entry.sourceSongIds.forEach((songId) => {
        const m = typeof songId === "string" ? songId.match(VALID_SONG_ID_RE) : null;

        if (!m) {
          invalidSourceSongIds.push({
            ...ref,
            reason: "invalid song id format",
            sourceSongId: songId,
          });
          return;
        }

        const n = Number(m[1]);

        if (n < MIN_SONG_NO || n > MAX_SONG_NO) {
          invalidSourceSongIds.push({
            ...ref,
            reason: `song id out of range bolly_${String(MIN_SONG_NO).padStart(
              3,
              "0"
            )} - bolly_${String(MAX_SONG_NO).padStart(3, "0")}`,
            sourceSongId: songId,
          });
        }

        sourceSongCounts[songId] = (sourceSongCounts[songId] || 0) + 1;
      });
    }

    // display / normalized review
    if (
      typeof entry.display === "string" &&
      typeof entry.normalized === "string" &&
      entry.display.trim() !== entry.normalized.trim()
    ) {
      suspiciousDisplayNormalized.push({
        ...ref,
        display: entry.display,
        normalized: entry.normalized,
      });
    }

    const looseWord = normalizeForLooseCompare(entry.word);
    const looseDisplay = normalizeForLooseCompare(entry.display);
    const looseNormalized = normalizeForLooseCompare(entry.normalized);

    if (
      looseWord &&
      looseDisplay &&
      looseNormalized &&
      (looseWord !== looseDisplay || looseDisplay !== looseNormalized)
    ) {
      normalizationReview.push({
        ...ref,
        word: entry.word,
        display: entry.display,
        normalized: entry.normalized,
        looseWord,
        looseDisplay,
        looseNormalized,
      });
    }
  });

  const duplicateIds = groupDuplicates(idMap);
  const duplicateWords = groupDuplicates(wordMap);
  const duplicateDisplays = groupDuplicates(displayMap);
  const duplicateNormalized = groupDuplicates(normalizedMap);
  const looseDuplicateCandidates = groupDuplicates(looseNormalizedMap);

  if (duplicateIds.length) {
    errors.push({
      type: "duplicate_ids",
      count: duplicateIds.length,
      items: duplicateIds,
    });
  }

  if (missingRequiredFields.length) {
    errors.push({
      type: "missing_required_fields",
      count: missingRequiredFields.length,
      items: missingRequiredFields,
    });
  }

  if (blankFields.length) {
    warnings.push({
      type: "blank_fields",
      count: blankFields.length,
      items: blankFields,
    });
  }

  if (invalidImportance.length) {
    warnings.push({
      type: "invalid_importance",
      count: invalidImportance.length,
      items: invalidImportance,
    });
  }

  if (invalidVariants.length) {
    warnings.push({
      type: "invalid_variants",
      count: invalidVariants.length,
      items: invalidVariants,
    });
  }

  if (invalidSourceSongIds.length) {
    warnings.push({
      type: "invalid_source_song_ids",
      count: invalidSourceSongIds.length,
      items: invalidSourceSongIds,
    });
  }

  if (emptySourceSongIds.length) {
    warnings.push({
      type: "empty_source_song_ids",
      count: emptySourceSongIds.length,
      items: emptySourceSongIds,
    });
  }

  info.push({
    type: "duplicate_words",
    count: duplicateWords.length,
    items: duplicateWords,
  });

  info.push({
    type: "duplicate_displays",
    count: duplicateDisplays.length,
    items: duplicateDisplays,
  });

  info.push({
    type: "duplicate_normalized",
    count: duplicateNormalized.length,
    items: duplicateNormalized,
  });

  info.push({
    type: "loose_duplicate_candidates",
    count: looseDuplicateCandidates.length,
    items: looseDuplicateCandidates,
  });

  const result = {
    generatedAt: new Date().toISOString(),
    input: path.relative(ROOT, MASTER_PATH),
    output: path.relative(ROOT, OUT_PATH),
    summary: {
      totalEntries: data.length,
      errorGroups: errors.length,
      warningGroups: warnings.length,
      duplicateIds: duplicateIds.length,
      duplicateWords: duplicateWords.length,
      duplicateDisplays: duplicateDisplays.length,
      duplicateNormalized: duplicateNormalized.length,
      looseDuplicateCandidates: looseDuplicateCandidates.length,
      missingRequiredFields: missingRequiredFields.length,
      blankFields: blankFields.length,
      invalidImportance: invalidImportance.length,
      invalidVariants: invalidVariants.length,
      invalidSourceSongIds: invalidSourceSongIds.length,
      emptySourceSongIds: emptySourceSongIds.length,
      displayNormalizedDifferences: suspiciousDisplayNormalized.length,
      normalizationReviewCount: normalizationReview.length,
    },
    counts: {
      posCounts,
      importanceCounts,
      sourceSongCounts,
    },
    errors,
    warnings,
    duplicateCandidates: {
      duplicateWords,
      duplicateDisplays,
      duplicateNormalized,
      looseDuplicateCandidates,
    },
    displayNormalizedReview: suspiciousDisplayNormalized,
    normalizationReview,
  };

  ensureDir(AUDIT_DIR);
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf8");

  console.log("✅ Bollywood vocab master audit complete.");
  console.log(`📄 Input:  ${MASTER_PATH}`);
  console.log(`📄 Output: ${OUT_PATH}`);
  console.log("");
  console.log(`Total entries: ${result.summary.totalEntries}`);
  console.log(`Errors:        ${result.summary.errorGroups}`);
  console.log(`Warnings:      ${result.summary.warningGroups}`);
  console.log("");
  console.log(`Duplicate normalized: ${result.summary.duplicateNormalized}`);
  console.log(`Loose duplicate candidates: ${result.summary.looseDuplicateCandidates}`);
  console.log(`Missing required fields: ${result.summary.missingRequiredFields}`);
  console.log(`Invalid sourceSongIds: ${result.summary.invalidSourceSongIds}`);
}

try {
  audit();
} catch (err) {
  console.error("❌ Audit failed.");
  console.error(err.message);
  process.exit(1);
}