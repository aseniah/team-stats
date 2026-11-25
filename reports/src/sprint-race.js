(() => {
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const boardHref =
    DATA.reports.find((r) => r.id === "pr-reviews")?.href ?? "pr-reviews.html";
  let team, members, refreshedAt, eff, counts, fallback, LAST;
  const THEMES = window.RACE_THEMES || {};
  const icon = (d) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    pause: icon(
      '<rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/>',
    ),
    play: icon(
      '<path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z" fill="currentColor"/>',
    ),
    restart: icon(
      '<path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M2.6 1.9v3.4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    ),
    skip: icon(
      '<path d="M2.5 3.2v9.6a.5.5 0 0 0 .8.4L9.6 8.4a.5.5 0 0 0 0-.8L3.3 2.8a.5.5 0 0 0-.8.4z" fill="currentColor"/><rect x="11" y="2.5" width="2.5" height="11" rx="1" fill="currentColor"/>',
    ),
  };

  const fill = (tpl, v) =>
    String(tpl).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
  const pick = (arr, i) => arr[i % arr.length];
  const ordinal = (n) =>
    `${n}${({ 1: "st", 2: "nd", 3: "rd" })[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th"}`;
  const WHEN = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
  const fmtWhen = (t) => WHEN.format(t);
  const fmtDay = (t) =>
    new Date(t).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  const fmtAgo = (iso) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const isWeekend = (t) => [0, 6].includes(new Date(t).getDay());
  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const BUBBLE_MS = 2800;
  const BANNER_MS = {
    lead: 3000,
    pass: 2600,
    big: 2200,
    start: 3000,
    cross: 1900,
    win: 2500,
  };
  const W = 1200,
    LABEL = 150,
    START_X = 245,
    FINISH_X = 1050,
    LANE_H = 74,
    TOP = 30;

  const now = new Date();
  const saved = store.get();
  const ui = {
    mode: savedMode(),
    look: THEMES[saved.look] ? saved.look : "cars",
    period: null,
  };

  function selectTeam(t, periodId) {
    team = t;
    members = t.members;
    refreshedAt = t.refreshedAt;
    LAST = lastPlaceMark(t);
    eff = effectivePeriods(t.periods, now);
    counts = countByPeriod(t.events, members, eff);
    fallback = latestFinishedPeriod(eff, now) || eff.at(-1);
    ui.period = eff.find((p) => p.id === periodId) || fallback;
    store.set({ team: t.id });
  }
  const writeHash = () =>
    history.replaceState(null, "", hashFor(team.id, ui.period?.id));
  const fromHash = () =>
    resolveSelection(DATA.teams, parseHash(location.hash), store.get().team);

  function renderTopBar() {
    mountTopBar(
      document.getElementById("topbar"),
      {
        reports: DATA.reports,
        current: DATA.current,
        teams: DATA.teams,
        teamId: team.id,
        mode: ui.mode,
      },
      {
        onTeam: (id) => {
          selectTeam(
            DATA.teams.find((t) => t.id === id),
            null,
          );
          writeHash();
          reset();
        },
        onMode: (mode) => {
          ui.mode = mode;
          recolor();
        },
      },
    );
  }
  const theme = () => THEMES[ui.look] || THEMES.cars;

  let race,
    status,
    lanes,
    byId,
    stage,
    raf,
    confettiRaf,
    pausedAt = null,
    pausedTotal = 0,
    lastFrame = 0,
    phraseN = 0,
    timers = [];
  const clock = () => (pausedAt ?? performance.now()) - pausedTotal;

  const paintLane = (l) => {
    const v = SERIES[members.indexOf(l.m) % SERIES.length];
    l.color = cssVar(v);
    l.ink = cssVar(`${v}-ink`);
  };
  const resolvedMode = () =>
    ui.mode !== "auto"
      ? ui.mode
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  function applyScene() {
    const el = document.getElementById("stage");
    if (!el) return;
    const pal = theme().palette[resolvedMode()] || theme().palette.light;
    for (const [k, v] of Object.entries(pal))
      el.style.setProperty(`--scene-${kebab(k)}`, v);
  }

  const geom = () => ({
    width: W,
    height: TOP + lanes.length * LANE_H + 16,
    top: TOP,
    lanes: lanes.length,
    laneHeight: LANE_H,
    labelWidth: LABEL,
    startX: START_X,
    finishX: FINISH_X,
  });
  const size = () => theme().size || { w: 58, h: 30 };
  const xFor = (d) => START_X + (d / race.finishDist) * (FINISH_X - START_X);
  const miniRacer = (l) => {
    const { w, h } = size();
    return `<svg class="mini" data-lane="${esc(l.m.id)}" viewBox="-1 0 ${w + 2} ${h}" width="46" height="${Math.round((46 * h) / (w + 2))}" aria-hidden="true">${theme().racer(l.color, initials(l.m), { wheel: "#7d8590", ink: l.ink })}</svg>`;
  };

  function setup() {
    timers.forEach(clearTimeout);
    timers = [];
    const p = ui.period;
    status = periodStatus(p, now, refreshedAt);
    const start = Date.parse(p.start);
    const end = Math.max(start + 1, Date.parse(status.clockEnd));
    lanes = members
      .filter((m) => counts[p.id]?.[m.id])
      .map((m) => {
        const from = m.from ? Date.parse(m.from) : -Infinity;
        const to = m.to ? Date.parse(m.to) : Infinity;
        return {
          m,
          times: counts[p.id][m.id].prs
            .flatMap((pr) => pr.reviewAts)
            .map((a) => Date.parse(a))
            .sort((a, b) => a - b),
          joinAt: from > start ? from : null,
          leaveAt: to < end ? to : null,
        };
      });
    lanes.forEach((l) => {
      paintLane(l);
      l.bubble = null;
      l.medal = null;
    });
    byId = new Map(lanes.map((l) => [l.m.id, l]));
    race = createRace({
      racers: lanes.map((l) => ({
        id: l.m.id,
        times: l.times,
        joinAt: l.joinAt,
        leaveAt: l.leaveAt,
      })),
      start,
      end,
      scaleEnd: status.state === "live" ? Date.parse(p.plannedEnd) || end : end,
      isWeekend,
    });
    lanes.forEach((l, i) => {
      l.r = race.racers[i];
    });
    stage = { queue: [], banner: null, ceremony: null };
    pausedAt = null;
    pausedTotal = 0;
  }

  function trackSvg() {
    const t = theme();
    const g = geom();
    const ticks = [];
    const step = race.finishDist > 60 ? 20 : race.finishDist > 20 ? 10 : 5;
    for (let d = step; d < race.finishDist - step / 2; d += step) {
      const x = xFor(d);
      ticks.push(
        `<line x1="${x}" x2="${x}" y1="${TOP}" y2="${TOP + lanes.length * LANE_H}" stroke="var(--scene-grid)"/><text class="tick tabular" x="${x}" y="${TOP - 8}" text-anchor="middle">${d}</text>`,
      );
    }
    const names = lanes
      .map((l, i) => {
        const y = TOP + i * LANE_H;
        return `<rect x="12" y="${y + 14}" width="5" height="${LANE_H - 28}" rx="2.5" fill="${l.color}"/>
        <text class="lane-name" x="28" y="${y + LANE_H / 2 + 1}" data-y="${y + LANE_H / 2 + 1}" data-name="${esc(l.m.displayName || l.m.name)}">${esc(l.m.displayName || l.m.name)}</text>
        <text class="lane-sub tabular" id="sub-${esc(l.m.id)}" x="28" y="${y + LANE_H / 2 + 18}"></text>`;
      })
      .join("");
    const racers = lanes
      .map(
        (
          l,
        ) => `<g class="car" id="car-${esc(l.m.id)}"><g class="flame" opacity="0">${t.effects.boost()}</g>${t.racer(l.color, initials(l.m), { ink: l.ink })}</g>
      <text class="tag" id="tag-${esc(l.m.id)}" fill="${l.color}"></text>
      <g class="bubble" id="bub-${esc(l.m.id)}" opacity="0"><rect class="bg" height="24" rx="5" fill="#fbfbf8"/><rect class="edge" width="4" height="24" rx="2" fill="${l.color}"/><text x="12" y="16.5"></text></g>`,
      )
      .join("");
    return `<svg class="track" viewBox="0 0 ${W} ${g.height}" role="img" aria-label="Race track with ${lanes.length} lanes">
      ${t.field(g)}${names}${ticks.join("")}
      <text class="tick" x="${FINISH_X + 8}" y="${TOP - 8}" text-anchor="middle">${race.finishDist}</text>
      ${racers}</svg>`;
  }

  function timelineHtml() {
    const span = race.end - race.start;
    const words = theme().words;
    const cells = calendarDays(race.start, race.end)
      .map(([t, next]) => {
        const w =
          ((Math.min(next, race.end) - Math.max(t, race.start)) / span) * 100;
        const wk = isWeekend(t);
        return `<div class="day${wk ? " wk" : ""}" style="width:${w}%"><span>${esc(wk ? words.weekendDay : new Date(t).toLocaleDateString(undefined, { weekday: "narrow" }))}</span></div>`;
      })
      .join("");
    return `<div class="timeline"><div class="days">${cells}</div><div class="marker" id="marker"></div></div>`;
  }

  function header() {
    const p = ui.period;
    const t = theme();
    const sprintOpts = [...eff]
      .reverse()
      .map(
        (x) =>
          `<option value="${esc(x.id)}" ${x.id === p.id ? "selected" : ""}>${esc(x.name)}${x.inProgress ? " (current)" : ""}</option>`,
      )
      .join("");
    const lookOpts = Object.values(THEMES)
      .map(
        (x) =>
          `<option value="${esc(x.id)}" ${x.id === t.id ? "selected" : ""}>${esc(x.label)}</option>`,
      )
      .join("");
    return `<header class="page-head">
      <div>
        <h1>${esc(fill(t.words.title, { name: p.name }))}</h1>
        <p class="page-sub">${esc(team.name)}, ${esc(fmtDay(race.start))} to ${esc(fmtDay(race.end))}. Every submitted review moves a racer forward.</p>
      </div>
      <div class="controls">
        <div class="row">
          <label class="control">Sprint<select id="ctl-sprint">${sprintOpts}</select></label>
          <label class="control">Look<select id="ctl-look">${lookOpts}</select></label>
        </div>
        <div class="row">
          <button type="button" id="ctl-pause" class="btn icon-btn" disabled>${ICONS.pause}<span>Pause</span></button>
          <button type="button" id="ctl-restart" class="btn icon-btn" disabled>${ICONS.restart}<span>Restart</span></button>
          <button type="button" id="ctl-skip" class="btn icon-btn" disabled>${ICONS.skip}<span>Skip to finish</span></button>
        </div>
      </div>
    </header>`;
  }

  function render() {
    const app = document.getElementById("app");
    renderTopBar();
    if (!eff.length) {
      app.innerHTML = `<p class="page-sub">No sprints are configured for ${esc(team.name)} yet. Add some to config/periods/${esc(team.id)}.json and rebuild.</p>`;
      return;
    }
    app.innerHTML = `${header()}
      <section class="stage" id="stage">
        <div class="callout" id="callout" role="status" aria-live="polite"></div>
        <div id="track">${lanes.length ? trackSvg() : `<div class="empty-race">Nobody on the team overlaps ${esc(ui.period.name)}.</div>`}</div>
        <div class="clock"><div class="when tabular" id="when"></div>${timelineHtml()}<span class="pit-flag" id="pit">${esc(theme().words.weekendFlag)}</span></div>
        <div class="overlay" id="overlay" hidden></div>
        <canvas class="confetti" id="confetti"></canvas>
      </section>
      <details class="log-wrap"><summary>Race log</summary><div class="log" id="log"></div></details>`;
    applyScene();
    wire();
    if (!lanes.length) return;
    bindLanes();
    draw();
    showGrid();
  }

  function wire() {
    document.getElementById("ctl-sprint").addEventListener("change", (e) => {
      ui.period = eff.find((x) => x.id === e.target.value) || fallback;
      writeHash();
      reset();
    });
    document.getElementById("ctl-look").addEventListener("change", (e) => {
      ui.look = THEMES[e.target.value] ? e.target.value : "cars";
      store.set({ look: ui.look });
      reset();
    });
    document.getElementById("ctl-skip").addEventListener("click", skipToFinish);
    document.getElementById("ctl-pause").addEventListener("click", togglePause);
    document.getElementById("ctl-restart").addEventListener("click", reset);
  }

  function recolor() {
    applyScene();
    if (!lanes?.length) return;
    lanes.forEach(paintLane);
    document.getElementById("track").innerHTML = trackSvg();
    bindLanes();
    document.querySelectorAll("svg.mini[data-lane]").forEach((svg) => {
      svg.outerHTML = miniRacer(byId.get(svg.dataset.lane));
    });
    draw();
  }

  // SVG text cannot wrap, so a name wider than the label panel splits onto two lines.
  function fitLaneNames() {
    const max = LABEL - 38;
    document.querySelectorAll("#track .lane-name").forEach((t) => {
      const name = t.dataset.name;
      t.textContent = name;
      const y = Number(t.dataset.y);
      const sub = t.nextElementSibling;
      sub.setAttribute("y", y + 17);
      const cut = name.lastIndexOf(" ");
      if (cut < 0 || t.getComputedTextLength() <= max) return;
      t.textContent = "";
      [name.slice(0, cut), name.slice(cut + 1)].forEach((line, i) => {
        const span = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "tspan",
        );
        span.setAttribute("x", 28);
        span.setAttribute("y", y - 9 + i * 18);
        span.textContent = line;
        t.appendChild(span);
      });
      sub.setAttribute("y", y + 26);
    });
  }

  function bindLanes() {
    fitLaneNames();
    document.fonts?.ready.then(fitLaneNames);
    for (const l of lanes) {
      const bub = document.getElementById(`bub-${l.m.id}`);
      const car = document.getElementById(`car-${l.m.id}`);
      l.el = {
        car,
        flame: car.querySelector(".flame"),
        tag: document.getElementById(`tag-${l.m.id}`),
        sub: document.getElementById(`sub-${l.m.id}`),
        bub,
        bubText: bub.querySelector("text"),
        bubBg: bub.querySelector(".bg"),
        bubEdge: bub.querySelector(".edge"),
        bubW: 0,
      };
    }
  }

  function freshness() {
    if (!refreshedAt)
      return '<p class="note warn">Review data has never been refreshed.</p>';
    const stale =
      now.getTime() - Date.parse(refreshedAt) > 3_600_000 &&
      (status.state !== "final" ||
        Date.parse(refreshedAt) < Date.parse(ui.period.end));
    return `<p class="note${stale ? " warn" : ""}">Data refreshed ${esc(fmtAgo(refreshedAt))}${stale ? ". That was more than an hour ago, so recent reviews may be missing." : "."}</p>`;
  }

  function showGrid() {
    const ov = document.getElementById("overlay");
    const t = theme();
    ov.hidden = false;
    ov.innerHTML = `<h2>${esc(fill(t.words.grid, { n: lanes.length }))}</h2>
      <div class="lineup">${lanes.map((l) => `<span>${miniRacer(l)}${esc(memberLabel(l.m))}</span>`).join("")}</div>
      ${freshness()}
      <div class="gantry"><div class="lights" id="lights">${"<i></i>".repeat(t.start.lights)}</div><div class="count" id="count"></div></div>
      <button type="button" class="go" id="go">${esc(t.start.button)}</button>`;
    document.getElementById("go").addEventListener("click", lightsOut);
  }

  function lightsOut() {
    const go = document.getElementById("go");
    go.disabled = true;
    go.style.visibility = "hidden";
    const lights = [...document.querySelectorAll("#lights i")];
    const count = document.getElementById("count");
    const STEP = 800;
    const n = lights.length;
    lights.forEach((light, i) =>
      timers.push(
        setTimeout(
          () => {
            light.classList.add("red");
            count.textContent = n - i;
          },
          STEP * i + 200,
        ),
      ),
    );
    timers.push(
      setTimeout(
        () => {
          lights.forEach((l) => {
            l.classList.remove("red");
            l.classList.add("green");
          });
          count.textContent = theme().start.go;
          count.classList.add("go-text");
        },
        STEP * n + 200,
      ),
    );
    timers.push(
      setTimeout(
        () => {
          document.getElementById("overlay").hidden = true;
          for (const id of ["ctl-skip", "ctl-pause", "ctl-restart"])
            document.getElementById(id).disabled = false;
          handle(start(race));
          lastFrame = clock();
          raf = requestAnimationFrame(tick);
        },
        STEP * n + 650,
      ),
    );
  }

  function enqueue(c) {
    const item = { ...c, at: clock() };
    logLine(c.t, c.text);
    if (c.now) {
      stage.queue = [item];
      stage.banner = null;
      return;
    }
    stage.queue.push(item);
    if (stage.queue.length > 2) {
      const low = stage.queue.reduce(
        (lo, x, i) => (x.pri < stage.queue[lo].pri ? i : lo),
        0,
      );
      stage.queue.splice(low, 1);
    }
  }

  function showNextCallout(nowMs) {
    if (stage.banner && nowMs < stage.banner.until) return;
    const el = document.getElementById("callout");
    let next = stage.queue.shift();
    while (next && nowMs - next.at > (next.pri >= 3 ? 5000 : 3000))
      next = stage.queue.shift();
    if (!next) {
      if (stage.banner) {
        el.classList.remove("show");
        stage.banner = null;
      }
      return;
    }
    stage.banner = { until: nowMs + (BANNER_MS[next.kind] ?? BANNER_MS.big) };
    el.className = `callout${next.big ? " big" : ""}`;
    const edge = next.duel
      ? `linear-gradient(180deg, ${next.duel.a.color} 50%, ${next.duel.b.color} 50%)`
      : next.l
        ? next.l.color
        : "repeating-conic-gradient(#f2f2f2 0 25%, #111 0 50%) 0 0 / 8px 8px";
    const body = next.duel
      ? `${miniRacer(next.duel.a)}<b>${esc(memberLabel(next.duel.a.m))}</b><span class="verb">${esc(next.duel.verb)}</span>${miniRacer(next.duel.b)}<b>${esc(memberLabel(next.duel.b.m))}</b>${next.duel.pill ? `<span class="pill">${esc(next.duel.pill)}</span>` : ""}`
      : `${next.l ? miniRacer(next.l) : ""}<b>${esc(next.text)}</b>`;
    el.innerHTML = `<i class="edge" style="background:${edge}"></i><span class="cap">${body}</span>`;
    void el.offsetWidth;
    el.classList.add("show");
  }

  function logLine(t, text) {
    const log = document.getElementById("log");
    const row = document.createElement("div");
    row.innerHTML = `<b>${esc(t ? fmtWhen(t) : "Race")}</b> · ${esc(text)}`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function bubble(l, text, t, logText = text) {
    l.bubble = { text, until: clock() + BUBBLE_MS, shownAt: clock() };
    logLine(t, `${memberLabel(l.m)}: ${logText}`);
  }

  function handle(evs) {
    const ph = theme().phrases;
    for (const e of evs) {
      const a = e.a && byId.get(e.a);
      const b = e.b && byId.get(e.b);
      if (e.type === "start")
        enqueue({
          text: pick(ph.start, phraseN++),
          kind: "start",
          pri: 3,
          big: true,
        });
      else if (e.type === "lead" || e.type === "pass") {
        const lead = e.type === "lead";
        const verb = e.back
          ? pick(ph.back, phraseN++)
          : pick(lead ? ph.lead : ph.pass, phraseN++);
        const pill = lead ? "Leader" : `for ${ordinal(e.place)}`;
        enqueue({
          t: e.t,
          l: a,
          kind: lead ? "lead" : "pass",
          pri: lead ? 3 : 2,
          duel: { a, b, verb, pill },
          text: `${memberLabel(a.m)} ${verb} ${memberLabel(b.m)}${lead ? "" : ` ${pill}`}`,
        });
      } else if (e.type === "tie") {
        const pill = fill(pick(ph.tie, phraseN++), { place: ordinal(e.place) });
        enqueue({
          t: e.t,
          l: a,
          kind: "pass",
          pri: 2,
          duel: { a, b, verb: "and", pill },
          text: `${memberLabel(a.m)} and ${memberLabel(b.m)} ${pill}`,
        });
      } else if (e.type === "join")
        enqueue({
          t: e.t,
          l: a,
          kind: "pass",
          pri: 2,
          text: fill(pick(ph.join, phraseN++), { a: memberLabel(a.m) }),
        });
      else if (e.type === "leave")
        bubble(
          a,
          fill(pick(ph.leave, phraseN++), { a: memberLabel(a.m) }),
          e.t,
        );
      else if (e.type === "boost") {
        const text = pick(ph.boost, phraseN++);
        bubble(a, text, e.t, `${text} (${RACE.boostN}+ reviews in an hour)`);
      } else if (e.type === "weekend")
        bubble(
          a,
          fill(pick(ph.weekend, phraseN++), {
            day: new Date(e.day).toLocaleDateString(undefined, {
              weekday: "long",
            }),
          }),
          e.t,
        );
      else if (e.type === "timeUp") {
        if (status.state === "live")
          enqueue({
            t: e.t,
            text: pick(ph.soFar, phraseN++),
            kind: "start",
            pri: 3,
            big: true,
          });
        else if (e.queued)
          enqueue({
            t: e.t,
            text: pick(ph.timeUp, phraseN++),
            kind: "start",
            pri: 3,
            big: true,
          });
      } else if (e.type === "ceremony") startCeremony();
    }
  }

  function tick() {
    const nowMs = clock();
    const dt = nowMs - lastFrame;
    lastFrame = nowMs;
    if (pausedAt === null) {
      handle(step(race, dt, nowMs));
      if (race.phase === "ceremony") runCeremony(nowMs);
      showNextCallout(nowMs);
      draw();
    }
    if (race.phase !== "done") raf = requestAnimationFrame(tick);
  }

  function crossText(g) {
    const fin = theme().phrases.finish;
    const ls = g.ids.map((id) => byId.get(id));
    const names = ls.map((l) => memberLabel(l.m)).join(" & ");
    const n = ls[0].r.final;
    const last = g.last && LAST;
    const kind =
      n === 0
        ? "garage"
        : g.place === 1
          ? "first"
          : last
            ? "last"
            : g.place === 2
              ? "second"
              : g.place === 3
                ? "third"
                : "middle";
    const tpl = ls.length > 1 ? fin[kind].shared : fin[kind].one;
    return `${fill(tpl, { names, n, place: ordinal(g.place), last: LAST || "" })}${kind === "garage" && last ? ` ${LAST}` : ""}`;
  }

  function startCeremony() {
    document.getElementById("ctl-skip").disabled = true;
    stage.queue = [];
    if (status.state === "live") {
      stage.ceremony = { groups: [], i: 0, next: clock() + 2500 };
      return;
    }
    enqueue({
      text: pick(theme().phrases.checkered, phraseN++),
      kind: "big",
      pri: 3,
      big: true,
      now: true,
    });
    stage.ceremony = {
      groups: ceremonyGroups(race),
      i: 0,
      next: clock() + 2300,
    };
  }

  function runCeremony(nowMs) {
    const c = stage.ceremony;
    if (!c || nowMs < c.next) return;
    if (c.i < c.groups.length) {
      const g = c.groups[c.i++];
      const parkNose = (FINISH_X + 16 + W - 10) / 2 + size().w / 2;
      g.ids.forEach((id) => {
        const l = byId.get(id);
        l.medal =
          g.last && LAST ? LAST : g.zero ? null : MEDALS[g.place] || "🏁";
        if (l.r.final > 0)
          l.r.crossTarget =
            (race.finishDist * (parkNose - START_X)) / (FINISH_X - START_X);
      });
      const kind = g.place === 1 ? "win" : "cross";
      enqueue({
        text: crossText(g),
        kind,
        pri: 3,
        big: g.place === 1,
        l: byId.get(g.ids[0]),
        now: true,
      });
      c.next = nowMs + BANNER_MS[kind] + 200;
      return;
    }
    race.phase = "done";
    document.getElementById("ctl-pause").disabled = true;
    timers.push(setTimeout(showFinal, 600));
  }

  function showFinal() {
    stage.queue = [];
    document.getElementById("callout").classList.remove("show");
    const ov = document.getElementById("overlay");
    const t = theme();
    const places = placesBy(lanes, (l) => l.r.final);
    const scored = lanes.some((l) => l.r.final > 0);
    const ranked = [...lanes].sort((a, b) => places.get(a) - places.get(b));
    const lastPlace = Math.max(...ranked.map((l) => places.get(l)));
    const back = `<a class="btn" href="${esc(boardHref)}${hashFor(team.id, ui.period.id)}">Back to leaderboard</a>`;
    const actions = `<div class="actions"><button type="button" class="btn" id="again">Replay</button>${back}</div>`;
    if (status.state === "live") {
      ov.innerHTML = `<h2>${esc(pick(t.phrases.soFar, 0))}</h2>
        <div class="standings">${ranked.map((l) => `<span>${ordinal(places.get(l))} ${esc(memberLabel(l.m))} · ${l.r.final}</span>`).join("")}</div>
        <p class="note">The sprint is still running, so these are standings, not results.</p>${actions}`;
    } else {
      const stepHtml = (pl) => {
        const ls = ranked.filter((l) => places.get(l) === pl && l.r.final > 0);
        if (!ls.length)
          return `<div class="step p${pl} empty"><div class="cars"></div><div class="name">Open</div><div class="block"><div class="medal">${MEDALS[pl]}</div><div class="num">No one</div></div></div>`;
        return `<div class="step p${pl}"><div class="cars">${ls.map(miniRacer).join("")}</div><div class="name">${ls.map((l) => esc(memberLabel(l.m))).join(" & ")}</div>
          <div class="block"><div class="medal">${MEDALS[pl]}</div><div class="num tabular">${ls[0].r.final} ${ls[0].r.final === 1 ? "review" : "reviews"}</div></div></div>`;
      };
      const others = ranked.filter((l) => places.get(l) > 3 || l.r.final === 0);
      ov.innerHTML = `<h2>${esc(fill(t.words.results, { name: ui.period.name }))}</h2>
        <div class="podium">${stepHtml(2)}${stepHtml(1)}${stepHtml(3)}</div>
        ${others.length ? `<div class="others">${others.map((l) => `<span>${LAST && places.get(l) === lastPlace && lastPlace > 3 ? esc(LAST) : ordinal(places.get(l))} ${esc(memberLabel(l.m))} · ${l.r.final}</span>`).join("")}</div>` : ""}
        ${status.state === "provisional" ? '<p class="note warn">Sprint not yet closed in Jira, results may change.</p>' : ""}${actions}`;
    }
    ov.hidden = false;
    document.getElementById("again").addEventListener("click", () => {
      reset();
      document.getElementById("go")?.click();
    });
    if (status.state !== "live" && scored) confetti();
  }

  function togglePause() {
    const btn = document.getElementById("ctl-pause");
    if (pausedAt !== null) {
      pausedTotal += performance.now() - pausedAt;
      pausedAt = null;
      btn.innerHTML = `${ICONS.pause}<span>Pause</span>`;
    } else {
      pausedAt = performance.now();
      btn.innerHTML = `${ICONS.play}<span>Resume</span>`;
    }
    document
      .getElementById("stage")
      .classList.toggle("paused", pausedAt !== null);
  }

  function skipToFinish() {
    if (pausedAt !== null) togglePause();
    stage.queue = [];
    lanes.forEach((l) => {
      l.bubble = null;
    });
    skip(race);
  }

  function draw() {
    const placeOf = placesBy(race.racers, drivenOf);
    const { w: carW, h: carH } = size();
    const nowMs = clock();
    const started =
      race.phase !== "grid" && race.racers.some((r) => r.shownDist > 0.05);
    lanes.forEach((l, i) => {
      const r = l.r;
      const y = TOP + i * LANE_H + LANE_H / 2 - carH / 2;
      const x = xFor(r.drawDist) - carW;
      const jitter =
        r.boost && race.phase === "race" ? Math.sin(nowMs / 40 + i) * 0.8 : 0;
      const { car, flame, tag, sub, bub, bubText, bubBg, bubEdge } = l.el;
      car.setAttribute(
        "transform",
        `translate(${x.toFixed(1)},${(y + jitter).toFixed(1)})`,
      );
      car.setAttribute(
        "opacity",
        race.phase === "grid" || (r.joined && !r.left) ? 1 : 0.35,
      );
      flame.setAttribute(
        "opacity",
        r.boost ? (0.75 + Math.random() * 0.25).toFixed(2) : 0,
      );
      if (r.boost)
        flame.setAttribute(
          "transform",
          `scale(${(0.85 + Math.random() * 0.35).toFixed(2)},1)`,
        );
      const parked = r.crossTarget !== null && x > FINISH_X;
      tag.setAttribute("x", (parked ? x + carW / 2 : x + carW).toFixed(1));
      tag.setAttribute("y", (y - 5).toFixed(1));
      tag.setAttribute("text-anchor", parked ? "middle" : "end");
      tag.setAttribute("font-size", parked ? 14 : 12);
      let text = "";
      if (race.phase !== "grid" && !r.joined)
        text = `Joins ${fmtDay(l.joinAt)}`;
      else if (race.phase !== "grid" && r.left && !l.medal)
        text = `Left ${fmtDay(l.leaveAt)} · ${ordinal(placeOf.get(r))} · ${drivenOf(r)}`;
      else if (started)
        text = `${l.medal ? `${l.medal} ` : ""}${ordinal(placeOf.get(r))} · ${drivenOf(r)}`;
      if (tag.textContent !== text) tag.textContent = text;
      if (
        l.bubble &&
        nowMs < l.bubble.until &&
        race.phase !== "ceremony" &&
        race.phase !== "done"
      ) {
        if (bubText.textContent !== l.bubble.text) {
          bubText.textContent = l.bubble.text;
          l.el.bubW = bubText.getComputedTextLength() + 22;
          bubBg.setAttribute("width", l.el.bubW);
        }
        const bw = l.el.bubW;
        const nose = x + carW + 10;
        const flip = nose + bw > W - 12;
        bubEdge.setAttribute("x", flip ? bw - 4 : 0);
        bub.setAttribute(
          "transform",
          `translate(${(flip ? x - 12 - bw : nose).toFixed(1)},${(y + carH / 2 - 11).toFixed(1)})`,
        );
        bub.setAttribute(
          "opacity",
          Math.min(
            1,
            (nowMs - l.bubble.shownAt) / 150,
            (l.bubble.until - nowMs) / 300,
          ).toFixed(2),
        );
      } else {
        bub.setAttribute("opacity", 0);
      }
      const subText =
        race.phase === "ceremony" || race.phase === "done"
          ? `${r.final} ${r.final === 1 ? "review" : "reviews"}`
          : "";
      if (sub.textContent !== subText) sub.textContent = subText;
    });
    const when = document.getElementById("when");
    const whenText = fmtWhen(race.simT);
    if (when.textContent !== whenText) when.textContent = whenText;
    document.getElementById("marker").style.left =
      `calc(${((race.simT - race.start) / (race.end - race.start)) * 100}% - 1px)`;
    document
      .getElementById("pit")
      .classList.toggle("on", race.phase === "race" && isWeekend(race.simT));
  }

  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = document.getElementById("confetti");
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * devicePixelRatio;
    cv.height = rect.height * devicePixelRatio;
    const ctx = cv.getContext("2d");
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const colors = [
      cssVar("--gold"),
      cssVar("--series-1"),
      cssVar("--series-2"),
      cssVar("--series-3"),
      "#f2f1ee",
    ];
    const bits = Array.from({ length: 160 }, () => ({
      x: rect.width / 2 + (Math.random() - 0.5) * 200,
      y: rect.height * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 9 - 3,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)],
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
    }));
    const t0 = performance.now();
    const frame = (t) => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      bits.forEach((b) => {
        b.vy += 0.22;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.r += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        ctx.restore();
      });
      if (t - t0 < 4500) confettiRaf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, rect.width, rect.height);
    };
    confettiRaf = requestAnimationFrame(frame);
  }

  function reset() {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(confettiRaf);
    timers.forEach(clearTimeout);
    timers = [];
    const focusId = document.activeElement?.id;
    if (eff.length) setup();
    else lanes = [];
    render();
    if (focusId)
      document.getElementById(focusId)?.focus({ preventScroll: true });
  }

  window.addEventListener("hashchange", () => {
    const { team: t, periodId } = fromHash();
    if (!t || (t.id === team?.id && (!periodId || periodId === ui.period?.id)))
      return;
    if (t.id === team.id) ui.period = eff.find((p) => p.id === periodId);
    else selectTeam(t, periodId);
    reset();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (ui.mode === "auto") recolor();
  });

  applyColorMode(ui.mode);
  const initial = fromHash();
  if (!initial.team) {
    document.getElementById("app").innerHTML =
      '<p class="page-sub">No teams are configured yet. Add one to config/teams.json and rebuild.</p>';
    return;
  }
  selectTeam(initial.team, initial.periodId);
  reset();
})();
