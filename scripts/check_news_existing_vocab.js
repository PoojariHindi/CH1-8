/**
 * check_news_existing_vocab.js
 *
 * News vocab candidates を vocab_master と厳密照合し、
 * new / existing / manual_review に分類する。
 *
 * 実行例:
 *   node scripts/check_news_existing_vocab.js
 *
 * 候補ファイルを指定する場合:
 *   node scripts/check_news_existing_vocab.js data/news/candidates/news_vocab_candidates.json
 *
 * 入力:
 *   data/news/vocab_master.json
 *   data/news/candidates/news_vocab_candidates.json
 *
 * 任意入力:
 *   data/news/category_aliases.json
 *   data/news/news_stopwords.json
 *   data/news/proper_noun_exclusions.json
 *
 * 出力:
 *   data/news/audit/news_existing_check.json
 *   data/news/audit/news_new_candidates.json
 *   data/news/audit/news_existing_matches.json
 *   data/news/audit/news_manual_review.json
 *   data/news/audit/news_stopword_candidates.json
 *   data/news/audit/news_proper_noun_exclusions.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const MASTER_PATH = path.join(ROOT, "data", "news", "vocab_master.json");

const DEFAULT_CANDIDATES_PATH = path.join(
  ROOT,
  "data",
  "news",
  "candidates",
  "news_vocab_candidates.json"
);

const CATEGORY_ALIASES_PATH = path.join(
  ROOT,
  "data",
  "news",
  "category_aliases.json"
);

const STOPWORDS_PATH = path.join(
  ROOT,
  "data",
  "news",
  "news_stopwords.json"
);

const PROPER_NOUN_EXCLUSIONS_PATH = path.join(
  ROOT,
  "data",
  "news",
  "proper_noun_exclusions.json"
);

const AUDIT_DIR = path.join(ROOT, "data", "news", "audit");

const REPORT_PATH = path.join(AUDIT_DIR, "news_existing_check.json");
const NEW_PATH = path.join(AUDIT_DIR, "news_new_candidates.json");
const EXISTING_PATH = path.join(AUDIT_DIR, "news_existing_matches.json");
const MANUAL_PATH = path.join(AUDIT_DIR, "news_manual_review.json");
const STOPWORD_PATH = path.join(AUDIT_DIR, "news_stopword_candidates.json");
const PROPER_NOUN_PATH = path.join(AUDIT_DIR, "news_proper_noun_exclusions.json");

const VALID_CATEGORIES = new Set([
  "行政・制度",
  "選挙・裁判",
  "労働・経済",
  "都市・環境",
  "事件・事故",
  "医療・健康",
  "教育",
  "調査・統計",
  "文化・宗教",
  "科学・技術",
  "未分類"
]);

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== null) return fallback;
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON parse error in ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeForCompare(value) {
  return normalizeString(value)
    .normalize("NFC")
    .replace(/\u200c/g, "")
    .replace(/\u200d/g, "")
    .replace(/\u093C/g, "")
    .replace(/क़/g, "क")
    .replace(/ख़/g, "ख")
    .replace(/ग़/g, "ग")
    .replace(/ज़/g, "ज")
    .replace(/ड़/g, "ड")
    .replace(/ढ़/g, "ढ")
    .replace(/फ़/g, "फ")
    .replace(/ऩ/g, "न")
    .replace(/ऱ/g, "र")
    .replace(/य़/g, "य")
    .replace(/ँ/g, "ं")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getCandidateItems(data) {
  if (Array.isArray(data)) return data;

  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.candidates)) return data.candidates;
  if (Array.isArray(data.vocab)) return data.vocab;
  if (Array.isArray(data.words)) return data.words;

  throw new Error(
    "Candidates file must be an array or contain items / candidates / vocab / words array."
  );
}

function getMasterItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.vocab)) return data.vocab;
  if (Array.isArray(data.items)) return data.items;

  throw new Error("vocab_master.json must be an array or contain vocab/items array.");
}

function getEntryKeys(entry) {
  return unique([
    entry.word,
    entry.display,
    entry.normalized,
    entry.surface,
    entry.key,
    ...ensureArray(entry.variants)
  ].map(normalizeForCompare));
}

function getPrimaryKey(entry) {
  return (
    normalizeForCompare(entry.normalized) ||
    normalizeForCompare(entry.display) ||
    normalizeForCompare(entry.word) ||
    normalizeForCompare(entry.surface) ||
    normalizeForCompare(entry.key)
  );
}

function buildMasterIndex(masterItems) {
  const keyMap = new Map();
  const duplicateMasterKeys = [];

  masterItems.forEach((entry, index) => {
    const keys = getEntryKeys(entry);

    keys.forEach((key) => {
      if (!key) return;

      if (!keyMap.has(key)) {
        keyMap.set(key, []);
      }

      keyMap.get(key).push({
        index,
        word: entry.word || "",
        display: entry.display || "",
        normalized: entry.normalized || "",
        entry
      });
    });
  });

  keyMap.forEach((matches, key) => {
    const uniqueIndexes = unique(matches.map((m) => String(m.index)));

    if (uniqueIndexes.length > 1) {
      duplicateMasterKeys.push({
        key,
        count: uniqueIndexes.length,
        matches: matches.map((m) => ({
          index: m.index,
          word: m.word,
          display: m.display,
          normalized: m.normalized
        }))
      });
    }
  });

  return {
    keyMap,
    duplicateMasterKeys
  };
}

function normalizeCategory(category, aliases) {
  const raw = normalizeString(category) || "未分類";
  return aliases[raw] || raw;
}

function isValidCategory(category) {
  return VALID_CATEGORIES.has(category);
}

function makeCandidateRecord(candidate, index, categoryAliases) {
  const word = normalizeString(candidate.word || candidate.surface || candidate.display);
  const display = normalizeString(candidate.display || candidate.word || candidate.surface);
  const normalized = normalizeString(candidate.normalized || candidate.key || word);
  const compareKey = getPrimaryKey({
    word,
    display,
    normalized,
    surface: candidate.surface,
    key: candidate.key,
    variants: candidate.variants
  });

  const category = normalizeCategory(
    candidate.category || candidate.field || candidate.topic,
    categoryAliases
  );

  return {
    candidateIndex: index,
    word,
    display,
    normalized,
    compareKey,
    variants: ensureArray(candidate.variants),
    pos: normalizeString(candidate.pos),
    meaning: normalizeString(candidate.meaning),
    meaning_ja: normalizeString(candidate.meaning_ja || candidate.meaning),
    category,
    originalCategory: normalizeString(
      candidate.category || candidate.field || candidate.topic
    ),
    importance: candidate.importance ?? candidate.quizWeight ?? 3,
    sourceId: normalizeString(candidate.sourceId || candidate.source || candidate.articleId),
    sourceIds: ensureArray(candidate.sourceIds),
    raw: candidate
  };
}

function classifyCandidate(record, masterIndex, stopwordSet, properNounSet) {
  const warnings = [];

  if (!record.word && !record.display && !record.normalized) {
    return {
      status: "manual_review",
      reason: "missing word/display/normalized",
      warnings
    };
  }

  if (!record.compareKey) {
    return {
      status: "manual_review",
      reason: "missing compareKey",
      warnings
    };
  }

  if (!record.meaning_ja) {
    warnings.push("missing meaning_ja");
  }

  if (!record.pos) {
    warnings.push("missing pos");
  }

  if (!isValidCategory(record.category)) {
    warnings.push(`unknown category: ${record.category}`);
  }

  if (properNounSet.has(record.compareKey)) {
    return {
      status: "proper_noun_exclusion",
      reason: "proper noun exclusion",
      warnings
    };
  }

  const matches = masterIndex.keyMap.get(record.compareKey) || [];

  if (matches.length === 1) {
    return {
      status: "existing",
      reason: "strict key match",
      matchedMasterIndex: matches[0].index,
      matchedMaster: {
        index: matches[0].index,
        word: matches[0].word,
        display: matches[0].display,
        normalized: matches[0].normalized
      },
      warnings
    };
  }

  if (matches.length > 1) {
    return {
      status: "manual_review",
      reason: "multiple master matches",
      matchedMasterIndexes: matches.map((m) => m.index),
      matchedMasters: matches.map((m) => ({
        index: m.index,
        word: m.word,
        display: m.display,
        normalized: m.normalized
      })),
      warnings
    };
  }

  if (stopwordSet.has(record.compareKey)) {
    return {
      status: "stopword_candidate",
      reason: "news stopword candidate",
      warnings
    };
  }

  if (warnings.length > 0) {
    return {
      status: "manual_review",
      reason: "candidate has warnings",
      warnings
    };
  }

  return {
    status: "new",
    reason: "not found in vocab_master",
    warnings
  };
}

function main() {
  const candidateArg = process.argv[2];
  const candidatesPath = candidateArg
    ? path.resolve(ROOT, candidateArg)
    : DEFAULT_CANDIDATES_PATH;

  const masterData = readJson(MASTER_PATH);
  const candidateData = readJson(candidatesPath);

  const categoryAliases = readJson(CATEGORY_ALIASES_PATH, {});
  const stopwords = readJson(STOPWORDS_PATH, []);
  const properNounExclusions = readJson(PROPER_NOUN_EXCLUSIONS_PATH, []);

  const stopwordSet = new Set(stopwords.map(normalizeForCompare));
  const properNounSet = new Set(properNounExclusions.map(normalizeForCompare));

  const masterItems = getMasterItems(masterData);
  const candidateItems = getCandidateItems(candidateData);

  const masterIndex = buildMasterIndex(masterItems);

  const reportItems = [];
  const newItems = [];
  const existingItems = [];
  const manualItems = [];
  const stopwordItems = [];
  const properNounItems = [];

  candidateItems.forEach((candidate, index) => {
    const record = makeCandidateRecord(candidate, index, categoryAliases);
    const result = classifyCandidate(
      record,
      masterIndex,
      stopwordSet,
      properNounSet
    );

    const item = {
      ...record,
      checkStatus: result.status,
      reason: result.reason,
      warnings: result.warnings || [],
      matchedMasterIndex: result.matchedMasterIndex ?? null,
      matchedMaster: result.matchedMaster ?? null,
      matchedMasterIndexes: result.matchedMasterIndexes || [],
      matchedMasters: result.matchedMasters || []
    };

    reportItems.push(item);

    if (result.status === "existing") {
      existingItems.push(item);
    } else if (result.status === "new") {
      newItems.push(item);
    } else if (result.status === "stopword_candidate") {
      stopwordItems.push(item);
    } else if (result.status === "proper_noun_exclusion") {
      properNounItems.push(item);
    } else {
      manualItems.push(item);
    }
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    masterPath: path.relative(ROOT, MASTER_PATH),
    candidatesPath: path.relative(ROOT, candidatesPath),
    masterCount: masterItems.length,
    candidateCount: candidateItems.length,
    existingCount: existingItems.length,
    newCount: newItems.length,
    manualReviewCount: manualItems.length,
    stopwordCandidateCount: stopwordItems.length,
    properNounExclusionCount: properNounItems.length,
    duplicateMasterKeyCount: masterIndex.duplicateMasterKeys.length
  };

  writeJson(REPORT_PATH, {
    ...summary,
    duplicateMasterKeys: masterIndex.duplicateMasterKeys,
    items: reportItems
  });

  writeJson(NEW_PATH, {
    generatedAt: summary.generatedAt,
    count: newItems.length,
    items: newItems
  });

  writeJson(EXISTING_PATH, {
    generatedAt: summary.generatedAt,
    count: existingItems.length,
    items: existingItems
  });

  writeJson(MANUAL_PATH, {
    generatedAt: summary.generatedAt,
    count: manualItems.length,
    items: manualItems
  });

  writeJson(STOPWORD_PATH, {
    generatedAt: summary.generatedAt,
    count: stopwordItems.length,
    items: stopwordItems
  });

  writeJson(PROPER_NOUN_PATH, {
    generatedAt: summary.generatedAt,
    count: properNounItems.length,
    items: properNounItems
  });

  console.log("✅ News existing vocab check complete.");
  console.log(`Master: ${summary.masterCount}`);
  console.log(`Candidates: ${summary.candidateCount}`);
  console.log(`Existing: ${summary.existingCount}`);
  console.log(`New: ${summary.newCount}`);
  console.log(`Manual review: ${summary.manualReviewCount}`);
  console.log(`Stopword candidates: ${summary.stopwordCandidateCount}`);
  console.log(`Proper noun exclusions: ${summary.properNounExclusionCount}`);
  console.log(`Duplicate master keys: ${summary.duplicateMasterKeyCount}`);
  console.log("");
  console.log(`Report: ${REPORT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error("❌ check_news_existing_vocab failed.");
  console.error(error.message);
  process.exit(1);
}