import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "../geometry/motifs";
import { App } from "./App";
import { bootstrap } from "./bootstrap";

bootstrap().then((store) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>,
  );
});
