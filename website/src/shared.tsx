import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      try {
        const saved = localStorage.getItem("telerag-theme");
        setTheme(
          saved === "dark" || (saved !== "light" && media.matches)
            ? "dark"
            : "light",
        );
      } catch {
        setTheme(media.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#171c18" : "#f4f1e9");
  }, [theme]);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    try {
      localStorage.setItem("telerag-theme", next);
    } catch {
      /* Theme still works for this visit. */
    }
  };
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    >
      <span aria-hidden="true">{theme === "light" ? "◐" : "☼"}</span>
    </button>
  );
}
export function Brand() {
  return (
    <a className="brand" href="/" aria-label="TeleRAG home">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 14 28 4 20 28l-6-10-11-4Zm11 4L28 4" />
      </svg>
      TeleRAG
    </a>
  );
}
export function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || !("IntersectionObserver" in window)) return;
    el.dataset.reveal = "waiting";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.dataset.reveal = "visible";
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    const finish = () => {
      if (media.matches) {
        el.dataset.reveal = "visible";
        observer.disconnect();
      }
    };
    observer.observe(el);
    media.addEventListener("change", finish);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", finish);
      delete el.dataset.reveal;
    };
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children?: ReactNode;
  error?: boolean;
}) {
  return children ? (
    <p
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  ) : null;
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
