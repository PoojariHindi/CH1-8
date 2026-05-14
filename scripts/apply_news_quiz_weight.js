/**
 * apply_news_quiz_weight.js
 *
 * data/news/vocab_master_with_quiz_weight.json を
 * data/news/vocab_master.json に反映するスクリプト。
 *
 * 役割:
 * - 元の vocab_master.json を自動バックアップ
 * - with_quiz_weight 側の件数・quizWeight 欠落を検証
 * - 問題なければ vocab_master.json を上書き
 *
 * 実行:
 *   node scripts/apply_news_quiz_weight.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const NEWS_DIR = path.join(ROOT, "data", "news");
const MASTER_PATH = path.join(NEWS_DIR, "vocab_master.json");
const WITH_WEIGHT_PATH = path.join(NEWS_DIR, "vocab_master_with_quiz_weight.json");
const BACKUP_DIR = path.join(NEWS_DIR, "backups");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function timestampForFilename() {
  return new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\./g, "-");
}

function validateArray(name, data) {
  if (!Array.isArray(data)) {
    throw new Error(`${name} must be a JSON array.`);
  }
}

function getKey(entry) {
  return entry.normalized || entry.word || "";
}

function validateQuizWeight(data) {
  const missing = [];
  const invalid = [];

  data.forEach((entry, index) => {
    if (entry.quizWeight === undefined || entry.quizWeight === null) {
      missing.push({
        index,
        word: entry.word || null,
        normalized: entry.normalized || null
      });
      return;
    }

    if (
      typeof entry.quizWeight !== "number" ||
      !Number.isInteger(entry.quizWeight) ||
      entry.quizWeight < 1 ||
      entry.quizWeight > 5
    ) {
      invalid.push({
        index,
        word: entry.word || null,
        normalized: entry.normalized || null,
        quizWeight: entry.quizWeight
      });
    }
  });

  return { missing, invalid };
}

function compareKeys(master, withWeight) {
  const masterKeys = master.map(getKey);
  const withWeightKeys = withWeight.map(getKey);

  const mismatches = [];

  const max = Math.max(masterKeys.length, withWeightKeys.length);

  for (let i = 0; i < max; i += 1) {
    if (masterKeys[i] !== withWeightKeys[i]) {
      mismatches.push({
        index: i,
        master: masterKeys[i] || null,
        withWeight: withWeightKeys[i] || null
      });

      if (mismatches.length >= 20) {
        break;
      }
    }
  }

  return mismatches;
}

function summarizeByWeight(data) {
  const summary = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };

  data.forEach((entry) => {
    const w = entry.quizWeight;
    summary[w] = (summary[w] || 0) + 1;
  });

  return summary;
}

function main() {
  const master = readJson(MASTER_PATH);
  const withWeight = readJson(WITH_WEIGHT_PATH);

  validateArray("vocab_master.json", master);
  validateArray("vocab_master_with_quiz_weight.json", withWeight);

  if (master.length !== withWeight.length) {
    throw new Error(
      `Entry count mismatch: vocab_master=${master.length}, with_quiz_weight=${withWeight.length}`
    );
  }

  const mismatches = compareKeys(master, withWeight);
  if (mismatches.length > 0) {
    console.error("❌ Key mismatch detected. Aborting.");
    console.error(JSON.stringify(mismatches, null, 2));
    throw new Error(
      "vocab_master.json and vocab_master_with_quiz_weight.json do not have the same order/keys."
    );
  }

  const validation = validateQuizWeight(withWeight);

  if (validation.missing.length > 0 || validation.invalid.length > 0) {
    console.error("❌ quizWeight validation failed.");
    console.error(
      JSON.stringify(
        {
          missingCount: validation.missing.length,
          invalidCount: validation.invalid.length,
          missing: validation.missing.slice(0, 20),
          invalid: validation.invalid.slice(0, 20)
        },
        null,
        2
      )
    );
    throw new Error("Invalid quizWeight data. Aborting.");
  }

  ensureDir(BACKUP_DIR);

  const backupPath = path.join(
    BACKUP_DIR,
    `vocab_master_backup_${timestampForFilename()}.json`
  );

  writeJson(backupPath, master);
  writeJson(MASTER_PATH, withWeight);

  console.log("✅ News quizWeight applied.");
  console.log(`📄 Source:  ${WITH_WEIGHT_PATH}`);
  console.log(`📄 Updated: ${MASTER_PATH}`);
  console.log(`🗂 Backup:  ${backupPath}`);
  console.log("");
  console.log(`Total entries: ${withWeight.length}`);
  console.log("quizWeight summary:");
  console.log(summarizeByWeight(withWeight));
}

try {
  main();
} catch (err) {
  console.error("❌ Failed to apply news quizWeight.");
  console.error(err.message);
  process.exit(1);
}