const fs = require("fs");
const path = require("path");

const masterPath = path.join(
  __dirname,
  "..",
  "data",
  "bollywood",
  "vocab_master.json"
);

const songsDir = path.join(
  __dirname,
  "..",
  "data",
  "bollywood",
  "songs"
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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function isActive(item) {
  return !item || item.status === undefined || item.status === "active";
}

function listSongFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .sort();
}

function getSourceCount(entry) {
  if (Array.isArray(entry.sourceSongIds)) {
    return entry.sourceSongIds.length;
  }

  if (typeof entry.sourceCount === "number") {
    return entry.sourceCount;
  }

  if (typeof entry.frequency === "number") {
    return entry.frequency;
  }

  return 1;
}

function getRarityBonus(sourceCount) {
  if (sourceCount <= 1) return 2.0;
  if (sourceCount === 2) return 1.6;
  if (sourceCount === 3) return 1.3;
  return 1.0;
}

function getQuizWeight(entry) {
  const rawImportance = Number(entry.importance ?? 3);

  // 現行方針：importance は 2〜4 の範囲で扱う
  const importance = Math.max(2, Math.min(rawImportance, 4));

  const sourceCount = getSourceCount(entry);
  const rarityBonus = getRarityBonus(sourceCount);

  return Math.round(importance * rarityBonus * 10) / 10;
}

function buildQuizVocab(masterEntries) {
  if (!Array.isArray(masterEntries)) {
    throw new Error("vocab_master.json must be an array.");
  }

  return masterEntries
    .filter((entry) => entry.status === "active")
    .map((entry) => {
      const sourceCount = getSourceCount(entry);

      const importance = Math.max(
        2,
        Math.min(Number(entry.importance ?? 3), 4)
      );

      const quizWeight = getQuizWeight(entry);

      return {
        // Quiz表示用
        word: entry.display || entry.word || "",

        // corpus原形保持
        surface: entry.word || "",

        // UI表示用 canonical
        display: entry.display || "",

        // 比較・merge用
        normalized: entry.normalized || "",

        // 表記揺れ
        variants: Array.isArray(entry.variants)
          ? entry.variants
          : [],

        // 意味
        meaning: entry.meaning_ja || entry.meaning || "",

        // 文法
        pos: entry.pos || "",

        // キー
        key:
          entry.key ||
          entry.normalized ||
          entry.display ||
          entry.word ||
          "",

        category: entry.category || "",
        difficulty: entry.difficulty ?? 1,

        // 出題補助
        frequency: entry.frequency ?? sourceCount,
        sourceCount,
        importance,
        quizWeight,

        layer: entry.layer || "B",
        tags: normalizeTags(entry.tags),

        // ソース
        sourceSongIds: Array.isArray(entry.sourceSongIds)
          ? entry.sourceSongIds
          : []
      };
    });
}

function buildExpressionEntry(song, expr, index) {
  return {
    id: `${song.id || song.title || "song"}::expr::${index + 1}`,
    type: "expression",

    songId: song.id || "",
    songTitle: song.title || "",
    film: song.film || "",
    year: song.year ?? null,

    text: safeString(expr.text),

    normalized:
      safeString(expr.normalized) ||
      safeString(expr.text),

    meaning:
      safeString(expr.meaning_ja) ||
      safeString(expr.meaning),

    importance: expr.importance ?? 3,
    difficulty: expr.difficulty ?? 1,

    tags: normalizeTags(expr.tags),

    status: expr.status || "active"
  };
}

function chooseBlankIndex(words) {
  if (!Array.isArray(words) || words.length === 0) {
    return -1;
  }

  const preferred = words.findIndex((word) => {
    const trimmed = word.trim();

    if (!trimmed) return false;
    if (trimmed.length <= 1) return false;
    if (/^[,.;:!?।…-]+$/.test(trimmed)) return false;
    if (/^\d+$/.test(trimmed)) return false;

    return true;
  });

  return preferred;
}

function generateFillBlankFromExpression(expression, index) {
  const text = safeString(expression.text).trim();

  if (!text) return null;

  const words = text.split(/\s+/).filter(Boolean);

  if (words.length < 2) return null;

  const blankIndex = chooseBlankIndex(words);

  if (blankIndex < 0) return null;

  const answer = words[blankIndex];

  const prompt = words
    .map((word, i) =>
      i === blankIndex ? "_____" : word
    )
    .join(" ");

  return {
    id: `${expression.id}::blank::${index + 1}`,
    type: "fill_blank",

    songId: expression.songId,
    songTitle: expression.songTitle,
    film: expression.film,
    year: expression.year,

    sourceText: expression.text,

    prompt,
    answer,

    meaning: expression.meaning,

    importance: expression.importance ?? 3,
    difficulty: expression.difficulty ?? 1,

    tags: normalizeTags(expression.tags)
  };
}

function loadSongDataAndBuildExtras() {
  const files = listSongFiles(songsDir);

  const expressions = [];
  const fillBlanks = [];
  const songs = [];

  files.forEach((file) => {
    const filePath = path.join(songsDir, file);

    const song = loadJson(filePath);

    songs.push({
      id: song.id || "",
      title: song.title || "",
      film: song.film || "",
      year: song.year ?? null
    });

    const songExpressions = normalizeArray(song.expressions)
      .filter(isActive)
      .map((expr, index) =>
        buildExpressionEntry(song, expr, index)
      )
      .filter(
        (expr) => expr.text && expr.meaning
      );

    expressions.push(...songExpressions);

    const songFillBlanks = songExpressions
      .map((expr, index) =>
        generateFillBlankFromExpression(expr, index)
      )
      .filter(Boolean);

    fillBlanks.push(...songFillBlanks);
  });

  return {
    songs,
    expressions,
    fillBlanks
  };
}

function main() {
  const masterEntries = loadJson(masterPath);

  const vocab = buildQuizVocab(masterEntries);

  const extras = loadSongDataAndBuildExtras();

  const quizData = {
    topic: "bollywood",

    generatedAt: new Date().toISOString(),

    counts: {
      vocab: vocab.length,
      expressions: extras.expressions.length,
      fillBlanks: extras.fillBlanks.length,
      songs: extras.songs.length
    },

    vocab,

    expressions: extras.expressions,

    fillBlanks: extras.fillBlanks
  };

  saveJson(outputPath, quizData);

  console.log(`Built quiz data: ${outputPath}`);
  console.log(`Songs processed: ${extras.songs.length}`);
  console.log(`Vocab entries: ${quizData.counts.vocab}`);
  console.log(
    `Expression entries: ${quizData.counts.expressions}`
  );
  console.log(
    `Fill blank entries: ${quizData.counts.fillBlanks}`
  );

  console.log(
    "display / variants / normalized support enabled."
  );
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}