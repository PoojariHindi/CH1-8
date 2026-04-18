const fs = require("fs");
const path = require("path");

const songId = process.argv[2];

if (!songId) {
  console.error("Usage: node scripts/update_bollywood_vocab_from_song.js bolly_011");
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

function normalizeText(text) {
  return String(text)
    .normalize("NFC")
    .replace(/[“”"‘’'….,!?;:(){}\[\]।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLyricsText(songData) {
  if (Array.isArray(songData.lyrics)) {
    return normalizeText(songData.lyrics.join(" "));
  }
  if (typeof songData.lyrics === "string") {
    return normalizeText(songData.lyrics);
  }
  return "";
}

function songContainsWord(lyricsText, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "u");
  return pattern.test(lyricsText);
}

function extractTokenCandidates(lyricsText) {
  const rawTokens = lyricsText.split(/\s+/).filter(Boolean);

  const stopwords = new Set([
    "है", "हैं", "हो", "हूँ", "था", "थी", "थे", "यह", "वह", "ये", "वे",
    "को", "से", "में", "पर", "और", "या", "तो", "भी", "ना", "नहीं", "ही",
    "हम", "तुम", "मैं", "तू", "तेरे", "तेरा", "तेरी", "तुझे", "यहाँ", "क्यों",
    "क्या", "एक", "इक", "जो", "कितना", "चाहे", "सब", "ऐसे", "दो", "चार",
    "बार", "पल", "का", "की", "के"
  ]);

  const freq = new Map();

  for (const token of rawTokens) {
    const t = token.trim();
    if (!t) continue;
    if (stopwords.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    if (t.length <= 1) continue;

    freq.set(t, (freq.get(t) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "hi"))
    .map(([word, count]) => ({ word, count }));
}

function main() {
  const songData = loadJson(songPath);
  const vocabMaster = loadJson(vocabMasterPath);

  if (!Array.isArray(vocabMaster)) {
    throw new Error("vocab_master.json must be an array.");
  }

 const lyricsText = getTextFromSong(songData);
if (!lyricsText) {
  throw new Error(`No lyrics or expressions found in ${songPath}`);
}

  let updatedCount = 0;

  const updatedMaster = vocabMaster.map((entry) => {
    const ids = Array.isArray(entry.sourceSongIds) ? [...new Set(entry.sourceSongIds)] : [];

    if (songContainsWord(lyricsText, entry.word)) {
      if (!ids.includes(songId)) {
        ids.push(songId);
        updatedCount += 1;
      }
    }

    return {
      ...entry,
      sourceSongIds: ids
    };
  });

  saveJson(vocabMasterPath, updatedMaster);

  const knownWords = new Set(updatedMaster.map((entry) => entry.word));
  const candidates = extractTokenCandidates(lyricsText)
    .filter((item) => !knownWords.has(item.word));

  saveJson(candidatesPath, {
    songId,
    title: songData.title || "",
    film: songData.film || "",
    candidateCount: candidates.length,
    candidates
  });

  console.log(`Updated vocab_master.json with song: ${songId}`);
  console.log(`Existing vocab matched and updated: ${updatedCount}`);
  console.log(`Candidate file created: ${candidatesPath}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
