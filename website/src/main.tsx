import { StrictMode, Suspense, lazy, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./shared";
import "./styles.css";

const Landing = lazy(() => import("./Landing"));
const Workspace = lazy(() => import("./Workspace"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="error-page">
        <h1>Let’s try that again.</h1>
        <p>The page couldn’t finish loading.</p>
        <button className="button" onClick={() => location.reload()}>
          Reload page
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <Suspense
          fallback={
            <div className="loading-page" role="status">
              Opening TeleRAG…
            </div>
          }
        >
          {document.body.dataset.page === "workspace" ? (
            <Workspace />
          ) : (
            <Landing />
          )}
        </Suspense>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
