const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SOURCES_DIR = path.join(ROOT, "data", "academic", "sources");
const CANDIDATES_DIR = path.join(ROOT, "data", "academic", "candidates");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeCandidate(candidate, source) {
  const word = candidate.word || "";
  const display = candidate.display || word;
  const normalized = candidate.normalized || display;

  return {
    word,
    display,
    normalized,
    variants: candidate.variants || [],
    pos: candidate.pos || "",
    meaning_ja: candidate.meaning_ja || "",
    importance: candidate.importance ?? 3,
    status: candidate.status || "active",
    category: "academic",
    tags: candidate.tags || source.tags || [],
    sourceIds: [source.id],
    sourceTitle: source.title || "",
    sourceGenre: source.genre || "",
    sourceRegister: source.register || ""
  };
}

function buildCandidatesForSource(sourceFile) {
  const sourcePath = path.join(SOURCES_DIR, sourceFile);
  const source = readJson(sourcePath);

  if (!source.id) {
    throw new Error(`${sourceFile} has no id.`);
  }

  const candidates = Array.isArray(source.vocab_candidates)
    ? source.vocab_candidates
    : [];

  const normalizedCandidates = candidates
    .filter((candidate) => candidate && candidate.word)
    .map((candidate) => normalizeCandidate(candidate, source));

  const outputPath = path.join(
    CANDIDATES_DIR,
    `${source.id}_candidates.json`
  );

  writeJson(outputPath, normalizedCandidates);

  console.log(
    `✅ ${source.id}: ${normalizedCandidates.length} candidates -> ${outputPath}`
  );
}

function main() {
  if (!fs.existsSync(SOURCES_DIR)) {
    throw new Error(`Sources directory not found: ${SOURCES_DIR}`);
  }

  const sourceFiles = fs
    .readdirSync(SOURCES_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();

  if (sourceFiles.length === 0) {
    console.log("No academic source files found.");
    return;
  }

  for (const sourceFile of sourceFiles) {
    buildCandidatesForSource(sourceFile);
  }

  console.log("🎉 Academic candidates build complete.");
}

main();