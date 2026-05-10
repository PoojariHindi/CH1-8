const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const MASTER_PATH = path.join(ROOT, "data", "academic", "vocab_master.json");
const REPORT_PATH = path.join(ROOT, "data", "academic", "academic_candidates_audit_report.json");
const BACKUP_PATH = path.join(ROOT, "data", "academic", "vocab_master.backup.json");

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

function cleanEntry(entry) {
  return {
    word: entry.word,
    normalized: entry.normalized || entry.display || entry.word,
    display: entry.display || entry.word,
    variants: uniq(entry.variants || []),
    pos: entry.pos || "",
    meaning_ja: entry.meaning_ja || "",
    importance: Number(entry.importance) || 3,
    category: entry.category || "academic",
    tags: uniq(entry.tags || []),
    sourceIds: uniq(entry.sourceIds || [])
  };
}

function mergeEntry(existing, incoming) {
  return {
    ...existing,
    variants: uniq([...(existing.variants || []), ...(incoming.variants || [])]),
    tags: uniq([...(existing.tags || []), ...(incoming.tags || [])]),
    sourceIds: uniq([...(existing.sourceIds || []), ...(incoming.sourceIds || [])]),
    importance: Math.max(Number(existing.importance) || 3, Number(incoming.importance) || 3)
  };
}

function main() {
  const master = readJson(MASTER_PATH, []);
  const report = readJson(REPORT_PATH);

  if (!Array.isArray(master)) {
    throw new Error("vocab_master.json must be an array.");
  }

  if (!report || !Array.isArray(report.newCandidates)) {
    throw new Error("audit report must contain newCandidates array.");
  }

  writeJson(BACKUP_PATH, master);

  const masterMap = new Map();

  for (const raw of master) {
    const entry = cleanEntry(raw);
    masterMap.set(entry.normalized, entry);
  }

  let added = 0;
  let merged = 0;
  let skipped = 0;

  for (const rawCandidate of report.newCandidates) {
    if (rawCandidate.audit !== "new_candidate") {
      skipped += 1;
      continue;
    }

    if (rawCandidate.status && rawCandidate.status !== "active") {
      skipped += 1;
      continue;
    }

    const candidate = cleanEntry(rawCandidate);

    if (!candidate.word || !candidate.normalized || !candidate.meaning_ja) {
      skipped += 1;
      continue;
    }

    if (masterMap.has(candidate.normalized)) {
      const existing = masterMap.get(candidate.normalized);
      masterMap.set(candidate.normalized, mergeEntry(existing, candidate));
      merged += 1;
    } else {
      masterMap.set(candidate.normalized, candidate);
      added += 1;
    }
  }

  const updatedMaster = [...masterMap.values()].sort((a, b) => {
    if (b.importance !== a.importance) {
      return b.importance - a.importance;
    }
    return a.display.localeCompare(b.display, "hi");
  });

  writeJson(MASTER_PATH, updatedMaster);

  console.log("✅ Academic vocab master merge complete.");
  console.log(`📄 Master: ${MASTER_PATH}`);
  console.log(`🧷 Backup: ${BACKUP_PATH}`);
  console.log({
    before: master.length,
    after: updatedMaster.length,
    added,
    merged,
    skipped
  });
}

main();