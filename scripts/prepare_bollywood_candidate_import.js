const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");

const masterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const newEntryPath = path.join(rootDir, "data", "bollywood", "audit", "candidate_new_entry_candidates.json");
const duplicatePath = path.join(rootDir, "data", "bollywood", "audit", "candidate_duplicate_merge_candidates.json");

const outDir = path.join(rootDir, "data", "bollywood", "audit");
const newBlockPath = path.join(outDir, "candidate_import_new_block.json");
const mergePatchPath = path.join(outDir, "candidate_import_merge_patch.json");
const previewPath = path.join(outDir, "vocab_master_import_preview.json");
const summaryPath = path.join(outDir, "candidate_import_summary.json");

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

function normalizeSongIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => safeString(v)).filter(Boolean))];
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => safeString(v)).filter(Boolean))];
}

function toItems(data) {
  return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
}

function defaultImportance(value) {
  if (value === 4 || value === 3 || value === 2) return value;
  if (value === 5) return 4;
  if (value === 1) return 2;
  return 3;
}

function inferPos(word, pos) {
  const p = safeString(pos);
  if (p) return p;

  const w = safeString(word);
  if (/ना$/.test(w)) return "動詞";
  if (/ा$/.test(w)) return "名詞（男）";
  if (/ी$/.test(w) || /ाई$/.test(w) || /त$/.test(w)) return "名詞（女）";
  return "";
}

function inferCategory(pos, meaning) {
  const p = safeString(pos);
  const m = safeString(meaning);

  if (p.includes("動詞")) return "action";
  if (m.includes("風") || m.includes("光") || m.includes("空") || m.includes("大地") || m.includes("雨") || m.includes("月") || m.includes("湖")) {
    return "nature";
  }
  if (m.includes("愛") || m.includes("願") || m.includes("希望") || m.includes("心") || m.includes("魂") || m.includes("痛み") || m.includes("恐れ") || m.includes("安らぎ")) {
    return "emotion";
  }
  return "";
}

function buildNewEntryBlock(newItems) {
  const seen = new Set();
  const result = [];

  for (const item of newItems) {
    const word = safeString(item.word);
    if (!word) continue;

    const normalized = safeString(item.normalized) || normalizeForCompare(word);
    const key = `${normalized}__${safeString(item.meaning_ja)}`;

    if (seen.has(key)) continue;
    seen.add(key);

    const pos = inferPos(word, item.pos);
    const meaning_ja = safeString(item.meaning_ja);
    const importance = defaultImportance(item.importance);

    result.push({
      word,
      normalized,
      pos,
      meaning_ja,
      importance,
      status: "active",
      sourceSongIds: [safeString(item.songId)].filter(Boolean),
      sourceCount: 1,
      frequency: 1,
      tags: [],
      notes: "",
      layer: importance === 4 ? "A" : "B",
      difficulty: importance === 4 ? 2 : 3,
      category: inferCategory(pos, meaning_ja)
    });
  }

  return result;
}

function buildDuplicateMergePatch(duplicateItems, masterEntries) {
  const patches = [];

  for (const item of duplicateItems) {
    const songId = safeString(item.songId);
    const matches = Array.isArray(item.possibleMatches) ? item.possibleMatches : [];
    if (!songId || matches.length === 0) continue;

    const best = matches[0];
    const idx = Number.isInteger(best.index) ? best.index : null;
    if (idx == null || !masterEntries[idx]) continue;

    patches.push({
      targetIndex: idx,
      targetWord: safeString(masterEntries[idx].word),
      addSongId: songId,
      candidateWord: safeString(item.word),
      reason: item.reason || []
    });
  }

  return patches;
}

function applyPreview(masterEntries, newBlock, mergePatch) {
  const preview = JSON.parse(JSON.stringify(masterEntries));

  for (const patch of mergePatch) {
    const target = preview[patch.targetIndex];
    if (!target) continue;

    const ids = normalizeSongIds(target.sourceSongIds);
    if (!ids.includes(patch.addSongId)) ids.push(patch.addSongId);

    target.sourceSongIds = ids;
    target.sourceCount = ids.length;
    target.frequency = ids.length;
    target.status = safeString(target.status) || "active";
    target.tags = normalizeTags(target.tags);
  }

  for (const entry of newBlock) {
    preview.push(entry);
  }

  return preview;
}

function main() {
  const masterEntries = loadJson(masterPath);
  const newData = loadJson(newEntryPath);
  const duplicateData = loadJson(duplicatePath);

  const newItems = toItems(newData);
  const duplicateItems = toItems(duplicateData);

  const newBlock = buildNewEntryBlock(newItems);
  const mergePatch = buildDuplicateMergePatch(duplicateItems, masterEntries);
  const preview = applyPreview(masterEntries, newBlock, mergePatch);

  saveJson(newBlockPath, {
    generatedAt: new Date().toISOString(),
    count: newBlock.length,
    items: newBlock
  });

  saveJson(mergePatchPath, {
    generatedAt: new Date().toISOString(),
    count: mergePatch.length,
    items: mergePatch
  });

  saveJson(previewPath, preview);

  saveJson(summaryPath, {
    generatedAt: new Date().toISOString(),
    newEntryInputCount: newItems.length,
    duplicateInputCount: duplicateItems.length,
    newBlockCount: newBlock.length,
    mergePatchCount: mergePatch.length,
    previewEntryCount: preview.length
  });

  console.log("✅ candidate import preparation completed");
  console.log(`new block: ${newBlock.length}`);
  console.log(`merge patch: ${mergePatch.length}`);
  console.log(`preview total entries: ${preview.length}`);
  console.log(`summary: ${summaryPath}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}