const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const masterPath = path.join(rootDir, "data", "bollywood", "vocab_master.json");
const candidatesDir = path.join(rootDir, "data", "bollywood", "candidates");
const auditDir = path.join(rootDir, "data", "bollywood", "audit");

const reportPath = path.join(auditDir, "candidate_audit_report.json");
const autoMergePath = path.join(auditDir, "candidate_auto_merge.json");
const manualReviewPath = path.join(auditDir, "candidate_manual_review.json");
const stopwordPath = path.join(auditDir, "candidate_stopword_skipped.json");
const lemmaAbsorbPath = path.join(auditDir, "candidate_lemma_absorb.json");
const weakSkippedPath = path.join(auditDir, "candidate_weak_skipped.json");

const RAW_STOPWORDS = [
  "कभी", "फिर", "अब", "कुछ", "कोई", "वो", "यह", "ये", "जो", "जिसे",
  "इन", "ने", "दे", "आया", "आई", "हुआ", "किया", "कहा", "कहना",
  "कहूं", "कहूँ", "जाना", "जाऊँ", "जाऊं", "ऐसा", "ऐसी", "सी",
  "मेरे", "यही", "बहुत", "जहां", "जहाँ", "जहान", "कहीं", "पार",
  "रोज़", "रोज", "बना", "मुझे", "खुद", "दूर"
];

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function safeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeForCompare(text) {
  return safeString(text)
    .normalize("NFC")
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
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(RAW_STOPWORDS.map(normalizeForCompare));

function buildMasterMap(master) {
  const masterMap = new Map();
  const duplicateMasterKeys = [];

  master.forEach((entry, index) => {
    const keys = [
      entry.word,
      entry.display,
      entry.normalized,
      ...(Array.isArray(entry.variants) ? entry.variants : [])
    ]
      .map(normalizeForCompare)
      .filter(Boolean);

    for (const key of keys) {
      if (masterMap.has(key)) {
        const existing = masterMap.get(key);
        if (existing.index !== index) {
          duplicateMasterKeys.push({
            compareKey: key,
            firstIndex: existing.index,
            duplicateIndex: index,
            firstWord: existing.entry.word,
            duplicateWord: entry.word
          });
        }
        continue;
      }

      masterMap.set(key, { entry, index });
    }
  });

  return { masterMap, duplicateMasterKeys };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function generateLemmaKeys(compareKey) {
  const keys = [];

  if (!compareKey) return keys;

  // आँखों → आंख / नज़रों → नजर / बातों → बात
  if (compareKey.endsWith("ों") && compareKey.length > 3) {
    keys.push(compareKey.slice(0, -2));
  }

  // खुशियों → खुशी / गलियों → गली
  if (compareKey.endsWith("यों") && compareKey.length > 4) {
    keys.push(compareKey.slice(0, -3) + "ी");
  }

  // नज़रों / आँखों with normalized nasal
  if (compareKey.endsWith("ो")) {
    keys.push(compareKey.slice(0, -1));
  }

  // अदाएँ / अदायें → अदा
  if (compareKey.endsWith("एं") && compareKey.length > 3) {
    keys.push(compareKey.slice(0, -2) + "ा");
  }

  if (compareKey.endsWith("यें") && compareKey.length > 4) {
    keys.push(compareKey.slice(0, -3) + "ा");
  }

  // रातें → रात / बातें → बात
  if (compareKey.endsWith("ें") && compareKey.length > 3) {
    keys.push(compareKey.slice(0, -2));
  }

  // बिछड़ी / बिछड़ी / टूटी 等の形は candidate.normalized 側で動詞見出し化されていれば拾う
  return unique(keys.map(normalizeForCompare).filter((key) => key !== compareKey));
}

function isWeakCandidate(candidate) {
  const pos = safeString(candidate.pos);
  const meaning = safeString(candidate.meaning_ja);
  const importance = Number(candidate.importance || 0);

  return !pos && !meaning && importance <= 2;
}

function main() {
  const master = loadJson(masterPath);

  if (!Array.isArray(master)) {
    throw new Error("vocab_master.json must be an array.");
  }

  const { masterMap, duplicateMasterKeys } = buildMasterMap(master);

  if (!fs.existsSync(candidatesDir)) {
    throw new Error(`Candidates directory not found: ${candidatesDir}`);
  }

  const files = fs
    .readdirSync(candidatesDir)
    .filter((file) => file.endsWith("_candidates.json"))
    .sort();

  const report = [];
  const autoMergeItems = [];
  const manual = [];
  const skippedStopwords = [];
  const lemmaAbsorbItems = [];
  const weakSkippedItems = [];
  const sanityWarnings = [];
  const candidateKeyMap = new Map();

  for (const file of files) {
    const fullPath = path.join(candidatesDir, file);
    const data = loadJson(fullPath);

    const songId = safeString(data.songId);
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];

    for (const candidate of candidates) {
      const candidateWord = safeString(candidate.word);
      const candidateNormalized = safeString(candidate.normalized || candidate.word);
      const compareKey = normalizeForCompare(candidateNormalized);

      if (!compareKey) continue;

      if (!candidateKeyMap.has(compareKey)) {
        candidateKeyMap.set(compareKey, []);
      }

      candidateKeyMap.get(compareKey).push({
        songId,
        file,
        word: candidateWord,
        normalized: candidateNormalized
      });

      const baseCandidate = {
        songId,
        file,
        word: candidateWord,
        normalized: candidateNormalized,
        compareKey,
        pos: candidate.pos || "",
        meaning_ja: candidate.meaning_ja || "",
        importance: candidate.importance || 3,
        status: candidate.status || "active"
      };

      if (STOPWORDS.has(compareKey)) {
        skippedStopwords.push({
          ...baseCandidate,
          status: "skipped_stopword",
          existsInMaster: null,
          matchedMasterIndex: null,
          matchedWord: null,
          matchedNormalized: null
        });
        continue;
      }

      const exactMatch = masterMap.get(compareKey);

      if (exactMatch) {
        const matchedSourceSongIds = Array.isArray(exactMatch.entry.sourceSongIds)
          ? exactMatch.entry.sourceSongIds
          : [];

        autoMergeItems.push({
          mergeInto: {
            index: exactMatch.index,
            word: exactMatch.entry.word,
            normalized: exactMatch.entry.normalized || exactMatch.entry.word,
            sourceSongIds: matchedSourceSongIds
          },
          candidate: {
            ...baseCandidate,
            addSourceSongId: songId
          },
          existsInMaster: true,
          matchedMasterIndex: exactMatch.index,
          compareKey,
          matchType: "exact"
        });

        report.push({
          ...baseCandidate,
          auditStatus: "match",
          matchType: "exact",
          existsInMaster: true,
          matchedMasterIndex: exactMatch.index,
          matchedWord: exactMatch.entry.word,
          matchedNormalized: exactMatch.entry.normalized || exactMatch.entry.word,
          matchedSourceSongIds
        });

        continue;
      }

      const lemmaKeys = generateLemmaKeys(compareKey);
      const lemmaMatchKey = lemmaKeys.find((key) => masterMap.has(key));
      const lemmaMatch = lemmaMatchKey ? masterMap.get(lemmaMatchKey) : null;

      if (lemmaMatch) {
        const matchedSourceSongIds = Array.isArray(lemmaMatch.entry.sourceSongIds)
          ? lemmaMatch.entry.sourceSongIds
          : [];

        lemmaAbsorbItems.push({
          mergeInto: {
            index: lemmaMatch.index,
            word: lemmaMatch.entry.word,
            normalized: lemmaMatch.entry.normalized || lemmaMatch.entry.word,
            sourceSongIds: matchedSourceSongIds
          },
          candidate: {
            ...baseCandidate,
            addSourceSongId: songId
          },
          existsInMaster: true,
          matchedMasterIndex: lemmaMatch.index,
          matchedWord: lemmaMatch.entry.word,
          matchedNormalized: lemmaMatch.entry.normalized || lemmaMatch.entry.word,
          compareKey,
          lemmaMatchKey,
          lemmaKeys,
          matchType: "lemma_absorb",
          recommendedAction: "add_source_song_id_only"
        });

        report.push({
          ...baseCandidate,
          auditStatus: "lemma_absorb",
          matchType: "lemma_absorb",
          existsInMaster: true,
          matchedMasterIndex: lemmaMatch.index,
          matchedWord: lemmaMatch.entry.word,
          matchedNormalized: lemmaMatch.entry.normalized || lemmaMatch.entry.word,
          matchedSourceSongIds,
          lemmaMatchKey,
          lemmaKeys,
          reason: "inflected form matched existing master lemma"
        });

        continue;
      }

      if (isWeakCandidate(baseCandidate)) {
        weakSkippedItems.push({
          ...baseCandidate,
          auditStatus: "weak_skipped",
          existsInMaster: false,
          matchedMasterIndex: null,
          matchedWord: null,
          matchedNormalized: null,
          reason: "empty pos and meaning_ja with importance <= 2",
          recommendedAction: "skip"
        });

        report.push({
          ...baseCandidate,
          auditStatus: "weak_skipped",
          existsInMaster: false,
          matchedMasterIndex: null,
          matchedWord: null,
          matchedNormalized: null,
          reason: "weak candidate skipped"
        });

        continue;
      }

      manual.push({
        ...baseCandidate,
        existsInMaster: false,
        matchedMasterIndex: null,
        matchedWord: null,
        matchedNormalized: null,
        reason: "new candidate; not found in vocab_master",
        recommendedAction: "new"
      });

      report.push({
        ...baseCandidate,
        auditStatus: "new",
        existsInMaster: false,
        matchedMasterIndex: null,
        matchedWord: null,
        matchedNormalized: null,
        matchedSourceSongIds: [],
        reason: "not found in vocab_master"
      });
    }
  }

  const duplicateCandidateKeys = Array.from(candidateKeyMap.entries())
    .filter(([, items]) => items.length > 1)
    .map(([compareKey, items]) => ({
      compareKey,
      count: items.length,
      items
    }));

  const invalidAutoMerge = autoMergeItems.filter(
    (item) => item.existsInMaster !== true || item.matchedMasterIndex == null
  );

  const invalidManual = manual.filter(
    (item) => item.existsInMaster !== false || item.matchedMasterIndex !== null
  );

  if (invalidAutoMerge.length > 0) {
    sanityWarnings.push({
      type: "invalid_auto_merge",
      message: `autoMerge contains ${invalidAutoMerge.length} invalid entries.`,
      count: invalidAutoMerge.length
    });
  }

  if (invalidManual.length > 0) {
    sanityWarnings.push({
      type: "invalid_manual_review",
      message: `manualReview contains ${invalidManual.length} invalid entries.`,
      count: invalidManual.length
    });
  }

  if (duplicateMasterKeys.length > 0) {
    sanityWarnings.push({
      type: "duplicate_master_keys",
      message: `vocab_master has ${duplicateMasterKeys.length} duplicate normalized compare keys.`,
      count: duplicateMasterKeys.length
    });
  }

  if (duplicateCandidateKeys.length > 0) {
    sanityWarnings.push({
      type: "duplicate_candidate_keys",
      message: `candidate files contain ${duplicateCandidateKeys.length} duplicate compare keys.`,
      count: duplicateCandidateKeys.length
    });
  }

  saveJson(reportPath, {
    generatedAt: new Date().toISOString(),
    masterCount: master.length,
    candidateFileCount: files.length,
    reportCount: report.length,
    autoMergeCount: autoMergeItems.length,
    lemmaAbsorbCount: lemmaAbsorbItems.length,
    manualReviewCount: manual.length,
    skippedStopwordCount: skippedStopwords.length,
    weakSkippedCount: weakSkippedItems.length,
    duplicateMasterKeyCount: duplicateMasterKeys.length,
    duplicateCandidateKeyCount: duplicateCandidateKeys.length,
    sanityWarnings,
    duplicateMasterKeys,
    duplicateCandidateKeys,
    items: report
  });

  saveJson(autoMergePath, {
    generatedAt: new Date().toISOString(),
    count: autoMergeItems.length,
    sanityWarnings: invalidAutoMerge.length > 0 ? sanityWarnings : [],
    items: autoMergeItems
  });

  saveJson(lemmaAbsorbPath, {
    generatedAt: new Date().toISOString(),
    count: lemmaAbsorbItems.length,
    items: lemmaAbsorbItems
  });

  saveJson(manualReviewPath, {
    generatedAt: new Date().toISOString(),
    count: manual.length,
    sanityWarnings: invalidManual.length > 0 ? sanityWarnings : [],
    items: manual
  });

  saveJson(stopwordPath, {
    generatedAt: new Date().toISOString(),
    count: skippedStopwords.length,
    items: skippedStopwords
  });

  saveJson(weakSkippedPath, {
    generatedAt: new Date().toISOString(),
    count: weakSkippedItems.length,
    items: weakSkippedItems
  });

  console.log("✅ audit 完了");
  console.log(`candidate files: ${files.length}`);
  console.log(`report: ${report.length}`);
  console.log(`autoMerge: ${autoMergeItems.length}`);
  console.log(`lemmaAbsorb: ${lemmaAbsorbItems.length}`);
  console.log(`manual/new: ${manual.length}`);
  console.log(`skipped stopwords: ${skippedStopwords.length}`);
  console.log(`weak skipped: ${weakSkippedItems.length}`);
  console.log(`duplicate master keys: ${duplicateMasterKeys.length}`);
  console.log(`duplicate candidate keys: ${duplicateCandidateKeys.length}`);
  console.log(`sanity warnings: ${sanityWarnings.length}`);

  if (sanityWarnings.length > 0) {
    console.log("⚠️ warnings:");
    sanityWarnings.forEach((warning) => {
      console.log(`- ${warning.type}: ${warning.message}`);
    });
  }
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}