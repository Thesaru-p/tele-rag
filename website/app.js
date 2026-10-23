const documents = {
  handbook: {
    label: "PREVIEW · STUDIO HANDBOOK",
    text: "Our doors are open Tuesday–Sunday, 9 am–6 pm. The Sunday beginner class starts at 10 am and runs for two hours. All materials are included, and no experience is needed.",
    name: "Studio handbook",
  },
  prices: {
    label: "PREVIEW · CLASS PRICES",
    text: "The two-hour beginner pottery class is $35 per person, including clay, tools, glazing, and firing. Private group sessions start at $180 for up to six people.",
    name: "Class prices",
  },
  policies: {
    label: "PREVIEW · THE HOUSE RULES",
    text: "Bring your curiosity and clothes you don’t mind getting a little messy. Aprons and all tools are provided. Cancel at least 48 hours before class for a full refund.",
    name: "The house rules",
  },
};

function selectDocument(key) {
  const doc = documents[key];
  document.querySelectorAll("[data-document]").forEach((button) => {
    const active = button.dataset.document === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const preview = document.querySelector("#document-preview");
  preview.querySelector(".preview-label").textContent = doc.label;
  preview.querySelector("p").textContent = doc.text;
}

document.querySelectorAll("[data-document]").forEach((button) => {
  button.addEventListener("click", () =>
    selectDocument(button.dataset.document),
  );
});
selectDocument("handbook");

const messages = document.querySelector("#chat-messages");
const initialMessage = messages.firstElementChild.cloneNode(true);
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const submit = form.querySelector("button");
let pendingReply;

function answerFor(question) {
  const q = question.toLowerCase();
  if (/\b(cancel\w*|refund\w*|reschedul\w*|polic\w*)\b/.test(q))
    return {
      text: "Plans change — we get it. Cancel at least 48 hours before your class for a full refund. The sample house rules don’t specify a refund for later cancellations.",
      source: "policies",
    };
  if (/\b(private|group\w*|party|parties|team)\b/.test(q))
    return {
      text: "A little clay is even better with company. Private group sessions start at $180 for up to six people. That includes your own session together.",
      source: "prices",
    };
  if (
    /\b(price\w*|cost\w*|much|pay|payment|dollars?|fees?|expensive)\b|\$/.test(
      q,
    )
  )
    return {
      text: "Our two-hour beginner pottery class is $35 per person. Clay, tools, glazing, and firing are all included.",
      source: "prices",
    };
  if (
    /\b(bring\w*|wear|cloth\w*|apron\w*|need|suppl\w*|tool\w*|material\w*)\b/.test(
      q,
    )
  )
    return {
      text: "Just bring your curiosity and clothes you don’t mind getting a little messy. We’ll provide an apron and all the tools. Your clay, glazing, and firing are included, too.",
      source: "policies",
      additionalSource: "prices",
    };
  if (
    /\b(open\w*|hour\w*|close\w*|monday|tuesday|wednesday|thursday|friday|saturday|today|tomorrow)\b/.test(
      q,
    )
  )
    return {
      text: "Our doors are open Tuesday to Sunday, 9 am–6 pm. We’re closed on Mondays. The beginner pottery class is on Sunday at 10 am and lasts two hours.",
      source: "handbook",
    };
  if (
    /\b(begin\w*|class\w*|experience|first|sunday|pottery|lesson\w*|long|when|time)\b/.test(
      q,
    )
  )
    return {
      text: "The beginner pottery class starts at 10 am on Sundays and runs for two hours. All materials are included, and no experience is needed.",
      source: "handbook",
    };
  return {
    text: "I couldn’t find that in the sample documents. Try asking about class prices, opening hours, what to bring, or cancellations.",
    source: null,
  };
}

function addMessage(text, className) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  messages.append(element);
  messages.scrollTop = messages.scrollHeight;
  return element;
}

function addSource(element, source) {
  const button = document.createElement("button");
  button.className = "answer-source";
  button.type = "button";
  button.textContent = `↗ Source: ${documents[source].name}`;
  button.addEventListener("click", () => {
    selectDocument(source);
    document
      .querySelector(`[data-document="${source}"]`)
      .focus({ preventScroll: true });
    document
      .querySelector("#document-preview")
      .scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "nearest",
      });
  });
  element.append(button);
}

function ask(question) {
  const clean = question.trim().slice(0, 400);
  if (!clean || pendingReply) return;
  addMessage(clean, "demo-user-message");
  input.value = "";
  submit.disabled = true;
  form.setAttribute("aria-busy", "true");
  const typing = addMessage(
    "Finding the right page…",
    "demo-bot-message typing",
  );
  pendingReply = setTimeout(() => {
    typing.remove();
    const answer = answerFor(clean);
    const element = addMessage(answer.text, "demo-bot-message");
    if (answer.source) addSource(element, answer.source);
    if (answer.additionalSource) addSource(element, answer.additionalSource);
    messages.scrollTop = messages.scrollHeight;
    submit.disabled = false;
    form.removeAttribute("aria-busy");
    pendingReply = undefined;
  }, 650);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});
document.querySelectorAll("[data-question]").forEach((button) => {
  button.addEventListener("click", () => ask(button.dataset.question));
});
document.querySelector("#reset-chat").addEventListener("click", () => {
  clearTimeout(pendingReply);
  pendingReply = undefined;
  messages.replaceChildren(initialMessage.cloneNode(true));
  input.value = "";
  submit.disabled = false;
  form.removeAttribute("aria-busy");
  selectDocument("handbook");
});

const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#main-nav");
function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
  navigation.classList.remove("open");
}
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
  navigation.classList.toggle("open", open);
});
navigation
  .querySelectorAll("a")
  .forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuToggle.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menuToggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
document.querySelector("#current-year").textContent = new Date().getFullYear();

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
const scene = document.querySelector(".hero-art");
let pointerFrame;
scene.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || !finePointer.matches) return;
  cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    const bounds = scene.getBoundingClientRect();
    scene.style.setProperty(
      "--scene-rx",
      `${(0.5 - (event.clientY - bounds.top) / bounds.height) * 10}deg`,
    );
    scene.style.setProperty(
      "--scene-ry",
      `${((event.clientX - bounds.left) / bounds.width - 0.5) * 12}deg`,
    );
  });
});
scene.addEventListener("pointerleave", () => {
  cancelAnimationFrame(pointerFrame);
  scene.style.setProperty("--scene-rx", "0deg");
  scene.style.setProperty("--scene-ry", "0deg");
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  if (!reducedMotion.matches) {
    document
      .querySelectorAll(
        ".section-heading, .process-card, .inside-copy, .principles article, .faq-section, .closing",
      )
      .forEach((element) => {
        element.classList.add("reveal-ready");
        revealObserver.observe(element);
      });
  }
  const motionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) =>
      entry.target.classList.toggle("motion-paused", !entry.isIntersecting),
    );
  });
  document
    .querySelectorAll(".hero-art, .closing-orbit")
    .forEach((element) => motionObserver.observe(element));
}
