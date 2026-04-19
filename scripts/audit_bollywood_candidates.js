const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const masterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const candidatesDir = path.join(rootDir, "data", "bollywood", "candidates");
const auditDir = path.join(rootDir, "data", "bollywood", "audit");

const reportPath = path.join(auditDir, "candidate_audit_report.json");
const autoMergePath = path.join(auditDir, "candidate_auto_merge.json");
const manualReviewPath = path.join(auditDir, "candidate_manual_review.json");
const previewPath = path.join(auditDir, "vocab_master_merged_preview.json");

// --------------------
// ユーティリティ
// --------------------

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

function normalize(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/\u093C/g, "") // nukta除去
    .replace(/\s+/g, " ")
    .trim();
}

// --------------------
// メイン処理
// --------------------

function main() {
  const master = loadJson(masterPath);
  const files = fs.readdirSync(candidatesDir)
    .filter(f => f.endsWith("_candidates.json"));

  const report = [];
  const autoMerge = [];
  const manual = [];

  for (const file of files) {
    const fullPath = path.join(candidatesDir, file);
    const data = loadJson(fullPath);

    const songId = data.songId;
    const candidates = data.candidates || [];

    for (const c of candidates) {
      const norm = normalize(c.normalized || c.word);

      // master 検索
      const match = master.find(m =>
        normalize(m.normalized || m.word) === norm
      );

      if (match) {
        report.push({
          songId,
          word: c.word,
          status: "match",
          matchedWord: match.word
        });

        autoMerge.push({
          word: match.word,
          addSongId: songId
        });

      } else {
        report.push({
          songId,
          word: c.word,
          status: "new"
        });

        manual.push({
          songId,
          word: c.word,
          meaning_ja: c.meaning_ja
        });
      }
    }
  }

  saveJson(reportPath, report);
  saveJson(autoMergePath, autoMerge);
  saveJson(manualReviewPath, manual);

  console.log("✅ audit 完了");
  console.log(`report: ${report.length}`);
  console.log(`autoMerge: ${autoMerge.length}`);
  console.log(`manual: ${manual.length}`);
}

main();