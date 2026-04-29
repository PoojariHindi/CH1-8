// ==============================
// Hindi Quiz App - Extended Script
// Complete Hindi + News + Bollywood
// - 語彙問題
// - 穴埋め問題
// - 表現問題
// ==============================

let chVocab = [];
let newsVocab = [];

let bollywoodVocab = [];
let bollywoodFill = [];
let bollywoodExpressions = [];

let currentQuiz = null;
let wrongAnswers = [];
let reviewModeEnabled = false;

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${path}`);
  }
  return await response.json();
}

function shuffle(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function pickRandom(array, count) {
  return shuffle(array).slice(0, count);
}

// Bollywood語彙専用：rare-word重視の重み付き抽選
function pickWeightedRandom(array) {
  if (!Array.isArray(array) || array.length === 0) return null;

  const totalWeight = array.reduce((sum, item) => {
    const weight = Number(item.quizWeight) || 1;
    return sum + weight;
  }, 0);

  let random = Math.random() * totalWeight;

  for (const item of array) {
    random -= Number(item.quizWeight) || 1;
    if (random <= 0) {
      return item;
    }
  }

  return array[array.length - 1];
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadManifest() {
  return loadJson("data/manifest.json");
}

async function loadAllChVocab(manifest) {
  const files = manifest.ch?.vocab || [];
  const results = await Promise.all(files.map(loadJson));

  return results.flatMap((fileData) =>
    (fileData.vocab || []).map((entry) => ({
      ...entry,
      lesson: fileData.lesson,
      source: "ch"
    }))
  );
}

async function loadAllNewsVocab(manifest) {
  const files = manifest.news?.vocab || [];
  const results = await Promise.all(files.map(loadJson));

  return results.flatMap((fileData) => {
    const entries = Array.isArray(fileData)
      ? fileData
      : (fileData.vocab || []);

    return entries.map((entry) => ({
      ...entry,
      source: "news",
      topic: fileData.topic || "mixed"
    }));
  });
}

// Bollywood は統合ファイルを1つ読む
async function loadBollywoodAll() {
  const data = await loadJson("data/bollywood/quizzes/vocab.json");

  return {
    vocab: Array.isArray(data.vocab)
      ? data.vocab.map((entry) => ({
          ...entry,
          source: "bollywood",
          topic: "bollywood"
        }))
      : [],
    expressions: Array.isArray(data.expressions)
      ? data.expressions.map((entry) => ({
          ...entry,
          source: "bollywood_expressions"
        }))
      : [],
    fillBlanks: Array.isArray(data.fillBlanks)
      ? data.fillBlanks.map((entry) => ({
          ...entry,
          source: "bollywood_fill"
        }))
      : []
  };
}

function filterChByLesson(vocabList, maxLesson) {
  return vocabList.filter((item) => Number(item.lesson) <= maxLesson);
}

function getDirection() {
  return document.getElementById("directionSelect").value;
}

function getMode() {
  return document.getElementById("modeSelect").value;
}

function isVocabularyMode(mode) {
  return mode === "ch" || mode === "news" || mode === "bollywood_vocab";
}

function getMeaning(entry) {
  return normalizeString(entry.meaning) || normalizeString(entry.meaning_ja);
}

function getWord(entry) {
  return normalizeString(entry.word);
}

function buildWrongPoolForVocab(pool, correct, direction) {
  if (direction === "hi2jp") {
    return pool.filter(
      (item) => getMeaning(item) && getMeaning(item) !== getMeaning(correct)
    );
  }

  return pool.filter(
    (item) => getWord(item) && getWord(item) !== getWord(correct)
  );
}

function createQuizQuestion(vocabPool, direction) {
  if (!Array.isArray(vocabPool) || vocabPool.length < 4) {
    return null;
  }

  const mode = getMode();

  // Bollywood語彙のみ rare-word weighted random
  const correct =
    mode === "bollywood_vocab"
      ? pickWeightedRandom(vocabPool)
      : pickRandom(vocabPool, 1)[0];

  if (!correct) return null;

  const wrongPool = buildWrongPoolForVocab(vocabPool, correct, direction);
  if (wrongPool.length < 3) {
    return null;
  }

  const wrongChoices = pickRandom(wrongPool, 3);

  let question = "";
  let correctAnswer = "";
  let choices = [];

  if (direction === "hi2jp") {
    question = getWord(correct);
    correctAnswer = getMeaning(correct);
    choices = shuffle([
      correctAnswer,
      ...wrongChoices.map((item) => getMeaning(item))
    ]);
  } else {
    question = getMeaning(correct);
    correctAnswer = getWord(correct);
    choices = shuffle([
      correctAnswer,
      ...wrongChoices.map((item) => getWord(item))
    ]);
  }

  return {
    type: "vocab",
    question,
    correctAnswer,
    choices,
    entry: correct,
    meta: {
      source: correct.source,
      lesson: correct.lesson || null,
      pos: correct.pos || "",
      songTitle: "",
      film: ""
    }
  };
}

function createFillQuestion(pool) {
  if (!Array.isArray(pool) || pool.length < 4) {
    return null;
  }

  const usable = pool.filter(
    (item) => normalizeString(item.prompt) && normalizeString(item.answer)
  );

  if (usable.length < 4) {
    return null;
  }

  const correct = pickRandom(usable, 1)[0];
  const wrongPool = usable.filter(
    (item) => normalizeString(item.answer) !== normalizeString(correct.answer)
  );

  if (wrongPool.length < 3) {
    return null;
  }

  const wrongChoices = pickRandom(wrongPool, 3);

  return {
    type: "fill_blank",
    question: normalizeString(correct.prompt),
    correctAnswer: normalizeString(correct.answer),
    choices: shuffle([
      normalizeString(correct.answer),
      ...wrongChoices.map((item) => normalizeString(item.answer))
    ]),
    entry: correct,
    meta: {
      source: correct.source,
      lesson: null,
      pos: "穴埋め",
      songTitle: correct.songTitle || "",
      film: correct.film || ""
    },
    extra: {
      translation: normalizeString(correct.meaning),
      sourceText: normalizeString(correct.sourceText)
    }
  };
}

function createExpressionQuestion(pool, direction) {
  if (!Array.isArray(pool) || pool.length < 4) {
    return null;
  }

  const usable = pool.filter(
    (item) => normalizeString(item.text) && normalizeString(item.meaning)
  );

  if (usable.length < 4) {
    return null;
  }

  const correct = pickRandom(usable, 1)[0];
  const wrongPool = usable.filter((item) => {
    if (direction === "hi2jp") {
      return normalizeString(item.meaning) !== normalizeString(correct.meaning);
    }
    return normalizeString(item.text) !== normalizeString(correct.text);
  });

  if (wrongPool.length < 3) {
    return null;
  }

  const wrongChoices = pickRandom(wrongPool, 3);

  let question = "";
  let correctAnswer = "";
  let choices = [];

  if (direction === "hi2jp") {
    question = normalizeString(correct.text);
    correctAnswer = normalizeString(correct.meaning);
    choices = shuffle([
      correctAnswer,
      ...wrongChoices.map((item) => normalizeString(item.meaning))
    ]);
  } else {
    question = normalizeString(correct.meaning);
    correctAnswer = normalizeString(correct.text);
    choices = shuffle([
      correctAnswer,
      ...wrongChoices.map((item) => normalizeString(item.text))
    ]);
  }

  return {
    type: "expression",
    question,
    correctAnswer,
    choices,
    entry: correct,
    meta: {
      source: correct.source,
      lesson: null,
      pos: "表現",
      songTitle: correct.songTitle || "",
      film: correct.film || ""
    }
  };
}

function renderQuiz(quiz) {
  const quizArea = document.getElementById("quizArea");

  if (!quiz) {
    quizArea.innerHTML = "<p>問題を作成できませんでした。</p>";
    return;
  }

  const metaParts = [];
  if (quiz.meta.lesson) {
    metaParts.push(`<span>L${escapeHtml(quiz.meta.lesson)}</span>`);
  }
  if (quiz.meta.pos) {
    metaParts.push(`<span>${escapeHtml(quiz.meta.pos)}</span>`);
  }
  if (quiz.meta.songTitle) {
    metaParts.push(`<span>${escapeHtml(quiz.meta.songTitle)}</span>`);
  }

  const metaRow = `
    <div class="quiz-meta-row">
      ${metaParts.join("")}
    </div>
  `;

  const translationBlock =
    quiz.extra && quiz.extra.translation
      ? `<div class="quiz-subhint" style="text-align:center; font-size:14px; opacity:0.85; margin:6px 0 10px;">${escapeHtml(quiz.extra.translation)}</div>`
      : "";

  quizArea.innerHTML = `
    <div class="quiz-card">
      ${metaRow}
      <h2 class="quiz-question">${escapeHtml(quiz.question)}</h2>
      ${translationBlock}
      <div class="quiz-choices">
        ${quiz.choices
          .map(
            (choice) => `
              <button class="choice-btn" data-answer="${escapeHtml(choice)}">
                ${escapeHtml(choice)}
              </button>
            `
          )
          .join("")}
      </div>
      <div id="quizFeedback" class="quiz-feedback"></div>
      <button id="nextQuestionBtn" class="next-btn" style="display:none;">
        次の問題
      </button>
    </div>
  `;

  document.querySelectorAll(".choice-btn").forEach((button) => {
    button.addEventListener("click", handleAnswerClick);
  });

  document
    .getElementById("nextQuestionBtn")
    .addEventListener("click", startQuiz);
}

function addWrongAnswer(entry) {
  const mode = getMode();

  if (!isVocabularyMode(mode)) {
    return;
  }

  const exists = wrongAnswers.some(
    (item) =>
      normalizeString(item.word) === normalizeString(entry.word) &&
      getMeaning(item) === getMeaning(entry)
  );

  if (!exists) {
    wrongAnswers.push(entry);
  }
}

function handleAnswerClick(event) {
  if (!currentQuiz) return;

  const selected = event.currentTarget.textContent.trim();
  const feedback = document.getElementById("quizFeedback");
  const nextBtn = document.getElementById("nextQuestionBtn");

  const buttons = document.querySelectorAll(".choice-btn");
  buttons.forEach((btn) => {
    btn.disabled = true;
    const value = btn.textContent.trim();

    if (value === currentQuiz.correctAnswer) {
      btn.classList.add("correct");
    } else if (value === selected) {
      btn.classList.add("wrong");
    }
  });

  if (selected === currentQuiz.correctAnswer) {
    feedback.innerHTML = `<p>✅ 正解です</p>`;
  } else {
    addWrongAnswer(currentQuiz.entry);
    feedback.innerHTML = `<p>❌ 不正解です。正解: ${escapeHtml(currentQuiz.correctAnswer)}</p>`;
  }

  nextBtn.style.display = "inline-block";
}

function getCurrentPool() {
  if (reviewModeEnabled) {
    return [...wrongAnswers];
  }

  const mode = getMode();

  if (mode === "ch") {
    const lessonValue = Number(document.getElementById("lessonSelect").value);
    return filterChByLesson(chVocab, lessonValue);
  }

  if (mode === "news") {
    return [...newsVocab];
  }

  if (mode === "bollywood_vocab") {
    return [...bollywoodVocab];
  }

  if (mode === "bollywood_fill") {
    return [...bollywoodFill];
  }

  if (mode === "bollywood_expressions") {
    return [...bollywoodExpressions];
  }

  return [];
}

function startQuiz() {
  const mode = getMode();
  const direction = getDirection();
  const quizArea = document.getElementById("quizArea");
  const pool = getCurrentPool();

  if (pool.length < 4) {
    quizArea.innerHTML = "<p>問題を作るのに十分なデータがありません。</p>";
    return;
  }

  if (mode === "bollywood_fill") {
    currentQuiz = createFillQuestion(pool);
  } else if (mode === "bollywood_expressions") {
    currentQuiz = createExpressionQuestion(pool, direction);
  } else {
    currentQuiz = createQuizQuestion(pool, direction);
  }

  renderQuiz(currentQuiz);
}

function startReviewMode() {
  const mode = getMode();
  const quizArea = document.getElementById("quizArea");

  if (!isVocabularyMode(mode)) {
    quizArea.innerHTML = "<p>復習モードは現在、語彙問題のみ対応しています。</p>";
    return;
  }

  reviewModeEnabled = true;
  startQuiz();
}

function updateUiByMode() {
  const mode = getMode();
  const lessonSelect = document.getElementById("lessonSelect");
  const lessonLabel = document.getElementById("lessonLabel");
  const directionSelect = document.getElementById("directionSelect");
  const directionLabel = document.getElementById("directionLabel");

  if (mode === "ch") {
    lessonSelect.style.display = "";
    if (lessonLabel) lessonLabel.style.display = "";
  } else {
    lessonSelect.style.display = "none";
    if (lessonLabel) lessonLabel.style.display = "none";
  }

  if (mode === "bollywood_fill") {
    directionSelect.style.display = "none";
    if (directionLabel) directionLabel.style.display = "none";
  } else {
    directionSelect.style.display = "";
    if (directionLabel) directionLabel.style.display = "";
  }
}

async function initApp() {
  try {
    const manifest = await loadManifest();

    chVocab = await loadAllChVocab(manifest);
    newsVocab = await loadAllNewsVocab(manifest);

    const bolly = await loadBollywoodAll();
    bollywoodVocab = bolly.vocab;
    bollywoodFill = bolly.fillBlanks;
    bollywoodExpressions = bolly.expressions;

    document
      .getElementById("startQuizBtn")
      .addEventListener("click", () => {
        reviewModeEnabled = false;
        startQuiz();
      });

    document
      .getElementById("reviewBtn")
      .addEventListener("click", startReviewMode);

    document
      .getElementById("modeSelect")
      .addEventListener("change", () => {
        reviewModeEnabled = false;
        updateUiByMode();
      });

    updateUiByMode();
  } catch (error) {
    console.error(error);
    const quizArea = document.getElementById("quizArea");
    if (quizArea) {
      quizArea.innerHTML =
        "<p>データの読み込みに失敗しました。ファイル名や場所を確認してください。</p>";
    }
  }
}

document.addEventListener("DOMContentLoaded", initApp);