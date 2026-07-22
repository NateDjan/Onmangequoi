/**
 * Post-build: generate static /recette/{slug}/index.html pages and sitemap.
 *
 * Fetches all recipes from the public Convex API (no auth needed).
 * Runs after `vite build` as part of `bun run build`.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CONVEX_URL = "https://tame-cardinal-281.convex.cloud";
const DIST = new URL("../dist", import.meta.url).pathname;
const FALLBACK_OG_IMAGE = "https://onmangequoi.net/og-image.png";

// ── Fetch recipes ─────────────────────────────────────────────────────────────

async function fetchRecipes() {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "publicRecipes:listRecent", args: { limit: 500 }, format: "json" }),
  });
  if (!res.ok) throw new Error(`Convex query failed: ${res.status}`);
  const data = await res.json();
  return data.value ?? [];
}

// ── HTML escaping ─────────────────────────────────────────────────────────────

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── Generate HTML ─────────────────────────────────────────────────────────────

function generateHtml(recipe) {
  const name = recipe.name ?? "";
  const description = recipe.description ?? "";
  const slug = recipe.slug ?? "";
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  const imageUrl = recipe.imageUrl ?? "";
  const cookingTime = recipe.cookingTime ?? "";
  const difficulty = recipe.difficulty ?? "";
  const servings = recipe.servings ?? "";

  const canonical = `https://onmangequoi.net/recette/${slug}`;
  const ogImage = imageUrl || FALLBACK_OG_IMAGE;

  const heroImg = imageUrl
    ? `<div class="hero-img-wrap"><img src="${esc(imageUrl)}" alt="${esc(name)}" class="hero-img" loading="eager" /></div>`
    : `<div class="hero-img-placeholder">&#x1F37D;</div>`;

  const ingredientsHtml = ingredients.map(i => `<li>${esc(i)}</li>`).join("\n");
  const stepsHtml = steps.map((s, i) => `<li id="etape-${i + 1}">${esc(s)}</li>`).join("\n");

  // ── Structured data (schema.org/Recipe) — enriched for recipe rich results ────
  const isoDuration = (txt) => {
    const m = String(txt ?? "").match(/\d+/);
    return m ? `PT${m[0]}M` : "";
  };
  const recipeCategory = (() => {
    const n = `${name} ${description}`.toLowerCase();
    if (/soupe|velout|potage/.test(n)) return "Soupe";
    if (/salade/.test(n)) return "Entrée";
    // High precision on Dessert: a sweet signal AND no savory marker. A savory dish must
    // never be mislabeled Dessert; under-labeling a dessert as "Plat principal" is harmless.
    const savory = /poulet|poule|b[œo]euf|veau|porc|jambon|bacon|lardon|chorizo|merguez|saucisse|dinde|canard|agneau|poisson|saumon|thon|cabillaud|sardine|anchois|maquereau|crevette|moule|calamar|oeuf|œuf|omelette|quiche|fromage|ch[èe]vre|comt[ée]|parmesan|mozzarella|feta|gruy[èe]re|ricotta|burrata|gratin|risotto|gnocchi|p[âa]tes|nouille|riz|quinoa|boulgour|semoule|lentille|pois|haricot|courgette|aubergine|poireau|carotte|tomate|oignon|[ée]chalote|champignon|[ée]pinard|brocoli|chou|potiron|potimarron|patate|pomme de terre|betterave|poivron|curry|tajine|wok|po[êe]l[ée]e|fricass[ée]e|blanquette|mijot|r[ôo]ti|sal[ée]|moutarde/;
    const sweet = /dessert|g[âa]teau|tarte|cr[êe]pe|mousse|cookie|brownie|chocolat|sucr|compote|p[âa]tisserie|glace|sorbet|clafouti|tiramisu|panna|cheesecake|muffin|gaufre|crumble|banana bread/;
    if (sweet.test(n) && !savory.test(n)) return "Dessert";
    return "Plat principal";
  })();
  const cookIso = isoDuration(cookingTime);

  const recipeSchema = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name,
    description,
    url: canonical,
    author: { "@type": "Organization", name: "On mange quoi ?", url: "https://onmangequoi.net" },
    recipeCategory,
    recipeIngredient: ingredients,
    recipeInstructions: steps.map((s, i) => {
      const step = {
        "@type": "HowToStep",
        position: i + 1,
        name: `Étape ${i + 1}`,
        text: s,
        url: `${canonical}#etape-${i + 1}`,
      };
      if (imageUrl) step.image = imageUrl;
      return step;
    }),
  };
  if (imageUrl) recipeSchema.image = imageUrl;
  if (cookIso) { recipeSchema.cookTime = cookIso; recipeSchema.totalTime = cookIso; }
  if (servings) recipeSchema.recipeYield = String(servings);
  if (recipe.recipeType) recipeSchema.keywords = String(recipe.recipeType);
  const recipeJsonLd = JSON.stringify(recipeSchema, null, 2);

  const metaParts = [];
  if (cookingTime) metaParts.push(`&#x23F1; ${cookingTime}`);
  if (difficulty) metaParts.push(`&#x1F4CA; ${difficulty}`);
  if (servings) metaParts.push(`&#x1F465; ${servings}`);
  const metaLine = metaParts.join(" &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(name)} | On mange quoi ?</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${esc(name)} | On mange quoi ?">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:type" content="article">
  <!-- Google AdSense — loaded only on editorial recipe pages (publisher content) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4947224241575125" crossorigin="anonymous"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script type="application/ld+json">
${recipeJsonLd}
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fbf7f0; color: #1f1a15; }
    header { background: rgba(251,247,240,0.9); backdrop-filter: blur(10px); border-bottom: 1px solid #e7ded2; padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
    header a { color: #1f1a15; text-decoration: none; font-weight: 600; font-size: 1.05rem; }
    header a:first-child { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 1.2rem; }
    header a:first-child em { color: #c14a2e; font-style: normal; }
    .hero { background: linear-gradient(180deg, #f6e9df 0%, #fbf7f0 100%); color: #1f1a15; padding: 3rem 2rem 2.5rem; text-align: center; }
    .hero h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 2.3rem; letter-spacing: -0.02em; margin-bottom: 0.75rem; line-height: 1.2; max-width: 800px; margin-left: auto; margin-right: auto; }
    .hero p { font-size: 1.05rem; color: #6b5f52; max-width: 600px; margin: 0 auto; }
    .hero-meta { font-size: 0.9rem; color: #6b5f52; margin-top: 0.9rem; }
    .hero-img-wrap { margin-top: 2rem; max-width: 860px; margin-left: auto; margin-right: auto; }
    .hero-img { width: 100%; max-height: 440px; object-fit: cover; display: block; border-radius: 22px; box-shadow: 0 18px 44px rgba(31,26,21,0.14); }
    .hero-img-placeholder { font-size: 4rem; padding: 2rem 0; }
    .container { max-width: 800px; margin: 0 auto; padding: 2rem; }
    .card { background: white; border: 1px solid #e7ded2; border-radius: 20px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 10px rgba(31,26,21,0.05); }
    h2 { font-family: 'Fraunces', Georgia, serif; color: #c14a2e; font-weight: 600; font-size: 1.45rem; letter-spacing: -0.01em; margin-bottom: 1rem; }
    ul, ol { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; line-height: 1.6; }
    .cta { background: linear-gradient(135deg, #c14a2e, #d9603f); border-radius: 20px; padding: 2.5rem 2rem; text-align: center; color: white; margin-bottom: 2rem; }
    .cta h2 { color: white; font-size: 1.5rem; }
    .cta p { opacity: 0.92; margin: 1rem 0; font-size: 1rem; }
    .btn { display: inline-block; background: white; color: #c14a2e; padding: 1rem 2.5rem; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 1.05rem; margin-top: 1rem; }
    .links { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .links a { background: #f6e3db; color: #a03a22; padding: 0.5rem 1rem; border-radius: 999px; text-decoration: none; font-size: 0.9rem; font-weight: 500; }
    footer { text-align: center; padding: 2rem; color: #85766b; font-size: 0.85rem; }
  </style>
</head>
<body>
  <header>
    <a href="https://onmangequoi.net">&#x1F37D; On mange <em>quoi ?</em></a>
    <a href="/recettes">&#x2190; Toutes les recettes</a>
  </header>
  <div class="hero">
    <h1>${esc(name)}</h1>
    <p>${esc(description)}</p>
    ${metaLine ? `<p class="hero-meta">${metaLine}</p>` : ""}
    ${heroImg}
  </div>
  <div class="container">
    <div class="card">
      <h2>&#x1F955; Ingrédients</h2>
      <ul>${ingredientsHtml}</ul>
    </div>
    <div class="card">
      <h2>&#x1F468;&#x200D;&#x1F373; Préparation</h2>
      <ol>${stepsHtml}</ol>
    </div>
    <div class="cta">
      <h2>&#x1F916; L'IA propose d'autres recettes avec vos ingrédients !</h2>
      <p>Pas tous les ingrédients ? Prenez en photo votre frigo et l'IA génère une recette avec ce que vous avez vraiment sous la main.</p>
      <a href="https://onmangequoi.net" class="btn">&#x2728; Essayer gratuitement &#x2192;</a>
    </div>
    <div class="card">
      <h2>&#x1F374; D'autres recettes</h2>
      <div class="links">
        <a href="/recette/overnight-oats-proteine">Overnight oats</a>
        <a href="/recette/fondant-au-chocolat-coulant">Fondant chocolat</a>
        <a href="/recette/poke-bowl-saumon-avocat">Poké bowl saumon</a>
        <a href="/recette/gratin-dauphinois-fondant">Gratin dauphinois</a>
        <a href="/recette/carbonara-authentique-express">Carbonara express</a>
        <a href="/recette/dhal-de-lentilles-express">Dhal de lentilles</a>
        <a href="/recettes">Voir toutes les recettes &#x2192;</a>
      </div>
    </div>
  </div>
  <footer>
    <p>&#x00A9; 2026 <a href="https://onmangequoi.net" style="color:#c14a2e">On mange quoi ?</a> &#x2014; Recettes générées par intelligence artificielle.</p>
  </footer>
</body>
</html>`;
}

// ── Recipe index page (/recettes/) ─────────────────────────────────────────────

function generateIndexHtml(recipes) {
  const cards = recipes.map(r => {
    const slug = r.slug ?? "";
    const name = esc(r.name ?? "");
    const description = esc(r.description ?? "").substring(0, 120);
    const imageUrl = r.imageUrl ?? "";
    const tags = (r.ingredients ?? []).slice(0, 4).map(i => esc(i.toLowerCase()));

    const imageHtml = imageUrl
      ? `<img src="${esc(imageUrl)}" alt="${name}" class="card-img" loading="lazy" />`
      : `<div class="card-emoji">🍽️</div>`;

    const tagsHtml = tags.map(t => `<span class="tag">${t}</span>`).join("");

    return `<a href="/recette/${slug}" class="recipe-card">
      <div class="card-thumb">${imageHtml}</div>
      <h2>${name}</h2>
      <p>${description}...</p>
      <div class="tags">${tagsHtml}</div>
    </a>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recettes faciles avec vos ingrédients | On mange quoi ?</title>
  <meta name="description" content="Trouvez des recettes avec les ingrédients que vous avez dans votre frigo. ${recipes.length}+ recettes faciles et rapides, de la soupe au dessert.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://onmangequoi.net/recettes/">
  <meta property="og:title" content="Recettes faciles avec vos ingrédients | On mange quoi ?">
  <meta property="og:description" content="Trouvez des recettes avec les ingrédients que vous avez dans votre frigo. ${recipes.length}+ recettes faciles et rapides.">
  <meta property="og:url" content="https://onmangequoi.net/recettes/">
  <meta property="og:type" content="website">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Recettes faciles avec vos ingrédients",
    "description": "${recipes.length}+ recettes classées par ingrédients pour cuisiner avec ce que vous avez.",
    "url": "https://onmangequoi.net/recettes/",
    "author": {"@type": "Organization", "name": "On mange quoi ?"}
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fbf7f0; color: #1f1a15; }
    header { background: rgba(251,247,240,0.9); backdrop-filter: blur(10px); border-bottom: 1px solid #e7ded2; padding: 1rem 2rem; }
    header a { color: #1f1a15; text-decoration: none; font-weight: 600; font-size: 1.2rem; font-family: 'Fraunces', Georgia, serif; }
    header a em { color: #c14a2e; font-style: normal; }
    .hero { background: linear-gradient(180deg, #f6e9df 0%, #fbf7f0 100%); color: #1f1a15; padding: 3.5rem 2rem 3rem; text-align: center; }
    .hero h1 { font-family: 'Fraunces', Georgia, serif; font-weight: 600; font-size: 2.4rem; letter-spacing: -0.02em; margin-bottom: 1rem; }
    .hero p { font-size: 1.1rem; color: #6b5f52; max-width: 600px; margin: 0 auto 1.75rem; }
    .btn { display: inline-block; background: #c14a2e; color: white; padding: 0.95rem 2.4rem; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 1.05rem; box-shadow: 0 8px 24px rgba(193,74,46,0.25); transition: transform 0.15s; }
    .btn:hover { transform: translateY(-2px); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; max-width: 1200px; margin: 2rem auto; padding: 0 1.5rem; }
    .recipe-card { background: white; border: 1px solid #e7ded2; border-radius: 20px; text-decoration: none; color: inherit; box-shadow: 0 2px 10px rgba(31,26,21,0.05); transition: transform 0.2s, box-shadow 0.2s; overflow: hidden; display: flex; flex-direction: column; }
    .recipe-card:hover { transform: translateY(-4px); box-shadow: 0 14px 34px rgba(31,26,21,0.11); }
    .card-thumb { aspect-ratio: 16/10; overflow: hidden; background: linear-gradient(135deg, #f6e3db, #fbf7f0); }
    .card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
    .recipe-card:hover .card-img { transform: scale(1.05); }
    .card-emoji { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 3rem; }
    .recipe-card h2 { font-family: 'Fraunces', Georgia, serif; color: #1f1a15; font-weight: 600; font-size: 1.08rem; letter-spacing: -0.01em; margin: 0; padding: 1rem 1.25rem 0.25rem; line-height: 1.35; }
    .recipe-card p { color: #6b5f52; font-size: 0.85rem; line-height: 1.5; padding: 0.25rem 1.25rem 0.5rem; }
    .tags { display: flex; gap: 0.4rem; flex-wrap: wrap; padding: 0 1.25rem 1.25rem; margin-top: auto; }
    .tag { background: #eff2ea; color: #5f6f52; border-radius: 999px; padding: 0.22rem 0.65rem; font-size: 0.78rem; font-weight: 500; }
    footer { text-align: center; padding: 2rem; color: #85766b; font-size: 0.85rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <header>
    <a href="https://onmangequoi.net">🍽️ On mange <em>quoi ?</em></a>
  </header>

  <div class="hero">
    <h1>🥘 Toutes nos recettes</h1>
    <p>Des recettes faciles classées par ingrédients. Ou laissez l'IA composer un plat avec ce que vous avez dans votre frigo !</p>
    <a href="https://onmangequoi.net" class="btn">📸 Prendre une photo de mon frigo</a>
  </div>

  <div class="grid">
${cards}
  </div>

  <footer>
    <p>© 2026 <a href="https://onmangequoi.net" style="color:#c14a2e">On mange quoi ?</a> — Application de recettes IA gratuite</p>
  </footer>
</body>
</html>`;
}

// ── Sitemap ───────────────────────────────────────────────────────────────────

function buildSitemap(recipes) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `<url>\n    <loc>https://onmangequoi.net/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `<url>\n    <loc>https://onmangequoi.net/recettes</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>`,
  ];
  for (const r of recipes) {
    if (!r.slug) continue;
    urls.push(
      `<url>\n    <loc>https://onmangequoi.net/recette/${r.slug}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>monthly</changefreq>\n` +
      `    <priority>0.8</priority>\n  </url>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  ` + urls.join("\n  ") + `\n</urlset>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("🔄 Fetching recipes from Convex...");
const recipes = await fetchRecipes();
console.log(`✅ ${recipes.length} recipes fetched`);

// Generate /recette/{slug}/index.html
const recipeDir = join(DIST, "recette");
mkdirSync(recipeDir, { recursive: true });

let generated = 0;
let noImage = [];
for (const recipe of recipes) {
  if (!recipe.slug) continue;
  const outDir = join(recipeDir, recipe.slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), generateHtml(recipe), "utf-8");
  generated++;
  if (!recipe.imageUrl) noImage.push(recipe.slug);
}
console.log(`✅ ${generated} recipe pages generated in dist/recette/`);
if (noImage.length) console.log(`⚠️  ${noImage.length} recipes without image (fallback OG used)`);

// Generate /recettes/index.html (recipe index with images)
const recettesDir = join(DIST, "recettes");
mkdirSync(recettesDir, { recursive: true });
writeFileSync(join(recettesDir, "index.html"), generateIndexHtml(recipes), "utf-8");
console.log(`✅ Recipe index page generated (${recipes.length} recipes with images)`);

// Update sitemap
const sitemap = buildSitemap(recipes);
writeFileSync(join(DIST, "sitemap.xml"), sitemap, "utf-8");
console.log(`✅ Sitemap updated (${recipes.length + 2} URLs)`);
