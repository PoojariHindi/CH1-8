const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const vocabMasterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const backupPath = path.join(rootDir, "data", "bollywood", "vocab_master.backup.before_v2.json");

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeWhitespace(text) {
  return String(text)
    .normalize("NFC")
    .replace(/[“”"‘’'….,!?;:(){}\[\]।॥]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForCompare(text) {
  return normalizeWhitespace(text)
    .replace(/\u093C/g, "")
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
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null) return [];
  const s = safeString(value);
  return s ? [s] : [];
}

function uniqueArray(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function mapPos(oldPos, gender) {
  const pos = safeString(oldPos);

  const map = {
    "noun_m": "名詞（男）",
    "noun_f": "名詞（女）",
    "noun": "名詞",
    "adj": "形容詞",
    "verb": "動詞",
    "adverb": "副詞",
    "postposition": "後置詞",
    "interjection": "間投詞",
    "expression_part": "表現要素",

    // 既存の日本語はそのまま許容
    "名詞（男）": "名詞（男）",
    "名詞（女）": "名詞（女）",
    "名詞": "名詞",
    "動詞": "動詞",
    "自動詞": "自動詞",
    "他動詞": "他動詞",
    "形容詞": "形容詞",
    "副詞": "副詞",
    "後置詞": "後置詞",
    "間投詞": "間投詞",
    "表現要素": "表現要素"
  };

  if (map[pos]) return map[pos];

  // gender が別項目である古いデータ救済
  if (pos === "名詞" && gender === "m") return "名詞（男）";
  if (pos === "名詞" && gender === "f") return "名詞（女）";

  return pos || "";
}

function mapImportance(entry) {
  // 新項目優先
  if (Number.isFinite(entry.importance)) return entry.importance;

  // 既存 difficulty を importance に移す
  if (Number.isFinite(entry.difficulty)) return entry.difficulty;

  // 何もなければ仮に3
  return 3;
}

function mapMeaning(entry) {
  return safeString(entry.meaning_ja) || safeString(entry.meaning) || "";
}

function mapNormalized(entry) {
  return (
    safeString(entry.normalized) ||
    safeString(entry.key) ||
    normalizeForCompare(entry.word || "")
  );
}

function mapTags(entry) {
  // すでに tags があれば優先
  const existingTags = toArray(entry.tags);

  // 旧 category は tags に昇格
  const category = safeString(entry.category);

  return uniqueArray([
    ...existingTags,
    ...(category ? [category] : [])
  ]);
}

function mapNotes(entry) {
  return safeString(entry.notes);
}

function migrateEntry(entry) {
  const word = safeString(entry.word);
  const normalized = mapNormalized(entry);
  const pos = mapPos(entry.pos, safeString(entry.gender));
  const meaning_ja = mapMeaning(entry);
  const importance = mapImportance(entry);
  const sourceSongIds = uniqueArray(toArray(entry.sourceSongIds));
  const sourceCount = Number.isFinite(entry.sourceCount)
    ? entry.sourceCount
    : sourceSongIds.length;
  const frequency = Number.isFinite(entry.frequency)
    ? entry.frequency
    : sourceCount;
  const tags = mapTags(entry);
  const notes = mapNotes(entry);

  return {
    word,
    normalized,
    pos,
    meaning_ja,
    importance,
    status: safeString(entry.status) || "active",
    sourceSongIds,
    sourceCount,
    frequency,
    tags,
    notes
  };
}

function mergeEntries(entries) {
  const map = new Map();

  for (const entry of entries) {
    if (!entry.normalized) continue;

    if (!map.has(entry.normalized)) {
      map.set(entry.normalized, { ...entry });
      continue;
    }

    const prev = map.get(entry.normalized);

    const merged = {
      word: prev.word || entry.word,
      normalized: prev.normalized,
      pos: prev.pos || entry.pos,
      meaning_ja: prev.meaning_ja || entry.meaning_ja,
      importance: Math.max(prev.importance || 1, entry.importance || 1),
      status: prev.status || entry.status || "active",
      sourceSongIds: uniqueArray([
        ...toArray(prev.sourceSongIds),
        ...toArray(entry.sourceSongIds)
      ]),
      sourceCount: 0,
      frequency: Math.max(prev.frequency || 0, entry.frequency || 0),
      tags: uniqueArray([
        ...toArray(prev.tags),
        ...toArray(entry.tags)
      ]),
      notes: [safeString(prev.notes), safeString(entry.notes)]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(" / ")
    };

    merged.sourceCount = merged.sourceSongIds.length;
    if (!merged.frequency) {
      merged.frequency = merged.sourceCount;
    }

    map.set(entry.normalized, merged);
  }

  return [...map.values()].sort((a, b) =>
    a.word.localeCompare(b.word, "hi")
  );
}

function main() {
  const vocabMaster = loadJson(vocabMasterPath);

  if (!Array.isArray(vocabMaster)) {
    throw new Error("vocab_master.json must be an array.");
  }

  // バックアップ作成
  if (!fs.existsSync(backupPath)) {
    saveJson(backupPath, vocabMaster);
    console.log(`Backup created: ${backupPath}`);
  } else {
    console.log(`Backup already exists: ${backupPath}`);
  }

  const migrated = vocabMaster.map(migrateEntry);
  const merged = mergeEntries(migrated);

  saveJson(vocabMasterPath, merged);

  console.log(`Migrated vocab_master.json to v2: ${vocabMasterPath}`);
  console.log(`Entries before: ${vocabMaster.length}`);
  console.log(`Entries after merge: ${merged.length}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
