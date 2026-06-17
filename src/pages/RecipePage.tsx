import { useQuery } from "convex/react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Clock, ChefHat, Users, ArrowLeft, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

function usePageMeta(title: string, description: string, image?: string, url?: string) {
  useEffect(() => {
    document.title = title;
    const setMeta = (name: string, content: string, prop?: string) => {
      const selector = prop ? `meta[property="${prop}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        if (prop) el.setAttribute("property", prop);
        else el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", description);
    setMeta("", title, "og:title");
    setMeta("", description, "og:description");
    if (image) setMeta("", image, "og:image");
    if (url) setMeta("", url, "og:url");
    setMeta("", "article", "og:type");

    return () => { document.title = "On Mange Quoi ?"; };
  }, [title, description, image, url]);
}

export function RecipePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t, lang } = useLanguage();
  const recipe = useQuery(api.publicRecipes.getBySlug, slug ? { slug } : "skip");

  usePageMeta(
    recipe ? `${recipe.name} — ${lang === "fr" ? "Recette IA" : "AI Recipe"} | ${t("appName")}` : `${lang === "fr" ? "Recette" : "Recipe"} — ${t("appName")}`,
    recipe ? `${recipe.description} | ${recipe.cookingTime}, ${recipe.difficulty}, ${recipe.servings} ${lang === "fr" ? "pers." : "serv."}` : "",
    recipe?.imageUrl || "https://onmangequoi.net/og-image.png",
    slug ? `https://onmangequoi.net/recette/${slug}` : undefined,
  );

  useEffect(() => {
    if (!recipe) return;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: recipe.name,
      description: recipe.description,
      image: recipe.imageUrl || "https://onmangequoi.net/og-image.png",
      author: { "@type": "Organization", name: "On Mange Quoi ?", url: "https://onmangequoi.net" },
      datePublished: new Date(recipe.createdAt).toISOString().split("T")[0],
      prepTime: `PT${parseInt(recipe.cookingTime) || 30}M`,
      totalTime: `PT${parseInt(recipe.cookingTime) || 30}M`,
      recipeYield: `${recipe.servings} ${lang === "fr" ? "personnes" : "servings"}`,
      recipeCategory: recipe.recipeType || (lang === "fr" ? "Plat principal" : "Main course"),
      recipeCuisine: lang === "fr" ? "Française" : "French",
      recipeIngredient: recipe.ingredients,
      recipeInstructions: recipe.steps.map((step: string, i: number) => ({
        "@type": "HowToStep", position: i + 1, text: step,
      })),
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "recipe-jsonld";
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => { document.getElementById("recipe-jsonld")?.remove(); };
  }, [recipe, lang]);

  if (recipe === undefined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-foreground">
          {lang === "fr" ? "Recette introuvable" : "Recipe not found"}
        </h1>
        <p className="text-muted-foreground">
          {lang === "fr" ? "Cette recette n'existe pas ou a été supprimée." : "This recipe doesn't exist or has been deleted."}
        </p>
        <Link to="/" className="text-primary hover:underline flex items-center gap-1">
          <ArrowLeft className="size-4" /> {lang === "fr" ? "Retour à l'accueil" : "Back to home"}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-noads="true">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-surface-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/recettes" className="text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="size-5" />
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src="/icon-192x192.png" alt={t("appName")} className="size-7 rounded-lg" />
            <span className="font-bold text-foreground text-sm">{t("appName")}</span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="rounded-2xl overflow-hidden aspect-[16/10] bg-muted">
          {recipe.imageUrl ? (
            <img
              src={recipe.imageUrl}
              alt={recipe.name}
              className="w-full h-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <span className="text-6xl">🍽️</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
            {recipe.name}
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            {recipe.description}
          </p>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1">
              <Clock className="size-3.5" /> {recipe.cookingTime}
            </span>
            <span className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1">
              <ChefHat className="size-3.5" /> {recipe.difficulty}
            </span>
            <span className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1">
              <Users className="size-3.5" /> {recipe.servings} {lang === "fr" ? "pers." : "serv."}
            </span>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">🥕 {lang === "fr" ? "Ingrédients" : "Ingredients"}</h2>
          <ul className="space-y-2">
            {recipe.ingredients.map((ing: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-foreground/90">
                <span className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                {ing}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-foreground">📝 {lang === "fr" ? "Préparation" : "Instructions"}</h2>
          <ol className="space-y-4">
            {recipe.steps.map((step: string, i: number) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 flex items-center justify-center size-7 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {i + 1}
                </span>
                <p className="text-foreground/90 leading-relaxed pt-0.5">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6 text-center space-y-3">
          <Sparkles className="size-8 text-primary mx-auto" />
          <h3 className="text-lg font-bold text-foreground">
            {lang === "fr" ? "Cette recette a été générée par IA 🤖" : "This recipe was generated by AI 🤖"}
          </h3>
          <p className="text-muted-foreground text-sm">
            {lang === "fr"
              ? "Prends en photo ton frigo et reçois des recettes personnalisées en quelques secondes."
              : "Take a photo of your fridge and get personalized recipes in seconds."}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition"
          >
            {lang === "fr" ? `Essayer ${t("appName")} →` : `Try ${t("appName")} →`}
          </Link>
        </section>
      </main>

      <footer className="max-w-2xl mx-auto px-4 py-8 border-t border-surface-border text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {t("appName")} — {lang === "fr" ? "Recettes générées par intelligence artificielle." : "Recipes generated by artificial intelligence."}
        </p>
      </footer>
    </div>
  );
}
