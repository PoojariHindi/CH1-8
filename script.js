// ==============================
// Hindi Quiz App - Extended Script
// Complete Hindi + News + Bollywood
// - 語彙問題
// - 穴埋め問題（構文）
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

async function loadManifest() {
  return await loadJson("data/manifest.json");
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
  return results.flatMap((fileData) =>
    (fileData.vocab || []).map((entry) => ({
      ...entry,
      source: "news",
      topic: fileData.topic || "mixed"
    }))
  );
}

async function loadAllBollywoodVocab(manifest) {
  const files = manifest.bollywood?.vocab || [];
  const results = await Promise.all(files.map(loadJson));
  return results.flatMap((fileData) =>
    (fileData.vocab || []).map((entry) => ({
      ...entry,
      source: "bollywood",
      topic: fileData.topic || "bollywood"
    }))
  );
}

async function loadAllBollywoodFill(manifest) {
  const files = manifest.bollywood?.fill || [];
  const results = await Promise.all(files.map(loadJson));
  return results.flatMap((fileData) =>
    (fileData.items || []).map((entry) => ({
      ...entry,
      source: "bollywood_fill"
    }))
  );
}

async function loadAllBollywoodExpressions(manifest) {
  const files = manifest.bollywood?.expressions || [];
  const results = await Promise.all(files.map(loadJson));
  return results.flatMap((fileData) =>
    (fileData.items || []).map((entry) => ({
      ...entry,
      source: "bollywood_expressions"
    }))
  );
}

function filterChByLesson(vocabList, maxLesson) {
  return vocabList.filter((item) => item.lesson <= maxLesson);
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

function createQuizQuestion(vocabPool, direction) {
  if (vocabPool.length < 4) {
    return null;
  }

  const correct = pickRandom(vocabPool, 1)[0];
  const wrongPool = vocabPool.filter((item) => item.word !== correct.word);
  const wrongChoices = pickRandom(wrongPool, 3);

  let question = "";
  let correctAnswer = "";
  let choices = [];

  if (direction === "hi2jp") {
    question = correct.word;
    correctAnswer = correct.meaning;
    choices = shuffle([
      correct.meaning,
      ...wrongChoices.map((item) => item.meaning)
    ]);
  } else {
    question = correct.meaning;
    correctAnswer = correct.word;
    choices = shuffle([
      correct.word,
      ...wrongChoices.map((item) => item.word)
    ]);
  }

  return {
    question,
    correctAnswer,
    choices,
    entry: correct,
    meta: {
      source: correct.source,
      lesson: correct.lesson || null,
      pos: correct.pos || ""
    }
  };
}

function createFillQuestion(pool) {
  if (pool.length < 4) {
    return null;
  }

  const correct = pickRandom(pool, 1)[0];
  const wrongPool = pool.filter((item) => item.answer !== correct.answer);
  const wrongChoices = pickRandom(wrongPool, 3);

  return {
    question: correct.question,
    correctAnswer: correct.answer,
    choices: shuffle([
      correct.answer,
      ...wrongChoices.map((item) => item.answer)
    ]),
    entry: correct,
    meta: {
      source: correct.source,
      lesson: null,
      pos: correct.patternLabel || "構文"
    },
    extra: {
      translation: correct.translation || ""
    }
  };
}

function createExpressionQuestion(pool, direction) {
  if (pool.length < 4) {
    return null;
  }

  const correct = pickRandom(pool, 1)[0];
  const wrongPool = pool.filter(
    (item) => item.expression !== correct.expression
  );
  const wrongChoices = pickRandom(wrongPool, 3);

  let question = "";
  let correctAnswer = "";
  let choices = [];

  if (direction === "hi2jp") {
    question = correct.expression;
    correctAnswer = correct.meaning;
    choices = shuffle([
      correct.meaning,
      ...wrongChoices.map((item) => item.meaning)
    ]);
  } else {
    question = correct.meaning;
    correctAnswer = correct.expression;
    choices = shuffle([
      correct.expression,
      ...wrongChoices.map((item) => item.expression)
    ]);
  }

  return {
    question,
    correctAnswer,
    choices,
    entry: correct,
    meta: {
      source: correct.source,
      lesson: null,
      pos: correct.pos || "表現"
    }
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderQuiz(quiz) {
  const quizArea = document.getElementById("quizArea");

  if (!quiz) {
    quizArea.innerHTML = "<p>問題を作成できませんでした。</p>";
    return;
  }

  const metaRow = `
    <div class="quiz-meta-row">
      ${quiz.meta.lesson ? `<span>L${quiz.meta.lesson}</span>` : ""}
      ${quiz.meta.pos ? `<span>${escapeHtml(quiz.meta.pos)}</span>` : ""}
    </div>
  `;

  const translationBlock =
    quiz.extra && quiz.extra.translation
      ? `<div class="quiz-subhint">${escapeHtml(quiz.extra.translation)}</div>`
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

  // 復習モードは語彙問題のみ対応
  if (!isVocabularyMode(mode)) {
    return;
  }

  const exists = wrongAnswers.some(
    (item) => item.word === entry.word && item.meaning === entry.meaning
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
    feedback.innerHTML = `<p>❌ 不正解です。正解: ${escapeHtml(
      currentQuiz.correctAnswer
    )}</p>`;
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
    quizArea.innerHTML =
      "<p>問題を作るのに十分なデータがありません。</p>";
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
    quizArea.innerHTML =
      "<p>復習モードは現在、語彙問題のみ対応しています。</p>";
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

  // 穴埋め問題では方向選択は不要
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
    bollywoodVocab = await loadAllBollywoodVocab(manifest);
    bollywoodFill = await loadAllBollywoodFill(manifest);
    bollywoodExpressions = await loadAllBollywoodExpressions(manifest);

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
