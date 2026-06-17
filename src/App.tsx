import { Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { RouteTracker } from "./components/RouteTracker";
import { PublicLayout } from "./components/PublicLayout";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Toaster } from "./components/ui/sonner";
import { ThemeProvider } from "./contexts/ThemeContext";
import { HomePage, LoginPage, SignupPage } from "./pages";
import { HistoryPage } from "./pages/HistoryPage";
import { RecipePage } from "./pages/RecipePage";
import { RecipesIndexPage } from "./pages/RecipesIndexPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import BlogPage from "./pages/BlogPage";
import { PricingPage } from "./pages/PricingPage";
import { AdminPage } from "./pages/AdminPage";
import { PlazamPage } from "./pages/PlazamPage";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" switchable={true}>
        <RouteTracker />
        <Toaster />
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="/history" element={<HistoryPage />} />
            </Route>
          </Route>

          <Route path="/recettes" element={<RecipesIndexPage />} />
          <Route path="/recette/:slug" element={<RecipePage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/plazam" element={<PlazamPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route element={<PublicLayout />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
