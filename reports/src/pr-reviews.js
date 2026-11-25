(() => {
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const MAX_RANGE = 10;
  const now = new Date();
  const raceHref =
    DATA.reports.find((r) => r.id === "sprint-race")?.href ??
    "sprint-race.html";
  let team, members, events, eff, counts, LAST;
  const seriesOf = (m) => SERIES[members.indexOf(m) % SERIES.length];
  const colorOf = (m) => `var(${seriesOf(m)})`;
  const state = { n: 4, mode: savedMode(), focus: null, hidden: new Set() };

  function selectTeam(t, periodId) {
    team = t;
    members = t.members;
    events = t.events;
    LAST = lastPlaceMark(t);
    eff = effectivePeriods(t.periods, now);
    counts = countByPeriod(events, members, eff);
    state.n = Math.max(1, Math.min(store.get().n || 4, eff.length, MAX_RANGE));
    state.focus =
      (eff.find((p) => p.id === periodId) || eff.at(-1))?.id ?? null;
    state.hidden.clear();
    openDrill.clear();
    teamChanged = true;
    store.set({ team: t.id });
  }
  const writeHash = () =>
    history.replaceState(null, "", hashFor(team.id, state.focus));
  const shown = () => members.filter((m) => !state.hidden.has(m.id));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const ICON_INFO =
    '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4"/><circle cx="8" cy="4.9" r=".6" class="fill"/></svg>';
  const ICON_PLAY =
    '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6l7.5-4.8z" class="fill"/></svg>';
  const ICON_CAL =
    '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>';

  const fmtDate = (iso, opts = { month: "short", day: "numeric" }) =>
    new Date(iso).toLocaleDateString(undefined, opts);
  const fmtDateTime = (iso) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const periodLabel = (p) => p.label ?? p.name;
  const displayEnd = (p) => (p.inProgress ? p.plannedEnd || p.end : p.end);

  function rangePeriods() {
    return eff.slice(-state.n);
  }

  function cellsFor(pid) {
    return members
      .filter((m) => counts[pid][m.id])
      .map((m) => ({
        memberId: m.id,
        score: counts[pid][m.id].reviews,
        prCount: counts[pid][m.id].count,
      }));
  }
  const teamPrs = (pid) =>
    new Set(
      members.flatMap((m) => counts[pid][m.id]?.prs.map((pr) => pr.key) ?? []),
    ).size;
  const tip = document.getElementById("tooltip");
  function showTip(evt, html) {
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }
  const hideTip = () => {
    tip.style.opacity = 0;
  };
  const ttRows = (rows) =>
    rows
      .map(
        (r) =>
          `<div class="tt-row"><span><i class="dot" style="background:${r.color}"></i>${esc(r.name)}</span><b class="tabular">${r.value}</b></div>`,
      )
      .join("");
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs))
      if (v !== undefined && v !== null) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }
  function yAxis(svg, { x0, x1, y0, y1, max, ticks = 4 }) {
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i;
      const y = y0 - ((y0 - y1) * i) / ticks;
      el(
        "line",
        {
          x1: x0,
          x2: x1,
          y1: y,
          y2: y,
          class: i === 0 ? "baseline" : "grid-line",
        },
        svg,
      );
      const t = el(
        "text",
        { x: x0 - 8, y: y + 4, "text-anchor": "end", class: "tabular" },
        svg,
      );
      t.textContent = Number.isInteger(v) ? v : v.toFixed(1);
    }
  }
  function legend(kind) {
    return `<div class="legend">${members
      .map((m) => {
        const off = state.hidden.has(m.id);
        return `<button type="button" class="legend-item${off ? " off" : ""}" data-member="${esc(m.id)}" aria-pressed="${!off}" title="${off ? "Show" : "Hide"} ${esc(memberLabel(m))}"><i class="${kind}" style="background:${colorOf(m)}"></i>${esc(memberLabel(m))}</button>`;
      })
      .join("")}</div>`;
  }
  function barPath(x, y, w, h, r = 4) {
    if (h <= 0) return "";
    const rr = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
  }
  function renderRangeHead() {
    const maxN = Math.min(eff.length, MAX_RANGE);
    const nOpts = Array.from({ length: maxN }, (_, i) => i + 1)
      .map(
        (n) =>
          `<option value="${n}" ${n === state.n ? "selected" : ""}>Last ${n} ${n === 1 ? "sprint" : "sprints"}</option>`,
      )
      .join("");
    return `<div class="group-head"><h2 class="group-title">Across sprints</h2>
      <label class="control">Range<select id="ctl-n">${nOpts}</select></label></div>`;
  }

  function renderHeader() {
    const refreshed = team.refreshedAt
      ? fmtDateTime(team.refreshedAt)
      : "never";
    const fOpts = [...eff]
      .reverse()
      .map(
        (p) =>
          `<option value="${esc(p.id)}" ${p.id === state.focus ? "selected" : ""}>${esc(p.name)}${p.inProgress ? " (current)" : ""}</option>`,
      )
      .join("");
    return `<header class="page-head">
      <div>
        <h1>PR Review Leaderboard</h1>
        <p class="page-sub">${esc(team.name)} · ${ICON_CAL} Data refreshed ${esc(refreshed)} · <a href="#how" class="how-link">${ICON_INFO}How it's counted</a></p>
      </div>
      ${eff.length ? `<div class="controls"><label class="control">Sprint<select id="ctl-focus">${fOpts}</select></label></div>` : ""}
    </header>`;
  }

  function renderTopBar() {
    mountTopBar(
      document.getElementById("topbar"),
      {
        reports: DATA.reports,
        current: DATA.current,
        teams: DATA.teams,
        teamId: team.id,
        mode: state.mode,
      },
      {
        onTeam: (id) => {
          selectTeam(
            DATA.teams.find((t) => t.id === id),
            null,
          );
          writeHash();
          render();
        },
        onMode: (mode) => {
          state.mode = mode;
        },
      },
    );
  }

  function personHtml(m, prCount) {
    return `<div class="person"><div class="avatar" style="background:${colorOf(m)};--ink:var(${seriesOf(m)}-ink)">${esc(initials(m))}</div>
      <div class="name">${esc(m.displayName || m.name)}</div><div class="prs tabular">${plural(prCount, "PR", "PRs")}</div></div>`;
  }

  function renderPodium() {
    const p = eff.find((x) => x.id === state.focus);
    if (!p)
      return `<section class="card hero"><div class="no-data">No sprints configured yet.</div></section>`;
    const ranked = rankMembers(cellsFor(p.id));
    const byId = Object.fromEntries(members.map((m) => [m.id, m]));
    const total = ranked.reduce((s, r) => s + r.score, 0);
    const idx = eff.indexOf(p);
    const prev = idx > 0 ? eff[idx - 1] : null;
    const prevTotal = prev
      ? cellsFor(prev.id).reduce((s, c) => s + c.score, 0)
      : null;
    const delta =
      prevTotal === null
        ? ""
        : ` · ${total - prevTotal >= 0 ? "▲" : "▼"} ${Math.abs(total - prevTotal)} vs ${esc(prev.name)}`;
    const st = periodStatus(p, now, team.refreshedAt).state;
    const title = st === "live" ? "Current leader" : "Winner";
    const badge =
      st === "live"
        ? '<span class="badge live">In progress</span>'
        : '<span class="badge">Final</span>';
    const provisional =
      st === "provisional"
        ? '<p class="note-provisional">Sprint not yet closed in Jira, results may change.</p>'
        : "";
    const dates = `${fmtDate(p.start)} – ${fmtDate(displayEnd(p))}`;

    let body;
    if (!ranked.length || total === 0) {
      body = `<div class="no-data">No reviews recorded for this sprint yet.</div>`;
    } else {
      const group = (pl) => {
        const g = ranked.filter((r) => r.place === pl && r.score > 0);
        return g.length ? g : null;
      };
      const step = (g, emptyPlace) => {
        if (!g)
          return `<div class="step place-${emptyPlace} empty-step"><div class="people"></div><div class="block"></div></div>`;
        const place = g[0].place;
        const people = g
          .map((r) => personHtml(byId[r.memberId], r.prCount))
          .join("");
        const crown =
          place === 1 ? '<div class="crown" aria-hidden="true">👑</div>' : "";
        return `<div class="step place-${place}">
          <div class="people">${crown}${people}</div>
          <div class="block"><div class="medal" aria-hidden="true">${MEDALS[place]}</div>
          <div class="num tabular">${g[0].score}</div><div class="lbl">${g[0].score === 1 ? "review" : "reviews"}</div></div>
        </div>`;
      };
      const podium = `<div class="podium">${step(group(2), 2)}${step(group(1), 1)}${step(group(3), 3)}</div>`;
      const last = LAST ? ranked.filter((r) => r.last) : [];
      const lastHtml = last.length
        ? `<div class="last-place"><div class="poo" aria-hidden="true">${esc(LAST)}</div><div class="txt">
            <strong>${last.map((r) => esc(byId[r.memberId].displayName || byId[r.memberId].name)).join(" & ")}</strong>
            brought up the rear with <strong class="tabular">${last[0].score}</strong> ${last[0].score === 1 ? "review" : "reviews"}${st === "live" ? " so far. Still time to climb!" : "."}</div></div>`
        : "";
      body = podium + lastHtml;
    }
    return `<section class="card hero">
      <div class="hero-head">
        <h2 class="hero-title">${title} · ${esc(p.name)} ${badge}</h2>
        <div class="hero-stats tabular">${dates} · ${plural(total, "team review", "team reviews")} on ${plural(teamPrs(p.id), "PR", "PRs")}${delta}</div>
      </div>${provisional}
      ${body}
    </section>`;
  }

  function renderTable() {
    const rp = rangePeriods();
    const placeOf = Object.fromEntries(
      rp.map((p) => [
        p.id,
        Object.fromEntries(
          rankMembers(cellsFor(p.id)).map((r) => [r.memberId, r]),
        ),
      ]),
    );
    const cellHtml = (reviews, prCount, extraClass = "", mark = "") =>
      `<td class="tabular${extraClass}">${mark}${reviews}<span class="rd">${plural(prCount, "PR", "PRs")}</span></td>`;
    const head = rp
      .map(
        (p) =>
          `<th class="tabular"><span class="pn">${esc(periodLabel(p))}${p.inProgress ? "*" : ""}</span>${esc(fmtDate(p.start))}</th>`,
      )
      .join("");
    const rows = members
      .map((m) => {
        const cells = rp
          .map((p) => {
            const c = counts[p.id][m.id];
            if (!c) return '<td class="na">–</td>';
            const r = placeOf[p.id][m.id];
            const scored = r && c.reviews > 0;
            const mark =
              r?.last && LAST
                ? `${esc(LAST)} `
                : scored && MEDALS[r.place]
                  ? `${MEDALS[r.place]} `
                  : "";
            return cellHtml(
              c.reviews,
              c.count,
              scored && r.place === 1 ? " lead" : "",
              mark,
            );
          })
          .join("");
        const tot = rp.reduce(
          (s, p) => s + (counts[p.id][m.id]?.count || 0),
          0,
        );
        const totReviews = rp.reduce(
          (s, p) => s + (counts[p.id][m.id]?.reviews || 0),
          0,
        );
        const active = rp.some((p) => counts[p.id][m.id]);
        if (!active) return "";
        return `<tr><td><span class="who"><i class="dot" style="background:${colorOf(m)}"></i>${esc(m.displayName || m.name)}</span></td>${cells}${cellHtml(totReviews, tot, " total")}</tr>`;
      })
      .join("");
    const sumReviews = (pid) =>
      members.reduce((s, m) => s + (counts[pid][m.id]?.reviews || 0), 0);
    const teamRow = rp
      .map((p) => cellHtml(sumReviews(p.id), teamPrs(p.id)))
      .join("");
    const teamTotal = cellHtml(
      rp.reduce((s, p) => s + sumReviews(p.id), 0),
      rp.reduce((s, p) => s + teamPrs(p.id), 0),
      " total",
    );
    const anyLive = rp.some((p) => p.inProgress);
    return `<section class="card">
      <h2>By sprint</h2>
      <p class="sub">Reviews each person submitted in the sprint, with distinct PRs beneath. 🥇🥈🥉 mark the top three${LAST ? ` and ${esc(LAST)} marks last` : ""}. Totals add each sprint's count.${anyLive ? " * In progress." : ""}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Member</th>${head}<th class="total">Total</th></tr></thead>
        <tbody>${rows}<tr class="team"><td>Team</td>${teamRow}${teamTotal}</tr></tbody>
      </table></div>
    </section>`;
  }

  function drawBars(container) {
    const rp = rangePeriods();
    const W = 560,
      H = 300,
      L = 40,
      R = 8,
      T = 16,
      B = 40;
    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "chart",
      role: "img",
      "aria-label": "Grouped bar chart of reviews per sprint",
    });
    const vis = shown();
    const { max, ticks } = niceScale(
      Math.max(
        1,
        ...rp.flatMap((p) => vis.map((m) => counts[p.id][m.id]?.reviews || 0)),
      ),
    );
    const y = (v) => H - B - ((H - B - T) * v) / max;
    yAxis(svg, { x0: L, x1: W - R, y0: H - B, y1: T, max, ticks });
    const groupW = (W - L - R) / rp.length;
    const gap = 2;
    const slots = Math.max(1, vis.length);
    const inner = Math.min(groupW * 0.78, 30 * slots);
    const barW = (inner - gap * (slots - 1)) / slots;
    rp.forEach((p, gi) => {
      const gx = L + gi * groupW + (groupW - inner) / 2;
      vis.forEach((m, mi) => {
        const c = counts[p.id][m.id];
        if (!c) return;
        const x = gx + mi * (barW + gap);
        const yy = y(c.reviews);
        el(
          "path",
          { d: barPath(x, yy, barW, H - B - yy), fill: colorOf(m) },
          svg,
        );
        const hit = el(
          "rect",
          {
            x: x - gap / 2,
            y: T,
            width: barW + gap,
            height: H - B - T,
            class: "hit",
          },
          svg,
        );
        hit.addEventListener("mousemove", (e) =>
          showTip(
            e,
            `<div class="tt-title">${esc(p.name)}</div>${ttRows([{ name: m.displayName || m.name, color: colorOf(m), value: `${plural(c.reviews, "review", "reviews")} · ${plural(c.count, "PR", "PRs")}` }])}`,
          ),
        );
        hit.addEventListener("mouseleave", hideTip);
      });
      const t = el(
        "text",
        {
          x: L + gi * groupW + groupW / 2,
          y: H - B + 18,
          "text-anchor": "middle",
        },
        svg,
      );
      t.textContent = periodLabel(p) + (p.inProgress ? "*" : "");
      const d = el(
        "text",
        {
          x: L + gi * groupW + groupW / 2,
          y: H - B + 33,
          "text-anchor": "middle",
          class: "axis-label",
        },
        svg,
      );
      d.textContent = fmtDate(p.start);
    });
    container.appendChild(svg);
  }

  function drawTrend(container) {
    const rp = rangePeriods();
    const W = 560,
      H = 300,
      L = 40,
      R = 70,
      T = 16,
      B = 40;
    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "chart",
      role: "img",
      "aria-label": "Line chart of reviews per sprint by member",
    });
    const vis = shown();
    const { max, ticks } = niceScale(
      Math.max(
        1,
        ...rp.flatMap((p) => vis.map((m) => counts[p.id][m.id]?.reviews || 0)),
      ),
    );
    const y = (v) => H - B - ((H - B - T) * v) / max;
    const x = (i) =>
      rp.length === 1
        ? (L + W - R) / 2
        : L + ((W - R - L) * i) / (rp.length - 1);
    yAxis(svg, { x0: L, x1: W - R, y0: H - B, y1: T, max, ticks });
    rp.forEach((p, i) => {
      const t = el(
        "text",
        { x: x(i), y: H - B + 18, "text-anchor": "middle" },
        svg,
      );
      t.textContent = periodLabel(p) + (p.inProgress ? "*" : "");
      const d = el(
        "text",
        {
          x: x(i),
          y: H - B + 33,
          "text-anchor": "middle",
          class: "axis-label",
        },
        svg,
      );
      d.textContent = fmtDate(p.start);
    });
    const ends = [];
    vis.forEach((m) => {
      const pts = rp.map((p, i) =>
        counts[p.id][m.id]
          ? [x(i), y(counts[p.id][m.id].reviews), counts[p.id][m.id].reviews]
          : null,
      );
      const segs = [];
      let cur = [];
      pts.forEach((pt) => {
        if (pt) cur.push(pt);
        else if (cur.length) {
          segs.push(cur);
          cur = [];
        }
      });
      if (cur.length) segs.push(cur);
      segs.forEach((s) => {
        if (s.length > 1)
          el(
            "path",
            {
              d: s.map((q, i) => `${i ? "L" : "M"}${q[0]},${q[1]}`).join(""),
              fill: "none",
              stroke: colorOf(m),
              "stroke-width": 2,
              "stroke-linejoin": "round",
              "stroke-linecap": "round",
            },
            svg,
          );
        s.forEach((q) =>
          el(
            "circle",
            {
              cx: q[0],
              cy: q[1],
              r: 4,
              fill: colorOf(m),
              stroke: "var(--surface-1)",
              "stroke-width": 2,
            },
            svg,
          ),
        );
      });
      const lastPt = pts.filter(Boolean).at(-1);
      if (lastPt) ends.push({ m, y: lastPt[1], x: lastPt[0] });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++)
      if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach((e) => {
      const t = el("text", { x: e.x + 10, y: e.y + 4, class: "direct" }, svg);
      t.textContent = memberLabel(e.m);
    });
    const hover = el(
      "line",
      { y1: T, y2: H - B, class: "hover-line", opacity: 0 },
      svg,
    );
    rp.forEach((p, i) => {
      const w = rp.length === 1 ? W - L - R : (W - R - L) / (rp.length - 1);
      const hit = el(
        "rect",
        { x: x(i) - w / 2, y: T, width: w, height: H - B - T, class: "hit" },
        svg,
      );
      hit.addEventListener("mousemove", (e) => {
        hover.setAttribute("x1", x(i));
        hover.setAttribute("x2", x(i));
        hover.setAttribute("opacity", 1);
        const rows = vis
          .filter((m) => counts[p.id][m.id])
          .map((m) => ({
            name: m.displayName || m.name,
            color: colorOf(m),
            value: counts[p.id][m.id].reviews,
          }))
          .sort((a, b) => b.value - a.value);
        showTip(e, `<div class="tt-title">${esc(p.name)}</div>${ttRows(rows)}`);
      });
      hit.addEventListener("mouseleave", () => {
        hover.setAttribute("opacity", 0);
        hideTip();
      });
    });
    container.appendChild(svg);
  }

  function drawRace(container) {
    const p = eff.find((x) => x.id === state.focus);
    if (!p) return;
    const trackEnd = Date.parse(displayEnd(p));
    const days = [];
    for (
      let d = Date.parse(new Date(p.start).toISOString().slice(0, 10));
      d < Math.max(trackEnd, Date.parse(p.end));
      d += 86400000
    )
      days.push(new Date(d).toISOString().slice(0, 10));
    const vis = shown();
    const daily = dailyCumulative(events, vis, p);
    const W = 1060,
      H = 300,
      L = 40,
      R = 90,
      T = 16,
      B = 34;
    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "chart",
      role: "img",
      "aria-label": `Cumulative reviews per day in ${p.name}`,
    });
    const { max, ticks } = niceScale(
      Math.max(1, ...Object.values(daily).map((s) => s.at(-1)?.total || 0)),
    );
    const y = (v) => H - B - ((H - B - T) * v) / max;
    const x = (i) => L + ((W - R - L) * (i + 0.5)) / days.length;
    const dayW = (W - R - L) / days.length;
    days.forEach((d, i) => {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6)
        el(
          "rect",
          {
            x: L + dayW * i,
            y: T,
            width: dayW,
            height: H - B - T,
            class: "weekend",
          },
          svg,
        );
    });
    yAxis(svg, { x0: L, x1: W - R, y0: H - B, y1: T, max, ticks });
    const every = days.length > 16 ? 2 : 1;
    days.forEach((d, i) => {
      if (i % every) return;
      const t = el(
        "text",
        {
          x: x(i),
          y: H - B + 18,
          "text-anchor": "middle",
          class: "axis-label",
        },
        svg,
      );
      t.textContent = fmtDate(`${d}T12:00:00Z`);
    });
    if (p.inProgress) {
      const ti = days.indexOf(now.toISOString().slice(0, 10));
      if (ti >= 0) {
        el(
          "line",
          { x1: x(ti), x2: x(ti), y1: T, y2: H - B, class: "today" },
          svg,
        );
        const t = el(
          "text",
          { x: x(ti), y: T - 4, "text-anchor": "middle", class: "axis-label" },
          svg,
        );
        t.textContent = "today";
      }
    }
    const ends = [];
    vis.forEach((m) => {
      const series = daily[m.id];
      if (!series) return;
      const byDay = Object.fromEntries(series.map((s) => [s.day, s.total]));
      const pts = days
        .map((d, i) => (d in byDay ? [x(i), y(byDay[d]), byDay[d]] : null))
        .filter(Boolean);
      if (!pts.length) return;
      const d = pts
        .map((q, i) => (i ? `H${q[0]}V${q[1]}` : `M${q[0]},${q[1]}`))
        .join("");
      el(
        "path",
        {
          d,
          fill: "none",
          stroke: colorOf(m),
          "stroke-width": 2,
          "stroke-linejoin": "round",
        },
        svg,
      );
      const lastPt = pts.at(-1);
      el(
        "circle",
        {
          cx: lastPt[0],
          cy: lastPt[1],
          r: 4,
          fill: colorOf(m),
          stroke: "var(--surface-1)",
          "stroke-width": 2,
        },
        svg,
      );
      ends.push({ m, x: lastPt[0], y: lastPt[1], v: lastPt[2] });
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++)
      if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach((e) => {
      const t = el("text", { x: e.x + 10, y: e.y + 4, class: "direct" }, svg);
      t.textContent = `${memberLabel(e.m)} ${e.v}`;
    });
    const hover = el(
      "line",
      { y1: T, y2: H - B, class: "hover-line", opacity: 0 },
      svg,
    );
    const colW = (W - R - L) / days.length;
    days.forEach((d, i) => {
      const hit = el(
        "rect",
        { x: L + colW * i, y: T, width: colW, height: H - B - T, class: "hit" },
        svg,
      );
      hit.addEventListener("mousemove", (e) => {
        const rows = vis
          .filter((m) => daily[m.id])
          .map((m) => {
            const s = daily[m.id].find((q) => q.day === d);
            return s
              ? {
                  name: m.displayName || m.name,
                  color: colorOf(m),
                  value: s.total,
                }
              : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.value - a.value);
        if (!rows.length) return hideTip();
        hover.setAttribute("x1", x(i));
        hover.setAttribute("x2", x(i));
        hover.setAttribute("opacity", 1);
        showTip(
          e,
          `<div class="tt-title">${esc(fmtDate(`${d}T12:00:00Z`, { weekday: "short", month: "short", day: "numeric" }))}</div>${ttRows(rows)}`,
        );
      });
      hit.addEventListener("mouseleave", () => {
        hover.setAttribute("opacity", 0);
        hideTip();
      });
    });
    container.appendChild(svg);
  }

  const REASONS = {
    "after-merge": "after merge",
    "inline-comment": "single comment",
  };

  function renderDrill() {
    const p = eff.find((x) => x.id === state.focus);
    if (!p) return "";
    const start = Date.parse(p.start),
      end = Date.parse(p.end);
    const excludedBy = {};
    for (const e of events) {
      const t = Date.parse(e.at);
      if (e.excluded && t >= start && t < end)
        (excludedBy[e.login] ||= []).push(e);
    }
    const ordered = members
      .filter((m) => counts[p.id][m.id])
      .sort((a, b) => counts[p.id][b.id].reviews - counts[p.id][a.id].reviews);
    const items = ordered
      .map((m) => {
        const c = counts[p.id][m.id];
        const prs = [...c.prs].sort(
          (a, b) => Date.parse(b.firstAt) - Date.parse(a.firstAt),
        );
        const li = prs
          .map(
            (
              pr,
            ) => `<li><span class="repo">${esc(pr.repo.replace(/^[^/]+\//, ""))}#${pr.pr}</span>
        <a class="title" href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.title)}</a>
        <span class="when tabular">${esc(fmtDateTime(pr.firstAt))}${pr.reviewAts.length > 1 ? `<span class="reason">${pr.reviewAts.length} reviews</span>` : ""}</span></li>`,
          )
          .join("");
        const ex = (excludedBy[m.github] || []).sort(
          (a, b) => Date.parse(b.at) - Date.parse(a.at),
        );
        const exLi = ex
          .map(
            (
              e,
            ) => `<li class="excluded"><span class="repo">${esc(e.repo.replace(/^[^/]+\//, ""))}#${e.pr}</span>
        <a class="title" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.prTitle)}</a>
        <span class="when tabular">${esc(fmtDateTime(e.at))}<span class="reason">${esc(REASONS[e.excluded] || e.excluded)}</span></span></li>`,
          )
          .join("");
        return `<details class="member" data-member="${esc(m.id)}"${openDrill.has(m.id) ? " open" : ""}><summary><i class="dot" style="background:${colorOf(m)}"></i><b>${esc(m.displayName || m.name)}</b>
        <span class="cnt tabular">${plural(c.reviews, "review", "reviews")} · ${plural(c.count, "PR", "PRs")}${ex.length ? ` · ${ex.length} not counted` : ""}</span></summary>
        <ul class="pr-list">${li || "<li>No reviews yet.</li>"}</ul>
        ${ex.length ? `<div class="subhead">Not counted</div><ul class="pr-list">${exLi}</ul>` : ""}</details>`;
      })
      .join("");
    return `<section class="card"><h2>Reviewed PRs · ${esc(p.name)}</h2>
      <p class="sub">Each PR with its first counted review in the sprint, and how many reviews when more than one. Greyed rows are activity that didn't count.</p>${items}</section>`;
  }

  const openDrill = new Set();
  let teamChanged = false;

  function render() {
    const app = document.getElementById("app");
    if (!teamChanged) {
      openDrill.clear();
      app
        .querySelectorAll("details.member[open]")
        .forEach((d) => openDrill.add(d.dataset.member));
    }
    teamChanged = false;
    const active = document.activeElement;
    const legendIndex = [...app.querySelectorAll(".legend-item")].indexOf(
      active,
    );
    const focusId = active?.id;
    const focus = eff.find((x) => x.id === state.focus);
    renderTopBar();
    app.innerHTML = `${renderHeader()}
      ${renderPodium()}
      ${focus ? `<section class="card"><div class="card-head"><h2>Sprint race · ${esc(focus.name)}</h2><a class="watch" href="${esc(raceHref)}${hashFor(team.id, focus.id)}">${ICON_PLAY}Watch the race</a></div><p class="sub">Cumulative reviews by day (UTC).</p>${legend("line")}<div id="race"></div></section>` : ""}
      ${renderDrill()}
      ${renderRangeHead()}
      <div class="grid">
        <section class="card"><h2>Reviews per sprint</h2><p class="sub">Reviews submitted, last ${state.n} ${state.n === 1 ? "sprint" : "sprints"}.</p>${legend("swatch")}<div id="bars"></div></section>
        <section class="card"><h2>Trend</h2><p class="sub">Each person's count across sprints.</p>${legend("line")}<div id="trend"></div></section>
      </div>
      ${renderTable()}
      <footer>
        <div class="how" id="how">${ICON_INFO}<div>
          <p><b>How it's counted.</b> A review is an Approve, Request changes, or Comment review submitted on someone else's PR in ${esc(team.githubOrg)} before it merged. Every review counts, including a second review on the same PR, and each counts in the sprint it was submitted.</p>
          <p>Standalone inline comments and replies in code threads don't count, and neither do comments in the conversation tab. GitHub records a standalone comment as a Comment review with no summary and one inline comment, so a submitted Comment review with no summary and only one inline comment is missed too. Distinct PRs reviewed show as the smaller number.</p>
          <p>Sprints run from their Jira start to the next sprint's start.</p>
        </div></div>
        <p class="built">${ICON_CAL}Built ${esc(fmtDateTime(DATA.builtAt))}</p>
      </footer>`;
    if (eff.length) {
      drawBars(document.getElementById("bars"));
      drawTrend(document.getElementById("trend"));
    }
    if (focus) drawRace(document.getElementById("race"));
    document.getElementById("ctl-n")?.addEventListener("change", (e) => {
      state.n = Number(e.target.value);
      store.set({ n: state.n });
      render();
    });
    document.getElementById("ctl-focus")?.addEventListener("change", (e) => {
      state.focus = e.target.value;
      writeHash();
      render();
    });
    app.querySelectorAll(".legend-item").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.member;
        if (state.hidden.has(id)) state.hidden.delete(id);
        else state.hidden.add(id);
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
      }),
    );
    const target =
      legendIndex >= 0
        ? app.querySelectorAll(".legend-item")[legendIndex]
        : focusId
          ? document.getElementById(focusId)
          : null;
    target?.focus({ preventScroll: true });
  }

  function fromHash() {
    const { team: t, periodId } = resolveSelection(
      DATA.teams,
      parseHash(location.hash),
      store.get().team,
    );
    return { t, periodId };
  }

  window.addEventListener("hashchange", () => {
    const { t, periodId } = fromHash();
    if (!t || (t.id === team?.id && (!periodId || periodId === state.focus)))
      return;
    if (t.id === team.id) state.focus = periodId;
    else selectTeam(t, periodId);
    render();
  });

  applyColorMode(state.mode);
  const initial = fromHash();
  if (!initial.t) {
    document.getElementById("app").innerHTML =
      '<p class="page-sub">No teams are configured yet. Add one to config/teams.json and rebuild.</p>';
    return;
  }
  selectTeam(initial.t, initial.periodId);
  render();
})();
