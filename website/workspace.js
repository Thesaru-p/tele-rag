const authPanel = document.querySelector('#auth-panel');
const workspacePanel = document.querySelector('#workspace-panel');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const toggleAuth = document.querySelector('#toggle-auth');
const authSubmit = document.querySelector('#auth-submit');
const sessionKey = 'telerag-session';
let config;
let creatingAccount = false;

function status(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

async function loadConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Could not load application settings.');
  config = await response.json();
}

function session() {
  try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); }
  catch { return null; }
}

async function authRequest(path, body) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Authentication failed.');
  return data;
}

async function api(path, options = {}) {
  const current = session();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${current.access_token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

function showLogin() {
  authPanel.hidden = false;
  workspacePanel.hidden = true;
}

function showWorkspace() {
  authPanel.hidden = true;
  workspacePanel.hidden = false;
  loadWorkspace().catch(error => status(document.querySelector('#upload-message'), error.message, true));
}

toggleAuth.addEventListener('click', () => {
  creatingAccount = !creatingAccount;
  authSubmit.innerHTML = creatingAccount ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
  toggleAuth.textContent = creatingAccount ? 'I already have an account' : 'Create an account';
  document.querySelector('#password').autocomplete = creatingAccount ? 'new-password' : 'current-password';
  status(authMessage, '');
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  authSubmit.disabled = true;
  status(authMessage, creatingAccount ? 'Creating your account…' : 'Signing in…');
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  try {
    const data = await authRequest(creatingAccount ? 'signup' : 'token?grant_type=password', { email, password });
    if (!data.access_token) {
      status(authMessage, 'Account created. Check your email to confirm it, then sign in.');
      return;
    }
    sessionStorage.setItem(sessionKey, JSON.stringify(data));
    status(authMessage, '');
    showWorkspace();
  } catch (error) {
    status(authMessage, error.message, true);
  } finally {
    authSubmit.disabled = false;
  }
});

async function loadWorkspace() {
  const business = await api('/api/business');
  document.querySelector('#business-name').textContent = business.name;
  await loadTelegramStatus();
  const docs = await api('/api/documents');
  const list = document.querySelector('#document-list');
  list.replaceChildren();
  for (const doc of docs) {
    const item = document.createElement('li');
    item.className = 'document-item';
    const name = document.createElement('span');
    name.textContent = doc.file_name;
    const state = document.createElement('small');
    state.textContent = doc.status;
    item.append(name, state);
    if (doc.status === 'failed') {
      const retry = document.createElement('button');
      retry.className = 'reindex-button';
      retry.type = 'button';
      retry.textContent = 'Retry indexing';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        status(document.querySelector('#upload-message'), `Retrying indexing for ${doc.file_name}…`);
        try {
          const result = await api(`/api/documents/${encodeURIComponent(doc.id)}/reindex`, { method: 'POST' });
          status(document.querySelector('#upload-message'), `Indexed ${result.chunks} text chunks from ${result.name}.`);
          await loadWorkspace();
        } catch (error) {
          status(document.querySelector('#upload-message'), error.message, true);
          retry.disabled = false;
        }
      });
      item.append(retry);
    }
    list.append(item);
  }
  if (!docs.length) {
    const empty = document.createElement('li');
    empty.className = 'document-item';
    empty.textContent = 'No documents yet. Upload one to get started.';
    list.append(empty);
  }
}

async function loadTelegramStatus() {
  const label = document.querySelector('#telegram-status');
  const disconnect = document.querySelector('#telegram-disconnect');
  const form = document.querySelector('#telegram-form');
  try {
    const state = await api('/api/telegram');
    status(label, state.connected ? `Connected as @${state.username}.` : 'No Telegram bot connected.');
    disconnect.hidden = !state.connected;
    form.hidden = state.connected;
  } catch (error) {
    status(label, error.message, true);
  }
}

document.querySelector('#telegram-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.querySelector('#telegram-token');
  const button = document.querySelector('#telegram-connect');
  button.disabled = true;
  status(document.querySelector('#telegram-status'), 'Verifying bot and configuring its webhook…');
  try {
    await api('/api/telegram', { method: 'POST', body: JSON.stringify({ token: input.value }) });
    input.value = '';
    await loadTelegramStatus();
  } catch (error) {
    status(document.querySelector('#telegram-status'), error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#telegram-disconnect').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api('/api/telegram', { method: 'DELETE' });
    await loadTelegramStatus();
  } catch (error) {
    status(document.querySelector('#telegram-status'), error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#file-input');
  const file = input.files[0];
  if (!file) return;
  const message = document.querySelector('#upload-message');
  if (file.size > 10 * 1024 * 1024) return status(message, 'Choose a file no larger than 10 MiB.', true);
  const form = event.currentTarget;
  form.querySelector('button').disabled = true;
  status(message, 'Preparing a secure direct upload…');
  try {
    const upload = await api('/api/documents/upload-url', {
      method: 'POST', body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
    });
    status(message, 'Uploading your file directly to private Supabase storage…');
    const uploaded = await fetch(upload.signedUrl, {
      method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file,
    });
    if (!uploaded.ok) {
      const detail = await uploaded.json().catch(() => ({}));
      throw new Error(detail.message || detail.error || `Supabase upload failed (${uploaded.status}).`);
    }
    status(message, 'Upload complete. Extracting text and creating search embeddings…');
    const data = await api('/api/documents/finalize-upload', {
      method: 'POST', body: JSON.stringify({ name: file.name, path: upload.path }),
    });
    status(message, `Indexed ${data.chunks} text chunks from ${data.name}.`);
    input.value = '';
    await loadWorkspace();
  } catch (error) {
    status(message, error.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
});

document.querySelector('#question-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const question = document.querySelector('#question-input');
  const answerBox = document.querySelector('#answer-box');
  const sources = document.querySelector('#source-list');
  const button = form.querySelector('button');
  button.disabled = true;
  answerBox.textContent = 'Searching your documents…';
  sources.replaceChildren();
  try {
    const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ question: question.value }) });
    answerBox.textContent = data.answer;
    for (const source of data.sources) {
      const item = document.createElement('li');
      item.className = 'source-item';
      item.textContent = `Source: ${source}`;
      sources.append(item);
    }
    question.value = '';
  } catch (error) {
    answerBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#sign-out').addEventListener('click', () => {
  sessionStorage.removeItem(sessionKey);
  showLogin();
});

loadConfig().then(() => session()?.access_token ? showWorkspace() : showLogin()).catch(error => status(authMessage, error.message, true));
