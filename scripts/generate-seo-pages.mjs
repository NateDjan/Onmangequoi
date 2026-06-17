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
function escj(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    .replace(/\n/g, "\\n").replace(/\r/g, "");
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
  const jsonldImage = imageUrl ? `,\n    "image": "${escj(imageUrl)}"` : "";

  const heroImg = imageUrl
    ? `<div class="hero-img-wrap"><img src="${esc(imageUrl)}" alt="${esc(name)}" class="hero-img" loading="eager" /></div>`
    : `<div class="hero-img-placeholder">&#x1F37D;</div>`;

  const ingredientsHtml = ingredients.map(i => `<li>${esc(i)}</li>`).join("\n");
  const stepsHtml = steps.map(s => `<li>${esc(s)}</li>`).join("\n");
  const instructionsJson = JSON.stringify(
    steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, text: s }))
  );
  const ingredientsJson = JSON.stringify(ingredients);

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
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "${escj(name)}",
    "description": "${escj(description)}",
    "url": "${canonical}",
    "author": {"@type": "Organization", "name": "On mange quoi ?", "url": "https://onmangequoi.net"},
    "recipeIngredient": ${ingredientsJson},
    "recipeInstructions": ${instructionsJson}${jsonldImage}
  }
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fdf8f4; color: #2d1a0e; }
    header { background: linear-gradient(135deg, #1a0f0a, #3d1f0d); padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
    header a { color: white; text-decoration: none; font-weight: bold; font-size: 1.2rem; }
    .hero { background: linear-gradient(135deg, #3d1f0d, #6b3a1f); color: white; padding: 2.5rem 2rem 0; text-align: center; }
    .hero h1 { font-size: 2rem; margin-bottom: 0.75rem; line-height: 1.3; }
    .hero p { font-size: 1.05rem; opacity: 0.9; max-width: 600px; margin: 0 auto; }
    .hero-meta { font-size: 0.9rem; opacity: 0.8; margin-top: 0.75rem; }
    .hero-img-wrap { margin-top: 2rem; }
    .hero-img { width: 100%; max-height: 420px; object-fit: cover; display: block; }
    .hero-img-placeholder { font-size: 4rem; padding: 2rem 0; }
    .container { max-width: 800px; margin: 0 auto; padding: 2rem; }
    .card { background: white; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h2 { color: #c45c1a; font-size: 1.4rem; margin-bottom: 1rem; }
    ul, ol { padding-left: 1.5rem; }
    li { margin-bottom: 0.5rem; line-height: 1.6; }
    .cta { background: linear-gradient(135deg, #c45c1a, #e67e22); border-radius: 16px; padding: 2.5rem 2rem; text-align: center; color: white; margin-bottom: 2rem; }
    .cta h2 { color: white; font-size: 1.5rem; }
    .cta p { opacity: 0.9; margin: 1rem 0; font-size: 1rem; }
    .btn { display: inline-block; background: white; color: #c45c1a; padding: 1rem 2.5rem; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 1.05rem; margin-top: 1rem; }
    .links { display: flex; flex-wrap: wrap; gap: 0.75rem; }
    .links a { background: #fdf0e8; color: #c45c1a; padding: 0.5rem 1rem; border-radius: 8px; text-decoration: none; font-size: 0.9rem; }
    footer { text-align: center; padding: 2rem; color: #888; font-size: 0.85rem; }
  </style>
</head>
<body>
  <header>
    <a href="https://onmangequoi.net">&#x1F37D; On mange quoi ?</a>
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
    <p>&#x00A9; 2026 <a href="https://onmangequoi.net" style="color:#c45c1a">On mange quoi ?</a> &#x2014; Recettes générées par intelligence artificielle.</p>
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

// Update sitemap
const sitemap = buildSitemap(recipes);
writeFileSync(join(DIST, "sitemap.xml"), sitemap, "utf-8");
console.log(`✅ Sitemap updated (${recipes.length + 2} URLs)`);
