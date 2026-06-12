export function telemetryPage(pollMs: number) {
  return `<!doctype html>
<html lang="en" style="--poll-ms: ${pollMs}ms">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenCode Telemetry</title>
  <script>
    (function () {
      const key = "opencode-telemetry-theme";
      const stored = localStorage.getItem(key);
      const theme = stored === "light" || stored === "dark" ? stored : "dark";
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  <style>
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0d1117;
      --panel: #161b22;
      --control: #21262d;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #58a6ff;
      --good: #3fb950;
      --warn: #d29922;
      --row-hover: rgba(88, 166, 255, 0.06);
    }
    :root[data-theme="light"] {
      color-scheme: light;
      --bg: #f6f8fa;
      --panel: #ffffff;
      --control: #f6f8fa;
      --border: #d0d7de;
      --text: #1f2328;
      --muted: #656d76;
      --accent: #0969da;
      --good: #1a7f37;
      --warn: #9a6700;
      --row-hover: rgba(9, 105, 218, 0.06);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      position: sticky;
      top: 0;
      z-index: 2;
      overflow: hidden;
    }
    .header-live-bar {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 2px;
      width: 100%;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
      transform: translateX(-100%);
      opacity: 0;
      pointer-events: none;
    }
    body.is-live .header-live-bar {
      opacity: 1;
      animation: live-sweep var(--poll-ms) linear infinite;
    }
    @keyframes live-sweep {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .meta { color: var(--muted); font-size: 12px; }
    .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    button, select {
      background: var(--control);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
    }
    button.active { border-color: var(--accent); color: var(--accent); }
    body.is-live #toggle-live.active {
      animation: live-btn-glow 2s ease-in-out infinite;
    }
    @keyframes live-btn-glow {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); }
      50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent); }
    }
    main { padding: 20px; display: grid; gap: 16px; }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      padding: 0 0 4px;
    }
    @media (max-width: 900px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .cards { grid-template-columns: 1fr; } }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      min-height: 92px;
    }
    .card .label { color: var(--muted); font-size: 12px; font-weight: 500; }
    .card .value {
      font-size: 24px;
      font-weight: 600;
      margin-top: 6px;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
    }
    .card .card-sub {
      margin-top: 8px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--muted);
    }
    .panels { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    @media (max-width: 1100px) { .panels { grid-template-columns: 1fr; } }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .section-heading, .panel-heading {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
    }
    .section-heading h2, .panel-heading h2 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }
    .section-meta, .panel-meta {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .summary-section .cards { padding-top: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; position: sticky; top: 0; background: var(--panel); z-index: 1; }
    th .th-hint {
      display: block;
      margin-top: 2px;
      font-size: 10px;
      font-weight: 500;
      color: color-mix(in srgb, var(--muted) 82%, transparent);
    }
    tbody tr:hover { background: var(--row-hover); }
    .table-wrap { max-height: 62vh; overflow: auto; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .session-cell {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .metrics {
      display: grid;
      gap: 3px;
      min-width: 108px;
    }
    .metric {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .metric-k {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .metric-v { font-variant-numeric: tabular-nums; }
    .token-pair {
      display: grid;
      gap: 3px;
      min-width: 88px;
    }
    .token-line {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      font-variant-numeric: tabular-nums;
    }
    .token-k {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .detail-line { font-variant-numeric: tabular-nums; }
    .pill {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--control);
      border: 1px solid var(--border);
      font-size: 11px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 64px;
      color: var(--good);
    }
    .status.paused { color: var(--warn); }
    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--good);
      opacity: 0;
      transform: scale(0.8);
    }
    body.is-live .live-dot {
      opacity: 1;
      animation: live-dot-pulse 1.4s ease-in-out infinite;
    }
    @keyframes live-dot-pulse {
      0%, 100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--good) 55%, transparent);
      }
      50% {
        transform: scale(1.2);
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--good) 0%, transparent);
      }
    }
    body.is-live .status.live .live-label {
      animation: live-label-pulse 2s ease-in-out infinite;
    }
    @keyframes live-label-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
    .empty { color: var(--muted); padding: 20px; text-align: center; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>OpenCode Telemetry</h1>
      <div class="meta" id="db-path"></div>
    </div>
    <div class="controls">
      <select id="event-filter">
        <option value="">All events</option>
        <option value="llm.completion" selected>llm.completion</option>
        <option value="turn.completed">turn.completed</option>
        <option value="tool.used">tool.used</option>
      </select>
      <select id="model-filter">
        <option value="">All models</option>
      </select>
      <button id="toggle-theme" title="Toggle light/dark theme">Dark</button>
      <button id="toggle-live" class="active">Live</button>
      <span class="status live" id="status">
        <span class="live-dot" aria-hidden="true"></span>
        <span class="live-label" id="status-label">polling</span>
      </span>
    </div>
    <div class="header-live-bar" aria-hidden="true"></div>
  </header>
  <main>
    <section class="summary-section">
      <div class="section-heading">
        <h2>All-time statistics</h2>
        <p class="section-meta">Totals across all telemetry stored in the database</p>
      </div>
      <div class="cards" id="summary-cards"></div>
    </section>
    <section class="panels">
      <div class="panel">
        <div class="panel-heading">
          <h2>Recent events</h2>
          <p class="panel-meta" id="events-scope">Latest events</p>
        </div>
        <div class="table-wrap">
          <table>
            <thead id="events-head"></thead>
            <tbody id="events-body"></tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h2>By model</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Calls</th>
                <th title="Input tokens / output tokens">In / out</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody id="models-body"></tbody>
          </table>
        </div>
      </div>
    </section>
  </main>
  <script>
    const pollMs = ${pollMs};
    const themeKey = "opencode-telemetry-theme";
    const summaryCards = [
      { label: "Total cost", hint: "Estimated LLM spend across all stored telemetry" },
      { label: "LLM calls", hint: "Completed LLM completion events" },
      { label: "Tokens", hint: "Total input and output tokens across all LLM calls" },
      { label: "Latency", hint: "Average LLM timing per completion" },
      { label: "Turns", hint: "Completed user turns" },
      { label: "Tool calls", hint: "Completed tool invocations" },
    ];
    const eventHeaders = {
      "": [
        ["Time", ""],
        ["Event", ""],
        ["Session", ""],
        ["Target", "Model, tool, or provider"],
        ["Details", "Tokens, status, or activity"],
        ["Cost", ""],
        ["Duration", ""],
      ],
      "llm.completion": [
        ["Time", ""],
        ["Event", ""],
        ["Session", ""],
        ["Model", ""],
        ["Tokens", "Prompt in · completion out"],
        ["Cost", ""],
        ["Latency", "TTFT · generation · total stream"],
      ],
      "turn.completed": [
        ["Time", ""],
        ["Event", ""],
        ["Session", ""],
        ["Model", ""],
        ["Activity", "Assistant steps and tool calls"],
        ["Cost", ""],
        ["Duration", "End-to-end turn time"],
      ],
      "tool.used": [
        ["Time", ""],
        ["Event", ""],
        ["Session", ""],
        ["Tool", ""],
        ["Status", "Execution result"],
        ["Cost", ""],
        ["Duration", "Tool execution time"],
      ],
    };
    let live = true;
    let since = 0;
    const rows = new Map();
    const renderedEventIds = new Set();
    const maxRows = 300;
    let summaryInitialized = false;
    let lastModelsJson = "";
    let lastModelOptionsJson = "";
    let lastMetaText = "";

    const $ = (id) => document.getElementById(id);
    const theme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const modelKey = (providerID, modelID) => providerID + "/" + modelID;

    function renderThemeButton() {
      const current = theme();
      $("toggle-theme").textContent = current === "dark" ? "Dark" : "Light";
      $("toggle-theme").title = current === "dark" ? "Switch to light theme" : "Switch to dark theme";
    }

    function setTheme(next) {
      document.documentElement.dataset.theme = next;
      localStorage.setItem(themeKey, next);
      renderThemeButton();
    }

    function renderLiveState(label) {
      document.body.classList.toggle("is-live", live);
      $("toggle-live").classList.toggle("active", live);
      $("status-label").textContent = label ?? (live ? "live" : "paused");
      $("status").className = live ? "status live" : "status paused";
      renderEventsScope(rows.size);
    }

    function renderEventsScope(count) {
      const event = $("event-filter").value;
      const model = $("model-filter").value;
      const parts = ["Latest " + maxRows + " events"];
      if (count > 0) parts.push("showing " + count);
      if (event) parts.push(event);
      if (model) parts.push(model);
      parts.push(live ? "updates every " + (pollMs / 1000) + "s" : "paused");
      $("events-scope").textContent = parts.join(" · ");
    }
    const fmtTime = (ms) => new Date(ms).toLocaleString();
    const fmtNum = (n) => Number(n || 0).toLocaleString();
    const fmtCost = (n) => "$" + Number(n || 0).toFixed(4);
    const fmtMs = (n) => fmtNum(n) + " ms";
    const fmtDuration = (ms) => {
      if (ms === undefined || ms === null) return "-";
      const n = Number(ms);
      if (!Number.isFinite(n)) return "-";
      if (n >= 1000) return (Math.round(n / 100) / 10).toFixed(1) + "s";
      return fmtNum(Math.round(n)) + "ms";
    };
    const escapeAttr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const shortSession = (sessionID) => {
      if (!sessionID || sessionID === "-") return "-";
      if (sessionID.length <= 14) return sessionID;
      return "…" + sessionID.slice(-12);
    };
    const metric = (key, value, title) =>
      '<div class="metric" title="' + escapeAttr(title) + '"><span class="metric-k">' + key + '</span><span class="metric-v mono">' + value + "</span></div>";
    const tokenLine = (key, value, title) =>
      '<div class="token-line" title="' + escapeAttr(title) + '"><span class="token-k">' + key + '</span><span class="mono">' + value + "</span></div>";

    function renderEventHeaders() {
      const event = $("event-filter").value;
      const headers = eventHeaders[event] || eventHeaders[""];
      $("events-head").innerHTML =
        "<tr>" +
        headers
          .map(([label, hint]) => {
            const title = hint ? ' title="' + escapeAttr(hint) + '"' : "";
            const hintHtml = hint ? '<span class="th-hint">' + hint + "</span>" : "";
            return "<th" + title + ">" + label + hintHtml + "</th>";
          })
          .join("") +
        "</tr>";
    }

    function renderModelFilter(models) {
      const select = $("model-filter");
      const selected = select.value;
      const keys = models.map((row) => modelKey(row.providerID, row.modelID));
      const nextJson = JSON.stringify(keys);
      if (nextJson === lastModelOptionsJson && select.options.length > 0) return;
      lastModelOptionsJson = nextJson;
      const options = ['<option value="">All models</option>'].concat(
        keys.map((key) => '<option value="' + key + '"' + (key === selected ? ' selected' : '') + '>' + key + '</option>'),
      );
      select.innerHTML = options.join("");
    }

    function renderSummary(summary) {
      const cards = [
        {
          value: fmtCost(summary.cost),
          sub: summary.cacheReadTokens > 0 ? "Cache read " + fmtNum(summary.cacheReadTokens) : "No cache reads",
        },
        {
          value: fmtNum(summary.calls),
          sub: "Avg gen " + fmtDuration(summary.avgDurationMs),
        },
        {
          value: fmtNum(summary.inputTokens) + " / " + fmtNum(summary.outputTokens),
          sub: "In / out",
        },
        {
          value: fmtDuration(summary.avgTimeToFirstTokenMs),
          sub: "Gen " + fmtDuration(summary.avgDurationMs) + " · stream " + fmtDuration(summary.avgStreamMs),
        },
        {
          value: fmtNum(summary.turns),
          sub: summary.turns > 0 ? "Avg " + fmtDuration(summary.avgTurnDurationMs) + " per turn" : "No turns yet",
        },
        {
          value: fmtNum(summary.toolCalls),
          sub: summary.toolCalls > 0 ? "Avg " + fmtDuration(summary.avgToolDurationMs) + " per call" : "No tool calls yet",
        },
      ];

      if (!summaryInitialized) {
        $("summary-cards").innerHTML = summaryCards
          .map(
            (card, index) =>
              '<div class="card" data-index="' +
              index +
              '" title="' +
              escapeAttr(card.hint) +
              '"><div class="label">' +
              card.label +
              '</div><div class="value mono"></div><div class="card-sub"></div></div>',
          )
          .join("");
        summaryInitialized = true;
      }

      $("summary-cards").querySelectorAll(".card").forEach((el, index) => {
        const card = cards[index];
        if (!card) return;
        const value = el.querySelector(".value");
        const sub = el.querySelector(".card-sub");
        if (value && value.textContent !== card.value) value.textContent = card.value;
        if (sub && sub.textContent !== card.sub) sub.textContent = card.sub;
      });

      const models = summary.byModel || [];
      const modelsJson = JSON.stringify(models);
      if (modelsJson === lastModelsJson) return;
      lastModelsJson = modelsJson;
      $("models-body").innerHTML = models.length
        ? models
            .map(
              (row) =>
                '<tr><td class="mono">' +
                row.providerID +
                "/" +
                row.modelID +
                '</td><td class="mono">' +
                fmtNum(row.calls) +
                '</td><td><div class="token-pair">' +
                tokenLine("In", fmtNum(row.inputTokens), "Input tokens") +
                tokenLine("Out", fmtNum(row.outputTokens), "Output tokens") +
                '</div></td><td class="mono">' +
                fmtCost(row.cost) +
                "</td></tr>",
            )
            .join("")
        : '<tr><td colspan="4" class="empty">No model data yet</td></tr>';
    }

    function rowHtml(row) {
      const p = row.properties || {};
      const session = p.sessionID || "-";
      const sessionLabel = shortSession(session);
      const sessionTitle = session === sessionLabel ? "" : ' title="' + escapeAttr(session) + '"';
      let target = "-";
      let detail = "-";
      let cost = "-";
      let timing = "-";

      if (row.event === "llm.completion") {
        target = p.providerID && p.modelID ? p.providerID + "/" + p.modelID : "-";
        detail =
          '<div class="token-pair">' +
          tokenLine("In", fmtNum(p.inputTokens), "Prompt and context tokens sent to the model") +
          tokenLine("Out", fmtNum(p.outputTokens), "Completion tokens returned by the model") +
          "</div>";
        cost = p.cost === undefined ? "-" : fmtCost(p.cost);
        timing =
          '<div class="metrics">' +
          metric("TTFT", fmtDuration(p.timeToFirstTokenMs), "Time from request start to first token") +
          metric("Gen", fmtDuration(p.durationMs), "Active model generation time") +
          metric("Total", fmtDuration(p.streamMs), "End-to-end stream duration") +
          "</div>";
      } else if (row.event === "tool.used") {
        target = p.tool || "-";
        detail = '<span class="pill">' + (p.status || "-") + "</span>";
        timing = p.durationMs === undefined ? "-" : '<span class="mono detail-line">' + fmtDuration(p.durationMs) + "</span>";
      } else if (row.event === "turn.completed") {
        target = p.providerID && p.modelID ? p.providerID + "/" + p.modelID : "-";
        detail =
          '<div class="detail-line">' +
          (p.assistantSteps === undefined ? "-" : fmtNum(p.assistantSteps) + " steps") +
          " · " +
          (p.toolCalls === undefined ? "-" : fmtNum(p.toolCalls) + " tools") +
          "</div>";
        timing = p.durationMs === undefined ? "-" : '<span class="mono detail-line">' + fmtDuration(p.durationMs) + "</span>";
      } else {
        target = p.providerID && p.modelID ? p.providerID + "/" + p.modelID : p.tool || "-";
        if (p.inputTokens !== undefined || p.outputTokens !== undefined) {
          detail = fmtNum(p.inputTokens) + " in · " + fmtNum(p.outputTokens) + " out";
        }
        if (p.durationMs !== undefined) timing = '<span class="mono detail-line">' + fmtDuration(p.durationMs) + "</span>";
      }

      return (
        '<tr data-id="' +
        row.id +
        '"><td class="mono">' +
        fmtTime(row.time_created) +
        '</td><td><span class="pill">' +
        row.event +
        '</span></td><td class="mono session-cell"' +
        sessionTitle +
        ">" +
        sessionLabel +
        '</td><td class="mono">' +
        target +
        "</td><td>" +
        detail +
        '</td><td class="mono">' +
        cost +
        "</td><td>" +
        timing +
        "</td></tr>"
      );
    }

    function resetEventsView() {
      renderedEventIds.clear();
      $("events-body").innerHTML = "";
    }

    function renderEvents(full) {
      const list = Array.from(rows.values()).sort((a, b) => b.id - a.id).slice(0, maxRows);
      const body = $("events-body");

      if (full) {
        resetEventsView();
        body.innerHTML = list.length
          ? list.map(rowHtml).join("")
          : '<tr><td colspan="7" class="empty">Waiting for telemetry events…</td></tr>';
        for (const row of list) renderedEventIds.add(row.id);
        return;
      }

      if (!list.length) {
        if (!body.children.length) {
          body.innerHTML = '<tr><td colspan="7" class="empty">Waiting for telemetry events…</td></tr>';
        }
        return;
      }

      const empty = body.querySelector(".empty");
      if (empty) empty.remove();

      const fresh = list.filter((row) => !renderedEventIds.has(row.id));
      if (!fresh.length) return;

      for (const row of fresh.sort((a, b) => b.id - a.id)) {
        body.insertAdjacentHTML("afterbegin", rowHtml(row));
        renderedEventIds.add(row.id);
      }

      while (body.children.length > maxRows) {
        const last = body.lastElementChild;
        if (!last || !last.dataset.id) break;
        renderedEventIds.delete(Number(last.dataset.id));
        last.remove();
      }
    }

    function resetFilters() {
      since = 0;
      rows.clear();
      resetEventsView();
      lastModelsJson = "";
    }

    async function refresh() {
      const event = $("event-filter").value;
      const model = $("model-filter").value;
      const backfill = since === 0;
      const params = new URLSearchParams();
      if (backfill) params.set("latest", String(maxRows));
      if (!backfill) {
        params.set("since", String(since));
        params.set("limit", "200");
      }
      if (event) params.set("event", event);
      if (model) params.set("model", model);

      const summaryParams = model ? "?" + new URLSearchParams({ model }) : "";
      const [eventsRes, summaryRes, modelsRes, metaRes] = await Promise.all([
        fetch("/api/telemetry?" + params),
        fetch("/api/summary" + summaryParams),
        fetch("/api/models"),
        fetch("/api/meta"),
      ]);

      const events = await eventsRes.json();
      const summary = await summaryRes.json();
      const models = await modelsRes.json();
      const meta = await metaRes.json();

      const metaText = meta.dbPath + " · poll " + meta.pollMs + "ms · latest id " + meta.latestId;
      if (metaText !== lastMetaText) {
        $("db-path").textContent = metaText;
        lastMetaText = metaText;
      }

      renderModelFilter(models.items || []);
      renderSummary(summary);

      let added = 0;
      for (const row of events.items || []) {
        rows.set(row.id, row);
        since = Math.max(since, row.id);
        added += 1;
      }
      if (backfill && added === 0) since = meta.latestId;
      while (rows.size > maxRows) {
        const oldest = Math.min(...rows.keys());
        rows.delete(oldest);
      }
      renderEvents(backfill || (added === 0 && renderedEventIds.size === 0));
      renderLiveState(live ? "live" : "paused");
    }

    $("toggle-theme").addEventListener("click", () => {
      setTheme(theme() === "dark" ? "light" : "dark");
    });

    $("toggle-live").addEventListener("click", () => {
      live = !live;
      renderLiveState();
    });

    $("event-filter").addEventListener("change", () => {
      renderEventHeaders();
      resetFilters();
      if (live) refresh();
    });

    $("model-filter").addEventListener("change", () => {
      resetFilters();
      lastModelsJson = "";
      if (live) refresh();
    });

    async function loop() {
      if (live) {
        try { await refresh(); } catch (err) { renderLiveState("error"); }
      }
      setTimeout(loop, pollMs);
    }

    renderThemeButton();
    renderEventHeaders();
    renderLiveState("polling");
    refresh();
    loop();
  </script>
</body>
</html>`
}
