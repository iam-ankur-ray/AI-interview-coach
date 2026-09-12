const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000";
const state = { topic: "", difficulty: "", history: [], ended: false };
const $ = (selector) => document.querySelector(selector);

function setStatus(message = "") { $("#status").textContent = message; }
function addMessage(role, content) {
  state.history.push({ role, content });
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.innerHTML = `<strong>${role === "user" ? "You" : "Interviewer"}</strong>`;
  item.append(document.createTextNode(content));
  $("#transcript").append(item);
  item.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function callApi(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

$("#setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  state.topic = $("#topic").value.trim();
  state.difficulty = $("#difficulty").value;
  setStatus("Starting your interview...");
  try {
    const result = await callApi("/start", { topic: state.topic, difficulty: state.difficulty, history: [] });
    $("#setup").classList.add("hidden");
    $("#interview").classList.remove("hidden");
    $("#session-topic").textContent = state.topic;
    $("#session-difficulty").textContent = state.difficulty;
    addMessage("interviewer", result.message);
    setStatus("");
  } catch (error) { setStatus(error.message); }
});

$("#answer-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const answer = $("#answer").value.trim();
  if (!answer || state.ended) return;
  addMessage("user", answer);
  $("#answer").value = "";
  const button = event.submitter;
  button.disabled = true;
  setStatus("Evaluating your response...");
  try {
    const result = await callApi("/answer", { topic: state.topic, difficulty: state.difficulty, history: state.history });
    addMessage("interviewer", result.message);
    state.ended = result.ended;
    if (state.ended) {
      $("#answer-form").classList.add("hidden");
      $("#report-button").classList.remove("hidden");
    }
    setStatus("");
  } catch (error) { setStatus(error.message); }
  finally { button.disabled = false; }
});

$("#report-button").addEventListener("click", async () => {
  setStatus("Preparing your report...");
  try {
    const report = await callApi("/report", { topic: state.topic, difficulty: state.difficulty, history: state.history });
    $("#report").innerHTML = `<h2>Performance report</h2>
      <div class="report-score">${report.score}<small>/100</small></div>
      <p><strong>${report.verdict} · ${report.pass_fail}</strong></p>
      ${renderList("Strengths", report.strengths)}
      ${renderList("Weaknesses", report.weaknesses)}
      ${renderList("Topics to revise", report.topics_to_revise)}`;
    $("#report").classList.remove("hidden");
    setStatus("");
  } catch (error) { setStatus(error.message); }
});

function renderList(title, values) {
  return `<h3>${title}</h3><ul class="report-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}
function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}
