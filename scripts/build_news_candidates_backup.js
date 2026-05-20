/**
 * build_news_candidates.js
 *
 * News corpus txt から news vocab candidate JSON を生成する。
 *
 * 実行例:
 *   node scripts/build_news_candidates.js data/news/articles/news023_DJ20260520_HotSummer.txt
 *
 * 出力:
 *   data/news/candidates/news023_DJ20260520_HotSummer_candidates.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const OUT_DIR = path.join(ROOT, "data", "news", "candidates");

const STOPWORDS_PATH = path.join(ROOT, "data", "news", "news_stopwords.json");
const PROPER_NOUN_EXCLUSIONS_PATH = path.join(
  ROOT,
  "data",
  "news",
  "proper_noun_exclusions.json"
);
const CATEGORY_ALIASES_PATH = path.join(
  ROOT,
  "data",
  "news",
  "category_aliases.json"
);

const DEFAULT_IMPORTANCE = 3;

const BUILTIN_STOPWORDS = new Set([
  "है", "हैं", "था", "थे", "थी", "हुआ", "हुई", "हुए",
  "हो", "होगा", "होगी", "रहा", "रही", "रहे",
  "के", "की", "का", "को", "से", "में", "पर", "ने", "और", "या",
  "एक", "यह", "ये", "वह", "वे", "इस", "उस", "इन", "उन",
  "भी", "ही", "तो", "तक", "लिए", "साथ", "बाद", "पहले",
  "किया", "किए", "कहा", "गया", "गई", "गए",
  "कर", "करने", "रूप", "तरह", "दौरान",
  "अधिक", "सबसे", "सभी", "कोई", "कई"
]);

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`JSON parse error in ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeForCompare(value) {
  return normalizeString(value)
    .normalize("NFC")
    .replace(/\u200c/g, "")
    .replace(/\u200d/g, "")
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
    .replace(/य़/g, "य")
    .replace(/ँ/g, "ं")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSourceId(inputPath) {
  const base = path.basename(inputPath, path.extname(inputPath));
  return base;
}

function parseTitle(text) {
  const match = text.match(/■\s*タイトル：(.+)/);
  return match ? match[1].trim() : "";
}

function parseCategory(text, aliases) {
  const match = text.match(/■\s*分野：(.+)/);
  const raw = match ? match[1].trim() : "未分類";
  return aliases[raw] || raw;
}

function parseBody(text) {
  const marker = "■ 本文：";
  const index = text.indexOf(marker);

  if (index === -1) {
    return text;
  }

  return text.slice(index + marker.length).trim();
}

function stripNoise(text) {
  return text
    .replace(/🪷\s*corpus:/g, " ")
    .replace(/【News】/g, " ")
    .replace(/■\s*タイトル：.*$/gm, " ")
    .replace(/■\s*分野：.*$/gm, " ")
    .replace(/■\s*本文：/g, " ")
    .replace(/[0-9०-९]+(?:\.[0-9०-९]+)?/g, " ")
    .replace(/[A-Za-z]+(?:[- ][A-Za-z]+)*/g, " ")
    .replace(/[।|,;:!?！？、。()\[\]{}「」『』"“”‘’]/g, " ")
    .replace(/[：・…—–\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeHindi(text) {
  const cleaned = stripNoise(text);
  const matches = cleaned.match(/[\u0900-\u097F]+(?:\s+[\u0900-\u097F]+)?/g);
  return matches || [];
}

function generateNgrams(tokens) {
  const items = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const one = tokens[i];
    if (one) items.push(one);

    const two = `${tokens[i]} ${tokens[i + 1] || ""}`.trim();
    if (tokens[i + 1] && two) items.push(two);
  }

  return items;
}

function looksUsefulCandidate(text) {
  const value = normalizeString(text);
  const key = normalizeForCompare(value);

  if (!key) return false;
  if (key.length < 2) return false;
  if (BUILTIN_STOPWORDS.has(key)) return false;

  const parts = key.split(/\s+/);

  if (parts.length > 2) return false;
  if (parts.every((part) => BUILTIN_STOPWORDS.has(part))) return false;

  return true;
}

function uniqueCandidates(items) {
  const map = new Map();

  items.forEach((item) => {
    const key = normalizeForCompare(item);
    if (!key || map.has(key)) return;

    map.set(key, item.trim());
  });

  return Array.from(map.entries()).map(([normalized, word]) => ({
    word,
    display: word,
    normalized,
    variants: []
  }));
}

function buildCandidates(body, extraStopwords, properNounExclusions) {
  const externalStopSet = new Set(extraStopwords.map(normalizeForCompare));
  const properNounSet = new Set(properNounExclusions.map(normalizeForCompare));

  const tokens = tokenizeHindi(body)
    .map((token) => token.trim())
    .filter(Boolean);

  const rawItems = generateNgrams(tokens);

  return uniqueCandidates(rawItems)
    .filter((item) => looksUsefulCandidate(item.word))
    .filter((item) => !externalStopSet.has(item.normalized))
    .filter((item) => !properNounSet.has(item.normalized));
}

function main() {
  const inputArg = process.argv[2];

  if (!inputArg) {
    throw new Error(
      "Usage: node scripts/build_news_candidates.js data/news/articles/news023.txt"
    );
  }

  const inputPath = path.resolve(ROOT, inputArg);
  const text = readText(inputPath);

  const aliases = readJson(CATEGORY_ALIASES_PATH, {});
  const stopwords = readJson(STOPWORDS_PATH, []);
  const properNounExclusions = readJson(PROPER_NOUN_EXCLUSIONS_PATH, []);

  const sourceId = parseSourceId(inputPath);
  const title = parseTitle(text);
  const category = parseCategory(text, aliases);
  const body = parseBody(text);

  const candidates = buildCandidates(
    body,
    stopwords,
    properNounExclusions
  ).map((item) => ({
    ...item,
    meaning_ja: "",
    pos: "",
    category,
    importance: DEFAULT_IMPORTANCE,
    sourceId
  }));

  const outputPath = path.join(
    OUT_DIR,
    `${sourceId}_candidates.json`
  );

  const result = {
    topic: "news_vocab_candidates",
    sourceId,
    title,
    category,
    generatedAt: new Date().toISOString(),
    counts: {
      candidates: candidates.length
    },
    candidates
  };

  writeJson(outputPath, result);

  console.log("✅ News candidates build complete.");
  console.log(`Input: ${inputPath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Source ID: ${sourceId}`);
  console.log(`Title: ${title || "(none)"}`);
  console.log(`Category: ${category}`);
  console.log(`Candidates: ${candidates.length}`);
}

try {
  main();
} catch (error) {
  console.error("❌ build_news_candidates failed.");
  console.error(error.message);
  process.exit(1);
}