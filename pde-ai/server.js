const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "PDE AI Developer is running!"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are PDE AI Developer. Help users build apps and write high-quality code.\n\n${prompt}`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI.";

    res.json({ reply });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      reply: "Server error."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 PDE AI running at http://localhost:${PORT}`);
});
