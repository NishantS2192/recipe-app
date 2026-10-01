exports.handler = async (event) => {
  try {
    const { image } = JSON.parse(event.body);

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + process.env.GEMINI_API_KEY;

    const prompt = `Look at this photo and list the food ingredients you can clearly see.
Then suggest 3 dishes that can be made mainly from them. Basic pantry items like oil, salt and spices can be assumed.
Reply with JSON only, in exactly this shape:
{"ingredients":["..."],"recipes":[{"name":"","time":"25 min","servings":2,"needs":["quantity and item"],"extra":["items not in the photo"],"steps":["..."]}]}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: image } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const reason = (data.error && data.error.message) || response.status;
      return { statusCode: 200, body: JSON.stringify({ result: "Gemini error: " + reason }) };
    }

    const text = data.candidates[0].content.parts[0].text;
    return { statusCode: 200, body: JSON.stringify({ result: text }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ result: "Function error: " + e.message }) };
  }
};
