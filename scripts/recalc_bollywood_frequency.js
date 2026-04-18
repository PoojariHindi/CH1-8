const fs = require("fs");
const path = require("path");

const masterPath = path.join(
  __dirname,
  "..",
  "data",
  "bollywood",
  "vocab_master.json"
);

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizeSourceSongIds(sourceSongIds) {
  if (!Array.isArray(sourceSongIds)) {
    return [];
  }

  const cleaned = sourceSongIds
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0);

  return [...new Set(cleaned)];
}

function recalcFrequency(masterEntries) {
  if (!Array.isArray(masterEntries)) {
    throw new Error("vocab_master.json must be an array.");
  }

  return masterEntries.map((entry) => {
    const normalizedSourceSongIds = normalizeSourceSongIds(entry.sourceSongIds);
    const frequency = normalizedSourceSongIds.length;

    return {
      ...entry,
      sourceSongIds: normalizedSourceSongIds,
      sourceCount: frequency,
      frequency: frequency
    };
  });
}

function main() {
  const masterEntries = loadJson(masterPath);
  const updatedEntries = recalcFrequency(masterEntries);

  fs.writeFileSync(masterPath, JSON.stringify(updatedEntries, null, 2), "utf8");

  console.log(`Updated frequency and sourceCount: ${masterPath}`);
  console.log(`Entries processed: ${updatedEntries.length}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
