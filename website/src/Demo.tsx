import { useEffect, useRef, useState, type FormEvent } from "react";

const documents = [
  {
    name: "Studio handbook",
    type: "handbook.md",
    text: "Our doors are open Tuesday–Sunday, 9 am–6 pm. The Sunday beginner class starts at 10 am and runs for two hours. All materials are included, and no experience is needed.",
  },
  {
    name: "Classes & prices",
    type: "prices.csv",
    text: "Beginner pottery class: $35 per person. Includes clay, tools, glazing, and firing. Private group session: $180 for up to six people.",
  },
  {
    name: "Good to know",
    type: "policies.pdf",
    text: "Wear clothes you don’t mind getting a little messy. Aprons and tools are provided. Cancel at least 48 hours before your class for a full refund.",
  },
];
export function demoAnswer(question: string) {
  if (/cancel|refund|reschedule|policy/i.test(question))
    return {
      text: "Cancel at least 48 hours before your class for a full refund. The documents don’t specify a refund for later cancellations.",
      source: 2,
    };
  if (/private|group|party|team/i.test(question))
    return {
      text: "A private group session is $180 for up to six people.",
      source: 1,
    };
  if (/price|cost|how much|pay|expensive/i.test(question))
    return {
      text: "The beginner pottery class is $35 per person, including clay, tools, glazing, and firing.",
      source: 1,
    };
  if (/bring|wear|material|tool/i.test(question))
    return {
      text: "Wear clothes you don’t mind getting messy. The studio provides aprons and tools, and all materials are included.",
      source: 2,
    };
  if (/open|hours|days|today|tomorrow/i.test(question))
    return {
      text: "The studio is open Tuesday–Sunday, 9 am–6 pm. It’s closed on Mondays.",
      source: 0,
    };
  if (/beginner|class|experience|sunday|lesson|when|time/i.test(question))
    return {
      text: "The beginner class is on Sunday at 10 am and lasts two hours. You don’t need any experience, and all materials are included.",
      source: 0,
    };
  return {
    text: "I couldn’t find that in the studio’s documents. Please contact the team directly so they can help.",
    source: null,
  };
}
type Message = {
  role: "user" | "assistant";
  text: string;
  source?: number | null;
};
const initial: Message[] = [
  {
    role: "assistant",
    text: "Hello from The Sunday Studio. Ask me about our classes, prices, or what to bring.",
  },
];
export default function Demo() {
  const [messages, setMessages] = useState(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy]);
  const ask = (value: string) => {
    const text = value.trim();
    if (!text || busy) return;
    setMessages((old) => [...old, { role: "user", text }]);
    setQuestion("");
    setBusy(true);
    timer.current = setTimeout(() => {
      setMessages((old) => [
        ...old,
        { role: "assistant", ...demoAnswer(text) },
      ]);
      setBusy(false);
    }, 650);
  };
  const reset = () => {
    clearTimeout(timer.current);
    setMessages(initial);
    setBusy(false);
    setQuestion("");
    setSource(0);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    ask(question);
  };
  return (
    <div className="demo-grid">
      <div className="demo-chat">
        <div className="panel-heading">
          <div className="studio-mark">
            S<span>↗</span>
          </div>
          <div>
            <strong>The Sunday Studio</strong>
            <span className="small muted">A sample conversation</span>
          </div>
          <button className="text-button" onClick={reset}>
            Reset
          </button>
        </div>
        <div
          className="chat-log"
          ref={log}
          role="log"
          aria-label="Demo conversation"
          aria-live="polite"
        >
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <span className="message-label">
                {message.role === "user" ? "You" : "Sunday Studio"}
              </span>
              <p>{message.text}</p>
              {message.source != null && (
                <button
                  className="source-button"
                  onClick={() => {
                    setSource(message.source!);
                    document
                      .getElementById("demo-source")
                      ?.scrollIntoView({
                        behavior: matchMedia("(prefers-reduced-motion: reduce)")
                          .matches
                          ? "instant"
                          : "smooth",
                        block: "nearest",
                      });
                  }}
                >
                  ↳ {documents[message.source].name} <span>↗</span>
                </button>
              )}
            </div>
          ))}
          {busy && (
            <div
              className="message assistant typing"
              aria-label="Finding an answer"
            >
              Finding the right passage<span>…</span>
            </div>
          )}
        </div>
        <div className="suggestions">
          {[
            "When is the beginner class?",
            "How much does it cost?",
            "Do you sell gift vouchers?",
          ].map((text) => (
            <button key={text} disabled={busy} onClick={() => ask(text)}>
              {text} ↗
            </button>
          ))}
        </div>
        <form className="chat-form" onSubmit={submit}>
          <input
            aria-label="Ask the sample studio"
            placeholder="Ask the studio a question…"
            maxLength={1000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            className="send-button"
            aria-label="Send demo question"
            disabled={busy || !question.trim()}
          >
            ↗
          </button>
        </form>
      </div>
      <aside className="demo-source" id="demo-source">
        <div className="eyebrow">THE OTHER SIDE OF THE ANSWER</div>
        <h3>
          Nothing up
          <br />
          its sleeve.
        </h3>
        <p className="muted">
          Every answer starts here. Open a source to see what the assistant
          knows.
        </p>
        <div
          className="document-tabs"
          role="group"
          aria-label="Sample documents"
        >
          {documents.map((doc, index) => (
            <button
              key={doc.name}
              aria-pressed={source === index}
              onClick={() => setSource(index)}
            >
              <span>0{index + 1}</span>
              {doc.name}
              <span>↗</span>
            </button>
          ))}
        </div>
        <div className="source-excerpt" aria-live="polite">
          <span className="file-label">{documents[source].type}</span>
          <p>{documents[source].text}</p>
          <span className="small muted">EXCERPT FROM SAMPLE DOCUMENT</span>
        </div>
        <p className="demo-disclaimer">
          This is a scripted preview. Your workspace uses your documents and the
          configured model.
        </p>
      </aside>
    </div>
  );
}
