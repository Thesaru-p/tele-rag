import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import {
  ApiClient,
  type AuthState,
  type Business,
  type Document,
  type Telegram,
  type Dashboard,
  type Answer,
} from "./lib/api";
import { Brand, ThemeToggle, Notice, errorMessage } from "./shared";
import {
  buildWelcomeMessage,
  welcomeMessageReady,
} from "../welcome-message.js";
import "./workspace.css";

function AuthForm({
  client,
  mode,
  onSignedIn,
}: {
  client: ApiClient;
  mode: "signedout" | "recovery";
  onSignedIn: () => void;
}) {
  const [signup, setSignup] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "recovery") {
        await client.updatePassword(password);
        onSignedIn();
      } else if (forgot) {
        await client.recover(email.trim());
        setMessage("Check your email for a password reset link.");
      } else if (await client.signIn(email.trim(), password, signup))
        onSignedIn();
      else
        setMessage(
          "Account created. Check your email to confirm it, then sign in.",
        );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="auth-form" onSubmit={submit}>
      <span className="eyebrow">YOUR WORKSPACE</span>
      <h2>
        {mode === "recovery"
          ? "A fresh start."
          : forgot
            ? "Let’s get you back in."
            : signup
              ? "Make yourself at home."
              : "Welcome back."}
      </h2>
      <p className="muted">
        {mode === "recovery"
          ? "Choose a new password for your account."
          : forgot
            ? "We’ll email you a link to reset your password."
            : signup
              ? "Bring your knowledge together in one place."
              : "Your documents, conversations, and next good answer."}
      </p>
      {mode !== "recovery" && (
        <label>
          Email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourbusiness.com"
            disabled={busy}
          />
        </label>
      )}
      {!forgot && (
        <label>
          {mode === "recovery" ? "New password" : "Password"}
          <input
            type="password"
            name="password"
            minLength={8}
            required
            autoComplete={
              signup || mode === "recovery"
                ? "new-password"
                : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            disabled={busy}
          />
        </label>
      )}
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <button className="button" disabled={busy}>
        {busy
          ? "One moment…"
          : mode === "recovery"
            ? "Save new password"
            : forgot
              ? "Send reset link"
              : signup
                ? "Create your workspace"
                : "Sign in"}
        <span>↗</span>
      </button>
      {mode !== "recovery" && (
        <div className="auth-options">
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setSignup(forgot ? false : !signup);
              setForgot(false);
              setError("");
              setMessage("");
            }}
          >
            {signup || forgot ? "Back to sign in" : "Create an account"}
          </button>
          {!signup && !forgot && (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setForgot(true);
                setError("");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
          )}
        </div>
      )}
    </form>
  );
}
function Documents({
  client,
  documents,
  refresh,
  changing,
  setChanging,
}: {
  client: ApiClient;
  documents: Document[];
  refresh: () => Promise<void>;
  changing: boolean;
  setChanging: (value: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Document | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (deleting) dialog.current?.showModal();
    else dialog.current?.close();
  }, [deleting]);
  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || changing) return;
    setError("");
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const types: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      csv: "text/csv",
      txt: "text/plain",
      md: "text/markdown",
    };
    if (!types[extension]) {
      setError("Choose a PDF, DOCX, CSV, TXT, or Markdown file.");
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setError("Choose a non-empty file smaller than 10 MB.");
      return;
    }
    setChanging(true);
    setStatus("Preparing your upload…");
    try {
      const upload = await client.api<{ path: string; signedUrl: string }>(
        "/api/documents/upload-url",
        "POST",
        { name: file.name, size: file.size, type: types[extension] },
      );
      setStatus("Uploading your document…");
      const response = await fetch(upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": types[extension], "x-upsert": "false" },
        body: file,
      });
      if (!response.ok)
        throw new Error("The file upload failed. Please try again.");
      setStatus("Finding and indexing the useful passages…");
      const result = await client.api<{ chunks: number }>(
        "/api/documents/finalize-upload",
        "POST",
        { name: file.name, path: upload.path },
      );
      setStatus(`Ready. ${result.chunks} searchable passages added.`);
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (error) {
      setStatus("");
      setError(errorMessage(error));
    } finally {
      await refresh();
      setChanging(false);
    }
  };
  const reindex = async (document: Document) => {
    setChanging(true);
    setError("");
    setStatus("Retrying document indexing…");
    try {
      await client.api(`/api/documents/${document.id}/reindex`, "POST");
      setStatus("Document is ready.");
    } catch (error) {
      setError(errorMessage(error));
      setStatus("");
    } finally {
      await refresh();
      setChanging(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setChanging(true);
    setDeleteError("");
    try {
      await client.api(`/api/documents/${deleting.id}`, "DELETE");
      setStatus(`${deleting.file_name} removed.`);
      setDeleting(null);
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      await refresh();
      setChanging(false);
    }
  };
  return (
    <section className="workspace-card" id="documents">
      <div className="card-heading">
        <div>
          <span className="eyebrow">01 / YOUR KNOWLEDGE</span>
          <h2>The source material.</h2>
        </div>
        <span className="count-pill">
          {documents.length} {documents.length === 1 ? "file" : "files"}
        </span>
      </div>
      <p className="muted">
        Add the information your assistant should know. Clear, current documents
        make better answers.
      </p>
      <form className="upload-form" onSubmit={upload}>
        <label className="file-picker">
          <span className="upload-symbol" aria-hidden="true">
            ↑
          </span>
          <strong>{file ? file.name : "Choose a document"}</strong>
          <span>PDF, DOCX, CSV, TXT, or MD · up to 10 MB</span>
          <input
            ref={input}
            type="file"
            aria-label="Choose a document"
            accept=".pdf,.docx,.csv,.txt,.md"
            disabled={changing}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError("");
            }}
          />
        </label>
        <button className="button" disabled={!file || changing}>
          {changing ? "Working…" : "Upload & index"}
          <span>↗</span>
        </button>
      </form>
      <Notice error>{error}</Notice>
      <Notice>{status}</Notice>
      <div className="document-list">
        {documents.length ? (
          documents.map((doc) => (
            <div className="document-row" key={doc.id}>
              <span className="file-icon" aria-hidden="true">
                ▤
              </span>
              <div className="document-info">
                <strong>{doc.file_name}</strong>
                <span className={`doc-status status-${doc.status}`}>
                  {doc.status === "ready"
                    ? `${doc.chunk_count} ${doc.chunk_count === 1 ? "passage" : "passages"} · Ready`
                    : doc.status === "processing"
                      ? "Indexing…"
                      : "Needs attention"}
                </span>
                {doc.error_message && (
                  <p className="small error-text">{doc.error_message}</p>
                )}
              </div>
              <div className="document-actions">
                {doc.status === "failed" && (
                  <button
                    className="text-button"
                    disabled={changing}
                    onClick={() => void reindex(doc)}
                  >
                    Retry
                  </button>
                )}
                <button
                  className="text-button danger"
                  aria-label={`Remove ${doc.file_name}`}
                  disabled={changing || doc.status === "processing"}
                  onClick={() => {
                    setDeleteError("");
                    setDeleting(doc);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="empty-state">
            A handbook, a price list, a good place to start.
            <br />
            Your documents will appear here.
          </p>
        )}
      </div>
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby="delete-title"
        onCancel={(e) => {
          if (changing) e.preventDefault();
          else setDeleting(null);
        }}
      >
        <h2 id="delete-title">Remove this document?</h2>
        <p>
          <strong>{deleting?.file_name}</strong> and its searchable passages
          will be removed. You can upload it again later.
        </p>
        <Notice error>{deleteError}</Notice>
        <div className="dialog-actions">
          <button
            className="button button-quiet"
            autoFocus
            disabled={changing}
            onClick={() => setDeleting(null)}
          >
            Keep document
          </button>
          <button
            className="button button-danger"
            disabled={changing}
            onClick={() => void remove()}
          >
            {changing ? "Removing…" : "Remove document"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
function TestChat({
  client,
  refresh,
}: {
  client: ApiClient;
  refresh: () => Promise<void>;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.api<Answer>("/api/chat", "POST", {
        question: question.trim(),
      });
      setAnswer(result);
      setAsked(question.trim());
      setQuestion("");
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="workspace-card" id="test-answer">
      <span className="eyebrow">02 / CHECK THE ANSWER</span>
      <h2>Try it before you share it.</h2>
      <p className="muted">Ask a question using your uploaded documents.</p>
      <div className="workspace-answer" aria-live="polite">
        {answer ? (
          <>
            <span className="message-label">YOU ASKED</span>
            <p className="asked-question">{asked}</p>
            <span className="message-label">
              {answer.supported
                ? "FROM YOUR DOCUMENTS"
                : "A GAP IN YOUR KNOWLEDGE"}
            </span>
            <p>{answer.answer}</p>
            <div className="answer-sources">
              {answer.sources.map((source) => (
                <span key={source}>↳ {source}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="answer-placeholder">
            <span aria-hidden="true">“</span>
            <p>A good question is a good start.</p>
            <small>Your answer and its sources will appear here.</small>
          </div>
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          aria-label="Test a question"
          maxLength={1000}
          required
          placeholder="What would a customer ask?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          className="send-button"
          disabled={busy || !question.trim()}
          aria-label="Send test question"
        >
          {busy ? "…" : "↗"}
        </button>
      </form>
      <Notice error>{error}</Notice>
      {busy && <Notice>Looking through your documents…</Notice>}
    </section>
  );
}
function TelegramSettings({
  client,
  connection,
  refresh,
  business,
  documents,
  changing,
}: {
  client: ApiClient;
  connection?: Telegram;
  refresh: () => Promise<void>;
  business?: Business;
  documents: Document[];
  changing: boolean;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const welcomeRef = useRef<HTMLTextAreaElement>(null);
  const welcome =
    business &&
    welcomeMessageReady(connection?.connected, documents) &&
    !changing
      ? buildWelcomeMessage({
          businessName: business.name,
          botUsername: connection?.username,
          documents,
        })
      : "";
  useEffect(() => setCopied(""), [welcome]);
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await client.api("/api/telegram", "POST", { token: token.trim() });
      setToken("");
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      await client.api("/api/telegram", "DELETE");
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(welcome);
      setCopied("Copied. Ready to paste.");
    } catch {
      welcomeRef.current?.focus();
      welcomeRef.current?.select();
      setCopied("Select the paragraph and press Ctrl+C (⌘C on Mac) to copy.");
    }
  };
  return (
    <section className="workspace-card" id="telegram">
      <span className="eyebrow">03 / MAKE THE CONNECTION</span>
      <h2>Meet them on Telegram.</h2>
      {connection?.connected ? (
        <div className="connected-bot">
          <span className="status-dot" />
          <div>
            <strong>Connected to @{connection.username}</strong>
            <a
              href={`https://t.me/${connection.username}`}
              target="_blank"
              rel="noreferrer"
            >
              Open your bot ↗
            </a>
          </div>
          <button
            className="text-button danger"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? "Working…" : "Disconnect"}
          </button>
        </div>
      ) : (
        <>
          <p className="muted">
            Create a bot with{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
              @BotFather
            </a>
            , then add its token here. Your app needs a public URL to receive
            Telegram messages.
          </p>
          <form onSubmit={connect} className="inline-form">
            <label>
              Telegram bot token
              <input
                type="password"
                autoComplete="off"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456:your-bot-token"
                disabled={busy || !connection}
              />
            </label>
            <button
              className="button"
              disabled={busy || !token.trim() || !connection}
            >
              {busy ? "Connecting…" : "Connect bot"}
              <span>↗</span>
            </button>
          </form>
        </>
      )}
      <Notice error>{error}</Notice>
      {welcome && (
        <div className="welcome-preview">
          <div className="card-heading">
            <h3>A proper introduction.</h3>
            <button className="text-button" onClick={() => void copy()}>
              Copy message ↗
            </button>
          </div>
          <p className="small muted">
            Your bot uses this greeting when someone sends /start.
          </p>
          <textarea
            ref={welcomeRef}
            aria-label="Bot welcome message"
            value={welcome}
            readOnly
            rows={5}
          />
          <Notice>{copied}</Notice>
        </div>
      )}
    </section>
  );
}
function BusinessSettings({
  client,
  business,
  refresh,
}: {
  client: ApiClient;
  business?: Business;
  refresh: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setName(business?.name || "");
  }, [business?.name]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await client.api("/api/business", "PATCH", { name: name.trim() });
      await refresh();
      setMessage("Business name saved.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="workspace-card business-settings">
      <span className="eyebrow">THE NAME BEHIND THE ANSWERS</span>
      <h2>Make it yours.</h2>
      <form onSubmit={save} className="inline-form">
        <label>
          Business name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!business || busy}
          />
        </label>
        <button
          className="button button-quiet"
          disabled={!business || busy || !name.trim()}
        >
          {busy ? "Saving…" : "Save name"}
        </button>
      </form>
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
    </section>
  );
}
function Activity({
  client,
  dashboard,
  refresh,
}: {
  client: ApiClient;
  dashboard?: Dashboard;
  refresh: () => Promise<void>;
}) {
  const [resolving, setResolving] = useState("");
  const [error, setError] = useState("");
  const resolve = async (id: string) => {
    setResolving(id);
    setError("");
    try {
      await client.api(`/api/unanswered/${id}`, "DELETE");
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setResolving("");
    }
  };
  return (
    <div className="workspace-grid activity-grid">
      <section className="workspace-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">KEEP LEARNING</span>
            <h2>The unanswered questions.</h2>
          </div>
          <span className="count-pill">
            {dashboard?.unanswered.length ?? "—"}
          </span>
        </div>
        <p className="muted">
          A useful place to find what’s missing. Update your documents, then
          mark a question as reviewed.
        </p>
        <Notice error>{error}</Notice>
        {!dashboard ? (
          <p className="empty-state">
            Activity is unavailable. Try refreshing the workspace.
          </p>
        ) : dashboard.unanswered.length ? (
          <ul className="question-list">
            {dashboard.unanswered.map((item) => (
              <li key={item.id}>
                <p>{item.question}</p>
                <button
                  className="text-button"
                  disabled={!!resolving}
                  onClick={() => void resolve(item.id)}
                >
                  {resolving === item.id ? "Saving…" : "Mark reviewed ✓"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">
            No unanswered questions.
            <br />
            You’re up to date.
          </p>
        )}
      </section>
      <section className="workspace-card">
        <span className="eyebrow">THE CONVERSATION CONTINUES</span>
        <h2>Recent conversations.</h2>
        <div className="history-list">
          {!dashboard ? (
            <p className="empty-state">Conversation history is unavailable.</p>
          ) : dashboard.conversations.length ? (
            [...dashboard.conversations].reverse().map((message) => (
              <article
                key={message.id}
                className={`history-message ${message.role}`}
              >
                <div>
                  <span className="message-label">
                    {message.role === "user" ? "CUSTOMER" : "ASSISTANT"}
                  </span>
                  <time dateTime={message.created_at}>
                    {new Date(message.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <p>{message.content}</p>
                {message.sources?.map((source) => (
                  <span className="small muted" key={source}>
                    ↳ {source}
                  </span>
                ))}
              </article>
            ))
          ) : (
            <p className="empty-state">
              The first conversation is still to come.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
function WorkspaceBody({ client }: { client: ApiClient }) {
  const [business, setBusiness] = useState<Business>();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [telegram, setTelegram] = useState<Telegram>();
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    const results = await Promise.allSettled([
      client.api<Business>("/api/business"),
      client.api<Document[]>("/api/documents"),
      client.api<Telegram>("/api/telegram"),
      client.api<Dashboard>("/api/dashboard"),
    ] as const);
    if (current !== version.current) return;
    const [b, d, t, a] = results;
    if (b.status === "fulfilled") setBusiness(b.value);
    if (d.status === "fulfilled") setDocuments(d.value);
    if (t.status === "fulfilled") setTelegram(t.value);
    if (a.status === "fulfilled") setDashboard(a.value);
    setErrors(
      results.flatMap((result, i) =>
        result.status === "rejected"
          ? [
              `${["Business", "Documents", "Telegram", "Activity"][i]}: ${errorMessage(result.reason)}`,
            ]
          : [],
      ),
    );
    setLoading(false);
  }, [client]);
  useEffect(() => {
    void refresh();
    return () => {
      version.current++;
    };
  }, [refresh]);
  useEffect(() => {
    if (!documents.some((doc) => doc.status === "processing")) return;
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [documents, refresh]);
  return (
    <main className="container workspace-main" id="main">
      <div className="workspace-intro">
        <div>
          <span className="eyebrow">A HOME FOR WHAT YOU KNOW</span>
          <h1>
            {business?.name || "Your workspace"}
            <em>.</em>
          </h1>
          <p className="muted">
            Keep the knowledge current. Let the conversations follow.
          </p>
        </div>
        <button
          className="text-button"
          disabled={loading || changing}
          onClick={() => void refresh()}
        >
          {loading ? "Refreshing…" : "Refresh workspace ↻"}
        </button>
      </div>
      {errors.length > 0 && (
        <div className="workspace-errors" role="alert">
          <strong>Some information couldn’t be loaded.</strong>
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
          <p>Check your configuration and database migrations, then refresh.</p>
        </div>
      )}
      <div className="stats-row">
        {[
          ["Documents ready", dashboard?.readyDocuments],
          ["Searchable passages", dashboard?.chunks],
          [
            "Questions this month",
            dashboard
              ? `${dashboard.usage.used} / ${dashboard.usage.limit}`
              : undefined,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
        <a href="#telegram">
          <span>Telegram</span>
          <strong className="stat-connection">
            {telegram
              ? telegram.connected
                ? "Connected ↗"
                : "Connect your bot ↗"
              : "—"}
          </strong>
        </a>
      </div>
      <div className="workspace-grid">
        <Documents
          client={client}
          documents={documents}
          refresh={refresh}
          changing={changing}
          setChanging={setChanging}
        />
        <TestChat client={client} refresh={refresh} />
      </div>
      <div className="workspace-grid settings-grid">
        <TelegramSettings
          client={client}
          connection={telegram}
          refresh={refresh}
          business={business}
          documents={documents}
          changing={changing}
        />
        <BusinessSettings
          client={client}
          business={business}
          refresh={refresh}
        />
      </div>
      <Activity client={client} dashboard={dashboard} refresh={refresh} />
      <footer className="workspace-footer">
        <span>Good answers start with good information.</span>
        <a href="/">Back to TeleRAG ↗</a>
      </footer>
    </main>
  );
}
export default function Workspace() {
  const [mode, setMode] = useState<AuthState>("loading");
  const [error, setError] = useState("");
  const [client] = useState(
    () =>
      new ApiClient(() => {
        setMode("signedout");
        setError("Your session has expired. Sign in again.");
      }),
  );
  useEffect(() => {
    let cancelled = false;
    client
      .initialize()
      .then((state) => {
        if (!cancelled) setMode(state);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(errorMessage(error));
          setMode("signedout");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
  useEffect(() => {
    if (mode !== "loading") window.scrollTo({ top: 0, behavior: "instant" });
  }, [mode]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header workspace-header">
        <div className="container header-inner">
          <Brand />
          <span className="workspace-label">THE WORKSPACE</span>
          <div className="header-actions">
            <ThemeToggle />
            {mode === "signedin" || mode === "recovery" ? (
              <button
                className="text-button"
                onClick={() => {
                  client.signOut();
                  setMode("signedout");
                  setError("");
                }}
              >
                Sign out ↗
              </button>
            ) : (
              <a className="text-link" href="/">
                Back to the site ↗
              </a>
            )}
          </div>
        </div>
      </header>
      {mode === "loading" ? (
        <main className="loading-page" id="main" role="status">
          Opening your workspace…
        </main>
      ) : mode === "signedin" ? (
        <WorkspaceBody client={client} />
      ) : (
        <main className="container auth-layout" id="main">
          <div className="auth-story">
            <span className="eyebrow">LESS REPEATING. MORE DOING.</span>
            <h1>
              All that
              <br />
              you know.
              <br />
              <em>Put to work.</em>
            </h1>
            <p>
              Your documents become helpful answers.
              <br />
              Your team gets a little room to breathe.
            </p>
            <div className="auth-note">
              <span>↳</span>
              <div>
                <strong>Start small.</strong>
                <p>
                  One useful document.
                  <br />
                  One good question.
                  <br />A better conversation.
                </p>
              </div>
            </div>
          </div>
          <div className="auth-card">
            <Notice error>{error}</Notice>
            <AuthForm
              client={client}
              mode={mode}
              onSignedIn={() => {
                setError("");
                setMode("signedin");
              }}
            />
            <p className="auth-footnote">
              Your information stays in your business workspace.
            </p>
          </div>
        </main>
      )}
    </>
  );
}
