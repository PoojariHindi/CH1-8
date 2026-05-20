/**
 * build_news_candidates.js v2
 *
 * News corpus txt から news vocab candidate JSON を生成する。
 * v2:
 * - 助詞で始まる/終わる2語候補を除外
 * - stopword / function word を強化
 * - 1語候補と安全な2語候補のみ生成
 * - proper noun exclusions / news_stopwords / category_aliases 対応
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

const FUNCTION_WORDS = new Set([
  "है", "हैं", "था", "थे", "थी", "हुआ", "हुई", "हुए",
  "हो", "होगा", "होगी", "होंगे", "रहा", "रही", "रहे",
  "किया", "किए", "किये", "कहना", "कहा", "गया", "गई", "गए",
  "कर", "करने", "करता", "करती", "करते", "मिलना", "मिलेगी",
  "बना", "बनी", "बने", "रहना", "रहा", "रही", "रहे",

  "का", "की", "के", "को", "से", "में", "पर", "ने", "तक",
  "लिए", "साथ", "बाद", "पहले", "दौरान", "बीच", "ऊपर",
  "और", "या", "लेकिन", "बल्कि", "क्योंकि", "यदि", "तो",

  "एक", "यह", "ये", "वह", "वे", "इस", "उस", "इन", "उन",
  "भी", "ही", "कोई", "कई", "कुछ", "सभी", "सबसे",
  "नहीं", "अब", "फिर", "जहां", "जहाँ",

  "अधिक", "कम", "ज्यादा", "काफी", "लगभग",
  "पहला", "पहली", "पहले", "दूसरा", "दूसरे", "तीसरा", "तीसरे",
  "पांच", "छह", "दिन", "मंगलवार", "बुधवार", "गुरुवार",
  "शुक्रवार", "शनिवार", "रविवार", "सोमवार",

  "रूप", "तरह", "माह", "वर्ष", "बार", "नंबर"
]);

const BAD_SINGLE_WORDS = new Set([
  "देश", "दुनिया", "शहर", "जिला", "राज्य", "क्षेत्र",
  "नाम", "सूची", "स्थिति", "कारण", "मामला",
  "दिन", "माह", "वर्ष", "बार", "नंबर"
]);

const GOOD_BIGRAM_PATTERNS = [
  /विभाग$/,
  /तापमान$/,
  /गर्मी$/,
  /लू$/,
  /प्रकोप$/,
  /राहत$/,
  /अलर्ट$/,
  /विक्षोभ$/,
  /हवा$/,
  /रैंकिंग$/,
  /सेल्सियस$/,
  /मौसम/,
  /अधिकतम/,
  /भीषण/,
  /पश्चिमी/,
  /शुष्क/,
  /गंभीर/,
  /ग्लोबल/,
  /लाइव/
];

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
  return path.basename(inputPath, path.extname(inputPath));
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
  return index === -1 ? text : text.slice(index + marker.length).trim();
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
  const matches = cleaned.match(/[\u0900-\u097F]+/g);
  return matches || [];
}

function isFunctionWord(word) {
  return FUNCTION_WORDS.has(normalizeForCompare(word));
}

function isBadSingleWord(word) {
  return BAD_SINGLE_WORDS.has(normalizeForCompare(word));
}

function isExternalStopword(word, externalStopSet) {
  return externalStopSet.has(normalizeForCompare(word));
}

function isProperNounExcluded(word, properNounSet) {
  return properNounSet.has(normalizeForCompare(word));
}

function looksLikeUsefulSingle(word, externalStopSet, properNounSet) {
  const key = normalizeForCompare(word);

  if (!key) return false;
  if (key.length < 3) return false;
  if (isFunctionWord(key)) return false;
  if (isBadSingleWord(key)) return false;
  if (externalStopSet.has(key)) return false;
  if (properNounSet.has(key)) return false;

  return true;
}

function looksLikeUsefulBigram(first, second, externalStopSet, properNounSet) {
  const a = normalizeForCompare(first);
  const b = normalizeForCompare(second);
  const phrase = `${a} ${b}`.trim();

  if (!a || !b) return false;
  if (a.length < 3 || b.length < 3) return false;

  if (isFunctionWord(a) || isFunctionWord(b)) return false;
  if (externalStopSet.has(a) || externalStopSet.has(b)) return false;
  if (externalStopSet.has(phrase)) return false;
  if (properNounSet.has(a) || properNounSet.has(b)) return false;
  if (properNounSet.has(phrase)) return false;

  if (isBadSingleWord(a) && isBadSingleWord(b)) return false;

  return GOOD_BIGRAM_PATTERNS.some((pattern) => pattern.test(phrase));
}

function uniqueByNormalized(items) {
  const map = new Map();

  items.forEach((word) => {
    const normalized = normalizeForCompare(word);
    if (!normalized || map.has(normalized)) return;

    map.set(normalized, {
      word,
      display: word,
      normalized,
      variants: []
    });
  });

  return Array.from(map.values());
}

function buildCandidates(body, extraStopwords, properNounExclusions) {
  const externalStopSet = new Set(extraStopwords.map(normalizeForCompare));
  const properNounSet = new Set(properNounExclusions.map(normalizeForCompare));

  const tokens = tokenizeHindi(body)
    .map(normalizeString)
    .filter(Boolean);

  const rawCandidates = [];

  tokens.forEach((token, index) => {
    if (looksLikeUsefulSingle(token, externalStopSet, properNounSet)) {
      rawCandidates.push(token);
    }

    const next = tokens[index + 1];

    if (next && looksLikeUsefulBigram(token, next, externalStopSet, properNounSet)) {
      rawCandidates.push(`${token} ${next}`);
    }
  });

  return uniqueByNormalized(rawCandidates);
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

  const outputPath = path.join(OUT_DIR, `${sourceId}_candidates.json`);

  writeJson(outputPath, {
    topic: "news_vocab_candidates",
    sourceId,
    title,
    category,
    generatedAt: new Date().toISOString(),
    counts: {
      candidates: candidates.length
    },
    candidates
  });

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