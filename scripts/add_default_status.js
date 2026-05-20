/**
 * add_default_status.js
 *
 * vocab_master 系 JSON に
 * status: "active"
 * を一括追加する。
 *
 * 既に status がある entry は変更しない。
 *
 * 実行例:
 *   node scripts/add_default_status.js data/news/vocab_master.json
 *
 * 複数:
 *   node scripts/add_default_status.js data/news/vocab_master.json data/bollywood/vocab_master.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.vocab)) return data.vocab;

  throw new Error(
    "Unsupported JSON structure. Expected array or { items: [] } or { vocab: [] }"
  );
}

function processFile(inputPath) {
  const resolved = path.resolve(ROOT, inputPath);

  const data = readJson(resolved);
  const items = asArray(data);

  let added = 0;
  let already = 0;

  items.forEach((entry) => {
    if (!Object.prototype.hasOwnProperty.call(entry, "status")) {
      entry.status = "active";
      added += 1;
    } else {
      already += 1;
    }
  });

  writeJson(resolved, data);

  console.log("");
  console.log(`✅ Updated: ${resolved}`);
  console.log(`Entries: ${items.length}`);
  console.log(`Added status: ${added}`);
  console.log(`Already had status: ${already}`);
}

function main() {
  const targets = process.argv.slice(2);

  if (targets.length === 0) {
    throw new Error(
      "Usage: node scripts/add_default_status.js data/news/vocab_master.json"
    );
  }

  targets.forEach(processFile);

  console.log("");
  console.log("✅ add_default_status complete.");
}

try {
  main();
} catch (error) {
  console.error("");
  console.error("❌ add_default_status failed.");
  console.error(error.message);
  process.exit(1);
}