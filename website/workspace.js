import { buildWelcomeMessage, welcomeMessageReady } from './welcome-message.js';
import { createSessionManager } from './session.js';

const authPanel = document.querySelector('#auth-panel');
const workspacePanel = document.querySelector('#workspace-panel');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const toggleAuth = document.querySelector('#toggle-auth');
const authSubmit = document.querySelector('#auth-submit');
let config;
let creatingAccount = false;
let workspaceBusiness = null;
let workspaceDocuments = [];
let telegramConnection = null;
let documentsChanging = false;
let recoveryMode = false;
const sessions = createSessionManager({ storage: sessionStorage, request: authRequest, onExpired: () => { showLogin(); status(authMessage, 'Your session has expired. Sign in again.', true); } });

function updateWelcomeMessage() {
  const panel = document.querySelector('#welcome-panel');
  const message = document.querySelector('#welcome-message');
  panel.hidden = documentsChanging || !workspaceBusiness || !welcomeMessageReady(telegramConnection?.connected, workspaceDocuments);
  const text = panel.hidden ? '' : buildWelcomeMessage({
    businessName: workspaceBusiness.name,
    botUsername: telegramConnection.username,
    documents: workspaceDocuments,
  });
  if (message.value !== text) {
    message.value = text;
    status(document.querySelector('#welcome-copy-status'), '');
  }
}

document.querySelector('#copy-welcome').addEventListener('click', async event => {
  const message = document.querySelector('#welcome-message');
  const feedback = document.querySelector('#welcome-copy-status');
  if (!message.value) return;
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(message.value);
    status(feedback, 'Copied. Your welcome message is ready to paste.');
  } catch {
    message.focus();
    message.select();
    status(feedback, 'Select the paragraph and copy it, or press Ctrl+C (⌘C on Mac).');
  } finally {
    button.disabled = false;
  }
});

function status(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}

async function loadConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Could not load application settings.');
  config = await response.json();
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
  const token = await sessions.accessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  let response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    headers.set('Authorization', `Bearer ${await sessions.accessToken(true)}`);
    response = await fetch(path, { ...options, headers });
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed.');
  return data;
}

function showLogin() {
  recoveryMode = false;
  document.querySelector('#recovery-panel').hidden = true;
  workspaceBusiness = null;
  workspaceDocuments = [];
  telegramConnection = null;
  updateWelcomeMessage();
  authPanel.hidden = false;
  workspacePanel.hidden = true;
  document.querySelector('#answer-box').textContent = 'Your answer will appear here, along with its source document.';
  document.querySelector('#source-list').replaceChildren();
  document.querySelector('#conversation-list').replaceChildren();
  document.querySelector('#unanswered-list').replaceChildren();
}

function showWorkspace() {
  document.querySelector('#recovery-panel').hidden = true;
  authPanel.hidden = true;
  workspacePanel.hidden = false;
  loadWorkspace().catch(error => status(document.querySelector('#upload-message'), error.message, true));
}

toggleAuth.addEventListener('click', () => {
  creatingAccount = !creatingAccount;
  authSubmit.innerHTML = creatingAccount ? 'Create your workspace <span>↗</span>' : 'Sign in to your workspace <span>↗</span>';
  document.querySelector('#auth-title').textContent = creatingAccount ? 'Make yourself at home.' : 'Welcome back.';
  document.querySelector('#auth-description').textContent = creatingAccount ? 'Create an account to bring your knowledge together.' : 'Sign in and pick up where you left off.';
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
    sessions.save(data);
    status(authMessage, '');
    showWorkspace();
  } catch (error) {
    status(authMessage, error.message, true);
  } finally {
    authSubmit.disabled = false;
  }
});

async function loadWorkspace() {
  workspaceDocuments = [];
  updateWelcomeMessage();
  const business = await api('/api/business');
  workspaceBusiness = business;
  document.querySelector('#business-name').textContent = business.name;
  if (document.activeElement !== document.querySelector('#business-name-input')) document.querySelector('#business-name-input').value = business.name;
  await loadTelegramStatus();
  const docs = await api('/api/documents');
  workspaceDocuments = docs;
  updateWelcomeMessage();
  const list = document.querySelector('#document-list');
  list.replaceChildren();
  for (const doc of docs) {
    const item = document.createElement('li');
    item.className = 'document-item';
    const name = document.createElement('span');
    name.textContent = doc.file_name;
    const state = document.createElement('small');
    state.textContent = doc.status === 'ready' ? `Ready · ${doc.chunk_count} chunks` : doc.status;
    item.append(name, state);
    if (doc.error_message) {
      const detail = document.createElement('p');
      detail.className = 'document-error';
      detail.textContent = doc.error_message;
      item.append(detail);
    }
    if (doc.status === 'failed') {
      const retry = document.createElement('button');
      retry.className = 'reindex-button';
      retry.type = 'button';
      retry.textContent = 'Retry indexing';
      retry.addEventListener('click', async () => {
        retry.disabled = true;
        documentsChanging = true;
        updateWelcomeMessage();
        status(document.querySelector('#upload-message'), `Retrying indexing for ${doc.file_name}…`);
        try {
          const result = await api(`/api/documents/${encodeURIComponent(doc.id)}/reindex`, { method: 'POST' });
          status(document.querySelector('#upload-message'), `Indexed ${result.chunks} text chunks from ${result.name}.`);
          await loadWorkspace();
        } catch (error) {
          status(document.querySelector('#upload-message'), error.message, true);
          retry.disabled = false;
        } finally {
          documentsChanging = false;
          updateWelcomeMessage();
        }
      });
      item.append(retry);
    }
    if (doc.status !== 'processing') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'reindex-button danger-button';
      remove.textContent = 'Delete document';
      remove.setAttribute('aria-label', `Delete ${doc.file_name}`);
      remove.addEventListener('click', () => {
        const dialog = document.querySelector('#delete-document-dialog');
        document.querySelector('#delete-document-name').textContent = doc.file_name;
        const confirm = document.querySelector('#confirm-delete-document');
        confirm.onclick = async () => {
          confirm.disabled = true;
          remove.disabled = true;
          documentsChanging = true;
          updateWelcomeMessage();
          try {
            await api(`/api/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
            status(document.querySelector('#upload-message'), `Deleted ${doc.file_name} and its indexed passages.`);
            dialog.close();
            await loadWorkspace();
          } catch (error) {
            status(document.querySelector('#delete-message'), error.message, true);
          } finally {
            documentsChanging = false;
            updateWelcomeMessage();
            confirm.disabled = false;
            remove.disabled = false;
          }
        };
        status(document.querySelector('#delete-message'), '');
        dialog.showModal();
      });
      item.append(remove);
    }
    list.append(item);
  }
  if (!docs.length) {
    const empty = document.createElement('li');
    empty.className = 'document-item';
    empty.textContent = 'No documents yet. Upload one to get started.';
    list.append(empty);
  }
  await loadDashboard();
}

async function loadDashboard() {
  const feedback = document.querySelector('#dashboard-message');
  try {
    const data = await api('/api/dashboard');
    document.querySelector('#stat-documents').textContent = `${data.readyDocuments} / ${data.documents}`;
    document.querySelector('#stat-chunks').textContent = data.chunks.toLocaleString();
    document.querySelector('#stat-usage').textContent = `${data.usage.used} / ${data.usage.limit.toLocaleString()}`;
    document.querySelector('#stat-unanswered').textContent = data.unanswered.length === 100 ? '100+' : data.unanswered.length;
    document.querySelector('#usage-month').textContent = `Questions · ${data.usage.month} UTC`;
    document.querySelector('#readiness-status').textContent = !data.documents ? 'Start by uploading a document below.' : data.readyDocuments !== data.documents ? 'Some documents need attention. Check their status below.' : telegramConnection?.connected ? 'Your knowledge base and Telegram bot are ready.' : 'Your knowledge base is ready. Ask a question here or connect Telegram below.';
    const unanswered = document.querySelector('#unanswered-list');
    unanswered.replaceChildren();
    for (const question of data.unanswered) {
      const row = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = question.question;
      const resolve = document.createElement('button');
      resolve.className = 'plain-button';
      resolve.type = 'button';
      resolve.textContent = 'Mark reviewed';
      resolve.addEventListener('click', async () => {
        resolve.disabled = true;
        try { await api(`/api/unanswered/${question.id}`, { method: 'DELETE' }); await loadDashboard(); }
        catch (error) { status(feedback, error.message, true); resolve.disabled = false; }
      });
      row.append(text, resolve);
      unanswered.append(row);
    }
    if (!data.unanswered.length) unanswered.textContent = 'No unanswered questions yet. Knowledge gaps will appear here.';
    const conversations = document.querySelector('#conversation-list');
    conversations.replaceChildren();
    for (const message of [...data.conversations].reverse()) {
      const row = document.createElement('li');
      row.className = `history-message history-${message.role}`;
      const label = document.createElement('strong');
      label.textContent = `${message.role === 'user' ? 'Customer' : 'Assistant'} · ${message.chat_id.startsWith('telegram:') ? 'Telegram' : 'Workspace'}`;
      const time = document.createElement('time');
      time.dateTime = message.created_at;
      time.textContent = new Date(message.created_at).toLocaleString();
      const text = document.createElement('p');
      text.textContent = message.content;
      row.append(label, time, text);
      if (message.sources?.length) {
        const sources = document.createElement('small');
        sources.textContent = `Sources: ${message.sources.join(', ')}`;
        row.append(sources);
      }
      conversations.append(row);
    }
    if (!data.conversations.length) conversations.textContent = 'Your latest conversations will appear here.';
    status(feedback, '');
  } catch (error) { status(feedback, error.message, true); }
}

document.querySelector('#business-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    workspaceBusiness = await api('/api/business', { method: 'PATCH', body: JSON.stringify({ name: document.querySelector('#business-name-input').value }) });
    document.querySelector('#business-name').textContent = workspaceBusiness.name;
    updateWelcomeMessage();
    status(document.querySelector('#settings-message'), 'Business name saved. Your bot greeting has been updated.');
  } catch (error) { status(document.querySelector('#settings-message'), error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector('#refresh-dashboard').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try { await loadWorkspace(); }
  catch (error) { status(document.querySelector('#dashboard-message'), error.message, true); }
  finally { button.disabled = false; }
});

async function loadTelegramStatus() {
  const label = document.querySelector('#telegram-status');
  const disconnect = document.querySelector('#telegram-disconnect');
  const form = document.querySelector('#telegram-form');
  try {
    const state = await api('/api/telegram');
    telegramConnection = state;
    updateWelcomeMessage();
    status(label, state.connected ? `Connected as @${state.username}.` : 'No Telegram bot connected.');
    disconnect.hidden = !state.connected;
    form.hidden = state.connected;
  } catch (error) {
    telegramConnection = null;
    updateWelcomeMessage();
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
    await loadDashboard();
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
    await loadDashboard();
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
  const types = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown' };
  const type = types[file.name.split('.').at(-1).toLowerCase()];
  if (!type) return status(message, 'Choose a PDF, DOCX, CSV, TXT, or Markdown file.', true);
  if (!file.size || file.size > 10 * 1024 * 1024) return status(message, 'Choose a nonempty file no larger than 10 MiB.', true);
  const form = event.currentTarget;
  form.querySelector('button').disabled = true;
  documentsChanging = true;
  updateWelcomeMessage();
  status(message, 'Preparing a secure direct upload…');
  try {
    const upload = await api('/api/documents/upload-url', {
      method: 'POST', body: JSON.stringify({ name: file.name, size: file.size, type: file.type }),
    });
    status(message, 'Uploading your file directly to private Supabase storage…');
    const uploaded = await fetch(upload.signedUrl, {
      method: 'PUT', headers: { 'Content-Type': type, 'x-upsert': 'false' }, body: file,
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
    document.querySelector('.file-picker-copy strong').textContent = 'Choose a document';
  } catch (error) {
    status(message, error.message, true);
  } finally {
    await loadWorkspace().catch(() => { workspaceDocuments = []; });
    documentsChanging = false;
    updateWelcomeMessage();
    form.querySelector('button').disabled = false;
  }
});

document.querySelector('#file-input').addEventListener('change', event => {
  document.querySelector('.file-picker-copy strong').textContent = event.currentTarget.files[0]?.name || 'Choose a document';
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
    await loadDashboard();
  } catch (error) {
    answerBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#sign-out').addEventListener('click', () => {
  const token = sessions.read()?.access_token;
  if (token) fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` } }).catch(() => {});
  sessions.clear();
  showLogin();
});

document.querySelector('#forgot-password').addEventListener('click', async event => {
  const email = document.querySelector('#email');
  if (!email.reportValidity() || !email.value.trim()) { status(authMessage, 'Enter your email address first.', true); return; }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await authRequest(`recover?redirect_to=${encodeURIComponent(`${location.origin}/workspace`)}`, { email: email.value.trim() });
    status(authMessage, 'If an account exists for this address, a password reset link is on its way.');
  } catch (error) { status(authMessage, error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector('#recovery-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const token = await sessions.accessToken();
    const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, { method: 'PUT', headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.querySelector('#new-password').value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || 'Could not update your password. Request a new reset link.');
    recoveryMode = false;
    document.querySelector('#recovery-panel').hidden = true;
    document.querySelector('#new-password').value = '';
    showWorkspace();
  } catch (error) { status(document.querySelector('#recovery-message'), error.message, true); }
  finally { button.disabled = false; }
});

async function initialize() {
  await loadConfig();
  const callback = new URLSearchParams(location.hash.slice(1));
  if (callback.has('error_description')) {
    history.replaceState(null, '', location.pathname);
    showLogin();
    status(authMessage, callback.get('error_description').replace(/\+/g, ' '), true);
    return;
  }
  if (callback.has('access_token')) {
    const token = callback.get('access_token');
    history.replaceState(null, '', location.pathname);
    const verified = await fetch(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` } });
    if (!verified.ok) throw new Error('This sign-in link is invalid or expired. Request a new link.');
    sessions.save({ access_token: token, refresh_token: callback.get('refresh_token'), expires_in: Number(callback.get('expires_in')) || 3600 });
    if (callback.get('type') === 'recovery') {
      recoveryMode = true;
      authPanel.hidden = true;
      workspacePanel.hidden = true;
      document.querySelector('#recovery-panel').hidden = false;
      return;
    }
  }
  if (sessions.read()?.access_token) { await sessions.accessToken(); showWorkspace(); }
  else showLogin();
}
initialize().catch(error => { if (!recoveryMode) showLogin(); status(authMessage, error.message, true); });
