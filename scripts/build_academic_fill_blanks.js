const fs = require("fs");
const path = require("path");

const sourcesDir = path.join(
  __dirname,
  "..",
  "data",
  "academic",
  "sources"
);

const candidatesPath = path.join(
  __dirname,
  "..",
  "data",
  "academic",
  "candidates",
  "fill_blanks_candidates.json"
);

const quizPath = path.join(
  __dirname,
  "..",
  "data",
  "academic",
  "quizzes",
  "fill_blanks.json"
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

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isActive(item) {
  return item && (item.status === undefined || item.status === "active");
}

function listSourceFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json"))
    .sort();
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getVocabForms(vocab) {
  const forms = [];

  for (const key of ["word", "display", "normalized"]) {
    const value = safeString(vocab[key]);
    if (value && !forms.includes(value)) {
      forms.push(value);
    }
  }

  if (Array.isArray(vocab.variants)) {
    for (const variant of vocab.variants) {
      const value = safeString(variant);
      if (value && !forms.includes(value)) {
        forms.push(value);
      }
    }
  }

  return forms.sort((a, b) => b.length - a.length);
}

function hasWholeWordMatch(text, target) {
  const pattern = new RegExp(
    `(^|\\s|['"“”‘’])${escapeRegExp(target)}($|\\s|[.,!?।'\"“”‘’])`,
    "u"
  );

  return pattern.test(text);
}

function makeBlankPrompt(text, target) {
  const pattern = new RegExp(escapeRegExp(target), "u");
  return text.replace(pattern, "_____");
}

function buildCandidateEntry(source, expression, vocab, exprIndex, vocabIndex, matchedForm) {
  const expressionText = safeString(expression.text);
  const answer = safeString(vocab.display) || safeString(vocab.word) || matchedForm;
  const prompt = makeBlankPrompt(expressionText, matchedForm);

  if (!prompt.includes("_____")) {
    return null;
  }

  return {
    id: `${source.id || "academic"}::expr::${exprIndex + 1}::blank::${vocabIndex + 1}`,

    type: "fill_blank",
    status: "active",

    sourceId: source.id || "",
    title: source.title || "",
    genre: source.genre || "",
    register: source.register || "",
    category: source.category || "読解",

    sourceText: expressionText,
    prompt,
    answer,

    matchedForm,

    meaning:
      safeString(vocab.meaning_ja) ||
      safeString(vocab.meaning) ||
      safeString(expression.meaning_ja) ||
      safeString(expression.meaning),

    expressionMeaning:
      safeString(expression.meaning_ja) ||
      safeString(expression.meaning),

    pos: safeString(vocab.pos),

    word: safeString(vocab.word),
    display: safeString(vocab.display) || safeString(vocab.word),
    normalized: safeString(vocab.normalized),

    expressionType: safeString(expression.type),
    importance: Number(vocab.importance ?? expression.importance ?? 3),
    expressionImportance: Number(expression.importance ?? 3),
    difficulty: Number(vocab.difficulty ?? expression.difficulty ?? 1),

    tags: normalizeArray(source.tags)
  };
}

function buildCandidatesFromSource(source) {
  const expressions = normalizeArray(source.expressions).filter(isActive);
  const vocabCandidates = normalizeArray(source.vocab_candidates)
    .filter(isActive)
    .filter((vocab) => Number(vocab.importance ?? 3) >= 3);

  const candidates = [];

  expressions.forEach((expression, exprIndex) => {
    const expressionText = safeString(expression.text);
    if (!expressionText) return;

    vocabCandidates.forEach((vocab, vocabIndex) => {
      const forms = getVocabForms(vocab);

      const matchedForm = forms.find((form) =>
  hasWholeWordMatch(expressionText, form)
);
if (!matchedForm) return;

      const candidate = buildCandidateEntry(
        source,
        expression,
        vocab,
        exprIndex,
        vocabIndex,
        matchedForm
      );

      if (candidate) {
        candidates.push(candidate);
      }
    });
  });

  return candidates;
}

function dedupeByPromptAndAnswer(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.sourceId}::${item.prompt}::${item.answer}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildQuizItems(candidates) {
  return candidates
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.id,
      type: "fill_blank",

      sourceId: item.sourceId,
      title: item.title,
      genre: item.genre,
      category: item.category,

      sourceText: item.sourceText,
      prompt: item.prompt,
      answer: item.answer,

      meaning: item.meaning,
      expressionMeaning: item.expressionMeaning,

      pos: item.pos,
      word: item.word,
      display: item.display,
      normalized: item.normalized,

      importance: item.importance,
      difficulty: item.difficulty,
      tags: item.tags
    }));
}

function main() {
  const files = listSourceFiles(sourcesDir);

  if (files.length === 0) {
    throw new Error(`No source JSON files found in: ${sourcesDir}`);
  }

  const allCandidates = [];

  files.forEach((file) => {
    const filePath = path.join(sourcesDir, file);
    const source = loadJson(filePath);

    const candidates = buildCandidatesFromSource(source);
    allCandidates.push(...candidates);
  });

 const dedupedCandidates = dedupeByPromptAndAnswer(allCandidates);

 const sortedCandidates = dedupedCandidates.sort((a, b) => {
  const importanceDiff =
    Number(b.importance ?? 3) - Number(a.importance ?? 3);

  if (importanceDiff !== 0) {
    return importanceDiff;
  }

  return Number(b.expressionImportance ?? 3) - Number(a.expressionImportance ?? 3);
});

const quizItems = buildQuizItems(sortedCandidates);

  const candidatesData = {
    topic: "academic_fill_blanks_candidates",
    generatedAt: new Date().toISOString(),
    counts: {
      sources: files.length,
      candidates: dedupedCandidates.length
    },
    items: sortedCandidates
  };

  const quizData = {
    topic: "academic_fill_blanks",
    generatedAt: new Date().toISOString(),
    counts: {
      sources: files.length,
      fillBlanks: quizItems.length
    },
    fillBlanks: quizItems
  };

  saveJson(candidatesPath, candidatesData);
  saveJson(quizPath, quizData);

  console.log("✅ Academic fill blanks build complete.");
  console.log(`📄 Candidates: ${candidatesPath}`);
  console.log(`📄 Quiz: ${quizPath}`);
  console.log(`Sources processed: ${files.length}`);
  console.log(`Fill blanks: ${quizItems.length}`);
}

try {
  main();
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}