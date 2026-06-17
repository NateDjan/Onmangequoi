import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./contexts/LanguageContext";
import "./index.css";

// Register PWA Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.warn("SW registration failed:", err));
  });
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

// Remove SSR hero shell once React takes over — avoids flash of both
const ssrShell = document.getElementById("ssr-shell");
if (ssrShell) ssrShell.remove();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <LanguageProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LanguageProvider>
    </ConvexAuthProvider>
  </StrictMode>,
);
