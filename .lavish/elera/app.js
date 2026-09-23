// Реконструкция макетов Elera. Живое ровно то, что можно показать без бэкенда:
// переходы между экранами, вкладки, фильтры и имитация чата.

const TITLES = {
  dashboard: ["Monday, April 20", ""],
  flow: ["Patient Flow", ""],
  sched: ["Scheduling", ""],
  chat: ["AI Chat", ""],
  labs: ["Pharmacy & Labs", ""],
  billing: ["Billing & Claims", ""],
  reports: ["Reports", "MIPS 2026 · reporting closes 31 Mar 2027"],
};

const title = document.getElementById("pageTitle");
const sub = document.getElementById("pageSub");

function show(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === `s-${name}`));
  document.querySelectorAll(".side a").forEach((a) => a.classList.toggle("on", a.dataset.go === name));
  const [t, s] = TITLES[name] ?? ["", ""];
  title.textContent = t;
  sub.textContent = s;
  sub.hidden = !s;
  location.hash = name;
}

document.querySelectorAll(".side a[data-go]").forEach((a) => {
  a.addEventListener("click", () => show(a.dataset.go));
});

// Вкладки внутри экрана: выбранная — белая пилюля.
document.querySelectorAll("[data-tabs]").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === button));
  });
});

// Чипы-фильтры переключаются независимо друг от друга.
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => chip.classList.toggle("on"));
});

// Чат: ответа от модели здесь нет, поэтому показываем заглушку вместо выдумки.
const form = document.getElementById("askForm");
const input = document.getElementById("askInput");
const thread = document.getElementById("chatThread");
const empty = document.getElementById("chatEmpty");

function ask(text) {
  const value = text.trim();
  if (!value) return;
  empty.hidden = true;
  thread.hidden = false;
  thread.insertAdjacentHTML("beforeend", `<div class="msg me"></div>`);
  thread.lastElementChild.textContent = value;
  input.value = "";
  setTimeout(() => {
    thread.insertAdjacentHTML(
      "beforeend",
      `<div class="msg it">Это статичная реконструкция макета: модель сюда не подключена.
       В нашем приложении тот же экран живёт на «Каска ИИ» и отвечает по-настоящему.</div>`,
    );
    thread.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" });
  }, 450);
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    ask(input.value);
  }
});

document.querySelectorAll("[data-ask]").forEach((button) => {
  button.addEventListener("click", () => ask(button.dataset.ask));
});

function fromHash() {
  const name = location.hash.slice(1);
  show(name in TITLES ? name : "dashboard");
}

// Ссылка вида index.html#flow должна открывать свой экран и при смене хэша на живой странице.
window.addEventListener("hashchange", fromHash);
fromHash();
