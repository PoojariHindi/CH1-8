const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");

const masterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const manualReviewPath = path.join(rootDir, "data", "bollywood", "audit", "candidate_manual_review.json");
const auditDir = path.join(rootDir, "data", "bollywood", "audit");

const newEntryPath = path.join(auditDir, "candidate_new_entry_candidates.json");
const duplicatePath = path.join(auditDir, "candidate_duplicate_merge_candidates.json");
const unclearPath = path.join(auditDir, "candidate_unclear_candidates.json");
const summaryPath = path.join(auditDir, "candidate_manual_classification_summary.json");

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

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeWhitespace(text) {
  return String(text || "")
    .normalize("NFC")
    .replace(/[“”"‘’'….,!?;:(){}\[\]।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(text) {
  return normalizeWhitespace(text)
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
    .replace(/ऴ/g, "ळ")
    .replace(/य़/g, "य")
    .replace(/ँ/g, "ं")
    .trim();
}

function normalizeMeaning(text) {
  return normalizeWhitespace(text).toLowerCase();
}

function normalizePos(text) {
  return normalizeWhitespace(text).toLowerCase();
}

function buildMasterIndex(masterEntries) {
  return masterEntries.map((entry, index) => ({
    index,
    word: safeString(entry.word),
    normalized: safeString(entry.normalized),
    compareNormalized: normalizeForCompare(entry.normalized || entry.word),
    meaning_ja: safeString(entry.meaning_ja || entry.meaning),
    meaningNorm: normalizeMeaning(entry.meaning_ja || entry.meaning),
    pos: safeString(entry.pos),
    posNorm: normalizePos(entry.pos),
    sourceSongIds: Array.isArray(entry.sourceSongIds) ? entry.sourceSongIds : [],
    raw: entry
  }));
}

function similarityScore(candidate, master) {
  let score = 0;

  if (candidate.compareNormalized && candidate.compareNormalized === master.compareNormalized) {
    score += 6;
  }

  if (candidate.word && candidate.word === master.word) {
    score += 5;
  }

  if (candidate.meaningNorm && master.meaningNorm) {
    if (candidate.meaningNorm === master.meaningNorm) {
      score += 4;
    } else if (
      candidate.meaningNorm.includes(master.meaningNorm) ||
      master.meaningNorm.includes(candidate.meaningNorm)
    ) {
      score += 2;
    }
  }

  if (candidate.posNorm && master.posNorm && candidate.posNorm === master.posNorm) {
    score += 2;
  }

  return score;
}

function classifyOne(candidate, masterIndex) {
  const scored = masterIndex
    .map((m) => ({
      ...m,
      score: similarityScore(candidate, m)
    }))
    .filter((m) => m.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) {
    return {
      class: "new_entry",
      reason: ["no close existing entry found"]
    };
  }

  const top = scored[0];

  const sameNormalized = candidate.compareNormalized && candidate.compareNormalized === top.compareNormalized;
  const sameMeaning = candidate.meaningNorm && top.meaningNorm && candidate.meaningNorm === top.meaningNorm;
  const samePos = candidate.posNorm && top.posNorm && candidate.posNorm === top.posNorm;

  if (sameNormalized || (sameMeaning && samePos)) {
    return {
      class: "duplicate_merge",
      reason: [
        sameNormalized ? "same normalized form" : "same meaning and pos"
      ],
      possibleMatches: scored.map((m) => ({
        index: m.index,
        word: m.word,
        normalized: m.normalized,
        meaning_ja: m.meaning_ja,
        pos: m.pos,
        sourceSongIds: m.sourceSongIds,
        score: m.score
      }))
    };
  }

  return {
    class: "unclear",
    reason: ["close match exists but not safe to auto-merge"],
    possibleMatches: scored.map((m) => ({
      index: m.index,
      word: m.word,
      normalized: m.normalized,
      meaning_ja: m.meaning_ja,
      pos: m.pos,
      sourceSongIds: m.sourceSongIds,
      score: m.score
    }))
  };
}

function flattenManualItems(data) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

  return items.map((item, idx) => ({
    reviewIndex: idx,
    songId: safeString(item.songId),
    title: safeString(item.title),
    film: safeString(item.film),
    word: safeString(item.word),
    normalized: safeString(item.normalized),
    compareNormalized: normalizeForCompare(item.normalized || item.word),
    meaning_ja: safeString(item.meaning_ja),
    meaningNorm: normalizeMeaning(item.meaning_ja),
    pos: safeString(item.pos),
    posNorm: normalizePos(item.pos),
    importance: Number.isFinite(item.importance) ? item.importance : null,
    status: safeString(item.status),
    raw: item
  })).filter((item) => item.word);
}

function main() {
  const masterEntries = loadJson(masterPath);
  const manualData = loadJson(manualReviewPath);

  const masterIndex = buildMasterIndex(masterEntries);
  const manualItems = flattenManualItems(manualData);

  const newEntries = [];
  const duplicateMerges = [];
  const unclear = [];

  for (const candidate of manualItems) {
    const result = classifyOne(candidate, masterIndex);

    const base = {
      songId: candidate.songId,
      title: candidate.title,
      film: candidate.film,
      word: candidate.word,
      normalized: candidate.normalized,
      pos: candidate.pos,
      meaning_ja: candidate.meaning_ja,
      importance: candidate.importance,
      reason: result.reason
    };

    if (result.class === "new_entry") {
      newEntries.push(base);
    } else if (result.class === "duplicate_merge") {
      duplicateMerges.push({
        ...base,
        possibleMatches: result.possibleMatches || []
      });
    } else {
      unclear.push({
        ...base,
        possibleMatches: result.possibleMatches || []
      });
    }
  }

  saveJson(newEntryPath, {
    generatedAt: new Date().toISOString(),
    count: newEntries.length,
    items: newEntries
  });

  saveJson(duplicatePath, {
    generatedAt: new Date().toISOString(),
    count: duplicateMerges.length,
    items: duplicateMerges
  });

  saveJson(unclearPath, {
    generatedAt: new Date().toISOString(),
    count: unclear.length,
    items: unclear
  });

  saveJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    totalManualItems: manualItems.length,
    newEntryCount: newEntries.length,
    duplicateMergeCount: duplicateMerges.length,
    unclearCount: unclear.length
  });

  console.log("✅ manual review classification completed");
  console.log(`new_entry: ${newEntries.length}`);
  console.log(`duplicate_merge: ${duplicateMerges.length}`);
  console.log(`unclear: ${unclear.length}`);
  console.log(`summary: ${summaryPath}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}