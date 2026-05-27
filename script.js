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

let academicVocab = [];
let academicExpressions = [];
let academicFill = [];

let currentQuiz = null;
let wrongAnswers = [];
let reviewModeEnabled = false;

const MYLIST_STORAGE_KEY = "hindiQuizMyList";
const MYLIST_MAX_ITEMS = 400;
const KNOWN_STORAGE_KEY = "hindiQuizKnownVocab";
const KNOWN_MAX_ITEMS = 800;
const MYLIST_ELIGIBLE_MODES = new Set([
  "ch",
  "news",
  "academic_vocab",
  "bollywood_vocab",
  "mylist"
]);
const KNOWN_ELIGIBLE_MODES = new Set([
  "news",
  "academic_vocab",
  "bollywood_vocab"
]);

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

function pickWeightedRandom(array) {
  if (!Array.isArray(array) || array.length === 0) return null;

  const totalWeight = array.reduce((sum, item) => {
    const weight = Number(item.quizWeight) || 1;
    return sum + weight;
  }, 0);

  let random = Math.random() * totalWeight;

  for (const item of array) {
    random -= Number(item.quizWeight) || 1;
    if (random <= 0) return item;
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

async function loadAcademicAll() {
  const data = await loadJson("data/academic/quizzes/vocab.json");

  return Array.isArray(data)
    ? data.map((entry) => ({
        ...entry,
        source: "academic",
        topic: "academic"
      }))
    : [];
}

async function loadAcademicExpressions() {
  const data = await loadJson("data/academic/quizzes/expressions.json");

  return Array.isArray(data)
    ? data.map((entry) => ({
        ...entry,
        source: "academic_expressions"
      }))
    : [];
}

async function loadAcademicFill() {
  const data = await loadJson("data/academic/quizzes/fill_blanks.json");

  const items = Array.isArray(data)
    ? data
    : (data.fillBlanks || []);

  return items.map((entry) => ({
    ...entry,
    source: "academic_fill"
  }));
}

function filterChByLessonRange(vocabList, rangeValue) {
  const [start, end] = rangeValue
    .split("-")
    .map(Number);

  return vocabList.filter((item) => {
    const lesson = Number(item.lesson);

    return lesson >= start && lesson <= end;
  });
}

function getDirection() {
  return document.getElementById("directionSelect").value;
}

function getMode() {
  return document.getElementById("modeSelect").value;
}

function isVocabularyMode(mode) {
  return (
    mode === "ch" ||
    mode === "news" ||
    mode === "bollywood_vocab" ||
    mode === "academic_vocab" ||
    mode === "mylist" ||
    mode === "known"
  );
}

function getMeaning(entry) {
  return normalizeString(entry.meaning) || normalizeString(entry.meaning_ja);
}

function getWord(entry) {
  return normalizeString(entry.word);
}

function getDisplayWord(entry) {
  return normalizeString(entry.display || entry.word);
}


function getMyListKey(entry) {
  return normalizeString(entry.normalized) ||
    normalizeString(entry.display) ||
    normalizeString(entry.word);
}

function getKnownKey(entry) {
  return normalizeString(entry.normalized) ||
    normalizeString(entry.display) ||
    normalizeString(entry.word);
}

function loadMyList() {
  try {
    const raw = localStorage.getItem(MYLIST_STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];

    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.warn("Failed to load mylist:", error);
    return [];
  }
}

function loadKnown() {
  try {
    const raw = localStorage.getItem(KNOWN_STORAGE_KEY);
    const items = raw ? JSON.parse(raw) : [];

    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.warn("Failed to load known:", error);
    return [];
  }
}


function saveMyList(items) {
  localStorage.setItem(MYLIST_STORAGE_KEY, JSON.stringify(items));
}

function saveKnown(items) {
  localStorage.setItem(KNOWN_STORAGE_KEY, JSON.stringify(items));
}

function sanitizeMyListEntry(entry) {
  return {
    word: normalizeString(entry.word),
    display: normalizeString(entry.display || entry.word),
    normalized: normalizeString(entry.normalized || entry.word),
    meaning: normalizeString(entry.meaning),
    meaning_ja: normalizeString(entry.meaning_ja),
    pos: normalizeString(entry.pos),
    source: normalizeString(entry.source),
    lesson: entry.lesson ?? null,
    topic: normalizeString(entry.topic),
    category: normalizeString(entry.category),
    quizWeight: 1
  };
}

function sanitizeKnownEntry(entry) {
  return {
    word: normalizeString(entry.word),
    display: normalizeString(entry.display || entry.word),
    normalized: normalizeString(entry.normalized || entry.word),
    meaning: normalizeString(entry.meaning),
    meaning_ja: normalizeString(entry.meaning_ja),
    pos: normalizeString(entry.pos),
    source: normalizeString(entry.source),
    lesson: entry.lesson ?? null,
    topic: normalizeString(entry.topic),
    category: normalizeString(entry.category),
    quizWeight: 1
  };
}

function isInMyList(entry) {
  const key = getMyListKey(entry);
  if (!key) return false;

  return loadMyList().some((item) => getMyListKey(item) === key);
}

function isInKnown(entry) {
  const key = getKnownKey(entry);
  if (!key) return false;

  return loadKnown().some((item) => getKnownKey(item) === key);
}

function addToMyList(entry) {
  const key = getMyListKey(entry);
  if (!key) {
    return {
      ok: false,
      message: "この語彙はマイリストに追加できません。"
    };
  }

  const items = loadMyList();

  if (items.some((item) => getMyListKey(item) === key)) {
    return {
      ok: true,
      message: "すでにマイリストに入っています。"
    };
  }

  if (items.length >= MYLIST_MAX_ITEMS) {
    return {
      ok: false,
      message: `マイリストは${MYLIST_MAX_ITEMS}語までです。不要な語を削除してください。`
    };
  }

  items.push(sanitizeMyListEntry(entry));
  saveMyList(items);

  return {
    ok: true,
    message: "マイリストに追加しました。"
  };
}

function addToKnown(entry) {
  const key = getKnownKey(entry);
  if (!key) {
    return {
      ok: false,
      message: "この語彙は覚えたリストに追加できません。"
    };
  }

  const items = loadKnown();

  if (items.some((item) => getKnownKey(item) === key)) {
    return {
      ok: true,
      message: "すでに覚えたリストに入っています。"
    };
  }

  if (items.length >= KNOWN_MAX_ITEMS) {
    return {
      ok: false,
      message: `覚えたリストは${KNOWN_MAX_ITEMS}語までです。不要な語を削除してください。`
    };
  }

  items.push(sanitizeKnownEntry(entry));
  saveKnown(items);

  return {
    ok: true,
    message: "覚えたリストに追加しました。"
  };
}

function removeFromMyList(entry) {
  const key = getMyListKey(entry);
  if (!key) {
    return {
      ok: false,
      message: "この語彙はマイリストから削除できません。"
    };
  }

  const items = loadMyList();
  const nextItems = items.filter((item) => getMyListKey(item) !== key);
  saveMyList(nextItems);

  return {
    ok: true,
    message: "マイリストから削除しました。"
  };
}

function removeFromKnown(entry) {
  const key = getKnownKey(entry);
  if (!key) {
    return {
      ok: false,
      message: "この語彙は覚えたリストから削除できません。"
    };
  }

  const items = loadKnown();
  const nextItems = items.filter((item) => getKnownKey(item) !== key);
  saveKnown(nextItems);

  return {
    ok: true,
    message: "覚えたリストから削除しました。"
  };
}

function isMyListEligibleQuiz() {
  if (!currentQuiz || currentQuiz.type !== "vocab") return false;

  const mode = getMode();
  return MYLIST_ELIGIBLE_MODES.has(mode);
}

function isKnownEligibleQuiz() {
  if (!currentQuiz || currentQuiz.type !== "vocab") return false;

  const mode = getMode();
  return KNOWN_ELIGIBLE_MODES.has(mode);
}

function renderMyListButton() {
  if (!isMyListEligibleQuiz()) return "";

  const inMyList = isInMyList(currentQuiz.entry);
  const label = inMyList ? "マイリストから削除" : "マイリストに追加";
  const extraClass = inMyList ? " remove" : "";

  return `
    <button id="myListToggleBtn" class="mylist-action-btn${extraClass}" type="button">
      ${escapeHtml(label)}
    </button>
    <div id="myListStatus" class="mylist-status"></div>
  `;
}

function buildWrongPoolForVocab(pool, correct, direction) {
  if (direction === "hi2jp") {
    return pool.filter(
      (item) => getMeaning(item) && getMeaning(item) !== getMeaning(correct)
    );
  }

  return pool.filter(
    (item) =>
      getDisplayWord(item) &&
      getDisplayWord(item) !== getDisplayWord(correct)
  );
}

function createQuizQuestion(vocabPool, direction) {
  if (!Array.isArray(vocabPool) || vocabPool.length < 4) return null;

  const mode = getMode();

  const correct =
    mode === "bollywood_vocab"
      ? pickWeightedRandom(vocabPool)
      : pickRandom(vocabPool, 1)[0];

  if (!correct) return null;

  const wrongPool = buildWrongPoolForVocab(vocabPool, correct, direction);
  if (wrongPool.length < 3) return null;

  const wrongChoices = pickRandom(wrongPool, 3);

  let question = "";
  let correctAnswer = "";
  let choices = [];

  if (direction === "hi2jp") {
    question = getDisplayWord(correct);
    correctAnswer = getMeaning(correct);
    choices = shuffle([
      correctAnswer,
      ...wrongChoices.map((item) => getMeaning(item))
    ]);
  } else {
    question = getMeaning(correct);
    correctAnswer = getDisplayWord(correct);
    choices = shuffle([
      correctAnswer,
      ...wrongChoices.map((item) => getDisplayWord(item))
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
  if (!Array.isArray(pool) || pool.length < 4) return null;

  const usable = pool.filter(
    (item) => normalizeString(item.prompt) && normalizeString(item.answer)
  );

  if (usable.length < 4) return null;

  const correct = pickRandom(usable, 1)[0];
  const wrongPool = usable.filter(
    (item) => normalizeString(item.answer) !== normalizeString(correct.answer)
  );

  if (wrongPool.length < 3) return null;

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
      translation:
        normalizeString(correct.expressionMeaning) ||
        normalizeString(correct.meaning) ||
        normalizeString(correct.translation),
      sourceText: normalizeString(correct.sourceText)
    }
  };
}

function createExpressionQuestion(pool, direction) {
  if (!Array.isArray(pool) || pool.length < 4) return null;

  const usable = pool.filter(
    (item) => normalizeString(item.text) && normalizeString(item.meaning)
  );

  if (usable.length < 4) return null;

  const correct = pickRandom(usable, 1)[0];
  const wrongPool = usable.filter((item) => {
    if (direction === "hi2jp") {
      return normalizeString(item.meaning) !== normalizeString(correct.meaning);
    }
    return normalizeString(item.text) !== normalizeString(correct.text);
  });

  if (wrongPool.length < 3) return null;

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
      
      <div class="quiz-action-row">
       <button id="myListToggleBtn" class="mylist-btn" style="display:none;">
        マイリストに追加
       </button>

       <button id="knownToggleBtn" class="mylist-btn known-btn" style="display:none;">
        覚えたリストに追加
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

  if (!isVocabularyMode(mode)) return;

  const exists = wrongAnswers.some(
    (item) =>
      getDisplayWord(item) === getDisplayWord(entry) &&
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

  const myListBtn = document.getElementById("myListToggleBtn");

  if (myListBtn && isMyListEligibleQuiz()) {
    const inMyList = isInMyList(currentQuiz.entry);

    myListBtn.style.display = "inline-block";
    myListBtn.textContent = inMyList
      ? "マイリストから削除"
      : "マイリストに追加";

    myListBtn.onclick = () => {
      const before = isInMyList(currentQuiz.entry);

      const result = before
        ? removeFromMyList(currentQuiz.entry)
        : addToMyList(currentQuiz.entry);

      const after = isInMyList(currentQuiz.entry);

      myListBtn.textContent = after
        ? "マイリストから削除"
        : "マイリストに追加";

      if (feedback && result.message) {
        feedback.innerHTML += `<p style="font-size:13px;">${escapeHtml(result.message)}</p>`;
      }
    };
  }

 const knownBtn = document.getElementById("knownToggleBtn");

if (knownBtn && isKnownEligibleQuiz()) {
  const inKnown = isInKnown(currentQuiz.entry);

  knownBtn.style.display = "inline-block";
  knownBtn.textContent = inKnown
    ? "覚えたリストから削除"
    : "覚えたリストに追加";

  knownBtn.onclick = () => {
    const before = isInKnown(currentQuiz.entry);

    const result = before
      ? removeFromKnown(currentQuiz.entry)
      : addToKnown(currentQuiz.entry);

    const after = isInKnown(currentQuiz.entry);

    knownBtn.textContent = after
      ? "覚えたリストから削除"
      : "覚えたリストに追加";

    if (feedback && result.message) {
      feedback.innerHTML += `<p style="font-size:13px;">${escapeHtml(result.message)}</p>`;
    }
  };
}
}

function excludeKnownItems(pool) {
  if (!Array.isArray(pool)) return [];

  return pool.filter((entry) => !isInKnown(entry));
}

function getCurrentPool() {
  if (reviewModeEnabled) {
    return [...wrongAnswers];
  }

  const mode = getMode();

  if (mode === "mylist") {
    return loadMyList();
  }

  if (mode === "known") {
  return loadKnown();
  }

  if (mode === "ch") {
    const lessonValue =  document.getElementById("lessonSelect").value;
   return filterChByLessonRange(chVocab, lessonValue);
  }

  if (mode === "news") {
  return excludeKnownItems([...newsVocab]);
  }

  if (mode === "bollywood_vocab") {
  return excludeKnownItems([...bollywoodVocab]);
  }

  if (mode === "academic_vocab") {
  return excludeKnownItems([...academicVocab]);
  }

  if (mode === "academic_expressions") {
    return [...academicExpressions];
  }

  if (mode === "academic_fill") {
    return [...academicFill];
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
  if (mode === "known") {
  renderKnownList(pool);
  return;
  }
  if (pool.length < 4) {
  if (mode === "mylist") {
    quizArea.innerHTML =
      `<p>マイリストの語彙が4語以上になると出題できます。</p>
       <p style="font-size:13px; opacity:0.8;">現在の登録数: ${pool.length} / ${MYLIST_MAX_ITEMS}</p>`;

  } else if (mode === "known") {

    quizArea.innerHTML =
      `<p>覚えたリストの語彙が4語以上になると確認できます。</p>
       <p style="font-size:13px; opacity:0.8;">現在の登録数: ${pool.length} / ${KNOWN_MAX_ITEMS}</p>`;

  } else {

    quizArea.innerHTML =
      "<p>問題を作るのに十分なデータがありません。</p>";

  }

  return;
}

  if (mode === "bollywood_fill" || mode === "academic_fill") {
    currentQuiz = createFillQuestion(pool);
  } else if (
    mode === "bollywood_expressions" ||
    mode === "academic_expressions"
  ) {
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

  if (mode === "bollywood_fill" || mode === "academic_fill") {
    directionSelect.style.display = "none";
    if (directionLabel) directionLabel.style.display = "none";
  } else {
    directionSelect.style.display = "";
    if (directionLabel) directionLabel.style.display = "";
  }
}

function renderKnownList(items) {
  const quizArea = document.getElementById("quizArea");

  if (!Array.isArray(items) || items.length === 0) {
    quizArea.innerHTML = `
      <p>覚えたリストは空です。</p>
    `;
    return;
  }

  const sorted = [...items].sort((a, b) =>
    getDisplayWord(a).localeCompare(getDisplayWord(b), "hi")
  );

  quizArea.innerHTML = `
    <div class="quiz-card">
      <h2>覚えたリスト</h2>

      <p style="font-size:13px; opacity:0.8; margin-bottom:14px;">
        登録数: ${sorted.length} / ${KNOWN_MAX_ITEMS}
      </p>

      <div class="known-list">
        ${sorted.map((item, index) => `
          <div class="known-item" data-index="${index}">
            <div>
              <strong>${escapeHtml(getDisplayWord(item))}</strong>
              <div style="font-size:13px; opacity:0.8;">
                ${escapeHtml(getMeaning(item))}
              </div>
            </div>

            <button
              class="known-remove-btn"
              data-key="${escapeHtml(getKnownKey(item))}"
            >
              削除
            </button>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  document.querySelectorAll(".known-remove-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.key;

      const items = loadKnown();
      const target = items.find(
        (item) => getKnownKey(item) === key
      );

      if (!target) return;

      removeFromKnown(target);

      renderKnownList(loadKnown());
    });
  });
}

async function initApp() {
  try {
    const manifest = await loadManifest();

    chVocab = await loadAllChVocab(manifest);
    newsVocab = await loadAllNewsVocab(manifest);
    console.log("news loaded:", newsVocab.length, newsVocab.slice(0, 5));

    const bolly = await loadBollywoodAll();
    bollywoodVocab = bolly.vocab;
    bollywoodFill = bolly.fillBlanks;
    bollywoodExpressions = bolly.expressions;

    academicVocab = await loadAcademicAll();
    console.log("academic loaded:", academicVocab.length);

    academicExpressions = await loadAcademicExpressions();
    console.log("academic expressions loaded:", academicExpressions.length);

    academicFill = await loadAcademicFill();
    console.log("academic fill loaded:", academicFill.length);

    document.getElementById("startQuizBtn").addEventListener("click", () => {
      reviewModeEnabled = false;
      document.getElementById("footerLinks")?.style.setProperty("display", "none");
      startQuiz();
    });

    document.getElementById("reviewBtn").addEventListener("click", () => {
      document.getElementById("footerLinks")?.style.setProperty("display", "none");
      startReviewMode();
    });

    document.getElementById("modeSelect").addEventListener("change", () => {
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