const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const songsDir = path.join(rootDir, "data", "bollywood", "songs");
const outputPath = path.join(rootDir, "data", "bollywood", "songs_index.json");

const idRe = /^bolly_(\d{3})\.json$/;

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sortKey(fileName) {
  const m = fileName.match(idRe);
  return m ? Number(m[1]) : 999999;
}

function main() {
  if (!fs.existsSync(songsDir)) {
    throw new Error(`songs dir not found: ${songsDir}`);
  }

  const songFiles = fs
    .readdirSync(songsDir)
    .filter((name) => idRe.test(name))
    .sort((a, b) => sortKey(a) - sortKey(b));

  if (songFiles.length === 0) {
    throw new Error(`no bolly_*.json files found in ${songsDir}`);
  }

  const songsIndex = songFiles.map((fileName) => {
    const filePath = path.join(songsDir, fileName);
    const data = loadJson(filePath);

    return {
      id: data.id || "",
      title: data.title || "",
      film: data.film || "",
      year: data.year || "",
      singer: Array.isArray(data.singer) ? data.singer : [],
      lyricist: Array.isArray(data.lyricist) ? data.lyricist : [],
      composer: Array.isArray(data.composer) ? data.composer : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      tags: Array.isArray(data.tags) ? data.tags : [],
      key_phrase: data.key_phrase || "",
      status: data.status || "processed"
    };
  });

  saveJson(outputPath, songsIndex);

  console.log(`Generated: ${outputPath}`);
  console.log(`Songs indexed: ${songsIndex.length}`);
  console.log(`Last ID: ${songsIndex[songsIndex.length - 1].id}`);
}

try {
  main();
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}