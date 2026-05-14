/**
 * add_news_quiz_weight.js
 *
 * News vocab_master に quizWeight を付与するスクリプト。
 *
 * 方針:
 * - difficulty は一切使わない
 * - importance / sourceCount / frequency / category / 例外リストで判断
 * - 元ファイルは直接変更しない
 *
 * 実行:
 *   node scripts/add_news_quiz_weight.js
 *
 * 入力:
 *   data/news/vocab_master.json
 *
 * 出力:
 *   data/news/vocab_master_with_quiz_weight.json
 *   data/news/audit/news_quiz_weight_report.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const INPUT_PATH = path.join(ROOT, "data", "news", "vocab_master.json");
const OUTPUT_PATH = path.join(
  ROOT,
  "data",
  "news",
  "vocab_master_with_quiz_weight.json"
);
const AUDIT_DIR = path.join(ROOT, "data", "news", "audit");
const REPORT_PATH = path.join(AUDIT_DIR, "news_quiz_weight_report.json");

const FORCE_HIGH = new Set([
  "प्रक्रिया",
  "प्रभावित",
  "चेतावनी",
  "मूल्यांकन",
  "मतदान"
]);

const FORCE_LOW = new Set([
  "चक्रवाती_परिसंचरण",
  "क्षेत्रीय_कार्य",
  "स्वगणना",
  "पुरवा_हवा",
  "ट्रांसमिशन_टावर"
]);

const CATEGORY_BONUS = {
  "重要動詞": 1,
  "行政・制度": 0.5,
  "裁判・法・選挙": 0.5,
  "選挙・裁判": 0.5,
  "教育": 0.5,
  "都市・環境": 0,
  "事件・事故": 0,
  "労働・経済": 0,
  "医療・健康": 0,
  "調査・データ": 0,
  "調査・統計": 0,
  "文化・宗教": 0
};

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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getKey(entry) {
  return entry.normalized || entry.word || "";
}

function calcQuizWeight(entry) {
  const key = getKey(entry);

  if (FORCE_HIGH.has(key) || FORCE_HIGH.has(entry.word)) {
    return {
      quizWeight: 5,
      reason: ["force_high"]
    };
  }

  if (FORCE_LOW.has(key) || FORCE_LOW.has(entry.word)) {
    return {
      quizWeight: 2,
      reason: ["force_low"]
    };
  }

  let score = 3;
  const reason = ["base_3"];

  const importance = Number(entry.importance || 0);
  const sourceCount = Number(entry.sourceCount || 0);
  const frequency = Number(entry.frequency || 0);
  const category = entry.category || "";

   if (importance >= 4 && sourceCount >= 2) {
    score += 1;
    reason.push("importance>=4 && sourceCount>=2:+1");
  }

  if (sourceCount >= 3) {
    score += 1;
    reason.push("sourceCount>=3:+1");
  }

  if (sourceCount >= 5) {
    score += 1;
    reason.push("sourceCount>=5:+1");
  }

  if (
  importance >= 3 &&
  importance < 4 &&
  sourceCount >= 4
) {
  score += 0.5;
  reason.push("importance3 && sourceCount>=4:+0.5");
}

  if (frequency >= 3 && sourceCount < 2) {
    score += 0.5;
    reason.push("frequency>=3 && sourceCount<2:+0.5");
  }

  if (category === "重要動詞") {
    score += 1;
    reason.push("category:重要動詞:+1");
  }

  const quizWeight = clamp(Math.round(score), 1, 5);

  return {
    quizWeight,
    reason
  };
}

function summarizeByWeight(items) {
  const summary = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };

  items.forEach((item) => {
    const w = item.quizWeight;
    summary[w] = (summary[w] || 0) + 1;
  });

  return summary;
}

function summarizeByCategory(items) {
  const summary = {};

  items.forEach((item) => {
    const category = item.category || "未分類";
    if (!summary[category]) {
      summary[category] = {
        total: 0,
        quizWeight: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0
        }
      };
    }

    summary[category].total += 1;
    summary[category].quizWeight[item.quizWeight] += 1;
  });

  return summary;
}

function main() {
  const vocab = readJson(INPUT_PATH);

  if (!Array.isArray(vocab)) {
    throw new Error("data/news/vocab_master.json must be an array.");
  }

  const changed = [];
  const unchanged = [];
  const auditItems = [];

  const output = vocab.map((entry, index) => {
    const before = entry.quizWeight;
    const result = calcQuizWeight(entry);

    const next = {
      ...entry,
      quizWeight: result.quizWeight
    };

    const auditItem = {
      index,
      word: entry.word,
      normalized: entry.normalized,
      category: entry.category,
      importance: entry.importance,
      sourceCount: entry.sourceCount,
      frequency: entry.frequency,
      oldQuizWeight: before ?? null,
      newQuizWeight: result.quizWeight,
      reason: result.reason
    };

    auditItems.push(auditItem);

    if (before !== result.quizWeight) {
      changed.push(auditItem);
    } else {
      unchanged.push(auditItem);
    }

    return next;
  });

  ensureDir(AUDIT_DIR);

  const report = {
    generatedAt: new Date().toISOString(),
    input: path.relative(ROOT, INPUT_PATH),
    output: path.relative(ROOT, OUTPUT_PATH),
    totalEntries: output.length,
    changedCount: changed.length,
    unchangedCount: unchanged.length,
    quizWeightSummary: summarizeByWeight(output),
    categorySummary: summarizeByCategory(output),
    forceHigh: Array.from(FORCE_HIGH),
    forceLow: Array.from(FORCE_LOW),
    changed,
    auditItems
  };

  writeJson(OUTPUT_PATH, output);
  writeJson(REPORT_PATH, report);

  console.log("✅ News quizWeight build complete.");
  console.log(`📄 Input:  ${INPUT_PATH}`);
  console.log(`📄 Output: ${OUTPUT_PATH}`);
  console.log(`📄 Report: ${REPORT_PATH}`);
  console.log("");
  console.log(`Total entries: ${output.length}`);
  console.log(`Changed:       ${changed.length}`);
  console.log(`Unchanged:     ${unchanged.length}`);
  console.log("");
  console.log("quizWeight summary:");
  console.log(report.quizWeightSummary);
}

try {
  main();
} catch (err) {
  console.error("❌ Failed to add news quizWeight.");
  console.error(err.message);
  process.exit(1);
}