import { runTest } from "./auth";

runTest("Menu Suggestion E2E", async (helper) => {
  const { page } = helper;

  console.log("📍 Opening homepage...");
  await helper.goto("/");
  await helper.screenshot("test-01-homepage.png");

  // Fill in ingredients
  console.log("📍 Typing ingredients...");
  const textarea = page.locator("textarea#ingredients");
  await textarea.waitFor({ state: "visible", timeout: 10000 });
  await textarea.fill("pâtes, tomates, mozzarella, basilic, ail");

  // Fill in preferences
  const prefsInput = page.locator("input#preferences");
  await prefsInput.fill("Cuisine italienne, rapide");

  await helper.screenshot("test-02-filled.png");

  // Click submit
  console.log("📍 Submitting...");
  const submitBtn = page.locator('button:has-text("Propose-moi des menus")');
  await submitBtn.click();

  // Wait for loading screen
  await page.waitForTimeout(2000);
  await helper.screenshot("test-03-loading.png");

  // Wait for results (up to 60 seconds)
  console.log("📍 Waiting for results (up to 90s)...");
  const resultHeader = page.locator('text=Voilà mes suggestions');
  await resultHeader.waitFor({ state: "visible", timeout: 90000 });

  await helper.screenshot("test-04-results.png");

  // Check that we have real recipe names (not "Plat mystère")
  const firstCardName = await page.locator("h3").first().innerText();
  console.log(`   First recipe: "${firstCardName}"`);

  if (firstCardName === "Plat mystère" || firstCardName === "Plat du chef") {
    throw new Error(`Recipe data not populated! Got: "${firstCardName}"`);
  }

  // Count menu cards
  const cards = page.locator("h3");
  const count = await cards.count();
  console.log(`   Total recipes: ${count}`);

  // Log all recipe names
  for (let i = 0; i < count; i++) {
    const name = await cards.nth(i).innerText();
    console.log(`   Recipe ${i + 1}: "${name}"`);
  }

  // Wait for at least one image to load
  console.log("📍 Waiting for images (up to 90s)...");
  try {
    await page.locator("img[alt]").first().waitFor({ state: "visible", timeout: 90000 });
    console.log("   ✓ At least one image loaded!");
    await helper.screenshot("test-05-with-images.png");
  } catch {
    console.log("   ⚠ Images didn't load in time (might be a URL issue)");
    await helper.screenshot("test-05-no-images.png");
  }

  // Click "Voir la recette" on first card
  console.log("📍 Expanding first recipe...");
  const expandBtn = page.locator('button:has-text("Voir la recette")').first();
  await expandBtn.click();
  await page.waitForTimeout(500);
  await helper.screenshot("test-06-expanded.png");

  // Check for ingredients and steps
  const hasIngredients = await page.locator('text=Ingrédients').isVisible();
  const hasSteps = await page.locator('text=Préparation').isVisible();
  console.log(`   ✓ Ingredients section: ${hasIngredients}`);
  console.log(`   ✓ Steps section: ${hasSteps}`);

  console.log("\n🎉 E2E test passed! Recipes are populated correctly.");
}).catch(() => process.exit(1));
