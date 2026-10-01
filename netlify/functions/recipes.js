exports.handler = async (event) => {
  const { image } = JSON.parse(event.body);

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + process.env.GEMINI_API_KEY;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: "List the food ingredients you can see in this photo as a short comma separated list." },
          { inline_data: { mime_type: "image/jpeg", data: image } }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  return { statusCode: 200, body: JSON.stringify({ result: text }) };
};