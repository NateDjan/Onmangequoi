import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { BookOpen, Globe, History, LogOut, Sparkles, User, UserPlus } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { PlazamIcon } from "./PlazamIcon";
import { api } from "../../convex/_generated/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "./ui/button";

export function Header() {
  const user = useQuery(api.auth.currentUser);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLanguage();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/85"
      data-noads="true"
    >
      <div className="container">
        <div className="flex h-14 items-center justify-between px-2">
          {/* Left: Language toggle */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-hover h-9 px-2.5 font-semibold text-xs"
              title={t("language")}
            >
              <Globe className="size-4" />
              <span className="w-5 text-center">{lang === "fr" ? "FR" : "EN"}</span>
            </Button>
          </div>

          {/* Center: Navigation icons */}
          <div className="flex items-center gap-1.5">
            {/* Plazam icon */}
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-muted-foreground hover:text-foreground hover:bg-surface-hover h-9 px-2.5"
              title="Plazam — identifie un plat en photo"
            >
              <Link to="/plazam">
                <PlazamIcon className="size-4" />
              </Link>
            </Button>

            {/* Recipes */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/recettes")}
              className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-hover h-9 px-2.5"
              title={t("recipes")}
            >
              <BookOpen className="size-4" />
            </Button>

            {/* Pricing / Pro */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/pricing")}
              className="gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 h-9 px-2.5"
              title="Pro"
            >
              <Sparkles className="size-4" />
            </Button>

            {user && (
              /* History */
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/history")}
                className="gap-1.5 text-muted-foreground hover:text-foreground hover:bg-surface-hover h-9 px-2.5"
                title={t("history")}
              >
                <History className="size-4" />
              </Button>
            )}
          </div>

          {/* Right: Auth controls */}
          <div className="flex items-center gap-1.5">
            {user ? (
              <div className="flex items-center gap-1.5">
                <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-primary/30">
                  <User className="size-3.5 text-primary" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-destructive hover:bg-surface-hover h-8 w-8 p-0"
                  title={t("logout")}
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate("/login")}
                className="gap-1.5 h-9 px-3 shadow-lg shadow-primary/20"
              >
                <UserPlus className="size-4" />
                <span className="text-sm">{lang === "fr" ? "Connexion" : "Sign in"}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
