import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
// Порядок важен: сначала токены, затем сброс, который на них опирается.
import "./shared/styles/tokens.css";
import "./shared/styles/base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
