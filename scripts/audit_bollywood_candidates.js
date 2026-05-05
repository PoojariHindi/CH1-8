const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const masterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const candidatesDir = path.join(rootDir, "data", "bollywood", "candidates");
const auditDir = path.join(rootDir, "data", "bollywood", "audit");

const reportPath = path.join(auditDir, "candidate_audit_report.json");
const autoMergePath = path.join(auditDir, "candidate_auto_merge.json");
const manualReviewPath = path.join(auditDir, "candidate_manual_review.json");

const STOPWORDS = new Set([
  "कभी",
  "फिर",
  "अब",
  "कुछ",
  "कोई",
  "वो",
  "यह",
  "ये",
  "जो",
  "जिसे",
  "इन",
  "ने",
  "दे",
  "आया",
  "आई",
  "हुआ",
  "किया",
  "कहा",
  "कहना",
  "कहूं",
  "जाना",
  "जाऊँ",
  "ऐसा",
  "ऐसी",
  "सी",
  "मेरे",
  "यही",
  "बहुत"
]);

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeForCompare(text) {
  return safeString(text)
    .normalize("NFC")
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
    .replace(/ऴ/g, "ळ")
    .replace(/य़/g, "य")
    .replace(/ँ/g, "ं")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  const master = loadJson(masterPath);

  if (!Array.isArray(master)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const masterMap = new Map();

  master.forEach((entry, index) => {
    const key = normalizeForCompare(entry.normalized || entry.word);
    if (!key) return;

    if (!masterMap.has(key)) {
      masterMap.set(key, { entry, index });
    }
  });

  const files = fs
    .readdirSync(candidatesDir)
    .filter((file) => file.endsWith("_candidates.json"))
    .sort();

  const report = [];
  const autoMergeItems = [];
  const manual = [];
  const skippedStopwords = [];

  for (const file of files) {
    const fullPath = path.join(candidatesDir, file);
    const data = loadJson(fullPath);

    const songId = safeString(data.songId);
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];

    for (const candidate of candidates) {
      const candidateWord = safeString(candidate.word);
      const candidateNormalized = safeString(candidate.normalized || candidate.word);
      const compareKey = normalizeForCompare(candidateNormalized);

      if (!compareKey) continue;

      if (STOPWORDS.has(compareKey)) {
        skippedStopwords.push({
          songId,
          word: candidateWord,
          normalized: candidateNormalized,
          compareKey,
          status: "skipped_stopword"
        });
        continue;
      }

      const match = masterMap.get(compareKey);

      if (match) {
        report.push({
          songId,
          word: candidateWord,
          normalized: candidateNormalized,
          compareKey,
          status: "match",
          matchedWord: match.entry.word,
          matchedNormalized: match.entry.normalized || match.entry.word,
          masterIndex: match.index
        });

        autoMergeItems.push({
          mergeInto: {
            index: match.index,
            word: match.entry.word,
            normalized: match.entry.normalized || match.entry.word
          },
          candidate: {
            songId,
            word: candidateWord,
            normalized: candidateNormalized,
            meaning_ja: candidate.meaning_ja || "",
            pos: candidate.pos || "",
            importance: candidate.importance || null
          }
        });
      } else {
        report.push({
          songId,
          word: candidateWord,
          normalized: candidateNormalized,
          compareKey,
          status: "new",
          matchedWord: null,
          matchedNormalized: null,
          masterIndex: null,
          reason: "not found in vocab_master"
        });

        manual.push({
          songId,
          word: candidateWord,
          normalized: candidateNormalized,
          pos: candidate.pos || "",
          meaning_ja: candidate.meaning_ja || "",
          importance: candidate.importance || 3,
          status: candidate.status || "active",
          reason: "new candidate; not found in vocab_master"
        });
      }
    }
  }

  saveJson(reportPath, report);
  saveJson(autoMergePath, {
    generatedAt: new Date().toISOString(),
    items: autoMergeItems
  });
  saveJson(manualReviewPath, manual);

  const stopwordPath = path.join(auditDir, "candidate_stopword_skipped.json");
  saveJson(stopwordPath, {
    generatedAt: new Date().toISOString(),
    count: skippedStopwords.length,
    items: skippedStopwords
  });

  console.log("✅ audit 完了");
  console.log(`candidate files: ${files.length}`);
  console.log(`report: ${report.length}`);
  console.log(`autoMerge: ${autoMergeItems.length}`);
  console.log(`manual/new: ${manual.length}`);
  console.log(`skipped stopwords: ${skippedStopwords.length}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}