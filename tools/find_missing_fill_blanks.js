const fs = require("fs");
const path = require("path");

const file = path.join(
  process.cwd(),
  "data",
  "bollywood",
  "quizzes",
  "vocab.json"
);

const raw = JSON.parse(fs.readFileSync(file, "utf8"));

const expressions = raw.expressions || [];
const fillBlanks = raw.fillBlanks || [];

function norm(s) {
  return String(s || "")
    .replace(/[।.!?…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getExpressionText(obj) {
  return obj.text || obj.expression || "";
}

function getFillText(obj) {
  return obj.sourceText || obj.text || obj.expression || obj.answer || obj.original || "";
}

const fillSet = new Set(fillBlanks.map(x => norm(getFillText(x))));
const missing = expressions.filter(x => !fillSet.has(norm(getExpressionText(x))));

console.log("Expression entries:", expressions.length);
console.log("Fill blank entries:", fillBlanks.length);
console.log("Missing:", missing.length);
console.log("");

missing.forEach((m, i) => {
  console.log(`${i + 1}. ${getExpressionText(m)}`);
});