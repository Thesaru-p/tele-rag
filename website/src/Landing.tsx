import { useEffect, useRef, useState } from "react";
import { Brand, Reveal, ThemeToggle } from "./shared";
import Demo from "./Demo";

const steps = [
  {
    title: "Bring what you know.",
    text: "The handbook you keep updating. Your price list. That policy everyone asks about. Upload the documents that already explain your business.",
    detail: "PDF · DOCX · CSV · TXT · MD",
    tag: "YOUR KNOWLEDGE",
    paper: "The Sunday Studio",
    line: "Beginner class · Sundays, 10 am",
    sub: "Two hours. All materials included.",
  },
  {
    title: "Find the right passage.",
    text: "TeleRAG breaks your documents into searchable passages. When a question arrives, it retrieves the relevant information from your workspace.",
    detail: "QUESTION → RELEVANT PASSAGES",
    tag: "RETRIEVAL",
    paper: "“When is the beginner class?”",
    line: "A match in Studio handbook",
    sub: "Sunday · 10 am · two hours",
  },
  {
    title: "Make it a conversation.",
    text: "Your Telegram bot turns those passages into a useful reply, with sources. If the information is missing, it says so—and saves the question for your team.",
    detail: "GROUNDED ANSWER → TELEGRAM",
    tag: "THE ANSWER",
    paper: "See you on Sunday.",
    line: "Our beginner class starts at 10 am.",
    sub: "↳ Studio handbook",
  },
];
function Walkthrough() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      frame = 0;
      const chapters = [
        ...(root.current?.querySelectorAll<HTMLElement>("[data-step]") || []),
      ];
      const passed = chapters.filter(
        (chapter) => chapter.getBoundingClientRect().top <= innerHeight * 0.45,
      );
      setActive(Number(passed.at(-1)?.dataset.step || 0));
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="walkthrough" ref={root}>
      <div className="process-sticky">
        <div className="process-index">
          <span>FROM A FILE TO A REPLY</span>
          <span>0{active + 1} / 03</span>
        </div>
        <div className={`process-paper stage-${active}`}>
          <span className="file-label">{steps[active].tag}</span>
          <h3>{steps[active].paper}</h3>
          <div className="paper-rule" />
          <p className="highlight-line">{steps[active].line}</p>
          <p>{steps[active].sub}</p>
          <div className="paper-lines">
            <i />
            <i />
            <i />
          </div>
          <span className="paper-stamp">t.</span>
        </div>
        <div className="process-track" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={active === i ? "active" : ""} />
          ))}
        </div>
        <span className="process-caption">
          The useful part of RAG: an answer with a reason.
        </span>
      </div>
      <div className="process-steps">
        {steps.map((step, i) => (
          <section
            className={`process-step ${active === i ? "active" : ""}`}
            data-step={i}
            key={step.title}
          >
            <Reveal>
              <span className="step-number">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="eyebrow">{step.detail}</span>
            </Reveal>
          </section>
        ))}
      </div>
    </div>
  );
}
export default function Landing() {
  const progress = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    let frame = 0;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const draw = () => {
      frame = 0;
      const y = window.scrollY;
      const length = document.documentElement.scrollHeight - innerHeight;
      progress.current?.style.setProperty(
        "transform",
        `scaleX(${length > 0 ? y / length : 0})`,
      );
      hero.current?.style.setProperty(
        "--hero-shift",
        `${media.matches ? 0 : Math.min(y * 0.09, 55)}px`,
      );
      if (header.current) header.current.dataset.scrolled = String(y > 24);
    };
    const update = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    media.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      media.removeEventListener("change", update);
    };
  }, []);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="reading-progress" ref={progress} aria-hidden="true" />
      <header className="site-header" ref={header}>
        <div className="container header-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#demo">Try it out</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            <a className="button button-small" href="/workspace">
              Your workspace <span>↗</span>
            </a>
          </div>
        </div>
      </header>
      <main id="main">
        <section className="hero container" ref={hero}>
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" /> YOUR KNOWLEDGE. IN CONVERSATION.
            </div>
            <h1>
              You wrote
              <br />
              it down.
              <br />
              <em>Let it answer.</em>
            </h1>
            <p className="hero-description">
              Give your business documents a voice.
              <br className="desktop-break" /> Helpful answers on Telegram,
              grounded in
              <br className="desktop-break" /> what your team actually knows.
            </p>
            <div className="hero-actions">
              <a className="button" href="/workspace">
                Build your assistant <span>↗</span>
              </a>
              <a className="text-link" href="#demo">
                Try a conversation <span>↓</span>
              </a>
            </div>
            <div className="hero-note">
              <span>01</span> Start with a document. Keep the conversation
              going.
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="A studio handbook becomes a sourced Telegram answer"
          >
            <span className="art-caption">
              A LITTLE LESS REPEATING YOURSELF.
            </span>
            <div className="hero-paper">
              <div className="paper-topline">
                <span>SUNDAY STUDIO</span>
                <span>EST. 2024</span>
              </div>
              <h2>
                A little
                <br />
                room to
                <br />
                <em>make things.</em>
              </h2>
              <div className="pottery-illustration" aria-hidden="true">
                <div className="vase vase-one" />
                <div className="vase vase-two" />
                <div className="pottery-line" />
              </div>
              <div className="paper-bottomline">
                <span>THE STUDIO HANDBOOK</span>
                <span>01</span>
              </div>
            </div>
            <span className="art-arrow" aria-hidden="true">
              ↘
            </span>
            <div className="hero-question">
              <span>YOU ASKED</span>
              <p>Do I need to bring anything?</p>
            </div>
            <div className="hero-answer">
              <div className="answer-top">
                <span className="status-dot" /> THE SUNDAY STUDIO <span>↗</span>
              </div>
              <p>
                Just yourself, and clothes you don’t mind getting messy. We’ll
                take care of the rest.
              </p>
              <span className="hero-citation">
                ↳ Studio handbook · Sample answer
              </span>
            </div>
            <span className="art-footnote">Your words. A helpful reply.</span>
          </div>
        </section>
        <div className="format-strip">
          <div className="container">
            <span>THE FILES YOU ALREADY HAVE</span>
            <div>
              <span>PDF</span>
              <span>Word</span>
              <span>CSV</span>
              <span>Text</span>
              <span>Markdown</span>
            </div>
            <span>ONE CONNECTED CONVERSATION ↗</span>
          </div>
        </div>
        <section className="section container" id="how-it-works">
          <Reveal>
            <div className="section-topline">
              <span className="eyebrow">01 / HOW IT WORKS</span>
              <span className="small muted">
                A practical use for your paperwork.
              </span>
            </div>
            <h2 className="section-title">
              Good answers have
              <br />
              <em>somewhere to start.</em>
            </h2>
          </Reveal>
          <Walkthrough />
        </section>
        <section className="demo-section" id="demo">
          <div className="container">
            <Reveal>
              <div className="section-topline">
                <span className="eyebrow">02 / TAKE IT FOR A SPIN</span>
                <span className="small muted">
                  No account needed for this preview.
                </span>
              </div>
              <div className="section-intro">
                <h2 className="section-title">
                  Ask something.
                  <br />
                  <em>Follow the answer.</em>
                </h2>
                <p>
                  Meet The Sunday Studio, our sample pottery business. Try a
                  question, then take a look at the document behind the reply.
                </p>
              </div>
            </Reveal>
            <Reveal>
              <Demo />
            </Reveal>
          </div>
        </section>
        <section className="section container care-section">
          <Reveal className="care-title">
            <span className="eyebrow">03 / BUILT FOR THE EVERYDAY</span>
            <h2 className="section-title">
              Useful.
              <br />
              Honest.
              <br />
              <em>Yours.</em>
            </h2>
            <div className="care-symbol" aria-hidden="true">
              ↳
            </div>
          </Reveal>
          <div className="care-list">
            {[
              [
                "An answer you can check.",
                "Replies include the source documents, so you can trace the answer back to the information your team supplied.",
              ],
              [
                "Room for “I don’t know.”",
                "When a question falls outside your documents, the assistant says so. Review those questions in your workspace and fill the gaps.",
              ],
              [
                "Your business stays your business.",
                "Documents and conversations are scoped to your workspace. Update your information, test a reply, and connect your own Telegram bot.",
              ],
            ].map(([title, text], i) => (
              <Reveal key={title}>
                <article>
                  <span className="small muted">0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
        <section className="section container faq-section" id="questions">
          <Reveal>
            <span className="eyebrow">04 / A FEW GOOD QUESTIONS</span>
            <h2 className="section-title">
              Before you
              <br />
              <em>get started.</em>
            </h2>
          </Reveal>
          <div className="faq-list">
            {[
              [
                "What does RAG actually mean?",
                "Retrieval-augmented generation. TeleRAG first finds relevant passages in your documents, then uses those passages to generate a reply. It gives the model specific information to work from.",
              ],
              [
                "Do I need to train a model?",
                "No. Upload your documents and TeleRAG indexes them for retrieval. The existing language model uses the retrieved passages when it answers a question.",
              ],
              [
                "How do I connect Telegram?",
                "Create a bot with @BotFather in Telegram, then paste its token into your workspace. TeleRAG configures the webhook. A publicly reachable deployment is needed for Telegram to send messages to your app.",
              ],
              [
                "What if my documents don’t contain the answer?",
                "The assistant tells the customer it couldn’t find the information. The question appears in your workspace so you can improve your documents or follow up with your team.",
              ],
              [
                "Can I change the information later?",
                "Yes. Remove an outdated document and upload its replacement. You can test answers in the workspace before sharing your bot with customers.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing">
          <Reveal className="container closing-inner">
            <span className="eyebrow">LESS REPEATING. MORE DOING.</span>
            <h2>
              Your next good answer
              <br />
              <em>is already written.</em>
            </h2>
            <a href="/workspace" className="button">
              Put it to work <span>↗</span>
            </a>
            <p>Start with the documents you know best.</p>
          </Reveal>
        </section>
      </main>
      <footer className="container footer">
        <Brand />
        <span>From what you know, to who needs it.</span>
        <a href="#main">Back to top ↑</a>
      </footer>
    </>
  );
}
