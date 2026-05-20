/**
 * check_news_quiz_vocab_diff.js
 *
 * data/news/vocab_master.json と data/news/quizzes/vocab.json の差分確認。
 *
 * 実行:
 *   node scripts/check_news_quiz_vocab_diff.js
 *
 * 出力:
 *   data/news/audit/news_quiz_vocab_diff.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const MASTER_PATH = path.join(ROOT, "data", "news", "vocab_master.json");
const QUIZ_PATH = path.join(ROOT, "data", "news", "quizzes", "vocab.json");
const OUT_PATH = path.join(ROOT, "data", "news", "audit", "news_quiz_vocab_diff.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.vocab)) return data.vocab;
  return [];
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(entry) {
  return normalizeString(entry.normalized || entry.display || entry.word)
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
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getReasons(entry) {
  const reasons = [];

  if (entry.status && entry.status !== "active") {
    reasons.push(`status is ${entry.status}`);
  }

  if (!normalizeString(entry.word)) {
    reasons.push("missing word");
  }

  if (!normalizeString(entry.normalized)) {
    reasons.push("missing normalized");
  }

  if (!normalizeString(entry.meaning_ja || entry.meaning)) {
    reasons.push("missing meaning_ja");
  }

  if (!normalizeString(entry.pos)) {
    reasons.push("missing pos");
  }

  if (entry.quizWeight === 0) {
    reasons.push("quizWeight is 0");
  }

  if (entry.excludeFromQuiz === true) {
    reasons.push("excludeFromQuiz is true");
  }

  if (entry.isStopword === true) {
    reasons.push("isStopword is true");
  }

  if (entry.stopword === true) {
    reasons.push("stopword is true");
  }

  if (entry.properNoun === true) {
    reasons.push("properNoun is true");
  }

  if (entry.isProperNoun === true) {
    reasons.push("isProperNoun is true");
  }

  return reasons;
}

function main() {
  const master = asArray(readJson(MASTER_PATH));
  const quiz = asArray(readJson(QUIZ_PATH));

  const quizKeySet = new Set();
  const duplicateQuizKeys = [];

  quiz.forEach((entry, index) => {
    const key = normalizeKey(entry);
    if (!key) return;

    if (quizKeySet.has(key)) {
      duplicateQuizKeys.push({
        index,
        key,
        word: entry.word || "",
        display: entry.display || "",
        normalized: entry.normalized || ""
      });
    }

    quizKeySet.add(key);
  });

  const missingFromQuiz = [];
  const includedInQuiz = [];
  const duplicateMasterKeysMap = new Map();

  master.forEach((entry, index) => {
    const key = normalizeKey(entry);

    if (!key) {
      missingFromQuiz.push({
        index,
        key,
        word: entry.word || "",
        display: entry.display || "",
        normalized: entry.normalized || "",
        reasons: ["missing comparable key"],
        entry
      });
      return;
    }

    if (!duplicateMasterKeysMap.has(key)) {
      duplicateMasterKeysMap.set(key, []);
    }

    duplicateMasterKeysMap.get(key).push({
      index,
      word: entry.word || "",
      display: entry.display || "",
      normalized: entry.normalized || ""
    });

    if (quizKeySet.has(key)) {
      includedInQuiz.push({
        index,
        key,
        word: entry.word || "",
        display: entry.display || "",
        normalized: entry.normalized || ""
      });
    } else {
      const reasons = getReasons(entry);

      missingFromQuiz.push({
        index,
        key,
        word: entry.word || "",
        display: entry.display || "",
        normalized: entry.normalized || "",
        reasons: reasons.length ? reasons : ["unknown: check build_news_quiz_vocab.js filters"],
        entry
      });
    }
  });

  const duplicateMasterKeys = [];

  duplicateMasterKeysMap.forEach((items, key) => {
    if (items.length > 1) {
      duplicateMasterKeys.push({
        key,
        count: items.length,
        items
      });
    }
  });

  const result = {
    generatedAt: new Date().toISOString(),
    paths: {
      master: path.relative(ROOT, MASTER_PATH),
      quiz: path.relative(ROOT, QUIZ_PATH)
    },
    counts: {
      master: master.length,
      quiz: quiz.length,
      includedInQuiz: includedInQuiz.length,
      missingFromQuiz: missingFromQuiz.length,
      duplicateMasterKeys: duplicateMasterKeys.length,
      duplicateQuizKeys: duplicateQuizKeys.length
    },
    missingFromQuiz,
    duplicateMasterKeys,
    duplicateQuizKeys
  };

  writeJson(OUT_PATH, result);

  console.log("✅ News quiz vocab diff check complete.");
  console.log(`Master entries: ${master.length}`);
  console.log(`Quiz entries: ${quiz.length}`);
  console.log(`Included in quiz: ${includedInQuiz.length}`);
  console.log(`Missing from quiz: ${missingFromQuiz.length}`);
  console.log(`Duplicate master keys: ${duplicateMasterKeys.length}`);
  console.log(`Duplicate quiz keys: ${duplicateQuizKeys.length}`);
  console.log(`Output: ${OUT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error("❌ check_news_quiz_vocab_diff failed.");
  console.error(error.message);
  process.exit(1);
}