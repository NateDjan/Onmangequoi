import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { RouteTracker } from "./components/RouteTracker";
import { PublicLayout } from "./components/PublicLayout";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";

// ── Critical route: loaded eagerly (above-the-fold) ──────────────────────────
import { HomePage } from "./pages";

// ── Non-critical routes: lazy-loaded on first navigation ─────────────────────
const LoginPage        = lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const SignupPage        = lazy(() => import("./pages/SignupPage").then(m => ({ default: m.SignupPage })));
const HistoryPage      = lazy(() => import("./pages/HistoryPage").then(m => ({ default: m.HistoryPage })));
const RecipePage       = lazy(() => import("./pages/RecipePage").then(m => ({ default: m.RecipePage })));
const RecipesIndexPage = lazy(() => import("./pages/RecipesIndexPage").then(m => ({ default: m.RecipesIndexPage })));
const TermsPage        = lazy(() => import("./pages/TermsPage"));
const PrivacyPage      = lazy(() => import("./pages/PrivacyPage"));
const BlogPage         = lazy(() => import("./pages/BlogPage"));
const PricingPage      = lazy(() => import("./pages/PricingPage").then(m => ({ default: m.PricingPage })));
const AdminPage        = lazy(() => import("./pages/AdminPage").then(m => ({ default: m.AdminPage })));
const PlazamPage       = lazy(() => import("./pages/PlazamPage").then(m => ({ default: m.PlazamPage })));

// Minimal spinner shown while a lazy chunk loads
function PageFallback() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ opacity: 0.4, fontSize: "1.5rem" }}>⏳</span>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable={true}>
        <RouteTracker />
        <Toaster />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<PublicOnlyRoute />}>
                <Route path="/login"  element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
              </Route>
              <Route element={<ProtectedRoute />}>
                <Route path="/history" element={<HistoryPage />} />
              </Route>
            </Route>

            <Route path="/recettes"       element={<RecipesIndexPage />} />
            <Route path="/recette/:slug"  element={<RecipePage />} />
            <Route path="/blog"           element={<BlogPage />} />
            <Route path="/pricing"        element={<PricingPage />} />
            <Route path="/plazam"         element={<PlazamPage />} />
            <Route path="/terms"          element={<TermsPage />} />
            <Route path="/privacy"        element={<PrivacyPage />} />
            <Route element={<PublicLayout />}>
              <Route path="/admin"        element={<AdminPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
