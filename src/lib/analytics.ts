/**
 * Analytics helper — wraps GA4 gtag calls with bot filtering,
 * clean page_location, and standardised page_title.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

type GtagEventParams = Record<string, string | number | boolean | undefined>;

/* ------------------------------------------------------------------ */
/*  Bot detection                                                      */
/* ------------------------------------------------------------------ */

const BOT_UA_RE =
  /bot|crawl|spider|slurp|facebook|whatsapp|telegram|preview|lighthouse|pagespeed|headless|phantom|puppeteer|selenium/i;

function isBot(): boolean {
  if (typeof navigator === "undefined") return true;
  if ((navigator as { webdriver?: boolean }).webdriver) return true;
  return BOT_UA_RE.test(navigator.userAgent);
}

/* ------------------------------------------------------------------ */
/*  Clean location helpers                                             */
/* ------------------------------------------------------------------ */

const SITE_TITLE = "On mange quoi ?";

/** Remove hash, trailing /index.html, ensure trailing slash consistency */
function cleanLocation(url: string): string {
  try {
    const u = new URL(url);
    // strip hash
    u.hash = "";
    // normalise /index.html → /
    u.pathname = u.pathname.replace(/\/index\.html$/i, "/");
    // collapse double slashes
    u.pathname = u.pathname.replace(/\/\/+/g, "/");
    return u.toString();
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ */
/*  Core send                                                          */
/* ------------------------------------------------------------------ */

function gtag(...args: unknown[]) {
  if (isBot()) return;
  window.gtag?.(...args);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Send a cleaned page_view — call on every SPA route change */
export function trackPageView(path?: string) {
  const loc = cleanLocation(path ?? window.location.href);
  gtag("event", "page_view", {
    page_title: SITE_TITLE,
    page_location: loc,
  });
}

/** Main conversion: user generated a menu/recipe */
export function trackGenerateLead(params: {
  form_id?: string;
  form_name: string;
  lead_type: string;
  value?: number;
}) {
  gtag("event", "generate_lead", {
    form_id: params.form_id ?? "recipe_generator",
    form_name: params.form_name,
    lead_type: params.lead_type,
    value: params.value ?? 0,
    currency: "EUR",
  });
}

/** CTA click (affiliate, external, WhatsApp, etc.) */
export function trackCtaClick(params: {
  link_url: string;
  cta_name: string;
  page_title?: string;
}) {
  gtag("event", "select_content", {
    content_type: "cta",
    link_url: params.link_url,
    cta_name: params.cta_name,
    page_title: params.page_title ?? SITE_TITLE,
  });
}

/** Internal search / ingredient lookup */
export function trackSearch(params: {
  search_term: string;
  results_count: number;
}) {
  gtag("event", "view_search_results", {
    search_term: params.search_term,
    results_count: params.results_count,
  });
}

/** Sign-up / login events */
export function trackSignUp(method: string) {
  gtag("event", "sign_up", { method });
}

export function trackLogin(method: string) {
  gtag("event", "login", { method });
}

/** Generic custom event */
export function trackEvent(name: string, params?: GtagEventParams) {
  gtag("event", name, params);
}
