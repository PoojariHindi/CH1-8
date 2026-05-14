const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.log(`⚠ Could not read: ${filePath}`);
    console.log(`  ${err.message}`);
    return null;
  }
}

function countArrayFile(label, filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      label,
      count: 0,
      missing: true,
      details: []
    };
  }

  const data = readJson(filePath);
  const count =
  Array.isArray(data) ? data.length :
  Array.isArray(data.vocab) ? data.vocab.length :
  Array.isArray(data.words) ? data.words.length :
  Array.isArray(data.items) ? data.items.length :
  Array.isArray(data.questions) ? data.questions.length :
  0;

  return {
    label,
    count,
    missing: false,
    details: []
  };
}

function countLessonVocabFolder(label, folderPath) {
  if (!fs.existsSync(folderPath)) {
    return {
      label,
      count: 0,
      missing: true,
      details: []
    };
  }

  const files = fs
    .readdirSync(folderPath)
    .filter((name) => name.endsWith('_vocab.json'))
    .sort();

  let total = 0;
  const details = [];

  for (const fileName of files) {
    const filePath = path.join(folderPath, fileName);
    const data = readJson(filePath);
    const count =
  Array.isArray(data) ? data.length :
  Array.isArray(data.vocab) ? data.vocab.length :
  Array.isArray(data.words) ? data.words.length :
  Array.isArray(data.items) ? data.items.length :
  Array.isArray(data.questions) ? data.questions.length :
  0;

    total += count;
    details.push({
      fileName,
      count
    });
  }

  return {
    label,
    count: total,
    missing: false,
    details
  };
}

const results = [
  countArrayFile(
    'Bollywood',
    path.join(ROOT, 'bollywood', 'vocab_master.json')
  ),
  countArrayFile(
    'News',
    path.join(ROOT, 'news', 'vocab_master.json')
  ),
  countArrayFile(
    'Academic',
    path.join(ROOT, 'academic', 'vocab_master.json')
  ),
  countLessonVocabFolder(
    'CompleteHindi',
    path.join(ROOT, 'ch', 'vocab')
  )
];

let grandTotal = 0;

console.log('==============================');
console.log(' Hindi Quiz App Vocabulary');
console.log('==============================');

for (const result of results) {
  if (result.missing) {
    console.log(`⚠ Missing: ${result.label}`);
    continue;
  }

  grandTotal += result.count;
  console.log(`${result.label.padEnd(16)} : ${result.count}`);

  if (result.details.length > 0) {
    for (const detail of result.details) {
      console.log(`  - ${detail.fileName.padEnd(22)} ${detail.count}`);
    }
  }
}

console.log('------------------------------');
console.log(`TOTAL            : ${grandTotal}`);
console.log('==============================');