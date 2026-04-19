const fs = require("fs");
const path = require("path");

const songId = process.argv[2];

if (!songId) {
  console.error("Usage: node scripts/suggest_song_importance.js bolly_001");
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

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeWhitespace(text) {
  return String(text)
    .normalize("NFC")
    .replace(/[“”"‘’'….,!?;:(){}\[\]।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(text) {
  return normalizeWhitespace(text)
    .replace(/\u093C/g, "")
    .replace(/क़/g, "क")
    .replace(/ख़/g, "ख")
    .replace(/ग़/g, "ग")
    .replace(/ज़/g, "ज")
    .replace(/ड़/g, "ड")
    .replace(/ढ़/g, "ढ")
    .replace(/फ़/g, "फ")
    .replace(/य़/g, "य")
    .trim();
}

function getExpressions(songData) {
  if (!Array.isArray(songData.expressions)) return [];
  return songData.expressions
    .map((e) => ({
      text: safeString(e.text),
      normalized: safeString(e.normalized) || normalizeForCompare(e.text || "")
    }))
    .filter((e) => e.text);
}

function getVocab(songData) {
  if (!Array.isArray(songData.vocab_candidates)) return [];
  return songData.vocab_candidates
    .map((v) => ({
      word: safeString(v.word),
      normalized: safeString(v.normalized) || normalizeForCompare(v.word || ""),
      pos: safeString(v.pos),
      meaning_ja: safeString(v.meaning_ja),
      importance: Number.isFinite(v.importance) ? v.importance : null,
      status: safeString(v.status)
    }))
    .filter((v) => v.word);
}

// Bollywood / Urdu / 詩語っぽさ
const highPoeticWords = new Set([
  "इश्क", "फना", "जन्नत", "पनाह", "हमसफर", "हमनवा", "जुनूं", "सुकून",
  "तन्हाई", "धड़कन", "दास्तां", "बेचैनी", "खामोशी", "ख्वाब", "ख्वाहिश",
  "आरजू", "तमन्ना", "नजर", "नजारा", "सिफारिश", "गुजारिश", "लम्हा",
  "रूह", "रुतबा", "समां", "एहसास", "जज्बात", "गम", "चाहत"
]);

// 一般語・他モジュール重複しやすい語
const commonGeneralWords = new Set([
  "दिल", "प्यार", "हवा", "रंग", "रास्ता", "पल", "जीना", "चलना", "गिरना",
  "बनाना", "पाना", "खोना", "छूना", "धूप", "बादल", "नदिया", "यार"
]);

// 補助的自然語・具体語
const helperWords = new Set([
  "चमन", "साया", "पवन", "रोशनी", "अंबर", "बूंद", "महक", "बरसात",
  "नदिया", "खेलना", "गाना", "नाचना"
]);

function wordAppearsInExpressions(normalizedWord, expressions) {
  return expressions.some((e) => {
    const tokens = e.normalized.split(/\s+/).filter(Boolean);
    return tokens.includes(normalizedWord);
  });
}

function evaluateWord(item, expressions) {
  let score = 0;
  const reasons = [];

  const normalized = item.normalized;

  if (highPoeticWords.has(normalized)) {
    score += 2;
    reasons.push("詩的・Bollywoodらしい語");
  }

  if (wordAppearsInExpressions(normalized, expressions)) {
    score += 1;
    reasons.push("表現に含まれる");
  }

  if (item.pos.includes("名詞")) {
    score += 1;
    reasons.push("表現学習に使いやすい名詞");
  }

  if (item.pos === "自動詞" || item.pos === "他動詞" || item.pos === "動詞") {
    score += 0;
  }

  if (commonGeneralWords.has(normalized)) {
    score -= 1;
    reasons.push("一般語で重複しやすい");
  }

  if (helperWords.has(normalized)) {
    score -= 1;
    reasons.push("補助的・情景理解寄り");
  }

  let suggested;
  if (score >= 3) {
    suggested = 4;
  } else if (score === 2) {
    suggested = 3;
  } else {
    suggested = 2;
  }

  return {
    word: item.word,
    normalized: item.normalized,
    current: item.importance,
    suggested,
    score,
    reasons
  };
}

function printSuggestions(results) {
  console.log(`Suggestions for ${songId}`);
  console.log("=".repeat(40));

  results.forEach((r) => {
    const diffMark = r.current !== null && r.current !== r.suggested ? " <-- check" : "";
    console.log(`[${r.suggested}] ${r.word}${diffMark}`);
    console.log(`  current: ${r.current === null ? "(none)" : r.current}`);
    console.log(`  suggested: ${r.suggested}`);
    console.log(`  score: ${r.score}`);
    console.log(`  reasons: ${r.reasons.length ? r.reasons.join(", ") : "特記事項なし"}`);
    console.log("");
  });
}

function printSummary(results) {
  const counts = { 4: 0, 3: 0, 2: 0 };
  for (const r of results) {
    counts[r.suggested] += 1;
  }

  console.log("Summary");
  console.log("-".repeat(40));
  console.log(`suggested importance 4: ${counts[4]}`);
  console.log(`suggested importance 3: ${counts[3]}`);
  console.log(`suggested importance 2: ${counts[2]}`);
}

function main() {
  const songData = loadJson(songPath);
  const expressions = getExpressions(songData);
  const vocab = getVocab(songData);

  if (!vocab.length) {
    throw new Error(`No vocab_candidates found in ${songPath}`);
  }

  const results = vocab.map((item) => evaluateWord(item, expressions));
  printSuggestions(results);
  printSummary(results);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}