let currentSubjectKey = "ce335";
let subjectsData = {};
let currentSection = "home";
let sidebarOpen = true;
const STUDENT_NAME = "Nhericka";
const LAST_STUDY_POSITION_KEY = "lastStudyPosition";
let pendingStudyRestore = null;
let studyPositionObserver = null;

const MOTIVATIONAL_QUOTES = [
  "\"I can do all things through Christ which strengtheneth me.\"  -  Philippians 4:13",
  "\"Be strong and of a good courage; be not afraid.\"  -  Joshua 1:9",
  "\"Commit thy works unto the LORD, and thy thoughts shall be established.\"  -  Proverbs 16:3",
  "\"Trust in the LORD with all thine heart; and lean not unto thine own understanding.\"  -  Proverbs 3:5",
  "\"The LORD is my strength and my shield; my heart trusted in him, and I am helped.\"  -  Psalm 28:7",
  "\"Let us not be weary in well doing: for in due season we shall reap, if we faint not.\"  -  Galatians 6:9",
  "\"If any of you lack wisdom, let him ask of God.\"  -  James 1:5",
  "\"The fear of the LORD is the beginning of wisdom.\"  -  Proverbs 9:10",
  "\"I will lift up mine eyes unto the hills, from whence cometh my help.\"  -  Psalm 121:1",
  "\"With God all things are possible.\"  -  Matthew 19:26",
];

let quoteRotationTimer = null;
let scrollRevealObserver = null;

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  setTheme(localStorage.getItem("themePreference") || "system");
  setPalette(localStorage.getItem("palettePreference") || "aurora");
  initScrollAnimations();
  initBackToTop();
  showSection("home");
  loadSiteData();
});

function initBackToTop() {
  const button = document.getElementById("back-to-top");
  if (!button) return;

  const updateVisibility = () => {
    button.classList.toggle("hidden", window.scrollY < 420);
  };

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}

function scrollToTop() {
  document.scrollingElement.scrollTo({ top: 0, behavior: "smooth" });
}

function initScrollAnimations() {
  if (!("IntersectionObserver" in window)) return;

  scrollRevealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        scrollRevealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  const observeRevealElements = root => {
    root.querySelectorAll(".card, .quiz-type-card, .flashcard").forEach(element => {
      if (!element.classList.contains("scroll-reveal")) {
        element.classList.add("scroll-reveal");
        scrollRevealObserver.observe(element);
      }
    });
  };

  observeRevealElements(document);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) observeRevealElements(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

// FETCH THE REVIEWER/QUIZ CONTENT FROM data/manifest.json + data/*.json
let loadedManifestFiles = [];

async function loadSiteData() {
  try {
    const manifestRes = await fetch("data/manifest.json");
    if (!manifestRes.ok) throw new Error(`manifest.json responded with ${manifestRes.status}`);
    const manifest = await manifestRes.json();
    loadedManifestFiles = manifest.files || [];

    const loaded = await Promise.all(
      loadedManifestFiles.map(async filename => {
        const res = await fetch(`data/${filename}`);
        if (!res.ok) throw new Error(`data/${filename} responded with ${res.status}`);
        return res.json();
      })
    );

    subjectsData = {};
    loaded.forEach(subject => {
      if (subject.id === "CE351: NUMSOL" && Array.isArray(subject.topics)) {
        subject.reviewer = subject.topics.flatMap(topic => topic.reviewer || []);
        subject.quizzes = subject.topics.flatMap(topic => topic.quizzes || []);
        delete subject.topics;
      }
      subjectsData[subject.id] = subject;
      if (Array.isArray(subject.topics)) {
        subject.topics.forEach((topic, index) => {
          const existingTopic = subjectsData[topic.id];
          topic.parentId = subject.id;
          topic.courseTitle = subject.title;
          topic.topicNumber = index + 1;
          if ((!Array.isArray(topic.quizzes) || topic.quizzes.length === 0) && existingTopic?.quizzes?.length) {
            topic.quizzes = existingTopic.quizzes;
          }
          subjectsData[topic.id] = topic;
        });
      }
    });
    loadSavedSubjects();

    const firstKey = loaded[0] ? loaded[0].id : null;
    if (firstKey && !subjectsData[currentSubjectKey]) currentSubjectKey = firstKey;

    loadSubject(currentSubjectKey);
    initHomePage();
  } catch (err) {
    console.error("Could not load site data:", err);
    showDataLoadError();
  }
}

function showDataLoadError() {
  const message = `
    <div class="no-results">
      Couldn't load the reviewer content. Make sure the <strong>data/</strong> folder
      (with manifest.json inside it) is in the same folder as this page, and that you're
      opening the site through a local server (e.g. VS Code's "Live Server" extension)
      rather than double-clicking index.html directly  -  browsers block plain file access
      to JSON for security reasons.
    </div>
  `;
  const notes = document.getElementById("notes-container");
  const picker = document.getElementById("quiz-picker-container");
  if (notes) notes.innerHTML = message;
  if (picker) picker.innerHTML = message;
}

// HOME PAGE SETUP
function initHomePage() {
  setGreeting();
  rotateQuote();
  quoteRotationTimer = setInterval(rotateQuote, 6000);
  renderContinueStudying();
}

function readLastStudyPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_STUDY_POSITION_KEY) || "null");
    return saved && typeof saved === "object" && saved.subjectId && saved.topicId ? saved : null;
  } catch (error) {
    console.warn("Ignoring invalid saved study position.", error);
    return null;
  }
}

function saveStudyPosition(section = "Reviewer", options = {}) {
  const topic = subjectsData[currentSubjectKey];
  if (!topic) return;
  const subject = topic.parentId ? subjectsData[topic.parentId] : topic;
  const position = {
    subjectId: subject?.id || currentSubjectKey,
    subject: subject?.title || topic.courseTitle || topic.title,
    topicId: currentSubjectKey,
    topic: options.contentTitle || topic.title,
    contentTitle: options.contentTitle || "",
    section,
    scrollY: Math.max(0, Math.round(options.scrollY ?? window.scrollY)),
    lastActivity: new Date().toISOString(),
    ...(options.quizType ? { quizType: options.quizType } : {}),
    ...(Number.isInteger(options.quizQuestionIndex) ? { quizQuestionIndex: options.quizQuestionIndex } : {}),
  };
  localStorage.setItem(LAST_STUDY_POSITION_KEY, JSON.stringify(position));
  renderContinueStudying();
}

function renderContinueStudying() {
  const card = document.getElementById("continue-studying-card");
  if (!card) return;
  const saved = readLastStudyPosition();
  if (!saved || !subjectsData[saved.topicId]) {
    card.classList.add("hidden");
    return;
  }
  card.querySelector("[data-continue-subject]").textContent = saved.subject;
  card.querySelector("[data-continue-topic]").textContent = saved.topic;
  card.querySelector("[data-continue-section]").textContent = saved.section || "Reviewer";
  card.classList.remove("hidden");
}

function continueStudying() {
  const saved = readLastStudyPosition();
  if (!saved || !subjectsData[saved.topicId]) {
    renderContinueStudying();
    return;
  }
  pendingStudyRestore = saved;
  changeSubject(saved.topicId);
  showSection(saved.section.startsWith("Quiz") ? "quiz" : "reviewer");
  if (saved.section.startsWith("Quiz")) {
    const subject = subjectsData[saved.topicId];
    if (saved.topicId === "topic-4") {
      renderQuiz([]);
    } else if (subject?.quizzes?.length) {
      selectQuizType(saved.quizType || subject.quizzes[0].type);
      if (Number.isInteger(saved.quizQuestionIndex) && saved.quizQuestionIndex < quizQuestions.length) {
        quizQuestionIndex = saved.quizQuestionIndex;
        renderCurrentQuestion();
      }
    }
    return;
  }
  requestAnimationFrame(() => restoreStudyPosition(saved));
}

function restoreStudyPosition(saved) {
  const target = document.querySelector(
    `[data-topic-id="${CSS.escape(saved.topicId)}"][data-topic-title="${CSS.escape(saved.contentTitle || "")}"]`
  ) || document.querySelector(`[data-topic-id="${CSS.escape(saved.topicId)}"]`);
  if (!target) return;
  const sectionTarget = saved.section && saved.section !== "Reviewer"
    ? target.querySelector(`[data-study-section="${CSS.escape(saved.section)}"]`)
    : null;
  (sectionTarget || target).scrollIntoView({ behavior: "smooth", block: "start" });
  pendingStudyRestore = null;
}

function setGreeting() {
  const hour = new Date().getHours();
  let salutation = "Good evening";
  if (hour < 12) salutation = "Good morning";
  else if (hour < 18) salutation = "Good afternoon";

  const el = document.getElementById("home-greeting");
  if (el) el.innerText = `${salutation}, ${STUDENT_NAME}`;
}

function rotateQuote() {
  const el = document.getElementById("quote-text");
  if (!el) return;

  el.classList.add("fading");

  setTimeout(() => {
    const next = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    el.innerText = next;
    el.classList.remove("fading");
  }, 500);
}

function getStarted() {
  showSection("reviewer");
  openReviewerDrawer();
}

// SWITCH SUBJECT
function changeSubject(key) {
  currentSubjectKey = key;
  loadSubject(key);
  if (subjectsData[key]) {
    const firstTopic = subjectsData[key].reviewer?.[0]?.title || "";
    saveStudyPosition("Reviewer", { contentTitle: firstTopic });
  }
}

// LOAD SUBJECT DATA
function loadSubject(key) {
  const subject = subjectsData[key];
  if (!subject) return;

  const titleEl = document.getElementById("subject-title");
  const descEl = document.getElementById("subject-desc");

  if (subject.parentId && subject.courseTitle) {
    titleEl.innerText = subject.courseTitle;
  } else {
    titleEl.innerText = subject.title;
  }
  descEl.innerText = subject.description;

  renderStudyProgress(subject);
  renderSubjectTasks();
  renderNotes(subject.reviewer);
  renderQuiz(subject.quizzes);

  // Reset quiz result box
  const resultBox = document.getElementById("result-box");
  if (resultBox) {
    resultBox.classList.add("hidden");
    resultBox.innerText = "";
  }
}

function renderStudyProgress(subject) {
  const container = document.getElementById("subject-progress-container");
  if (!container) return;

  container.innerHTML = `
    <section class="study-progress" aria-labelledby="study-progress-title">
      <h3 id="study-progress-title">Study progress</h3>
      <div class="study-progress-stats">
        <div><strong>${(subject.reviewer || []).length}</strong><span>Topics</span></div>
        <div><strong>${(subject.quizzes || []).length}</strong><span>Questions</span></div>
      </div>
    </section>
  `;
}

function getSubjectTasks() {
  const storageKey = `subjectTasks:${currentSubjectKey}`;
  try {
    const tasks = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(tasks) ? tasks : [];
  } catch (error) {
    console.warn(`Ignoring invalid task list for ${currentSubjectKey}.`, error);
    return [];
  }
}

function renderSubjectTasks() {
  const container = document.getElementById("subject-tasks-container");
  if (!container) return;

  const tasks = getSubjectTasks();
  container.innerHTML = `
    <section class="subject-tasks" aria-labelledby="subject-tasks-title">
      <div class="subject-tasks-header">
        <h3 id="subject-tasks-title">My to-do</h3>
      </div>
      <form class="subject-task-form" onsubmit="addSubjectTask(event)">
        <input id="subject-task-input" type="text" maxlength="120" placeholder="Add a task..." aria-label="New task">
        <button type="submit" class="submit-btn">Add</button>
      </form>
      ${tasks.length ? `
        <div class="subject-tasks-list">
          ${tasks.map((task, index) => `
            <div class="subject-task${task.completed ? " completed" : ""}">
              <input type="checkbox" ${task.completed ? "checked" : ""} onchange="toggleSubjectTask(${index}, this.checked)" aria-label="Complete task">
              <span>${escapeHtml(task.text)}</span>
              <button type="button" class="subject-task-remove" aria-label="Remove task" onclick="removeSubjectTask(${index})">&times;</button>
            </div>
          `).join("")}
        </div>
      ` : `<p class="subject-tasks-empty">Add tasks for this subject.</p>`}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function addSubjectTask(event) {
  event.preventDefault();
  const input = document.getElementById("subject-task-input");
  const text = input ? input.value.trim() : "";
  if (!text) return;

  const tasks = getSubjectTasks();
  tasks.push({ text, completed: false });
  localStorage.setItem(`subjectTasks:${currentSubjectKey}`, JSON.stringify(tasks));
  renderSubjectTasks();
}

function toggleSubjectTask(index, checked) {
  const tasks = getSubjectTasks();
  if (!tasks[index]) return;
  tasks[index].completed = checked;
  localStorage.setItem(`subjectTasks:${currentSubjectKey}`, JSON.stringify(tasks));
  renderSubjectTasks();
}

function removeSubjectTask(index) {
  const tasks = getSubjectTasks();
  if (!tasks[index]) return;
  tasks.splice(index, 1);
  localStorage.setItem(`subjectTasks:${currentSubjectKey}`, JSON.stringify(tasks));
  renderSubjectTasks();
}

// RENDER REVIEWER NOTES
function renderNotes(notes) {
  const container = document.getElementById("notes-container");
  
  if (!notes || notes.length === 0) {
    container.innerHTML = `<div class="no-results">No review notes available for this subject yet.</div>`;
    return;
  }

  container.innerHTML = notes.map(item => {
    let contentHtml = item.content.map(c => {
      if (c.type === "paragraph") {
        if (c.text.includes("ce333-diagram")) {
          const visualLabel = c.text.match(/aria-label="([^"]+)"/)?.[1] || "Educational diagram";
          return `
            <figure class="educational-visual-box">
              <figcaption>${visualLabel.replace(/^Original /, "")}</figcaption>
              <div class="educational-visual">${c.text}</div>
            </figure>
          `;
        }
        return `<p>${c.text}</p>`;
      } else if (c.type === "list") {
        return `<ul>${c.items.map(li => `<li>${li}</li>`).join("")}</ul>`;
      } else if (c.type === "image") {
        return `
          <figure class="reviewer-image">
            <img src="${c.src}" alt="${escapeHtml(c.alt || item.title)}" loading="lazy">
            ${c.caption ? `<figcaption>${escapeHtml(c.caption)}</figcaption>` : ""}
          </figure>
        `;
      } else if (c.type === "visual") {
        return renderMatrixVisual(c);
      } else if (c.type === "formula") {
        return renderFormula(c);
      }
      return "";
    }).join("");

    const bookmarkKey = `bookmark:${currentSubjectKey}:${item.title}`;
    const saved = localStorage.getItem(bookmarkKey) === "1";
    return `
      <div class="card${saved ? " bookmarked" : ""}" data-topic-id="${escapeHtml(currentSubjectKey)}" data-topic-title="${escapeHtml(item.title)}">
        <button type="button" class="bookmark-btn${saved ? " saved" : ""}" aria-label="${saved ? "Remove bookmark" : "Bookmark topic"}" onclick="toggleBookmark('${encodeURIComponent(item.title)}')">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="${saved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3.5A1.5 1.5 0 0 1 7.5 2h9A1.5 1.5 0 0 1 18 3.5V21l-6-3.5L6 21z"></path>
          </svg>
        </button>
        <h3>${item.title}</h3>
        <div class="card-text-block">${contentHtml}</div>
      </div>
    `;
  }).join("");

  if (studyPositionObserver) studyPositionObserver.disconnect();
  if ("IntersectionObserver" in window) {
    studyPositionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const card = entry.target.closest(".card");
        if (!card) return;
        const section = entry.target.dataset.studySection || "Reviewer";
        saveStudyPosition(section, { contentTitle: card.dataset.topicTitle });
      });
    }, { threshold: 0.55 });
    container.querySelectorAll(".card, [data-study-section]").forEach(element => studyPositionObserver.observe(element));
  }
}

function renderFormula(formula) {
  const workedExample = formula.example || formula.workedExample;
  const practice = formula.practice || `Try applying ${formula.title.toLowerCase()} to a new problem.`;
  const practicePrompt = typeof practice === "string" ? practice : practice.prompt || "Solve a new problem using this formula.";
  const practiceId = `practice-${currentSubjectKey}-${formula.title}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `
    <section class="formula-panel formula-panel-main" data-study-section="Formula" aria-labelledby="${practiceId}-formula-title">
        <div class="formula-label">FORMULA</div>
        <h4 id="${practiceId}-formula-title">${formula.title}</h4>
        <div class="formula-expression">${formula.expression}</div>
        ${formula.where ? `<p><strong>Where:</strong></p><ul>${formula.where.map(item => `<li>${item}</li>`).join("")}</ul>` : ""}
        ${formula.purpose ? `<p class="formula-purpose"><strong>Used for:</strong> ${formula.purpose}</p>` : ""}
    </section>
    <section class="formula-panel formula-example" data-study-section="Worked Example" aria-labelledby="${practiceId}-example-title">
      <div class="formula-label" id="${practiceId}-example-title">WORKED EXAMPLE</div>
      <div class="formula-panel-content">${workedExample || "No worked example was provided in the source material."}</div>
    </section>
    <section class="formula-panel formula-practice" data-study-section="Practice" aria-labelledby="${practiceId}-practice-title">
      <div class="formula-label" id="${practiceId}-practice-title">PRACTICE</div>
      <div class="formula-panel-content">
        <p>${practicePrompt}</p>
      </div>
    </section>
  `;
}

function renderMatrixVisual(visual) {
  const visuals = {
    notation: {
      label: "Matrix notation and dimensions",
      html: `<div class="matrix-visual-row"><span class="matrix-name">A</span><span class="matrix-equals">=</span><span class="matrix-bracket">[ <span class="matrix-grid cols-3"><span>a₁₁</span><span>a₁₂</span><span>a₁₃</span><span>a₂₁</span><span>a₂₂</span><span>a₂₃</span></span> ]</span><span class="matrix-dimension">2 × 3</span></div><div class="matrix-legend"><span>i = row index</span><span>j = column index</span></div>`
    },
    equality: {
      label: "Equality checks corresponding entries",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>1</span><span>2</span><span>3</span><span>4</span></span> ]</span><span class="matrix-equals">=</span><span class="matrix-bracket result">[ <span class="matrix-grid cols-2"><span>1</span><span>2</span><span>3</span><span>4</span></span> ]</span></div><div class="matrix-legend">Same dimensions and equal corresponding entries.</div>`
    },
    addition: {
      label: "Adding corresponding entries",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>1</span><span>2</span><span>3</span><span>4</span></span> ]</span><span class="matrix-operator">+</span><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>5</span><span>6</span><span>7</span><span>8</span></span> ]</span><span class="matrix-operator">=</span><span class="matrix-bracket result">[ <span class="matrix-grid cols-2"><span>6</span><span>8</span><span>10</span><span>12</span></span> ]</span></div><div class="matrix-legend">Only matrices with matching dimensions can be added.</div>`
    },
    scalar: {
      label: "Scalar multiplication",
      html: `<div class="matrix-visual-row"><span class="matrix-scalar">2</span><span class="matrix-operator">×</span><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>1</span><span>−2</span><span>3</span><span>4</span></span> ]</span><span class="matrix-operator">=</span><span class="matrix-bracket result">[ <span class="matrix-grid cols-2"><span>2</span><span>−4</span><span>6</span><span>8</span></span> ]</span></div><div class="matrix-legend">The scalar multiplies every entry.</div>`
    },
    multiplication: {
      label: "Matrix multiplication",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>1</span><span>2</span><span>3</span><span>4</span></span> ]</span><span class="matrix-operator">×</span><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>5</span><span>6</span><span>7</span><span>8</span></span> ]</span><span class="matrix-operator">=</span><span class="matrix-bracket result">[ <span class="matrix-grid cols-2"><span>19</span><span>22</span><span>43</span><span>50</span></span> ]</span></div><div class="matrix-legend">Each result entry is a row-by-column dot product; AB is 2 × 2.</div>`
    },
    properties: {
      label: "Core operation properties",
      html: `<div class="property-visual"><span>A + B = B + A</span><span>(A + B) + C = A + (B + C)</span><span>k(A + B) = kA + kB</span><span>(AB)ᵀ = BᵀAᵀ</span></div><div class="matrix-legend">The identities summarize how matrix operations relate.</div>`
    },
    transpose: {
      label: "Rows become columns",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket">[ <span class="matrix-grid cols-2"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></span> ]</span><span class="matrix-operator">→</span><span class="matrix-bracket result">[ <span class="matrix-grid cols-3"><span>1</span><span>3</span><span>5</span><span>2</span><span>4</span><span>6</span></span> ]</span></div><div class="matrix-legend">A is 3 × 2, while Aᵀ is 2 × 3.</div>`
    },
    symmetric: {
      label: "Symmetric matrix",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket result">[ <span class="matrix-grid cols-3 diagonal"><span>2</span><span>−1</span><span>0</span><span>−1</span><span>3</span><span>4</span><span>0</span><span>4</span><span>5</span></span> ]</span><span class="matrix-equation">Aᵀ = A</span></div><div class="matrix-legend">Entries mirror across the main diagonal.</div>`
    },
    skew: {
      label: "Skew-symmetric matrix",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket result">[ <span class="matrix-grid cols-3 diagonal"><span>0</span><span>2</span><span>−1</span><span>−2</span><span>0</span><span>3</span><span>1</span><span>−3</span><span>0</span></span> ]</span><span class="matrix-equation">Aᵀ = −A</span></div><div class="matrix-legend">Diagonal entries are zero; opposite entries have opposite signs.</div>`
    },
    triangular: {
      label: "Upper and lower triangular matrices",
      html: `<div class="matrix-pair"><div><small>Upper triangular</small><span class="matrix-bracket result">[ <span class="matrix-grid cols-3"><span>1</span><span>2</span><span>3</span><span>0</span><span>4</span><span>5</span><span>0</span><span>0</span><span>6</span></span> ]</span></div><div><small>Lower triangular</small><span class="matrix-bracket result">[ <span class="matrix-grid cols-3"><span>1</span><span>0</span><span>0</span><span>2</span><span>4</span><span>0</span><span>3</span><span>5</span><span>6</span></span> ]</span></div></div><div class="matrix-legend">Upper: zeros below the diagonal. Lower: zeros above it.</div>`
    },
    diagonal: {
      label: "Diagonal matrix",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket result">[ <span class="matrix-grid cols-3"><span>4</span><span>0</span><span>0</span><span>0</span><span>7</span><span>0</span><span>0</span><span>0</span><span>2</span></span> ]</span><span class="matrix-equation">aᵢⱼ = 0 when i ≠ j</span></div><div class="matrix-legend">Only main-diagonal entries may be nonzero.</div>`
    },
    scalarMatrix: {
      label: "Scalar matrix",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket result">[ <span class="matrix-grid cols-3"><span>5</span><span>0</span><span>0</span><span>0</span><span>5</span><span>0</span><span>0</span><span>0</span><span>5</span></span> ]</span><span class="matrix-equation">= 5I</span></div><div class="matrix-legend">A diagonal matrix whose diagonal entries are equal.</div>`
    },
    unit: {
      label: "Unit (identity) matrix",
      html: `<div class="matrix-visual-row"><span class="matrix-bracket result">[ <span class="matrix-grid cols-3"><span>1</span><span>0</span><span>0</span><span>0</span><span>1</span><span>0</span><span>0</span><span>0</span><span>1</span></span> ]</span><span class="matrix-equation">I₃</span></div><div class="matrix-legend">Ones lie on the main diagonal; all other entries are zero.</div>`
    }
  };
  const selected = visuals[visual.kind];
  if (!selected) return "";
  return `<figure class="educational-visual-box matrix-visual-box"><figcaption>${selected.label}</figcaption><div class="educational-visual">${selected.html}</div>${visual.explanation ? `<p class="visual-explanation">${visual.explanation}</p>` : ""}</figure>`;
}

// FILTER TOPICS (SEARCH BAR)
function filterTopics() {
  const query = document.getElementById("topic-search").value.toLowerCase();
  const subject = subjectsData[currentSubjectKey];

  if (!subject || !subject.reviewer) return;

  const filter = window.topicFilter || "all";
  const filtered = subject.reviewer.filter(topic => {
    if (filter === "bookmarked" && localStorage.getItem(`bookmark:${currentSubjectKey}:${topic.title}`) !== "1") return false;
    const titleMatch = topic.title.toLowerCase().includes(query);
    const contentMatch = topic.content.some(c => {
      if (c.type === "paragraph") return c.text.toLowerCase().includes(query);
      if (c.type === "list") return c.items.some(i => i.toLowerCase().includes(query));
      if (c.type === "image") return `${c.alt || ""} ${c.caption || ""}`.toLowerCase().includes(query);
      if (c.type === "visual") return `${c.kind || ""} ${c.explanation || ""}`.toLowerCase().includes(query);
      if (c.type === "formula") return `${c.title || ""} ${c.expression || ""} ${c.purpose || ""}`.toLowerCase().includes(query);
      return false;
    });
    return titleMatch || contentMatch;
  });

  renderNotes(filtered);
}

function setTopicFilter(filter, button) {
  window.topicFilter = filter;
  document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.remove("active"));
  if (button) button.classList.add("active");
  filterTopics();
}

function toggleBookmark(encodedTitle) {
  const title = decodeURIComponent(encodedTitle);
  const key = `bookmark:${currentSubjectKey}:${title}`;
  if (localStorage.getItem(key) === "1") localStorage.removeItem(key);
  else localStorage.setItem(key, "1");
  filterTopics();
}

// LABELS FOR EACH QUESTION TYPE
const QUIZ_TYPE_LABELS = {
  multiple_choice: "Multiple Choice",
  identification: "Identification",
  enumeration: "Enumeration",
  true_false: "True or False",
};

const QUIZ_TYPE_HINTS = {
  multiple_choice: "Pick the correct answer from the choices given.",
  identification: "Type the exact term or answer being described.",
  enumeration: "List out every item being asked for.",
  true_false: "Decide whether each statement is true or false.",
};

const SUPPORTED_QUIZ_TYPES = ["multiple_choice", "identification", "enumeration", "true_false"];

let currentQuizType = null;
let calculationQuestions = [];
let calculationQuestionIndex = 0;
let calculationAnswers = [];
let calculationMode = null;
const CALCULATION_QUESTION_COUNT = 10;

// RENDER QUIZ  -  SHOWS THE TYPE PICKER
function renderQuiz(quizzesData) {
  currentQuizType = null;
  document.getElementById("quiz-form").innerHTML = "";
  document.getElementById("quiz-action-footer").classList.add("hidden");
  document.getElementById("result-box").classList.add("hidden");

  const picker = document.getElementById("quiz-picker-container");

  if (currentSubjectKey === "topic-4") {
    renderCalculationPicker(picker);
    return;
  }

  if (!quizzesData || quizzesData.length === 0) {
    picker.innerHTML = `<div class="no-results">No examination questions available for this subject yet.</div>`;
    return;
  }

  const LOAD_LABELS = { D: "Dead Load", L: "Live Load", Lr: "Roof Live Load", S: "Snow Load", R: "Rain Load", W: "Wind Load", E: "Earthquake Load" };
  const ALTERNATIVE_LOADS = ["Lr", "S", "R"];

  function renderCalculationPicker(picker) {
    picker.innerHTML = `
      <section class="calculation-reference">
        <h3>NSCP 2015 Load Combinations</h3>
        <p>Choose a design method, then calculate each resulting load from the given values.</p>
        <div class="load-combination-table">
          <div><strong>LRFD</strong><span>1.4D</span><span>1.2D + 1.6L + 0.5(Lr or S or R)</span><span>1.2D + 1.6(Lr or S or R) + (L or 0.5W)</span><span>1.2D + 1.0W + L + 0.5(Lr or S or R)</span><span>1.2D + 1.0L + 1.0W + 0.2S</span><span>0.9D + 1.0W</span><span>0.9D + 1.0E</span></div>
          <div><strong>ASD</strong><span>D</span><span>D + L</span><span>D + (Lr or S or R)</span><span>D + 0.75L + 0.75(Lr or S or R)</span><span>D ± (0.6W or 0.7E)</span><span>D + 0.75L + 0.75(0.6W) + 0.75(Lr or S or R)</span><span>D + 0.75L + 0.75(0.7E) + 0.75S</span><span>0.6D ± (0.6W or 0.7E)</span></div>
        </div>
        <div class="calculation-mode-actions">
          <button type="button" class="quiz-type-card" onclick="startCalculationPractice('LRFD')"><span class="quiz-type-card-label">LRFD Practice</span><span class="quiz-type-card-count">Strength design combinations</span></button>
          <button type="button" class="quiz-type-card" onclick="startCalculationPractice('ASD')"><span class="quiz-type-card-label">ASD Practice</span><span class="quiz-type-card-count">Allowable stress combinations</span></button>
        </div>
      </section>
    `;
  }

  function randomLoad(min = 40, max = 240, decimal = false) {
    const value = min + Math.floor(Math.random() * ((max - min) / (decimal ? 0.5 : 1) + 1)) * (decimal ? 0.5 : 1);
    return Number(value.toFixed(1));
  }

  function buildCalculationQuestion(mode, index) {
    const decimal = index >= 7;
    const D = randomLoad(100, 260, decimal);
    const L = randomLoad(60, 180, decimal);
    const X = ALTERNATIVE_LOADS[index % ALTERNATIVE_LOADS.length];
    const xValue = randomLoad(30, 120, decimal);
    const W = randomLoad(40, 140, decimal);
    const E = randomLoad(40, 140, decimal);
    const loads = { D, L, [X]: xValue, W, E, S: X === "S" ? xValue : undefined, Lr: X === "Lr" ? xValue : undefined, R: X === "R" ? xValue : undefined };
    let terms;
    let formula;
    let difficulty = decimal ? "Hard" : index >= 4 ? "Medium" : "Easy";
    if (mode === "LRFD") {
      const templates = [
        { formula: "1.4D", terms: [["D", 1.4]] },
        { formula: "1.2D + 1.6L + 0.5(Lr or S or R)", terms: [["D", 1.2], ["L", 1.6], [X, 0.5]] },
        { formula: `1.2D + 1.6${X} + L`, terms: [["D", 1.2], [X, 1.6], ["L", 1]] },
        { formula: `1.2D + 1.0W + L + 0.5${X}`, terms: [["D", 1.2], ["W", 1], ["L", 1], [X, 0.5]] },
        { formula: "1.2D + 1.0L + 1.0W + 0.2S", terms: [["D", 1.2], ["L", 1], ["W", 1], ["S", 0.2]] },
        { formula: "0.9D + 1.0W", terms: [["D", 0.9], ["W", 1]] },
        { formula: "0.9D + 1.0E", terms: [["D", 0.9], ["E", 1]] }
      ];
      ({ formula, terms } = templates[index % templates.length]);
    } else {
      const sign = index % 2 === 0 ? "+" : "-";
      const templates = [
        { formula: "D", terms: [["D", 1]] },
        { formula: "D + L", terms: [["D", 1], ["L", 1]] },
        { formula: `D + ${X}`, terms: [["D", 1], [X, 1]] },
        { formula: `D + 0.75L + 0.75${X}`, terms: [["D", 1], ["L", 0.75], [X, 0.75]] },
        { formula: `D ${sign} 0.6W`, terms: [["D", 1], ["W", sign === "+" ? 0.6 : -0.6]] },
        { formula: `D + 0.75L + 0.75(0.6W) + 0.75${X}`, terms: [["D", 1], ["L", 0.75], ["W", 0.45], [X, 0.75]] },
        { formula: "D + 0.75L + 0.75(0.7E) + 0.75S", terms: [["D", 1], ["L", 0.75], ["E", 0.525], ["S", 0.75]] },
        { formula: `0.6D ${sign} 0.7E`, terms: [["D", 0.6], ["E", sign === "+" ? 0.7 : -0.7]] }
      ];
      ({ formula, terms } = templates[index % templates.length]);
    }
    terms.forEach(([load]) => {
      if (loads[load] === undefined) loads[load] = randomLoad(30, 100, decimal);
    });
    const resolvedTerms = terms.map(([load, coefficient]) => ({ load, coefficient, value: loads[load] }));
    const answer = resolvedTerms.reduce((sum, term) => sum + term.coefficient * term.value, 0);
    return { id: `${mode}-${index + 1}`, number: index + 1, mode, formula, loads, terms: resolvedTerms, answer: Number(answer.toFixed(2)), difficulty, submitted: false, correct: false, studentAnswer: "" };
  }

  function startCalculationPractice(mode) {
    calculationMode = mode;
    calculationQuestions = Array.from({ length: CALCULATION_QUESTION_COUNT }, (_, index) => buildCalculationQuestion(mode, index));
    calculationQuestionIndex = 0;
    calculationAnswers = [];
    quizQuestions = [];
    quizAnswers = {};
    currentQuizType = `calculation-${mode}`;
    document.getElementById("quiz-picker-container").innerHTML = "";
    document.getElementById("result-box").classList.add("hidden");
    renderCalculationQuestion();
  }

  function renderCalculationQuestion() {
    const question = calculationQuestions[calculationQuestionIndex];
    const form = document.getElementById("quiz-form");
    if (!question || !form) return;
    const progress = Math.round(((calculationQuestionIndex + 1) / calculationQuestions.length) * 100);
    const requiredLoads = [...new Set(question.terms.map(term => term.load))];
    const given = requiredLoads.map(load => [load, question.loads[load]]);
    form.innerHTML = `
      <button type="button" class="quiz-back-btn" onclick="backToQuizTypes()">Return</button>
      <div class="quiz-group-header"><span class="quiz-type-badge">${question.mode} Calculation</span><span class="quiz-group-count">Question ${question.number} of ${calculationQuestions.length} · ${question.difficulty}</span></div>
      <div class="quiz-progress" aria-label="Quiz progress"><div class="quiz-progress-track"><span style="width:${progress}%"></span></div><strong>${progress}%</strong></div>
      <section class="calculation-question">
        <h3>Determine the resulting load using:</h3>
        <div class="calculation-formula">${question.formula}</div>
        <h4>Given</h4>
        <div class="calculation-givens">${given.map(([load, value]) => `<span><strong>${load}</strong> = ${value} kN</span>`).join("")}</div>
        <p>Calculate the resulting load.</p>
        <label class="calculation-answer-label" for="calculation-answer">Answer</label>
        <input id="calculation-answer" class="input-field calculation-answer" type="number" step="any" placeholder="Enter value in kN" value="${question.studentAnswer}">
        <span class="calculation-unit">Unit: kN</span>
        <button type="button" class="submit-btn calculation-check-btn" onclick="checkCalculationAnswer()">Check Answer</button>
        ${question.submitted ? renderCalculationSolution(question) : ""}
        ${question.submitted ? `<button type="button" class="secondary-btn calculation-next-btn" onclick="nextCalculationQuestion()">${calculationQuestionIndex === calculationQuestions.length - 1 ? "View Results" : "Next"}</button>` : ""}
      </section>
    `;
  }

  function renderCalculationSolution(question) {
    const substitution = question.terms.map(term => `${term.coefficient < 0 ? "- " : ""}${Math.abs(term.coefficient)}(${term.value})`).join(" + ").replace(/\+ -/g, "- ");
    const terms = question.terms.map(term => (term.coefficient * term.value).toFixed(2)).join(" + ").replace(/\+ -/g, "- ");
    return `<div class="calculation-feedback ${question.correct ? "correct" : "incorrect"}"><strong>${question.correct ? "Correct!" : "Incorrect."}</strong><p><b>Formula</b><br>${question.formula}</p><p><b>Substitute</b><br>${substitution}</p><p><b>Calculate each term</b><br>${terms}</p><p><b>Final answer</b><br><strong>${question.answer.toFixed(2)} kN</strong></p></div>`;
  }

  function checkCalculationAnswer() {
    const question = calculationQuestions[calculationQuestionIndex];
    const input = document.getElementById("calculation-answer");
    if (!question || !input || input.value.trim() === "") return;
    const value = Number(input.value);
    question.studentAnswer = input.value;
    question.submitted = true;
    question.correct = Number.isFinite(value) && Math.abs(value - question.answer) <= 0.05;
    renderCalculationQuestion();
  }

  function nextCalculationQuestion() {
    if (calculationQuestionIndex >= calculationQuestions.length - 1) {
      finishCalculationPractice();
      return;
    }
    calculationQuestionIndex++;
    renderCalculationQuestion();
  }

  function finishCalculationPractice() {
    const score = calculationQuestions.filter(question => question.correct).length;
    quizResult = { score, total: calculationQuestions.length };
    document.getElementById("quiz-form").innerHTML = "";
    const percentage = Math.round((score / calculationQuestions.length) * 100);
    document.getElementById("result-box").innerHTML = `<div class="result-kicker">${calculationMode} calculation practice</div><h2>Quiz complete</h2><p class="result-score">Score: ${score} <span>/ ${calculationQuestions.length}</span></p><p class="result-message">Percentage: ${percentage}%</p><div class="result-actions"><button type="button" class="secondary-btn result-review-btn" onclick="reviewCalculationAnswers()">Review answers</button><button type="button" class="secondary-btn result-return-btn" onclick="backToQuizTypes()">Return to quizzes</button></div>`;
    document.getElementById("result-box").classList.remove("hidden");
  }

  function reviewCalculationAnswers() {
    const resultBox = document.getElementById("result-box");
    resultBox.innerHTML = `<h2>Review Answers</h2>` + calculationQuestions.map(question => `<div class="answer-review ${question.correct ? "correct" : "incorrect"}"><strong>${question.number}. ${question.formula}</strong><span>Given: ${question.terms.map(term => `${term.load} = ${term.value} kN`).join(", ")}</span><span>Your answer: ${question.studentAnswer || "Unanswered"} kN</span><span>Correct answer: ${question.answer.toFixed(2)} kN</span>${renderCalculationSolution(question)}<span class="review-status ${question.correct ? "correct" : "incorrect"}">${question.correct ? "Correct" : "Incorrect"}</span></div>`).join("") + `<div class="result-actions"><button type="button" class="secondary-btn result-return-btn" onclick="backToQuizTypes()">Return to quizzes</button></div>`;
  }

  window.startCalculationPractice = startCalculationPractice;
  window.checkCalculationAnswer = checkCalculationAnswer;
  window.nextCalculationQuestion = nextCalculationQuestion;
  window.reviewCalculationAnswers = reviewCalculationAnswers;

  // COUNT QUESTIONS PER TYPE, PRESERVING FIRST-SEEN ORDER
  const counts = [];
  const seen = {};
  quizzesData.filter(q => SUPPORTED_QUIZ_TYPES.includes(q.type)).forEach(q => {
    if (!(q.type in seen)) {
      seen[q.type] = counts.length;
      counts.push({ type: q.type, count: 0 });
    }
    counts[seen[q.type]].count++;
  });

  picker.innerHTML = `
    <div class="quiz-type-grid">
      ${counts.map(c => `
        <button type="button" class="quiz-type-card" onclick="selectQuizType('${c.type}')">
          <span class="quiz-type-card-label">${QUIZ_TYPE_LABELS[c.type] || c.type}</span>
          <span class="quiz-type-card-count">${c.count} question${c.count === 1 ? "" : "s"}</span>
        </button>
      `).join("")}
    </div>
  `;
}

// BACK TO THE TYPE PICKER
function backToQuizTypes() {
  const subject = subjectsData[currentSubjectKey];
  if (!subject) return;
  showSection("quiz");
  if (currentSubjectKey === "topic-4") {
    calculationQuestions = [];
    document.getElementById("quiz-form").innerHTML = "";
    document.getElementById("result-box").classList.add("hidden");
    renderQuiz([]);
    setReviewerSidebarState(true);
    return;
  }
  renderQuiz(subject.quizzes || []);
  setReviewerSidebarState(true);
}

// RENDER A SINGLE QUESTION BLOCK
function renderQuestionBlock(q, displayNumber) {
    let inputHtml = "";

    if (q.type === "multiple_choice" || q.type === "true_false") {
      inputHtml = `
        <div class="options-list" id="q-container-${q.id}">
          ${q.options.map(opt => `
            <label class="radio-option">
              <input type="radio" name="q${q.id}" value="${opt}" onchange="lockOptions('q${q.id}'); saveCurrentAnswer(); updateQuestionNavigator();">
              <span>${opt}</span>
            </label>
          `).join("")}
        </div>
        <button 
          type="button" 
          id="reanswer-btn-q${q.id}" 
          class="reanswer-btn hidden" 
          onclick="unlockSingleQuestion('q${q.id}')"
          style="margin-top: 0.75rem; background: transparent; border: 1px solid var(--border); color: var(--accent); padding: 0.4rem 0.8rem; border-radius: 12px; font-size: 0.82rem; cursor: pointer; font-family: var(--font-family);"
        >
          Change Answer
        </button>
      `;

    } else if (q.type === "identification") {
      inputHtml = `<input type="text" class="input-field" name="q${q.id}" placeholder="Type your answer here." oninput="saveCurrentAnswer(); updateQuestionNavigator();">`;

    } else if (q.type === "enumeration") {
      inputHtml = `<div class="enumeration-inputs" style="display: flex; flex-direction: column; gap: 0.6rem;">` + 
        q.answer.map((_, itemIdx) => `
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-weight: 500; min-width: 55px; color: var(--text-secondary);">${itemIdx + 1}.</span>
            <input 
              type="text" 
              class="input-field" 
              name="q${q.id}_item${itemIdx}" 
              placeholder="Type answer here."
              oninput="saveCurrentAnswer(); updateQuestionNavigator();"
            >
          </div>
        `).join("") + `</div>`;
    }

    return `
      <div class="question-block" id="block-q${q.id}" data-type="${q.type}">
        <div class="question-text">${displayNumber}. ${q.question}</div>
        ${inputHtml}
      </div>
    `;
}

// LOCK OPTIONS UPON SELECTION & HIGHLIGHT SELECTED ANSWER
function lockOptions(questionName) {
  const radios = document.querySelectorAll(`input[name="${questionName}"]`);
  radios.forEach(radio => {
    radio.disabled = true;
    const label = radio.closest('.radio-option');
    if (label) {
      if (radio.checked) {
        label.classList.add('selected');
        label.style.cursor = 'not-allowed';
        label.style.opacity = '1';
      } else {
        label.classList.remove('selected');
        label.style.cursor = 'not-allowed';
        label.style.opacity = '0.4';
      }
    }
  });

  const reanswerBtn = document.getElementById(`reanswer-btn-${questionName}`);
  if (reanswerBtn) {
    reanswerBtn.classList.remove("hidden");
  }
}

// UNLOCK A SINGLE QUESTION TO RE-ANSWER & REMOVE HIGHLIGHT
function unlockSingleQuestion(questionName) {
  const radios = document.querySelectorAll(`input[name="${questionName}"]`);
  radios.forEach(radio => {
    radio.checked = false;
    radio.disabled = false;
    const label = radio.closest('.radio-option');
    if (label) {
      label.classList.remove('selected');
      label.style.cursor = 'pointer';
      label.style.opacity = '1';
    }
  });

  const reanswerBtn = document.getElementById(`reanswer-btn-${questionName}`);
  if (reanswerBtn) {
    reanswerBtn.classList.add("hidden");
  }

  // Remove existing feedback if unlocked
  const block = document.getElementById(`block-${questionName}`);
  if (block) {
    const feedback = block.querySelector('.answer-feedback');
    if (feedback) feedback.remove();
  }
}

// GRADE QUIZ (INLINE EVALUATION WITH CORRECT ANSWERS DISPLAYED)
function gradeQuiz() {
  // 1. Verify subject data exists
  if (typeof subjectsData === 'undefined' || !subjectsData[currentSubjectKey]) {
    console.error("Subject data not found!");
    return;
  }

  const currentQuizzes = (subjectsData[currentSubjectKey].quizzes || []).filter(q => q.type === currentQuizType);
  if (!currentQuizzes || currentQuizzes.length === 0) return;

  let totalScore = 0;
  const totalQuestions = currentQuizzes.length;

  // 2. Loop through questions & give feedback
  currentQuizzes.forEach(q => {
    const block = document.getElementById(`block-q${q.id}`);
    if (!block) return;

    // Clear old feedback if re-submitting
    const existingFeedback = block.querySelector('.answer-feedback');
    if (existingFeedback) existingFeedback.remove();

    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'answer-feedback';
    feedbackDiv.style.marginTop = '0.85rem';
    feedbackDiv.style.padding = '0.75rem 1rem';
    feedbackDiv.style.borderRadius = '10px';
    feedbackDiv.style.fontSize = '0.9rem';
    feedbackDiv.style.fontWeight = '500';

    if (q.type === "multiple_choice" || q.type === "true_false") {
      const selected = document.querySelector(`input[name="q${q.id}"]:checked`);
      const userAnswer = selected ? selected.value.trim() : "";

      if (!userAnswer) {
        feedbackDiv.style.background = 'rgba(255, 171, 0, 0.15)';
        feedbackDiv.style.border = '1px solid #ffab00';
        feedbackDiv.style.color = '#ffab00';
        feedbackDiv.innerHTML = `Unanswered. Correct Answer: <strong>${q.answer}</strong>`;
      } else if (userAnswer === q.answer) {
        totalScore++;
        feedbackDiv.style.background = 'rgba(70, 201, 120, 0.15)';
        feedbackDiv.style.border = '1px solid #46c978';
        feedbackDiv.style.color = '#46c978';
        feedbackDiv.innerHTML = `Correct!`;
      } else {
        feedbackDiv.style.background = 'rgba(255, 85, 85, 0.15)';
        feedbackDiv.style.border = '1px solid #ff5555';
        feedbackDiv.style.color = '#ff5555';
        feedbackDiv.innerHTML = `Incorrect. Correct Answer: <strong style="color: var(--text-primary);">${q.answer}</strong>`;
      }

    } else if (q.type === "identification") {
      const input = document.querySelector(`input[name="q${q.id}"]`);
      const userAnswer = input ? input.value.trim() : "";

      if (!userAnswer) {
        feedbackDiv.style.background = 'rgba(255, 171, 0, 0.15)';
        feedbackDiv.style.border = '1px solid #ffab00';
        feedbackDiv.style.color = '#ffab00';
        feedbackDiv.innerHTML = `Unanswered. Correct Answer: <strong>${q.answer}</strong>`;
      } else if (userAnswer.toLowerCase() === q.answer.toLowerCase()) {
        totalScore++;
        feedbackDiv.style.background = 'rgba(70, 201, 120, 0.15)';
        feedbackDiv.style.border = '1px solid #46c978';
        feedbackDiv.style.color = '#46c978';
        feedbackDiv.innerHTML = `Correct!`;
      } else {
        feedbackDiv.style.background = 'rgba(255, 85, 85, 0.15)';
        feedbackDiv.style.border = '1px solid #ff5555';
        feedbackDiv.style.color = '#ff5555';
        feedbackDiv.innerHTML = `Incorrect. Correct Answer: <strong style="color: var(--text-primary);">${q.answer}</strong>`;
      }

    } else if (q.type === "enumeration") {
      const inputs = Array.from(document.querySelectorAll(`input[name^="q${q.id}_item"]`))
        .map(input => input.value.trim().toLowerCase())
        .filter(val => val !== "");

      const expectedAnswers = q.answer.map(ans => ans.toLowerCase());
      const allCorrect = expectedAnswers.length === inputs.length && 
        expectedAnswers.every(ans => inputs.includes(ans));

      if (inputs.length === 0) {
        feedbackDiv.style.background = 'rgba(255, 171, 0, 0.15)';
        feedbackDiv.style.border = '1px solid #ffab00';
        feedbackDiv.style.color = '#ffab00';
        feedbackDiv.innerHTML = `Unanswered. Correct Answers: <strong style="color: var(--text-primary);">${q.answer.join(", ")}</strong>`;
      } else if (allCorrect) {
        totalScore++;
        feedbackDiv.style.background = 'rgba(70, 201, 120, 0.15)';
        feedbackDiv.style.border = '1px solid #46c978';
        feedbackDiv.style.color = '#46c978';
        feedbackDiv.innerHTML = `Correct!`;
      } else {
        feedbackDiv.style.background = 'rgba(255, 85, 85, 0.15)';
        feedbackDiv.style.border = '1px solid #ff5555';
        feedbackDiv.style.color = '#ff5555';
        feedbackDiv.innerHTML = `Incorrect. Correct Answers: <strong style="color: var(--text-primary);">${q.answer.join(", ")}</strong>`;
      }
    }

    block.appendChild(feedbackDiv);
  });

  // 3. DISPLAY FINAL SCORE SUMMARY
  const percentage = Math.round((totalScore / totalQuestions) * 100);
  const resultBox = document.getElementById("result-box");
  
  if (resultBox) {
    resultBox.innerHTML = `Total Score: ${totalScore} / ${totalQuestions} (${percentage}%)`;
    resultBox.classList.remove("hidden"); // Reveals score box
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    console.error("Element #result-box is missing from HTML!");
  }
}

// WORKSPACE NAVIGATION
const ALL_SECTIONS = ["home", "reviewer", "quiz", "flashcards"];

function showSection(sectionId) {
  ALL_SECTIONS.forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });

  const target = document.getElementById(sectionId);
  if (!target) return;
  target.classList.remove("hidden");
  currentSection = sectionId;
  document.body.classList.toggle("home-view", sectionId === "home");
  const inWorkspace = sectionId === "reviewer" || sectionId === "quiz";
  document.body.classList.toggle("reviewer-view", inWorkspace);
  if (inWorkspace) {
    renderReviewerDrawer();
    const overlay = document.getElementById("reviewer-drawer-overlay");
    const drawer = document.getElementById("reviewer-drawer");
    if (overlay && drawer) {
      overlay.classList.toggle("hidden", !sidebarOpen);
      drawer.classList.toggle("collapsed", !sidebarOpen);
      document.body.classList.toggle("sidebar-collapsed", !sidebarOpen);
      document.body.classList.toggle("drawer-open", sidebarOpen);
    }
  } else {
    document.getElementById("reviewer-drawer-overlay")?.classList.add("hidden");
    document.getElementById("reviewer-drawer")?.classList.remove("collapsed");
    document.body.classList.remove("drawer-open", "sidebar-collapsed");
  }
  syncSidebarToggleVisibility();
  if (sectionId === "flashcards") renderFlashcards();
}

// THEME TOGGLE
function setTheme(theme) {
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  localStorage.setItem("themePreference", theme);

  const toggle = document.getElementById("theme-toggle");
  const moonIcon = document.getElementById("theme-moon-icon");
  const sunIcon = document.getElementById("theme-sun-icon");
  const isLight = resolved === "light";
  if (toggle) toggle.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
  if (moonIcon) moonIcon.classList.toggle("hidden", isLight);
  if (sunIcon) sunIcon.classList.toggle("hidden", !isLight);
}

function toggleTheme() {
  const current = localStorage.getItem("themePreference") || "system";
  setTheme(current === "system" ? "light" : current === "light" ? "dark" : "system");
}

function setPalette(palette) {
  const legacyNames = { blue: "aurora", "dark-pink": "rosewood", "dark-purple": "velvet" };
  const palettes = ["aurora", "rosewood", "velvet", "sage", "amber", "ocean", "slate", "terracotta"];
  const selected = palettes.includes(palette) ? palette : (legacyNames[palette] || "aurora");
  document.documentElement.setAttribute("data-palette", selected);
  localStorage.setItem("palettePreference", selected);
  document.querySelectorAll("[data-palette-option]").forEach(option => {
    const isSelected = option.dataset.paletteOption === selected;
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-checked", String(isSelected));
  });
  closePaletteMenu();
}

function togglePaletteMenu() {
  const menu = document.getElementById("palette-menu");
  const toggle = document.getElementById("palette-toggle");
  if (!menu || !toggle) return;
  const isOpen = menu.classList.toggle("hidden");
  toggle.setAttribute("aria-expanded", String(!isOpen));
}

function closePaletteMenu() {
  const menu = document.getElementById("palette-menu");
  const toggle = document.getElementById("palette-toggle");
  if (!menu || !toggle) return;
  menu.classList.add("hidden");
  toggle.setAttribute("aria-expanded", "false");
}
// ==========================================================================
// REVIEWER DRAWER & LOCAL STORAGE LIBRARY
// ==========================================================================
const SAVED_SUBJECT_KEYS = ["reviewerSubjects", "savedReviewers", "subjectsData", "subjects"];
let quizQuestions = [];
let quizQuestionIndex = 0;
let quizAnswers = {};
let quizResult = null;

function icon(name) {
  const icons = {
    library: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M4 5.5v16"></path><path d="M8 7h8"></path><path d="M8 11h8"></path></svg>',
    subject: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"></path><path d="M4 5.5v16"></path><path d="M8 7h8"></path></svg>',
    reviewer: '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5z"></path><path d="M5 4.5v17"></path><path d="M9 6h6"></path><path d="M9 10h6"></path></svg>',
    quiz: '<svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a2 2 0 0 1 2 2v14H4V5a2 2 0 0 1 2-2z"></path><path d="M8 7h8"></path><path d="M8 11h5"></path><path d="m8 15 1.5 1.5L12 14"></path></svg>',
    paper: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>',
  };
  return icons[name] || "";
}

function loadSavedSubjects() {
  SAVED_SUBJECT_KEYS.forEach(storageKey => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const saved = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      saved.filter(subject => subject && subject.id && (subject.reviewer || subject.quizzes)).forEach(subject => {
        if (["topic-3", "topic-4", "topic-5", "topic-6", "topic-7", "topic-8", "topic-9"].includes(subject.id) && (subjectsData["ce361"] || subjectsData["ce364"])) {
          return;
        }
        if (!subjectsData[subject.id]) {
          subjectsData[subject.id] = subject;
        }
      });
    } catch (error) {
      console.warn(`Ignoring invalid saved reviewer data in ${storageKey}.`, error);
    }
  });
}

function persistSubjects() {
  localStorage.setItem("reviewerSubjects", JSON.stringify(Object.values(subjectsData)));
}

function syncSidebarToggleVisibility() {
  const toggle = document.getElementById("sidebar-toggle-btn");
  if (!toggle) return;

  const shouldShow = currentSection !== "home" && !sidebarOpen;
  toggle.style.visibility = shouldShow ? "visible" : "hidden";
  toggle.style.opacity = shouldShow ? "1" : "0";
  toggle.style.pointerEvents = shouldShow ? "auto" : "none";
}

function setReviewerSidebarState(open) {
  sidebarOpen = open;
  const overlay = document.getElementById("reviewer-drawer-overlay");
  const drawer = document.getElementById("reviewer-drawer");
  if (!overlay || !drawer) return;

  overlay.classList.toggle("hidden", !open);
  drawer.classList.toggle("collapsed", !open);
  document.body.classList.toggle("sidebar-collapsed", !open && (currentSection === "reviewer" || currentSection === "quiz"));
  document.body.classList.toggle("drawer-open", open && (currentSection !== "home"));
  syncSidebarToggleVisibility();
}

function openReviewerDrawer() {
  if (currentSection === "home") {
    showSection("reviewer");
  }
  setReviewerSidebarState(true);
  renderReviewerDrawer();
}

function closeReviewerDrawer(event) {
  if (event && event.target !== event.currentTarget) return;
  if (currentSection === "home") {
    document.getElementById("reviewer-drawer-overlay")?.classList.add("hidden");
    document.body.classList.remove("drawer-open", "sidebar-collapsed");
    syncSidebarToggleVisibility();
    return;
  }
  setReviewerSidebarState(false);
}

function renderReviewerDrawer() {
  const list = document.getElementById("reviewer-drawer-list");
  if (!list) return;
  const searchEl = document.getElementById("reviewer-search");
  const query = (searchEl ? searchEl.value : "").trim().toLowerCase();

  const topSubjects = Object.values(subjectsData).filter(subject => !subject.parentId);

  const filteredSubjects = topSubjects.filter(subject => {
    if (!query) return true;
    const matchSelf = `${subject.title} ${subject.description || ""}`.toLowerCase().includes(query);
    if (matchSelf) return true;
    if (Array.isArray(subject.topics)) {
      return subject.topics.some(t => {
        const topicObj = subjectsData[t.id] || t;
        return `${topicObj.title} ${topicObj.description || ""}`.toLowerCase().includes(query);
      });
    }
    return false;
  });

  if (!filteredSubjects.length) {
    list.innerHTML = `<div class="drawer-empty"><span class="drawer-icon">${icon("library")}</span><strong>No reviewers yet</strong><p>Add a subject to build your study library.</p></div>`;
    return;
  }

  list.innerHTML = filteredSubjects.map(subject => {
    const hasTopics = Array.isArray(subject.topics) && subject.topics.length > 0;
    const isDirectSubject = subject.id === currentSubjectKey;
    const isParentActive = isDirectSubject || (hasTopics && subject.topics.some(t => t.id === currentSubjectKey));

    if (hasTopics) {
      const topicsHtml = subject.topics.map(tRef => {
        const topic = subjectsData[tRef.id] || tRef;
        const isCurrentTopic = topic.id === currentSubjectKey;
        const topicQuizCount = (topic.quizzes || []).length;
        const hasCalculationPractice = topic.id === "topic-4";
        return `
          <div class="drawer-topic-item ${isCurrentTopic ? "active" : ""}">
            <button type="button" class="drawer-topic-title" aria-expanded="${isCurrentTopic}" onclick="selectDrawerTopic('${topic.id}')">
              <span class="drawer-topic-icon">${icon("paper")}</span>
              <span class="drawer-topic-name">${topic.title}</span>
              <span class="drawer-chevron" role="button" tabindex="0" aria-label="Toggle ${topic.title}" onclick="event.stopPropagation(); toggleDrawerTopic(this.closest('.drawer-topic-title'))" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleDrawerTopic(this.closest('.drawer-topic-title')); }"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></span>
            </button>
            <div class="drawer-topic-body ${isCurrentTopic ? "" : "collapsed"}">
              <button type="button" class="drawer-link ${currentSection === "reviewer" && isCurrentTopic ? "active" : ""}" onclick="openSavedReviewer('${topic.id}')">${icon("reviewer")}<span>Reviewer</span></button>
              <button type="button" class="drawer-link quiz-drawer-link ${currentSection === "quiz" && isCurrentTopic ? "active" : ""}" ${topicQuizCount || hasCalculationPractice ? "" : "disabled"} onclick="openSavedQuiz('${topic.id}')">${icon("quiz")}<span class="drawer-link-label"><span>Quiz</span><small>${hasCalculationPractice ? "Calculation practice" : `${topicQuizCount} question${topicQuizCount === 1 ? "" : "s"}`}</small></span></button>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="drawer-subject ${isParentActive ? "active" : ""}">
          <button type="button" class="drawer-subject-title" aria-expanded="${isParentActive}" onclick="selectDrawerSubject('${subject.id}')">
            <span class="drawer-icon">${icon("subject")}</span><strong>${subject.title}</strong><span class="drawer-chevron" role="button" tabindex="0" aria-label="Toggle ${subject.title}" onclick="event.stopPropagation(); toggleDrawerSubject(this.closest('.drawer-subject-title'))" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleDrawerSubject(this.closest('.drawer-subject-title')); }"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></span>
          </button>
          <div class="drawer-subject-body ${isParentActive ? "" : "collapsed"}">
            ${topicsHtml}
          </div>
        </div>
      `;
    }

    const quizCount = (subject.quizzes || []).length;
    return `
      <div class="drawer-subject ${isDirectSubject ? "active" : ""}">
        <button type="button" class="drawer-subject-title" aria-expanded="${isDirectSubject}" onclick="selectDrawerSubject('${subject.id}')">
          <span class="drawer-icon">${icon("subject")}</span><strong>${subject.title}</strong><span class="drawer-chevron" role="button" tabindex="0" aria-label="Toggle ${subject.title}" onclick="event.stopPropagation(); toggleDrawerSubject(this.closest('.drawer-subject-title'))" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggleDrawerSubject(this.closest('.drawer-subject-title')); }"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg></span>
        </button>
        <div class="drawer-subject-body ${isDirectSubject ? "" : "collapsed"}">
          <button type="button" class="drawer-link ${currentSection === "reviewer" && subject.id === currentSubjectKey ? "active" : ""}" onclick="openSavedReviewer('${subject.id}')">${icon("reviewer")}<span>Reviewer</span></button>
          <button type="button" class="drawer-link quiz-drawer-link ${currentSection === "quiz" && subject.id === currentSubjectKey ? "active" : ""}" ${quizCount ? "" : "disabled"} onclick="openSavedQuiz('${subject.id}')">${icon("quiz")}<span class="drawer-link-label"><span>Quiz</span><small>${quizCount} question${quizCount === 1 ? "" : "s"}</small></span></button>
        </div>
      </div>
    `;
  }).join("");
}

function selectDrawerTopic(topicId) {
  if (!subjectsData[topicId]) return;
  changeSubject(topicId);
  renderReviewerDrawer();
}

function toggleDrawerTopic(button) {
  const body = button.nextElementSibling;
  if (!body) return;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  body.classList.toggle("collapsed", expanded);
}

function toggleDrawerSubject(button) {
  const body = button.nextElementSibling;
  if (!body) return;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  body.classList.toggle("collapsed", expanded);
}

function selectDrawerSubject(subjectId) {
  const subject = subjectsData[subjectId];
  if (!subject) return;

  if (Array.isArray(subject.topics) && subject.topics.length > 0) {
    const hasActiveTopic = subject.topics.some(t => t.id === currentSubjectKey);
    if (!hasActiveTopic) {
      changeSubject(subject.topics[0].id);
    }
  } else {
    changeSubject(subjectId);
  }
  renderReviewerDrawer();
}

function openSavedReviewer(subjectId) {
  if (!subjectsData[subjectId]) return;
  changeSubject(subjectId);
  showSection("reviewer");
}

function openSavedQuiz(subjectId) {
  if (!subjectsData[subjectId] || (subjectId !== "topic-4" && !(subjectsData[subjectId].quizzes || []).length)) return;
  changeSubject(subjectId);
  showSection("quiz");
  if (subjectId === "topic-4") {
    renderQuiz([]);
    return;
  }
  const firstType = subjectsData[subjectId].quizzes[0].type;
  selectQuizType(firstType);
}

// ==========================================================================
// ONE-QUESTION QUIZ FLOW
// ==========================================================================
function selectQuizType(type) {
  currentQuizType = type;
  quizQuestions = (subjectsData[currentSubjectKey].quizzes || [])
    .filter(q => q.type === type);
  quizQuestionIndex = 0;
  quizAnswers = {};
  quizResult = null;
  document.getElementById("quiz-picker-container").innerHTML = "";
  document.getElementById("result-box").classList.add("hidden");
  document.getElementById("quiz-action-footer").classList.add("hidden");
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const form = document.getElementById("quiz-form");
  if (!quizQuestions.length) return;
  const question = quizQuestions[quizQuestionIndex];
  saveStudyPosition(`Quiz — Question ${quizQuestionIndex + 1}`, {
    quizType: question.type,
    quizQuestionIndex,
  });
  const progress = Math.round(((quizQuestionIndex + 1) / quizQuestions.length) * 100);
  form.innerHTML = `
    <button type="button" class="quiz-back-btn" onclick="returnFromQuiz()">Return</button>
    <div class="quiz-group-header">
    <span class="quiz-type-badge">${QUIZ_TYPE_LABELS[question.type] || question.type}</span>
    <span class="quiz-group-count">Question ${quizQuestionIndex + 1} of ${quizQuestions.length}</span>
    </div>
    <div class="quiz-progress" aria-label="Quiz progress">
      <div class="quiz-progress-track"><span style="width:${progress}%"></span></div><strong>${progress}%</strong>
    </div>
    ${renderQuestionNavigator()}
    ${renderQuestionBlock(question, quizQuestionIndex + 1)}
    <div class="quiz-navigation">
      <button type="button" class="secondary-btn" onclick="goToPreviousQuestion()" ${quizQuestionIndex === 0 ? "disabled" : ""}>Previous</button>
      <button type="button" class="submit-btn quiz-next-btn" onclick="${quizQuestionIndex === quizQuestions.length - 1 ? "gradeQuiz()" : "goToNextQuestion()"}">${quizQuestionIndex === quizQuestions.length - 1 ? "Submit Quiz" : "Next"}</button>
    </div>
  `;
  restoreAnswer(question);
  requestAnimationFrame(() => form.classList.add("question-enter"));
}

function isQuestionAnswered(question) {
  const answer = quizAnswers[question.id];
  if (Array.isArray(answer)) return answer.some(value => String(value).trim() !== "");
  return typeof answer === "string" && answer.trim() !== "";
}

function renderQuestionNavigator() {
  return `
    <nav class="question-navigator" aria-label="Question navigation">
      ${quizQuestions.map((question, index) => `
        <button
          type="button"
          class="question-number${index === quizQuestionIndex ? " active" : ""}${isQuestionAnswered(question) ? " answered" : ""}"
          aria-label="Question ${index + 1}"
          aria-current="${index === quizQuestionIndex ? "step" : "false"}"
          onclick="jumpToQuestion(${index})"
        >${index + 1}</button>
      `).join("")}
    </nav>
  `;
}

function updateQuestionNavigator() {
  const navigator = document.querySelector(".question-navigator");
  if (!navigator) return;
  navigator.querySelectorAll(".question-number").forEach((button, index) => {
    const question = quizQuestions[index];
    const isActive = index === quizQuestionIndex;
    button.classList.toggle("active", isActive);
    button.classList.toggle("answered", isQuestionAnswered(question));
    button.setAttribute("aria-current", isActive ? "step" : "false");
  });
}

function jumpToQuestion(index) {
  saveCurrentAnswer();
  if (!Number.isInteger(index) || index < 0 || index >= quizQuestions.length) return;
  quizQuestionIndex = index;
  renderCurrentQuestion();
}

function saveCurrentAnswer() {
  const question = quizQuestions[quizQuestionIndex];
  if (!question) return;
  if (question.type === "multiple_choice" || question.type === "true_false") {
    const selected = document.querySelector(`input[name="q${question.id}"]:checked`);
    quizAnswers[question.id] = selected ? selected.value : "";
  } else if (question.type === "enumeration") {
    quizAnswers[question.id] = Array.from(document.querySelectorAll(`input[name^="q${question.id}_item"]`)).map(input => input.value);
  } else {
    const input = document.querySelector(`input[name="q${question.id}"]`);
    quizAnswers[question.id] = input ? input.value : "";
  }
}

function restoreAnswer(question) {
  const answer = quizAnswers[question.id];
  if (answer === undefined) return;
  if (question.type === "multiple_choice" || question.type === "true_false") {
    const input = Array.from(document.querySelectorAll(`input[name="q${question.id}"]`))
      .find(option => option.value === answer);
    if (input) input.checked = true;
  } else if (question.type === "enumeration") {
    document.querySelectorAll(`input[name^="q${question.id}_item"]`).forEach((input, index) => { input.value = answer[index] || ""; });
  } else {
    const input = document.querySelector(`input[name="q${question.id}"]`);
    if (input) input.value = answer;
  }
}

function goToNextQuestion() {
  saveCurrentAnswer();
  if (quizQuestionIndex < quizQuestions.length - 1) {
    quizQuestionIndex++;
    renderCurrentQuestion();
  }
}

function goToPreviousQuestion() {
  saveCurrentAnswer();
  if (quizQuestionIndex <= 0) return;
  quizQuestionIndex--;
  renderCurrentQuestion();
}

function returnFromQuiz() {
  saveCurrentAnswer();
  backToQuizTypes();
}

function returnToReviewerWorkspace() {
  showSection("reviewer");
  renderReviewerDrawer();
}

function gradeQuiz() {
  saveCurrentAnswer();
  if (!quizQuestions.length) return;
  let score = 0;
  quizQuestions.forEach(question => {
    const answer = quizAnswers[question.id];
    if (question.type === "enumeration") {
      const expected = question.answer.map(item => item.trim().toLowerCase()).sort();
      const actual = (answer || []).map(item => item.trim().toLowerCase()).filter(Boolean).sort();
      if (expected.length === actual.length && expected.every((item, index) => item === actual[index])) score++;
    } else if (typeof answer === "string" && answer.trim().toLowerCase() === String(question.answer).trim().toLowerCase()) {
      score++;
    }
  });
  quizResult = { score, total: quizQuestions.length };
  renderStudyProgress(subjectsData[currentSubjectKey]);
  document.getElementById("quiz-form").innerHTML = "";
  const percentage = Math.round((score / quizQuestions.length) * 100);
  const resultMessage = percentage >= 80
    ? "Excellent work  -  you really know your material."
    : percentage >= 50
      ? "Good effort  -  review the missed answers and try again."
      : "Keep practicing  -  every attempt helps you improve.";
  document.getElementById("result-box").innerHTML = `
    <div class="result-kicker">Practice examination</div>
    <h2>Quiz complete</h2>
    <div class="score-display" style="--score: ${percentage}%" role="img" aria-label="Score: ${score} out of ${quizQuestions.length}, ${percentage} percent">
      <div class="score-display-inner">
        <strong>${percentage}%</strong>
        <span>score</span>
      </div>
    </div>
    <p class="result-score">${score} <span>/ ${quizQuestions.length}</span></p>
    <p class="result-message">${resultMessage}</p>
    <div class="result-actions">
      <button type="button" class="secondary-btn result-review-btn" onclick="reviewQuizAnswers()">Review answers</button>
      <button type="button" class="secondary-btn result-return-btn" onclick="backToQuizTypes()">Return to quizzes</button>
    </div>
  `;
  document.getElementById("result-box").classList.remove("hidden");
}

function reviewQuizAnswers() {
  const resultBox = document.getElementById("result-box");
  resultBox.innerHTML = `<h2>Review Answers</h2>` + quizQuestions.map((question, index) => {
    const user = quizAnswers[question.id];
    const userText = Array.isArray(user) ? user.filter(Boolean).join(", ") || "Unanswered" : user || "Unanswered";
    const correctText = Array.isArray(question.answer) ? question.answer.join(", ") : question.answer;
    const isCorrect = (() => {
      if (question.type === "enumeration") {
        const expected = question.answer.map(item => item.trim().toLowerCase()).sort();
        const actual = (user || []).map(item => item.trim().toLowerCase()).filter(Boolean).sort();
        return expected.length === actual.length && expected.every((item, itemIndex) => item === actual[itemIndex]);
      }
      if (typeof user === "string") {
        return user.trim().toLowerCase() === String(correctText).trim().toLowerCase();
      }
      return false;
    })();

    return `<div class="answer-review ${isCorrect ? "correct" : "incorrect"}">
      <strong>${index + 1}. ${question.question}</strong>
      <span>Your answer: ${userText}</span>
      <span>Correct answer: ${correctText}</span>
      ${!isCorrect ? `<small>Tip: revisit the related reviewer notes for this concept.</small>` : ""}
      <span class="review-status ${isCorrect ? "correct" : "incorrect"}">${isCorrect ? "Correct" : "Incorrect"}</span>
    </div>`;
  }).join("") + `<div class="result-actions"><button type="button" class="secondary-btn" onclick="backToQuizTypes()">Return</button></div>`;
  resultBox.classList.remove("hidden");
}

function renderFlashcards() {
  const subject = subjectsData[currentSubjectKey];
  const container = document.getElementById("flashcard-container");
  if (!container || !subject) return;
  const cards = (subject.reviewer || []).slice(0, 12);
  container.innerHTML = cards.length ? `<div class="flashcard-grid">${cards.map((card, i) => `<button type="button" class="flashcard" onclick="this.classList.toggle('revealed')"><span class="flashcard-front">${escapeHtml(card.title)}</span><span class="flashcard-back">${stripMarkup(card.content && card.content[0] ? card.content[0].text : "Review this topic in your notes.")}</span><small>Tap to flip</small></button>`).join("")}</div>` : `<div class="no-results">No flashcards available yet.</div>`;
}

function stripMarkup(value) {
  const div = document.createElement("div");
  div.innerHTML = value || "";
  return div.textContent || div.innerText || "";
}
