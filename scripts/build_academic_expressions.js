const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SOURCES_DIR = path.join(ROOT, "data", "academic", "sources");
const MASTER_PATH = path.join(ROOT, "data", "academic", "expressions_master.json");
const QUIZ_PATH = path.join(ROOT, "data", "academic", "quizzes", "expressions.json");
const BACKUP_PATH = path.join(ROOT, "data", "academic", "expressions_master.backup.json");

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) {
    if (fallback !== null) return fallback;
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function uniq(array) {
  return [...new Set((array || []).filter(Boolean))];
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeExpression(expression, source) {
  const text = normalizeText(expression.text);
  const normalized = normalizeText(expression.normalized || text);

  return {
    text,
    normalized,
    meaning_ja: normalizeText(expression.meaning_ja || expression.meaning),
    type: expression.type || "academic_expression",
    importance: Number(expression.importance) || 3,
    status: expression.status || "active",
    category: "academic",
    tags: uniq(expression.tags || source.tags || []),
    sourceIds: uniq(expression.sourceIds || [source.id]),
    sourceTitle: source.title || "",
    sourceGenre: source.genre || "",
    sourceRegister: source.register || ""
  };
}

function mergeExpression(existing, incoming) {
  return {
    ...existing,
    tags: uniq([...(existing.tags || []), ...(incoming.tags || [])]),
    sourceIds: uniq([...(existing.sourceIds || []), ...(incoming.sourceIds || [])]),
    importance: Math.max(Number(existing.importance) || 3, Number(incoming.importance) || 3)
  };
}

function loadExpressionsFromSources() {
  const sourceFiles = fs
    .readdirSync(SOURCES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  const expressions = [];

  for (const file of sourceFiles) {
    const source = readJson(path.join(SOURCES_DIR, file));

    if (!source.id) {
      console.warn(`⚠️ Skipped ${file}: missing source id`);
      continue;
    }

    const sourceExpressions = Array.isArray(source.expressions)
      ? source.expressions
      : [];

    for (const raw of sourceExpressions) {
      const entry = normalizeExpression(raw, source);

      if (!entry.text || !entry.normalized || !entry.meaning_ja) {
        continue;
      }

      if (entry.status !== "active") {
        continue;
      }

      expressions.push(entry);
    }
  }

  return expressions;
}

function main() {
  const currentMaster = readJson(MASTER_PATH, []);

  if (!Array.isArray(currentMaster)) {
    throw new Error("expressions_master.json must be an array.");
  }

  writeJson(BACKUP_PATH, currentMaster);

  const expressionMap = new Map();

  for (const raw of currentMaster) {
    const entry = {
      text: normalizeText(raw.text),
      normalized: normalizeText(raw.normalized || raw.text),
      meaning_ja: normalizeText(raw.meaning_ja || raw.meaning),
      type: raw.type || "academic_expression",
      importance: Number(raw.importance) || 3,
      status: raw.status || "active",
      category: raw.category || "academic",
      tags: uniq(raw.tags || []),
      sourceIds: uniq(raw.sourceIds || []),
      sourceTitle: raw.sourceTitle || "",
      sourceGenre: raw.sourceGenre || "",
      sourceRegister: raw.sourceRegister || ""
    };

    if (entry.normalized) {
      expressionMap.set(entry.normalized, entry);
    }
  }

  const sourceExpressions = loadExpressionsFromSources();

  let added = 0;
  let merged = 0;

  for (const expression of sourceExpressions) {
    if (expressionMap.has(expression.normalized)) {
      const existing = expressionMap.get(expression.normalized);
      expressionMap.set(expression.normalized, mergeExpression(existing, expression));
      merged += 1;
    } else {
      expressionMap.set(expression.normalized, expression);
      added += 1;
    }
  }

  const updatedMaster = [...expressionMap.values()].sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    return a.normalized.localeCompare(b.normalized, "hi");
  });

  const quizExpressions = updatedMaster
    .filter((entry) => entry.status === "active")
    .map((entry) => ({
      text: entry.text,
      normalized: entry.normalized,
      meaning: entry.meaning_ja,
      meaning_ja: entry.meaning_ja,
      type: entry.type,
      importance: entry.importance,
      category: entry.category,
      tags: entry.tags,
      sourceIds: entry.sourceIds
    }));

  writeJson(MASTER_PATH, updatedMaster);
  writeJson(QUIZ_PATH, quizExpressions);

  console.log("✅ Academic expressions build complete.");
  console.log(`📄 Master: ${MASTER_PATH}`);
  console.log(`📄 Quiz: ${QUIZ_PATH}`);
  console.log({
    before: currentMaster.length,
    after: updatedMaster.length,
    sourceExpressions: sourceExpressions.length,
    added,
    merged,
    quizExpressions: quizExpressions.length
  });
}

main();