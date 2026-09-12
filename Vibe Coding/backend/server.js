import "dotenv/config";
import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);
const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

app.use(cors());
app.use(express.json({ limit: "100kb" }));

const interviewRules = `You are the AI Interview Coach, acting as a professional technical interviewer.
Ask one question at a time about the requested topic and difficulty.
Easy questions test definitions and recall. Medium questions test applied problem solving.
Hard questions test trade-offs and system-design thinking.
Be concise, professional, and encouraging. Never reveal answers, teach, or explain concepts.
If an answer is strong, acknowledge it briefly and move to another aspect.
If partly right, ask exactly one probing follow-up without hints.
If wrong, note the gap in one line and move on.
End early after repeated struggles, or once the key areas are covered for a strong candidate.`;

function requireFields(body, fields) {
  const missing = fields.filter((field) => typeof body[field] !== "string" || !body[field].trim());
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }
}

function historyText(history) {
  if (!Array.isArray(history)) return "No previous conversation.";
  return history
    .filter((entry) => entry && typeof entry.role === "string" && typeof entry.content === "string")
    .map((entry) => `${entry.role === "user" ? "Candidate" : "Interviewer"}: ${entry.content}`)
    .join("\n") || "No previous conversation.";
}

async function askGroq(messages, responseFormat = null) {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error("GROQ_API_KEY is not configured.");
    error.status = 500;
    throw error;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: groqModel,
      temperature: 0.4,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {})
    })
  });

  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Groq request failed (${response.status}): ${details}`);
    error.status = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("Groq returned an empty response.");
    error.status = 502;
    throw error;
  }
  return content.trim();
}

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model returned invalid JSON.");
    return JSON.parse(match[0]);
  }
}

app.post("/start", async (request, response, next) => {
  try {
    requireFields(request.body, ["topic", "difficulty"]);
    const { topic, difficulty, history = [] } = request.body;
    const content = await askGroq([
      { role: "system", content: interviewRules },
      {
        role: "user",
        content: `Start an interview on "${topic}" at ${difficulty} difficulty.
Conversation so far:
${historyText(history)}
Return only the first interviewer question as plain text.`
      }
    ]);
    response.json({ message: content, ended: false });
  } catch (error) {
    next(error);
  }
});

app.post("/answer", async (request, response, next) => {
  try {
    requireFields(request.body, ["topic", "difficulty"]);
    const { topic, difficulty } = request.body;
    if (!Array.isArray(request.body.history)) {
      const error = new Error("history must be an array.");
      error.status = 400;
      throw error;
    }
    const content = await askGroq([
      { role: "system", content: interviewRules },
      {
        role: "user",
        content: `Evaluate the candidate's latest response in this ${difficulty} interview about "${topic}".
Conversation:
${historyText(request.body.history)}
Return JSON only with exactly two fields:
{"message":"the next concise interviewer message","ended":false}
Set ended to true only when the interview should finish now.`
      }
    ], { type: "json_object" });
    const result = parseJson(content);
    if (typeof result.message !== "string" || typeof result.ended !== "boolean") {
      const error = new Error("Model returned an invalid interviewer response.");
      error.status = 502;
      throw error;
    }
    response.json({ message: result.message.trim(), ended: result.ended });
  } catch (error) {
    next(error);
  }
});

app.post("/report", async (request, response, next) => {
  try {
    requireFields(request.body, ["topic", "difficulty"]);
    const { topic, difficulty } = request.body;
    if (!Array.isArray(request.body.history)) {
      const error = new Error("history must be an array.");
      error.status = 400;
      throw error;
    }
    const content = await askGroq([
      {
        role: "system",
        content: "You are an objective technical interview evaluator. Return strict JSON only. Reference actual candidate responses in strengths and weaknesses. Do not add fields."
      },
      {
        role: "user",
        content: `Evaluate this ${difficulty} interview about "${topic}".
Conversation:
${historyText(request.body.history)}
Return exactly:
{"score":0,"strengths":[],"weaknesses":[],"topics_to_revise":[],"verdict":"Weak","pass_fail":"Fail"}
Use score 0-100. Verdict bands: 85+ Excellent, 70-84 Good, 55-69 Adequate, below 55 Weak. Pass is 55 or higher.`
      }
    ], { type: "json_object" });
    const result = parseJson(content);
    const verdicts = new Set(["Excellent", "Good", "Adequate", "Weak"]);
    const outcomes = new Set(["Pass", "Fail"]);
    if (
      !Number.isFinite(result.score) || result.score < 0 || result.score > 100 ||
      !Array.isArray(result.strengths) || !Array.isArray(result.weaknesses) ||
      !Array.isArray(result.topics_to_revise) || !verdicts.has(result.verdict) ||
      !outcomes.has(result.pass_fail)
    ) {
      const error = new Error("Model returned an invalid report.");
      error.status = 502;
      throw error;
    }
    response.json({
      score: Math.round(result.score),
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      topics_to_revise: result.topics_to_revise,
      verdict: result.verdict,
      pass_fail: result.pass_fail
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  response.status(status).json({ error: error.message || "Unexpected server error." });
});

app.listen(port, () => {
  console.log(`Interview coach API listening on http://localhost:${port}`);
});
