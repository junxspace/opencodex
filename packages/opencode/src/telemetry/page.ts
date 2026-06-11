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
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
    }
    .card .label { color: var(--muted); font-size: 12px; }
    .card .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
    .panels { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    @media (max-width: 1100px) { .panels { grid-template-columns: 1fr; } }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    .panel h2 {
      margin: 0;
      padding: 12px 14px;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; position: sticky; top: 0; background: var(--panel); }
    tbody tr:hover { background: var(--row-hover); }
    .table-wrap { max-height: 62vh; overflow: auto; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
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
    <section class="cards" id="summary-cards"></section>
    <section class="panels">
      <div class="panel">
        <h2>Recent events</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Session</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Duration</th>
              </tr>
            </thead>
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
                <th>Tokens</th>
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
    let live = true;
    let since = 0;
    const rows = new Map();
    const maxRows = 300;

    const $ = (id) => document.getElementById(id);
    const theme = () => document.documentElement.dataset.theme === "light" ? "light" : "dark";

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
    }
    const fmtTime = (ms) => new Date(ms).toLocaleString();
    const fmtNum = (n) => Number(n || 0).toLocaleString();
    const fmtCost = (n) => "$" + Number(n || 0).toFixed(4);
    const fmtMs = (n) => fmtNum(n) + " ms";

    function renderSummary(summary) {
      $("summary-cards").innerHTML = [
        ["LLM calls", fmtNum(summary.calls)],
        ["Avg LLM gen", fmtMs(summary.avgDurationMs)],
        ["Avg TTFT", fmtMs(summary.avgTimeToFirstTokenMs)],
        ["Avg stream", fmtMs(summary.avgStreamMs)],
        ["Turns", fmtNum(summary.turns)],
        ["Avg turn", fmtMs(summary.avgTurnDurationMs)],
        ["Tool calls", fmtNum(summary.toolCalls)],
        ["Avg tool", fmtMs(summary.avgToolDurationMs)],
        ["Input tokens", fmtNum(summary.inputTokens)],
        ["Output tokens", fmtNum(summary.outputTokens)],
        ["Total cost", fmtCost(summary.cost)],
        ["Cache read", fmtNum(summary.cacheReadTokens)],
      ].map(([label, value]) => '<div class="card"><div class="label">' + label + '</div><div class="value mono">' + value + '</div></div>').join("");

      const models = summary.byModel || [];
      $("models-body").innerHTML = models.length
        ? models.map((row) => '<tr><td class="mono">' + row.providerID + '/' + row.modelID + '</td><td>' + fmtNum(row.calls) + '</td><td class="mono">' + fmtNum(row.inputTokens) + ' / ' + fmtNum(row.outputTokens) + '</td><td class="mono">' + fmtCost(row.cost) + '</td></tr>').join("")
        : '<tr><td colspan="4" class="empty">No model data yet</td></tr>';
    }

    function rowHtml(row) {
      const p = row.properties || {};
      const session = p.sessionID || "-";
      let model = "-";
      let tokens = "-";
      let cost = "-";
      const duration =
        row.event === "llm.completion"
          ? [
              p.timeToFirstTokenMs === undefined ? "-" : fmtMs(p.timeToFirstTokenMs),
              p.durationMs === undefined ? "-" : fmtMs(p.durationMs),
              p.streamMs === undefined ? "-" : fmtMs(p.streamMs),
            ].join(" / ")
          : p.durationMs === undefined
            ? "-"
            : fmtMs(p.durationMs);
      if (row.event === "llm.completion") {
        model = p.providerID && p.modelID ? p.providerID + "/" + p.modelID : "-";
        tokens = fmtNum(p.inputTokens) + " / " + fmtNum(p.outputTokens);
        cost = p.cost === undefined ? "-" : fmtCost(p.cost);
      } else if (row.event === "tool.used") {
        model = p.tool || "-";
        tokens = p.status || "-";
      } else if (row.event === "turn.completed") {
        model = p.providerID && p.modelID ? p.providerID + "/" + p.modelID : "-";
        tokens =
          (p.assistantSteps === undefined ? "-" : fmtNum(p.assistantSteps) + " steps") +
          " · " +
          (p.toolCalls === undefined ? "-" : fmtNum(p.toolCalls) + " tools");
      }
      return '<tr data-id="' + row.id + '"><td class="mono">' + fmtTime(row.time_created) + '</td><td><span class="pill">' + row.event + '</span></td><td class="mono">' + session + '</td><td class="mono">' + model + '</td><td class="mono">' + tokens + '</td><td class="mono">' + cost + '</td><td class="mono">' + duration + '</td></tr>';
    }

    function renderEvents() {
      const list = Array.from(rows.values()).sort((a, b) => b.id - a.id).slice(0, maxRows);
      $("events-body").innerHTML = list.length
        ? list.map(rowHtml).join("")
        : '<tr><td colspan="7" class="empty">Waiting for telemetry events…</td></tr>';
    }

    async function refresh() {
      const event = $("event-filter").value;
      const params = new URLSearchParams({ since: String(since), limit: "200" });
      if (event) params.set("event", event);

      const [eventsRes, summaryRes, metaRes] = await Promise.all([
        fetch("/api/telemetry?" + params),
        fetch("/api/summary"),
        fetch("/api/meta"),
      ]);

      const events = await eventsRes.json();
      const summary = await summaryRes.json();
      const meta = await metaRes.json();

      $("db-path").textContent = meta.dbPath + " · poll " + meta.pollMs + "ms · latest id " + meta.latestId;
      renderSummary(summary);

      for (const row of events.items || []) {
        rows.set(row.id, row);
        since = Math.max(since, row.id);
      }
      while (rows.size > maxRows) {
        const oldest = Math.min(...rows.keys());
        rows.delete(oldest);
      }
      renderEvents();
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
      since = 0;
      rows.clear();
      renderEvents();
      if (live) refresh();
    });

    async function loop() {
      if (live) {
        try { await refresh(); } catch (err) { renderLiveState("error"); }
      }
      setTimeout(loop, pollMs);
    }

    renderThemeButton();
    renderLiveState("polling");
    refresh();
    loop();
  </script>
</body>
</html>`
}
