import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export default function BlogPage() {
  const { t, lang } = useLanguage();

  useEffect(() => {
    // Load Soro AI embed script
    const existingScript = document.querySelector(
      'script[src*="trysoro.com"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src =
        "https://app.trysoro.com/api/embed/0e8e36df-201f-43b1-b619-beb1ef21816c";
      script.defer = true;
      document.body.appendChild(script);
    }

    // Inject dark mode overrides for Soro embed
    // Soro uses hardcoded #1a1a1a text which is invisible on the site's dark bg (#1a0f0a)
    const darkStyle = document.createElement("style");
    darkStyle.id = "soro-dark-override";
    darkStyle.textContent = `
      .dark .soro-blog,
      .dark .soro-blog * {
        color: #f0ebe4 !important;
      }
      .dark .soro-blog-card {
        border-color: rgba(255,255,255,0.12) !important;
      }
      .dark .soro-blog-card:hover {
        border-color: rgba(255,255,255,0.2) !important;
      }
      .dark .soro-blog-back {
        border-color: rgba(255,255,255,0.15) !important;
        color: #ccc !important;
      }
      .dark .soro-blog-back:hover {
        background: rgba(255,255,255,0.08) !important;
      }
      .dark .soro-blog-spinner {
        border-color: rgba(255,255,255,0.12) !important;
        border-top-color: #f0ebe4 !important;
      }
      .dark .soro-blog-article-content a {
        color: #e2a077 !important;
      }
      .soro-blog-article-content a {
        color: #c14a2e !important;
      }
    `;
    document.head.appendChild(darkStyle);

    return () => {
      const s = document.querySelector('script[src*="trysoro.com"]');
      if (s) s.remove();
      const ds = document.getElementById("soro-dark-override");
      if (ds) ds.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <span className="text-2xl font-bold text-primary group-hover:text-primary/80 transition-colors">
              onmangequoi
            </span>
            <span className="text-sm text-muted-foreground">.net</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/"
              className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
            >
              {lang === "fr" ? "Accueil" : "Home"}
            </Link>
            <Link
              to="/recettes"
              className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
            >
              {t("recipes")}
            </Link>
            <span className="text-primary text-sm font-semibold">{t("blog")}</span>
          </nav>
        </div>
      </header>

      {/* Blog content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-2">{t("blog_title")}</h1>
        <p className="text-muted-foreground mb-6 text-lg">
          {t("blog_subtitle")}
        </p>

        {/* Editorial intro */}
        <div className="prose prose-neutral max-w-none mb-10 space-y-4 text-foreground/80 text-base leading-relaxed">
          <p>
            {lang === "fr"
              ? "Bienvenue sur le blog On Mange Quoi ? — votre ressource pour cuisiner malin, éviter le gaspillage alimentaire et trouver l'inspiration culinaire au quotidien. Nos articles couvrent les recettes IA générées depuis de vrais frigos, les astuces pour cuisiner avec les restes, la nutrition équilibrée et la planification des repas de la semaine."
              : "Welcome to the On Mange Quoi? blog — your resource for smart cooking, reducing food waste, and finding daily culinary inspiration. Our articles cover AI-generated recipes from real fridges, tips for cooking with leftovers, balanced nutrition, and weekly meal planning."}
          </p>
          <p>
            {lang === "fr"
              ? "Chaque semaine, nous publions des guides pratiques, des idées de menus équilibrés et des analyses nutritionnelles pour vous aider à manger mieux sans vous prendre la tête. Que vous ayez 10 minutes ou 1 heure devant vous, On Mange Quoi ? a une recette adaptée à votre frigo et à votre emploi du temps."
              : "Every week we publish practical guides, balanced meal ideas, and nutritional insights to help you eat better without the hassle. Whether you have 10 minutes or an hour, On Mange Quoi? has a recipe adapted to your fridge and your schedule."}
          </p>
        </div>

        {/* Soro AI embed container */}
        <div id="soro-blog"></div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} onmangequoi.net — {lang === "fr" ? "Tous droits réservés" : "All rights reserved"}
      </footer>
    </div>
  );
}
