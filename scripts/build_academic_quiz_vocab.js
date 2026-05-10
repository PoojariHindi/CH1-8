const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const MASTER_PATH = path.join(ROOT, "data", "academic", "vocab_master.json");
const OUTPUT_DIR = path.join(ROOT, "data", "academic", "quizzes");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "vocab.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeEntry(entry) {
  const display = entry.display || entry.word;
  const normalized = entry.normalized || display;

  return {
    word: entry.word,
    display,
    normalized,
    variants: entry.variants || [],
    pos: entry.pos || "",
    meaning_ja: entry.meaning_ja || "",
    importance: entry.importance ?? 3,
    category: entry.category || "academic",
    tags: entry.tags || [],
    sourceIds: entry.sourceIds || []
  };
}

function buildAcademicQuizVocab() {
  const master = readJson(MASTER_PATH);

  if (!Array.isArray(master)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const seen = new Set();

  const quizVocab = master
    .filter((entry) => entry && entry.word && entry.meaning_ja)
    .map(normalizeEntry)
    .filter((entry) => {
      const key = entry.normalized;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return a.display.localeCompare(b.display, "hi");
    });

  writeJson(OUTPUT_PATH, quizVocab);

  console.log(`✅ Academic quiz vocab built: ${quizVocab.length} entries`);
  console.log(`📄 Output: ${OUTPUT_PATH}`);
}

buildAcademicQuizVocab();