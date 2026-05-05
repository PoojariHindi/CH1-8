const fs = require("fs");
const path = require("path");

const filePath = path.join(
  process.cwd(),
  "data",
  "news",
  "vocab_master.json"
);

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const vocab = JSON.parse(fs.readFileSync(filePath, "utf8"));

if (!Array.isArray(vocab)) {
  console.error("vocab_master.json must be an array.");
  process.exit(1);
}

let updated = 0;

for (const entry of vocab) {
  const ids = Array.isArray(entry.sourceArticleIds)
    ? [...new Set(entry.sourceArticleIds)]
    : [];

  entry.sourceArticleIds = ids;
  entry.sourceCount = ids.length;
  entry.frequency = ids.length;

  updated += 1;
}

fs.writeFileSync(filePath, JSON.stringify(vocab, null, 2) + "\n", "utf8");

console.log("Updated:", filePath);
console.log("Entries processed:", updated);