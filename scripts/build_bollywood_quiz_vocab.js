const fs = require("fs");
const path = require("path");

const masterPath = path.join(
  __dirname,
  "..",
  "data",
  "bollywood",
  "vocab_master.json"
);

const outputPath = path.join(
  __dirname,
  "..",
  "data",
  "bollywood",
  "quizzes",
  "vocab.json"
);

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeTags(value) {
  return Array.isArray(value) ? value : [];
}

function buildQuizVocab(masterEntries) {
  if (!Array.isArray(masterEntries)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const vocab = masterEntries
    .filter((entry) => entry.status === "active")
    .map((entry) => ({
      word: entry.word || "",

      // ⭐ v2対応（ここが重要）
      meaning: entry.meaning_ja || entry.meaning || "",

      pos: entry.pos || "",
      key: entry.key || entry.word || "",
      category: entry.category || "",
      difficulty: entry.difficulty ?? 1,

      // 重み
      frequency:
        entry.frequency ??
        (Array.isArray(entry.sourceSongIds)
          ? entry.sourceSongIds.length
          : 0),

      importance: entry.importance ?? 3,
      layer: entry.layer || "B",
      tags: normalizeTags(entry.tags),

      // 補助
      normalized: entry.normalized || "",
      sourceSongIds: Array.isArray(entry.sourceSongIds)
        ? entry.sourceSongIds
        : []
    }));

  return {
    topic: "bollywood",
    vocab
  };
}

function main() {
  const masterEntries = loadJson(masterPath);
  const quizData = buildQuizVocab(masterEntries);

  saveJson(outputPath, quizData);

  console.log(`Built quiz vocab: ${outputPath}`);
  console.log(`Entries written: ${quizData.vocab.length}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}