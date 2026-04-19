const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");

const masterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const autoMergePath = path.join(rootDir, "data", "bollywood", "audit", "candidate_auto_merge.json");
const backupDir = path.join(rootDir, "data", "bollywood", "audit", "backups");

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

function normalizeSongIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => safeString(v)).filter(Boolean))];
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => safeString(v)).filter(Boolean))];
}

function makeBackup(masterEntries) {
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `vocab_master.backup.${timestamp}.json`);
  saveJson(backupPath, masterEntries);
  return backupPath;
}

function applyAutoMerge(masterEntries, autoMergeData) {
  if (!Array.isArray(masterEntries)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const items = Array.isArray(autoMergeData?.items)
    ? autoMergeData.items
    : Array.isArray(autoMergeData)
      ? autoMergeData
      : [];

  let applied = 0;
  let skipped = 0;
  const logs = [];

  for (const item of items) {
    const mergeInto = item?.mergeInto || {};
    const candidate = item?.candidate || {};

    const targetIndex = Number.isInteger(mergeInto.index) ? mergeInto.index : null;
    const songId = safeString(candidate.songId);

    if (targetIndex == null || !songId) {
      skipped += 1;
      logs.push({
        status: "skipped",
        reason: "missing target index or songId",
        item
      });
      continue;
    }

    const target = masterEntries[targetIndex];
    if (!target) {
      skipped += 1;
      logs.push({
        status: "skipped",
        reason: "target index not found in vocab_master",
        targetIndex,
        item
      });
      continue;
    }

    const beforeIds = normalizeSongIds(target.sourceSongIds);
    const afterIds = [...beforeIds];

    if (!afterIds.includes(songId)) {
      afterIds.push(songId);
    }

    target.sourceSongIds = afterIds;
    target.status = safeString(target.status) || "active";
    target.tags = normalizeTags(target.tags);

    if (afterIds.length !== beforeIds.length) {
      applied += 1;
      logs.push({
        status: "applied",
        word: target.word,
        targetIndex,
        addedSongId: songId
      });
    } else {
      skipped += 1;
      logs.push({
        status: "skipped",
        word: target.word,
        targetIndex,
        reason: "songId already present",
        songId
      });
    }
  }

  return {
    masterEntries,
    summary: {
      total: items.length,
      applied,
      skipped
    },
    logs
  };
}

function main() {
  const masterEntries = loadJson(masterPath);
  const autoMergeData = loadJson(autoMergePath);

  const backupPath = makeBackup(masterEntries);

  const result = applyAutoMerge(masterEntries, autoMergeData);

  saveJson(masterPath, result.masterEntries);

  const logPath = path.join(rootDir, "data", "bollywood", "audit", "candidate_auto_merge_applied_log.json");
  saveJson(logPath, {
    appliedAt: new Date().toISOString(),
    backupPath,
    summary: result.summary,
    logs: result.logs
  });

  console.log(`Backup created: ${backupPath}`);
  console.log(`Updated vocab_master.json: ${masterPath}`);
  console.log(`Applied: ${result.summary.applied}`);
  console.log(`Skipped: ${result.summary.skipped}`);
  console.log(`Log written: ${logPath}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}