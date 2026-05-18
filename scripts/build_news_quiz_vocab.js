const fs = require("fs");
const path = require("path");
const { NEWS_STOPWORDS } = require("./news_stopwords");

const ROOT = process.cwd();

const masterPath = path.join(ROOT, "data", "news", "vocab_master.json");
const outDir = path.join(ROOT, "data", "news", "quizzes");
const outPath = path.join(outDir, "vocab.json");

function calcQuizWeight(entry) {
  const importance = entry.importance ?? 3;
  const difficulty = entry.difficulty ?? 3;
  const sourceCount = entry.sourceCount ?? 1;

  return importance * 2 + sourceCount + Math.max(0, 4 - difficulty);
}

function normalizeKey(word) {
  return String(word || "")
    .trim()
    .replace(/\s+/g, " ");
}

function main() {
  if (!fs.existsSync(masterPath)) {
    throw new Error(`Not found: ${masterPath}`);
  }

  const master = JSON.parse(fs.readFileSync(masterPath, "utf8"));

  const quiz = master
    .filter((entry) => entry.status === "active")
    .filter((entry) => entry.word && entry.meaning_ja)
    .filter((entry) => !NEWS_STOPWORDS.has(entry.normalized || entry.word))
    .map((entry) => {
      const word = normalizeKey(entry.word);

      return {
        word,
        display: entry.display || word,
         normalized: entry.normalized || word,
        meaning_ja: entry.meaning_ja,
        pos: entry.pos || "",
        category: entry.category || "未分類",
        difficulty: entry.difficulty ?? 3,
        importance: entry.importance ?? 3,
        sourceCount: entry.sourceCount ?? 1,
        frequency: entry.frequency ?? 1,
        quizWeight: calcQuizWeight(entry)
      };
    })
    .sort((a, b) => {
      if (b.quizWeight !== a.quizWeight) return b.quizWeight - a.quizWeight;
      return a.word.localeCompare(b.word, "hi");
    });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(quiz, null, 2), "utf8");

  console.log(`Built news quiz vocab: ${outPath}`);
  console.log(`Entries written: ${quiz.length}`);
}

main();