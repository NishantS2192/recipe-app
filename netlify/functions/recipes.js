exports.handler = async (event) => {
  try {
    const b = JSON.parse(event.body);
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + process.env.GEMINI_API_KEY;
    let parts;

    if (b.mode === "detect") {
      parts = [
        { text: 'List the food ingredients you can clearly see in this photo. Reply with JSON only: {"ingredients":["..."]}. No duplicates. If there is no food, return {"ingredients":[]}.' },
        { inline_data: { mime_type: "image/jpeg", data: b.image } }
      ];
    } else {
      const diet = b.diet === "Vegetarian"
        ? "All dishes must be vegetarian, with no meat, fish or eggs."
        : b.diet === "Non vegetarian"
        ? "All dishes must be non vegetarian, using meat, fish or eggs. If the list has none, put one in the extra items to buy."
        : "Dishes can be vegetarian or non vegetarian.";
      const cal = b.maxCal
        ? `Each dish must have at most ${b.maxCal} kcal per serving.`
        : "Prefer lighter, balanced dishes.";
      const servings = Math.min(8, Math.max(1, parseInt(b.servings) || 2));
      parts = [{ text: `Suggest 3 different dishes made mainly from these ingredients: ${b.ingredients.join(", ")}.
Basic pantry items like oil, salt and spices can be assumed. ${diet} ${cal}
Each dish serves ${servings}. Scale the quantities to ${servings} servings.
Estimate nutrition per single serving, as whole numbers: calories in kcal, and protein, carbs and fat in grams. Count cooking oil and sauces.
Reply with JSON only, in exactly this shape:
{"recipes":[{"name":"","time":"25 min","servings":${servings},"calories":450,"protein":20,"carbs":50,"fat":15,"needs":["quantity and item"],"extra":["items not in the list"],"steps":["..."]}]}` }];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    const data = await response.json();

    if (!response.ok) {
      const m = (data.error && data.error.message) || "";
      const busy = response.status === 429 || /quota|rate|exhaust/i.test(m);
      return reply({ error: busy ? "busy" : "failed", detail: m });
    }
    return reply({ result: data.candidates[0].content.parts[0].text });
  } catch (e) {
    return reply({ error: "failed", detail: e.message });
  }
};

const reply = (obj) => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj)
});
