const fs = require("fs");
const path = require("path");

const songId = process.argv[2];

if (!songId) {
  console.error("Usage: node scripts/update_bollywood_vocab_from_song.js bolly_014");
  process.exit(1);
}

const rootDir = path.join(__dirname, "..");
const songPath = path.join(rootDir, "data", "bollywood", "songs", `${songId}.json`);
const vocabMasterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const candidatesDir = path.join(rootDir, "data", "bollywood", "candidates");
const candidatesPath = path.join(candidatesDir, `${songId}_candidates.json`);

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

function normalizeWhitespace(text) {
  return String(text)
    .normalize("NFC")
    .replace(/[“”"‘’'….,!?;:(){}\[\]।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 比較用の正規化
// - 句読点除去
// - nukta字の揺れをある程度吸収
// - 空白統一
function normalizeForCompare(text) {
  return normalizeWhitespace(text)
    .replace(/\u093C/g, "") // nukta combining mark を除去
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

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function getExpressionItems(songData) {
  if (!Array.isArray(songData.expressions)) return [];

  return songData.expressions
    .map((item) => {
      if (typeof item === "string") {
        const text = safeString(item);
        if (!text) return null;
        return {
          text,
          normalized: normalizeForCompare(text),
          meaning_ja: "",
          type: "expression",
          importance: 3,
          status: "active"
        };
      }

      if (item && typeof item === "object") {
        const text = safeString(item.text);
        if (!text) return null;
        return {
          text,
          normalized: safeString(item.normalized) || normalizeForCompare(text),
          meaning_ja: safeString(item.meaning_ja),
          type: safeString(item.type) || "expression",
          importance: Number.isFinite(item.importance) ? item.importance : 3,
          status: safeString(item.status) || "active"
        };
      }

      return null;
    })
    .filter(Boolean);
}

function getExplicitVocabCandidates(songData) {
  if (!Array.isArray(songData.vocab_candidates)) return [];

  return songData.vocab_candidates
    .map((item) => {
      if (typeof item === "string") {
        const word = safeString(item);
        if (!word) return null;
        return {
          word,
          normalized: normalizeForCompare(word),
          pos: "",
          meaning_ja: "",
          importance: 3,
          status: "active",
          source: "vocab_candidates"
        };
      }

      if (item && typeof item === "object") {
        const word = safeString(item.word);
        if (!word) return null;
        return {
          word,
          normalized: safeString(item.normalized) || normalizeForCompare(word),
          pos: safeString(item.pos),
          meaning_ja: safeString(item.meaning_ja),
          importance: Number.isFinite(item.importance) ? item.importance : 3,
          status: safeString(item.status) || "active",
          source: "vocab_candidates"
        };
      }

      return null;
    })
    .filter(Boolean);
}

function getLyricsText(songData) {
  if (Array.isArray(songData.lyrics)) {
    return normalizeWhitespace(songData.lyrics.join(" "));
  }
  if (typeof songData.lyrics === "string") {
    return normalizeWhitespace(songData.lyrics);
  }
  return "";
}

function extractTokenCandidatesFromText(text, source = "text_fallback") {
  const normalizedText = normalizeWhitespace(text);
  if (!normalizedText) return [];

  const rawTokens = normalizedText.split(/\s+/).filter(Boolean);

  const stopwords = new Set([
    "है", "हैं", "हो", "हूँ", "था", "थी", "थे", "यह", "वह", "ये", "वे",
    "को", "से", "में", "पर", "और", "या", "तो", "भी", "ना", "नहीं", "ही",
    "हम", "तुम", "मैं", "तू", "तेरे", "तेरा", "तेरी", "तुझे", "यहाँ", "क्यों",
    "क्या", "एक", "इक", "जो", "कितना", "चाहे", "सब", "ऐसे", "दो", "चार",
    "बार", "पल", "का", "की", "के", "या", "मैं", "ना", "तो", "भी"
  ]);

  const freq = new Map();

  for (const token of rawTokens) {
    const word = safeString(token);
    const normalized = normalizeForCompare(word);

    if (!word) continue;
    if (!normalized) continue;
    if (stopwords.has(normalized)) continue;
    if (/^\d+$/.test(normalized)) continue;
    if (normalized.length <= 1) continue;

    if (!freq.has(normalized)) {
      freq.set(normalized, {
        word,
        normalized,
        pos: "",
        meaning_ja: "",
        importance: 2,
        status: "active",
        source,
        count: 0
      });
    }

    freq.get(normalized).count += 1;
  }

  return [...freq.values()]
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, "hi"))
    .map(({ count, ...rest }) => rest);
}

function extractCandidatesFromExpressions(songData) {
  const expressions = getExpressionItems(songData);
  if (expressions.length === 0) return [];

  const joined = expressions.map((e) => e.text).join(" ");
  return extractTokenCandidatesFromText(joined, "expressions");
}

function dedupeCandidateObjects(items) {
  const map = new Map();

  for (const item of items) {
    if (!item || !item.normalized) continue;

    if (!map.has(item.normalized)) {
      map.set(item.normalized, { ...item });
      continue;
    }

    const prev = map.get(item.normalized);

    map.set(item.normalized, {
      word: prev.word || item.word,
      normalized: prev.normalized || item.normalized,
      pos: prev.pos || item.pos || "",
      meaning_ja: prev.meaning_ja || item.meaning_ja || "",
      importance: Math.max(prev.importance || 1, item.importance || 1),
      status: prev.status || item.status || "active",
      source: prev.source || item.source || ""
    });
  }

  return [...map.values()];
}

function buildSongCandidates(songData) {
  const explicit = getExplicitVocabCandidates(songData);
  if (explicit.length > 0) {
    return dedupeCandidateObjects(explicit);
  }

  const expressionDerived = extractCandidatesFromExpressions(songData);
  if (expressionDerived.length > 0) {
    return dedupeCandidateObjects(expressionDerived);
  }

  const lyricsText = getLyricsText(songData);
  if (lyricsText) {
    return dedupeCandidateObjects(extractTokenCandidatesFromText(lyricsText, "lyrics_fallback"));
  }

  throw new Error(`No vocab_candidates, expressions, or lyrics found in ${songPath}`);
}

function normalizeExistingEntry(entry) {
  const word = safeString(entry.word);
  const normalized = safeString(entry.normalized) || normalizeForCompare(word);
  return {
    ...entry,
    word,
    normalized
  };
}

function main() {
  const songData = loadJson(songPath);
  const vocabMaster = loadJson(vocabMasterPath);

  if (!Array.isArray(vocabMaster)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const songCandidates = buildSongCandidates(songData);
  const candidateMap = new Map(songCandidates.map((item) => [item.normalized, item]));
  const candidateNormalizedSet = new Set(songCandidates.map((item) => item.normalized));

  let updatedCount = 0;

  const normalizedMaster = vocabMaster.map(normalizeExistingEntry);

  const updatedMaster = normalizedMaster.map((entry) => {
    const ids = Array.isArray(entry.sourceSongIds)
      ? [...new Set(entry.sourceSongIds)]
      : [];

    if (candidateNormalizedSet.has(entry.normalized)) {
      if (!ids.includes(songId)) {
        ids.push(songId);
        updatedCount += 1;
      }

      const matched = candidateMap.get(entry.normalized);

      return {
        ...entry,
        normalized: entry.normalized,
        sourceSongIds: ids,
        importance: Math.max(entry.importance || 1, matched?.importance || 1),
        status: entry.status || "active"
      };
    }

    return {
      ...entry,
      normalized: entry.normalized,
      sourceSongIds: ids,
      status: entry.status || "active"
    };
  });

  saveJson(vocabMasterPath, updatedMaster);

  const knownWords = new Set(updatedMaster.map((entry) => entry.normalized));
  const newCandidates = songCandidates.filter((item) => !knownWords.has(item.normalized));

  saveJson(candidatesPath, {
    songId,
    title: songData.title || "",
    film: songData.film || "",
    candidateCount: newCandidates.length,
    candidates: newCandidates
  });

  console.log(`Updated vocab_master.json with song: ${songId}`);
  console.log(`Existing vocab matched and updated: ${updatedCount}`);
  console.log(`Candidate file created: ${candidatesPath}`);
  console.log(`New candidate count: ${newCandidates.length}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}