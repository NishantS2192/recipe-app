// netlify/functions/recipes.mjs
// v2: supports a full kitchen list (up to 120 items), separate spices/basics,
// meal type and cuisine. Still has validation and rate limiting.

const MODEL = "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const config = {
  path: "/api/recipes",
  rateLimit: {
    windowLimit: 15, // max requests...
    windowSize: 60,  // ...per 60 seconds...
    aggregateBy: ["ip", "domain"] // ...per visitor IP
  }
};

const reply = (obj) => Response.json(obj);
const fail = (detail) => reply({ error: "failed", detail });
const clean = (s) => String(s).replace(/[\r\n\t]+/g, " ").trim();

const DIETS = ["", "Vegetarian", "Non vegetarian"];
const CALS = ["", "400", "600", "800"];
const STYLES = ["quick and simple", "hearty and comforting", "fresh and light"];
const MEALS = ["", "Breakfast", "Lunch", "Dinner", "Snack"];
const CUISINES = ["Indian", "Any"];

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    let b;
    try {
      b = await req.json();
    } catch {
      return fail("Bad request");
    }
    if (!b || typeof b !== "object") return fail("Bad request");

    let parts;

    if (b.mode === "detect") {
      // Photo is resized to ~1024px by the page, so this limit is generous.
      if (typeof b.image !== "string" || b.image.length < 100 || b.image.length > 1_500_000) {
        return fail("Invalid image");
      }
      parts = [
        { text: 'List the food ingredients you can clearly see in this photo. Reply with JSON only: {"ingredients":["..."]}. No duplicates. If there is no food, return {"ingredients":[]}.' },
        { inline_data: { mime_type: "image/jpeg", data: b.image } }
      ];
    } else if (b.mode === "recipes") {
      // Main ingredients (vegetables, dals, grains, dairy...)
      if (
        !Array.isArray(b.ingredients) ||
        b.ingredients.length < 1 ||
        b.ingredients.length > 120 ||
        b.ingredients.some((i) => typeof i !== "string")
      ) {
        return fail("Invalid ingredients");
      }
      const ingredients = b.ingredients.map(clean).filter(Boolean);
      if (!ingredients.length || ingredients.some((i) => i.length > 60)) {
        return fail("Invalid ingredients");
      }

      // Spices and cooking basics (optional)
      let pantry = [];
      if (b.pantry != null) {
        if (!Array.isArray(b.pantry) || b.pantry.length > 60 || b.pantry.some((i) => typeof i !== "string")) {
          return fail("Invalid pantry");
        }
        pantry = b.pantry.map(clean).filter(Boolean);
        if (pantry.some((i) => i.length > 40)) return fail("Invalid pantry");
      }

      const dietIn = typeof b.diet === "string" ? b.diet : "";
      const calIn = b.maxCal == null ? "" : String(b.maxCal);
      const diet = DIETS.includes(dietIn) ? dietIn : "";
      const maxCal = CALS.includes(calIn) ? calIn : "";
      const servings = Math.min(8, Math.max(1, parseInt(b.servings) || 2));
      const count = Math.min(3, Math.max(1, parseInt(b.count) || 3));
      const style = STYLES.includes(b.style) ? b.style : "";
      const meal = MEALS.includes(b.meal) ? b.meal : "";
      const cuisine = CUISINES.includes(b.cuisine) ? b.cuisine : "Indian";

      const dietText =
        diet === "Vegetarian"
          ? "All dishes must be vegetarian, with no meat, fish or eggs."
          : diet === "Non vegetarian"
          ? "All dishes must be non vegetarian, using meat, fish or eggs. If the list has none, put one in the extra items to buy."
          : "Dishes can be vegetarian or non vegetarian.";
      const calText = maxCal
        ? `Each dish must have at most ${maxCal} kcal per serving.`
        : "Prefer lighter, balanced dishes.";
      const pantryText = pantry.length
        ? `You also have these spices and basics available: ${pantry.join(", ")}. Do not list them under extra items to buy.`
        : "Basic pantry items like oil, salt and spices can be assumed.";
      const mealText = meal ? `The dishes should suit ${meal.toLowerCase()}.` : "";
      const cuisineText =
        cuisine === "Indian"
          ? "Suggest everyday Indian home-style dishes that a typical Indian household would cook."
          : "";

      parts = [{
        text: `Suggest ${count} different dish${count > 1 ? "es" : ""}${style ? " (style: " + style + ")" : ""} made mainly from these ingredients: ${ingredients.join(", ")}.
You do not need to use every ingredient. Pick the combinations that make the best dishes.
${pantryText} ${mealText} ${cuisineText} ${dietText} ${calText}
Each dish serves ${servings}. Scale the quantities to ${servings} servings.
Estimate nutrition per single serving, as whole numbers: calories in kcal, and protein, carbs and fat in grams. Count cooking oil and sauces.
Reply with JSON only, in exactly this shape:
{"recipes":[{"name":"","time":"25 min","servings":${servings},"calories":450,"protein":20,"carbs":50,"fat":15,"needs":["quantity and item"],"extra":["items not in the list"],"steps":["..."]}]}`
      }];
    } else {
      return fail("Unknown mode");
    }

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": (process.env.GEMINI_API_KEY || "").trim()
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const data = await response.json();

    if (!response.ok) {
      const m = (data.error && data.error.message) || "";
      console.error("Gemini error:", response.status, m);
      const busy = response.status === 429 || /quota|rate|exhaust/i.test(m);
      return reply({ error: busy ? "busy" : "failed", detail: m });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Empty Gemini response:", JSON.stringify(data).slice(0, 500));
      return fail("Empty response");
    }
    return reply({ result: text });
  } catch (e) {
    console.error("Function error:", e.message);
    return fail(e.message);
  }
};
