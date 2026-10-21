const documents = {
  handbook: {
    label: 'A PEEK INSIDE · STUDIO HANDBOOK',
    text: 'Our doors are open Tuesday–Sunday, 9 am–6 pm. The Sunday beginner class starts at 10 am and runs for two hours. All materials are included, and no experience is needed.',
    name: 'Studio handbook',
  },
  prices: {
    label: 'A PEEK INSIDE · CLASS PRICES',
    text: 'The two-hour beginner pottery class is $35 per person, including clay, tools, glazing, and firing. Private group sessions start at $180 for up to six people.',
    name: 'Class prices',
  },
  policies: {
    label: 'A PEEK INSIDE · THE HOUSE RULES',
    text: 'Bring your curiosity and clothes you don’t mind getting a little messy. Aprons and all tools are provided. Cancel at least 48 hours before class for a full refund.',
    name: 'The house rules',
  },
};

function selectDocument(key) {
  const doc = documents[key];
  document.querySelectorAll('[data-document]').forEach(button => {
    const active = button.dataset.document === key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const preview = document.querySelector('#document-preview');
  preview.querySelector('.preview-label').textContent = doc.label;
  preview.querySelector('p').textContent = doc.text;
}

document.querySelectorAll('[data-document]').forEach(button => {
  button.addEventListener('click', () => selectDocument(button.dataset.document));
});
selectDocument('handbook');

const messages = document.querySelector('#chat-messages');
const initialMessage = messages.firstElementChild.cloneNode(true);
const form = document.querySelector('#chat-form');
const input = document.querySelector('#chat-input');
const submit = form.querySelector('button');
let pendingReply;

function answerFor(question) {
  const q = question.toLowerCase();
  if (/\b(cancel\w*|refund\w*|reschedul\w*|polic\w*)\b/.test(q)) return {
    text: 'Plans change — we get it. Cancel at least 48 hours before your class for a full refund. The sample house rules don’t specify a refund for later cancellations.', source: 'policies',
  };
  if (/\b(private|group\w*|party|parties|team)\b/.test(q)) return {
    text: 'A little clay is even better with company. Private group sessions start at $180 for up to six people. That includes your own session together.', source: 'prices',
  };
  if (/\b(price\w*|cost\w*|much|pay|payment|dollars?|fees?|expensive)\b|\$/.test(q)) return {
    text: 'Our two-hour beginner pottery class is $35 per person. Clay, tools, glazing, and firing are all included — just turn up with a little curiosity. 🌿', source: 'prices',
  };
  if (/\b(bring\w*|wear|cloth\w*|apron\w*|need|suppl\w*|tool\w*|material\w*)\b/.test(q)) return {
    text: 'Just bring your curiosity and clothes you don’t mind getting a little messy. We’ll provide an apron and all the tools. Your clay, glazing, and firing are included, too.', source: 'policies', additionalSource: 'prices',
  };
  if (/\b(open\w*|hour\w*|close\w*|monday|tuesday|wednesday|thursday|friday|saturday|today|tomorrow)\b/.test(q)) return {
    text: 'Our doors are open Tuesday to Sunday, 9 am–6 pm. We’re closed on Mondays. The beginner pottery class is on Sunday at 10 am and lasts two hours.', source: 'handbook',
  };
  if (/\b(begin\w*|class\w*|experience|first|sunday|pottery|lesson\w*|long|when|time)\b/.test(q)) return {
    text: 'You’re in the right place for a first try! The beginner pottery class starts at 10 am on Sundays and runs for two hours. All materials are included, and no experience is needed. No experience needed. 🌿', source: 'handbook',
  };
  return { text: 'I don’t have that detail in my sample documents, and I’d rather leave the guessing to the pottery wheel. Try asking about class prices, opening hours, what to bring, or cancellations.', source: null };
}

function addMessage(text, className) {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  messages.append(element);
  messages.scrollTop = messages.scrollHeight;
  return element;
}

function addSource(element, source) {
  const button = document.createElement('button');
  button.className = 'answer-source';
  button.type = 'button';
  button.textContent = `↗ Source: ${documents[source].name}`;
  button.addEventListener('click', () => {
    selectDocument(source);
    document.querySelector(`[data-document="${source}"]`).focus({ preventScroll: true });
    document.querySelector('#document-preview').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
  });
  element.append(button);
}

function ask(question) {
  const clean = question.trim().slice(0, 400);
  if (!clean || pendingReply) return;
  addMessage(clean, 'demo-user-message');
  input.value = '';
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  const typing = addMessage('Finding the right page…', 'demo-bot-message typing');
  pendingReply = setTimeout(() => {
    typing.remove();
    const answer = answerFor(clean);
    const element = addMessage(answer.text, 'demo-bot-message');
    if (answer.source) addSource(element, answer.source);
    if (answer.additionalSource) addSource(element, answer.additionalSource);
    messages.scrollTop = messages.scrollHeight;
    submit.disabled = false;
    form.removeAttribute('aria-busy');
    pendingReply = undefined;
  }, 650);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  ask(input.value);
});
document.querySelectorAll('[data-question]').forEach(button => {
  button.addEventListener('click', () => ask(button.dataset.question));
});
document.querySelector('#reset-chat').addEventListener('click', () => {
  clearTimeout(pendingReply);
  pendingReply = undefined;
  messages.replaceChildren(initialMessage.cloneNode(true));
  input.value = '';
  submit.disabled = false;
  form.removeAttribute('aria-busy');
  selectDocument('handbook');
});
