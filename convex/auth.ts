import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { TestCredentials } from "./testAuth";
import {
  ViktorSpacesEmail,
  ViktorSpacesPasswordReset,
} from "./ViktorSpacesEmail";
import Google from "@auth/core/providers/google";

declare const process: { env: Record<string, string | undefined> };

function decodePrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.includes("\n")) return key;
  if (key.startsWith("-----BEGIN")) {
    return key
      .replace("-----BEGIN PRIVATE KEY----- ", "-----BEGIN PRIVATE KEY-----\n")
      .replace(" -----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----")
      .split(" ")
      .join("\n");
  }
  try {
    return atob(key);
  } catch {
    return key;
  }
}

const authPrivateKey = process.env.AUTH_PRIVATE_KEY;
if (authPrivateKey) {
  process.env.AUTH_PRIVATE_KEY = decodePrivateKey(authPrivateKey);
}

const jwtPrivateKey = process.env.JWT_PRIVATE_KEY;
if (jwtPrivateKey) {
  process.env.JWT_PRIVATE_KEY = decodePrivateKey(jwtPrivateKey);
}

// Only register the @test.local credentials provider on preview/dev Convex
// deployments. `VIKTOR_SPACES_IS_PREVIEW` is set per-deployment by the Viktor
// Spaces backend (true on dev, false on prod). On production it is "false" or
// unset, so the test provider is omitted entirely and `signIn("test", ...)`
// fails with "Provider not configured".
// Google OAuth — only enabled when credentials are configured
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

// The canonical public domain for this app. We override the SITE_URL env var
// (which points to the viktor.space internal URL) so that all OAuth redirects
// land on the custom domain after login.
const CANONICAL_SITE_URL = "https://onmangequoi.net";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      verify: ViktorSpacesEmail,
      reset: ViktorSpacesPasswordReset,
    }),
    ...(googleClientId && googleClientSecret
      ? [Google({ clientId: googleClientId, clientSecret: googleClientSecret })]
      : []),
    ...(process.env.VIKTOR_SPACES_IS_PREVIEW === "true" ? [TestCredentials] : []),
  ],
  callbacks: {
    async redirect({ redirectTo }: { redirectTo: string }) {
      // On preview/dev keep the original SITE_URL behaviour; on prod use the custom domain
      const isPreview = process.env.VIKTOR_SPACES_IS_PREVIEW === "true";
      const base = (isPreview
        ? (process.env.SITE_URL ?? CANONICAL_SITE_URL)
        : CANONICAL_SITE_URL
      ).replace(/\/$/, "");

      if (!redirectTo || redirectTo === "/") return base;
      if (redirectTo.startsWith("?") || redirectTo.startsWith("/")) {
        return `${base}${redirectTo}`;
      }
      // Already an absolute URL — rewrite the origin to the canonical base
      try {
        const url = new URL(redirectTo);
        url.hostname = new URL(base).hostname;
        url.protocol = new URL(base).protocol;
        url.port = "";
        return url.toString();
      } catch {
        return base;
      }
    },
  },
});

export const currentUser = query({
  args: {},
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});
