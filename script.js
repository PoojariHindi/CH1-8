// ==============================
// Hindi Quiz App - Minimal Script
// Complete Hindi (lesson-based) + News vocab
// ==============================

let chVocab = [];
let newsVocab = [];
let currentQuiz = null;

// ------------------------------
// Utility
// ------------------------------
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

// ------------------------------
// Load all vocab
// ------------------------------
async function loadManifest() {
  return await loadJson("data/manifest.json");
}

async function loadAllChVocab(manifest) {
  const files = manifest.ch.vocab;
  const results = await Promise.all(files.map(loadJson));

  return results.flatMap((fileData) =>
    fileData.vocab.map((entry) => ({
      ...entry,
      lesson: fileData.lesson,
      source: "ch"
    }))
  );
}

async function loadAllNewsVocab(manifest) {
  const files = manifest.news.vocab;
  const results = await Promise.all(files.map(loadJson));

  return results.flatMap((fileData) =>
    fileData.vocab.map((entry) => ({
      ...entry,
      source: "news",
      topic: fileData.topic || "mixed"
    }))
  );
}

// ------------------------------
// Filters
// ------------------------------
function filterChByLesson(vocabList, maxLesson) {
  return vocabList.filter((item) => item.lesson <= maxLesson);
}

// ------------------------------
// Quiz creation
// ------------------------------
function createQuizQuestion(vocabPool) {
  if (vocabPool.length < 4) {
    return null;
  }

  const correct = pickRandom(vocabPool, 1)[0];
  const wrongPool = vocabPool.filter((item) => item.word !== correct.word);
  const wrongChoices = pickRandom(wrongPool, 3);

  const choices = shuffle([
    correct.meaning,
    ...wrongChoices.map((item) => item.meaning)
  ]);

  return {
    question: correct.word,
    correctAnswer: correct.meaning,
    choices,
    meta: {
      source: correct.source,
      lesson: correct.lesson || null,
      pos: correct.pos || ""
    }
  };
}

// ------------------------------
// Render
// ------------------------------
function renderQuiz(quiz) {
  const quizArea = document.getElementById("quizArea");

  if (!quiz) {
    quizArea.innerHTML = "<p>問題を作成できませんでした。</p>";
    return;
  }

  const lessonInfo =
    quiz.meta.source === "ch" && quiz.meta.lesson
      ? `<p class="quiz-meta">Lesson ${quiz.meta.lesson}</p>`
      : "";

  const posInfo = quiz.meta.pos
    ? `<p class="quiz-meta">品詞: ${quiz.meta.pos}</p>`
    : "";

  quizArea.innerHTML = `
    <div class="quiz-card">
      ${lessonInfo}
      <h2 class="quiz-question">${quiz.question}</h2>
      ${posInfo}
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

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------
// Answer handling
// ------------------------------
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
    feedback.innerHTML = `<p>❌ 不正解です。正解: ${escapeHtml(
      currentQuiz.correctAnswer
    )}</p>`;
  }

  nextBtn.style.display = "inline-block";
}

// ------------------------------
// Start quiz
// ------------------------------
function getCurrentPool() {
  const mode = document.getElementById("modeSelect").value;

  if (mode === "ch") {
    const lessonValue = Number(document.getElementById("lessonSelect").value);
    return filterChByLesson(chVocab, lessonValue);
  }

  if (mode === "news") {
    return [...newsVocab];
  }

  return [];
}

function startQuiz() {
  const pool = getCurrentPool();
  const quizArea = document.getElementById("quizArea");

  if (pool.length < 4) {
    quizArea.innerHTML =
      "<p>問題を作るのに十分な語彙がありません。</p>";
    return;
  }

  currentQuiz = createQuizQuestion(pool);
  renderQuiz(currentQuiz);
}

// ------------------------------
// UI mode switching
// ------------------------------
function updateUiByMode() {
  const mode = document.getElementById("modeSelect").value;
  const lessonSelect = document.getElementById("lessonSelect");
  const lessonLabel = document.getElementById("lessonLabel");

  if (mode === "ch") {
    lessonSelect.style.display = "";
    if (lessonLabel) lessonLabel.style.display = "";
  } else {
    lessonSelect.style.display = "none";
    if (lessonLabel) lessonLabel.style.display = "none";
  }
}

// ------------------------------
// App init
// ------------------------------
async function initApp() {
  try {
    const manifest = await loadManifest();
    chVocab = await loadAllChVocab(manifest);
    newsVocab = await loadAllNewsVocab(manifest);

    document
      .getElementById("startQuizBtn")
      .addEventListener("click", startQuiz);

    document
      .getElementById("modeSelect")
      .addEventListener("change", updateUiByMode);

    updateUiByMode();

    console.log("App initialized");
    console.log("CH vocab:", chVocab.length);
    console.log("News vocab:", newsVocab.length);
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
