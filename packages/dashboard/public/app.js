// Client for the Agent Arc Status dashboard. Renders arc cards from JSON state
// streamed over SSE. All event text is inserted with textContent / createElement
// (never innerHTML), so a hostile title or body can never execute — the trust
// boundary from spec §9.4 is enforced here in the DOM layer.

const PHASE_SYMBOL = { started: "▶", milestone: "✓", heartbeat: "·", done: "■", blocked: "⛔" };
const STALL_MS = 20 * 60 * 1000;

const arcsEl = document.getElementById("arcs");
const emptyEl = document.getElementById("empty");
const connEl = document.getElementById("conn");

const cards = new Map();
const receipt = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function upsert(state) {
  receipt.set(state.arc_id, Date.now());

  let card = cards.get(state.arc_id);
  if (!card) {
    card = el("section", "card");
    cards.set(state.arc_id, card);
    arcsEl.appendChild(card);
  }
  card.dataset.status = state.status;
  card.textContent = "";

  const head = el("div", "head");
  head.appendChild(el("span", "sym", PHASE_SYMBOL[state.phase] || "•"));
  head.appendChild(el("span", "title", state.title));
  head.appendChild(el("span", "badge " + state.status, state.status));
  card.appendChild(head);

  if (typeof state.step === "number" && typeof state.total === "number") {
    const bar = el("div", "bar");
    const fill = el("div", "fill");
    fill.style.width = Math.round((state.step / state.total) * 100) + "%";
    bar.appendChild(fill);
    card.appendChild(bar);
    let meta = "step " + state.step + "/" + state.total;
    if (typeof state.eta_minutes === "number") meta += " · ETA " + state.eta_minutes + "m";
    card.appendChild(el("div", "meta", meta));
  } else if (typeof state.eta_minutes === "number") {
    card.appendChild(el("div", "meta", "ETA " + state.eta_minutes + "m"));
  }

  card.appendChild(
    el("div", "meta dim", state.eventCount + " events · " + state.milestones.length + " milestones"),
  );

  if (state.blocked) {
    const blocker = el("div", "blocker");
    blocker.appendChild(el("strong", null, "blocked: "));
    blocker.appendChild(document.createTextNode(state.blocked.title));
    card.appendChild(blocker);
  }

  emptyEl.style.display = cards.size ? "none" : "";
}

function connect() {
  const source = new EventSource("/events");
  source.addEventListener("open", () => {
    connEl.textContent = "live";
    connEl.className = "conn live";
  });
  source.addEventListener("error", () => {
    connEl.textContent = "reconnecting…";
    connEl.className = "conn";
  });
  source.addEventListener("snapshot", (e) => {
    JSON.parse(e.data).forEach(upsert);
  });
  source.addEventListener("event", (e) => {
    upsert(JSON.parse(e.data));
  });
}

connect();

setInterval(() => {
  const now = Date.now();
  for (const [id, card] of cards) {
    const stalled = card.dataset.status === "active" && now - (receipt.get(id) || now) > STALL_MS;
    card.classList.toggle("stalled", stalled);
  }
}, 15000);
