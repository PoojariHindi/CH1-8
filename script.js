// ==============================
// Hindi Quiz App - Minimal Script
// Complete Hindi (lesson-based) + News vocab
// ==============================

let chVocab = [];
let newsVocab = [];
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

function filterChByLesson(vocabList, maxLesson) {
  return vocabList.filter((item) => item.lesson <= maxLesson);
}

function getDirection() {
  return document.getElementById("directionSelect").value;
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

function escapeHtml(text) {
  return text
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
    ${quiz.meta.pos ? `<span>${quiz.meta.pos}</span>` : ""}
  </div>
`;
  
  quizArea.innerHTML = `
    <div class="quiz-card">
      ${lessonInfo}
      <h2 class="quiz-question">${escapeHtml(quiz.question)}</h2>
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

function addWrongAnswer(entry) {
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
  const direction = getDirection();
  const quizArea = document.getElementById("quizArea");

  if (pool.length < 4) {
    quizArea.innerHTML =
      "<p>問題を作るのに十分な語彙がありません。</p>";
    return;
  }

  currentQuiz = createQuizQuestion(pool, direction);
  renderQuiz(currentQuiz);
}

function startReviewMode() {
  reviewModeEnabled = true;
  startQuiz();
}

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

async function initApp() {
  try {
    const manifest = await loadManifest();
    chVocab = await loadAllChVocab(manifest);
    newsVocab = await loadAllNewsVocab(manifest);

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
      .addEventListener("change", updateUiByMode);

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
