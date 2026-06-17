/**
 * Post-build script: inline critical CSS into index.html
 * and make the full stylesheet non-blocking.
 *
 * Critical CSS = CSS variables (:root, .dark) + base layer (~8 KB)
 * This eliminates the ~350ms render-blocking delay from the 157 KB stylesheet.
 *
 * Usage: node scripts/inline-critical-css.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const DIST = new URL("../dist", import.meta.url).pathname;

// ── 1. Find the built CSS file ───────────────────────────────────────────────
const assetsDir = join(DIST, "assets");
const cssFile = readdirSync(assetsDir).find(
  (f) => f.startsWith("index-") && f.endsWith(".css")
);
if (!cssFile) {
  console.error("❌ No index-*.css found in dist/assets");
  process.exit(1);
}

const cssPath = join(assetsDir, cssFile);
const fullCss = readFileSync(cssPath, "utf8");
console.log(`📦 Full CSS: ${(fullCss.length / 1024).toFixed(1)} KB`);

// ── 2. Extract critical CSS pieces ──────────────────────────────────────────
const pieces = [];

// @layer properties (Tailwind custom-property resets for transforms etc.)
const layerProps = fullCss.match(/@layer properties\{.*?\}\}/s);
if (layerProps) pieces.push(layerProps[0]);

// :root CSS custom properties (color palette, radius, etc.)
const rootVars = fullCss.match(/:root\{[^}]+\}/);
if (rootVars) pieces.push(rootVars[0]);

// .dark CSS custom properties
const darkVars = fullCss.match(/\.dark\{[^}]+\}/);
if (darkVars) pieces.push(darkVars[0]);

// @layer base (box-sizing reset, html/body font + background setup)
const baseLayer = fullCss.match(/@layer base\{.*?\}\}/s);
if (baseLayer) pieces.push(baseLayer[0]);

// Light mode body background gradient
const lightBodyBg = fullCss.match(/:root:not\(\.dark\)\s*body\{[^}]+\}/);
if (lightBodyBg) pieces.push(lightBodyBg[0]);

// Dark mode body background gradient
const darkBodyBg = fullCss.match(/\.dark\s*body\{[^}]+\}/);
if (darkBodyBg) pieces.push(darkBodyBg[0]);

const criticalCss = pieces.join("");
console.log(`🎯 Critical CSS: ${(criticalCss.length / 1024).toFixed(1)} KB (inlined)`);
console.log(`⚡ Deferred CSS: ${((fullCss.length - criticalCss.length) / 1024).toFixed(1)} KB (non-blocking)`);

// ── 3. Patch index.html ─────────────────────────────────────────────────────
const htmlPath = join(DIST, "index.html");
let html = readFileSync(htmlPath, "utf8");

// Replace the blocking <link rel="stylesheet" ...> with:
//   a) inline <style> with critical CSS
//   b) non-blocking <link media="print" onload="this.media='all'"> for the rest
//   c) <noscript> fallback for no-JS browsers

const cssHref = `/assets/${cssFile}`;

// Match the blocking stylesheet link (Vite emits it with crossorigin attr)
const blockingLinkRe = new RegExp(
  `<link rel="stylesheet"[^>]*href="${cssHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`
);

const replacement = `<style id="critical-css">${criticalCss}</style>
  <link rel="stylesheet" href="${cssHref}" media="print" onload="this.media='all'" crossorigin>
  <noscript><link rel="stylesheet" href="${cssHref}" crossorigin></noscript>`;

if (!blockingLinkRe.test(html)) {
  // Try the crossorigin-before-href variant
  const alt = new RegExp(
    `<link rel="stylesheet" crossorigin href="${cssHref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`
  );
  if (alt.test(html)) {
    html = html.replace(alt, replacement);
    console.log("✅ Patched stylesheet link (crossorigin-first variant)");
  } else {
    console.warn("⚠️  Could not find blocking stylesheet link — check pattern");
    console.log("HTML snippet:", html.slice(html.indexOf("<link rel=\"stylesheet\"") - 20, html.indexOf("<link rel=\"stylesheet\"") + 200));
    process.exit(1);
  }
} else {
  html = html.replace(blockingLinkRe, replacement);
  console.log("✅ Patched stylesheet link");
}

writeFileSync(htmlPath, html);
console.log("✅ index.html updated with critical-CSS-inline + non-blocking full CSS");
