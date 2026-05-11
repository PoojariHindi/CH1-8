const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const CANDIDATES_DIR = path.join(ROOT, "data", "academic", "candidates");
const MASTER_PATH = path.join(ROOT, "data", "academic", "vocab_master.json");
const REPORT_PATH = path.join(ROOT, "data", "academic", "academic_candidates_audit_report.json");

const HARD_STOPWORDS = new Set([
  "है",
  "हैं",
  "था",
  "थी",
  "थे",
  "होना",
  "करना",
  "कर",
  "किया",
  "किए",
  "गया",
  "गई",
  "गए",
  "यह",
  "वह",
  "ये",
  "वे",
  "इस",
  "उस",
  "इन",
  "उन",
  "और",
  "या",
  "तो",
  "भी",
  "ही",
  "से",
  "में",
  "को",
  "का",
  "के",
  "की",
  "पर",
  "लिए",
  "लिए",
  "साथ",
  "आज",
  "सभी",
  "कुछ",
  "कई",
  "एक",
  "न",
  "नहीं"
]);

const SOFT_STOPWORDS = new Set([
  "मनुष्य",
  "जीवन",
  "व्यक्ति",
  "शरीर",
  "मन",
  "लोग",
  "बात",
  "कारण"
]);

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
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEntry(entry) {
  const word = normalizeText(entry.word);
  const display = normalizeText(entry.display || word);
  const normalized = normalizeText(entry.normalized || display);

  return {
    word,
    display,
    normalized,
    variants: uniq(entry.variants || []),
    pos: normalizeText(entry.pos),
    meaning_ja: normalizeText(entry.meaning_ja),
    importance: Number(entry.importance) || 3,
    status: entry.status || "active",
    category: entry.category || "academic",
    tags: uniq(entry.tags || []),
    sourceIds: uniq(entry.sourceIds || []),
    sourceTitle: entry.sourceTitle || "",
    sourceGenre: entry.sourceGenre || "",
    sourceRegister: entry.sourceRegister || ""
  };
}

function mergeEntries(base, incoming) {
  return {
    ...base,
    variants: uniq([...(base.variants || []), ...(incoming.variants || [])]),
    tags: uniq([...(base.tags || []), ...(incoming.tags || [])]),
    sourceIds: uniq([...(base.sourceIds || []), ...(incoming.sourceIds || [])]),
    importance: Math.max(Number(base.importance) || 3, Number(incoming.importance) || 3)
  };
}

function getStopwordType(entry) {
  const key = entry.normalized || entry.display || entry.word;

  if (HARD_STOPWORDS.has(key)) {
    return "hard_stopword";
  }

  if (SOFT_STOPWORDS.has(key)) {
    return "soft_stopword_review";
  }

  return "";
}

function auditCandidates() {
  const master = readJson(MASTER_PATH, []);
  const existingKeys = new Set(
    master
      .filter((entry) => entry && entry.normalized)
      .map((entry) => entry.normalized)
  );

  const candidateFiles = fs
    .readdirSync(CANDIDATES_DIR)
    .filter((file) => file.endsWith("_candidates.json"))
    .sort();

  const allCandidates = [];
  const report = {
    summary: {
      candidateFiles: candidateFiles.length,
      totalCandidates: 0,
      newCandidates: 0,
      existingCandidates: 0,
      duplicateCandidates: 0,
      hardStopwords: 0,
      softStopwordReviews: 0
    },
    newCandidates: [],
    existingCandidates: [],
    duplicateCandidates: [],
    hardStopwords: [],
    softStopwordReviews: []
  };

  const seen = new Map();

  for (const file of candidateFiles) {
    const filePath = path.join(CANDIDATES_DIR, file);
    const candidatesRaw = readJson(filePath, []);

    const candidates = Array.isArray(candidatesRaw)
      ? candidatesRaw
      : (candidatesRaw.items || []);

    for (const raw of candidates) {
      const entry = normalizeEntry(raw);

      if (!entry.word || !entry.normalized || !entry.meaning_ja) {
        continue;
      }

      allCandidates.push(entry);

      const stopwordType = getStopwordType(entry);

      if (stopwordType === "hard_stopword") {
        report.hardStopwords.push({
          ...entry,
          audit: "exclude_hard_stopword"
        });
        continue;
      }

      if (stopwordType === "soft_stopword_review") {
        report.softStopwordReviews.push({
          ...entry,
          audit: "manual_review_soft_stopword"
        });
      }

      if (existingKeys.has(entry.normalized)) {
        report.existingCandidates.push({
          ...entry,
          audit: "existing_in_master"
        });
        continue;
      }

      if (seen.has(entry.normalized)) {
        const merged = mergeEntries(seen.get(entry.normalized), entry);
        seen.set(entry.normalized, merged);

        report.duplicateCandidates.push({
          ...entry,
          audit: "duplicate_in_candidates"
        });
        continue;
      }

      seen.set(entry.normalized, entry);
    }
  }

  report.newCandidates = [...seen.values()]
    .filter((entry) => !existingKeys.has(entry.normalized))
    .map((entry) => ({
      ...entry,
      audit: "new_candidate"
    }))
    .sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return a.display.localeCompare(b.display, "hi");
    });

  report.summary.totalCandidates = allCandidates.length;
  report.summary.newCandidates = report.newCandidates.length;
  report.summary.existingCandidates = report.existingCandidates.length;
  report.summary.duplicateCandidates = report.duplicateCandidates.length;
  report.summary.hardStopwords = report.hardStopwords.length;
  report.summary.softStopwordReviews = report.softStopwordReviews.length;

  writeJson(REPORT_PATH, report);

  console.log("✅ Academic candidates audit complete.");
  console.log(`📄 Report: ${REPORT_PATH}`);
  console.log(report.summary);
}

auditCandidates();