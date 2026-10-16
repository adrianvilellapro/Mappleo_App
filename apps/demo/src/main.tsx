import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "../../windows/src/renderer/styles.css";
import "./styles.css";
import { App } from "./App";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="welcome">
        <h1>Mappleo demo</h1>
        <p>La demo no ha podido abrirse. / The demo could not open.</p>
        <button
          className="button"
          onClick={() => {
            try {
              for (const lang of ["es", "en"])
                sessionStorage.removeItem(`mappleo-portfolio-demo-v1-${lang}`);
            } catch {
              /* Storage can be disabled. */
            }
            location.reload();
          }}
        >
          Reiniciar demo / Reset demo
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
