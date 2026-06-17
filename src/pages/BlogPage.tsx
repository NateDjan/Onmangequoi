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

    return () => {
      const s = document.querySelector('script[src*="trysoro.com"]');
      if (s) s.remove();
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
        <p className="text-muted-foreground mb-10 text-lg">
          {t("blog_subtitle")}
        </p>

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
