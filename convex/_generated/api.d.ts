/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ViktorSpacesEmail from "../ViktorSpacesEmail.js";
import type * as adminStats from "../adminStats.js";
import type * as auth from "../auth.js";
import type * as chefRecipes from "../chefRecipes.js";
import type * as constants from "../constants.js";
import type * as dishImages from "../dishImages.js";
import type * as heroImage from "../heroImage.js";
import type * as http from "../http.js";
import type * as menuHistory from "../menuHistory.js";
import type * as pendingImages from "../pendingImages.js";
import type * as photoAnalysis from "../photoAnalysis.js";
import type * as publicRecipes from "../publicRecipes.js";
import type * as seedTestUser from "../seedTestUser.js";
import type * as stripe from "../stripe.js";
import type * as subscriptions from "../subscriptions.js";
import type * as testAuth from "../testAuth.js";
import type * as userPreferences from "../userPreferences.js";
import type * as users from "../users.js";
import type * as viktorTools from "../viktorTools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ViktorSpacesEmail: typeof ViktorSpacesEmail;
  adminStats: typeof adminStats;
  auth: typeof auth;
  chefRecipes: typeof chefRecipes;
  constants: typeof constants;
  dishImages: typeof dishImages;
  heroImage: typeof heroImage;
  http: typeof http;
  menuHistory: typeof menuHistory;
  pendingImages: typeof pendingImages;
  photoAnalysis: typeof photoAnalysis;
  publicRecipes: typeof publicRecipes;
  seedTestUser: typeof seedTestUser;
  stripe: typeof stripe;
  subscriptions: typeof subscriptions;
  testAuth: typeof testAuth;
  userPreferences: typeof userPreferences;
  users: typeof users;
  viktorTools: typeof viktorTools;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
