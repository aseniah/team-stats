(() => {
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const night = {
    stage: "#2f6b3a",
    stageStripe: "#29603a",
    pitwall: "#151a20",
    ground: "#3a3d42",
    groundEdge: "#2b2e33",
    laneLine: "#d9dcdf",
    edgeA: "#eef0f1",
    edgeB: "#d33a2c",
    tick: "rgb(255 255 255 / 75%)",
    grid: "rgb(255 255 255 / 7%)",
    startLine: "#f2f2f2",
    weekendDay: "#24302a",
    weekendText: "#d7e4c3",
    text: "#f3f5f7",
    textShadow: "rgb(0 0 0 / 40%)",
    labelText: "#f3f5f7",
    labelSub: "#aeb6bf",
    dayText: "#aeb6bf",
    dayLine: "rgb(255 255 255 / 6%)",
    marker: "#fbfbf8",
  };
  const day = {
    stage: "#8cc47a",
    stageStripe: "#83bb70",
    pitwall: "#eef1f3",
    ground: "#6e747c",
    groundEdge: "#5d636a",
    laneLine: "#eef0f1",
    edgeA: "#ffffff",
    edgeB: "#d33a2c",
    tick: "rgb(20 40 20 / 75%)",
    grid: "rgb(0 0 0 / 7%)",
    startLine: "#ffffff",
    weekendDay: "#cfe2c2",
    weekendText: "#2c4a24",
    text: "#18301b",
    textShadow: "rgb(255 255 255 / 55%)",
    labelText: "#1d242c",
    labelSub: "#56606b",
    dayText: "#46505a",
    dayLine: "rgb(0 0 0 / 8%)",
    marker: "#1d242c",
  };

  window.RACE_THEMES = window.RACE_THEMES || {};
  window.RACE_THEMES.cars = {
    id: "cars",
    label: "Cars",
    size: { w: 58, h: 30 },
    racer(color, initials, { wheel = "#0c0c0c", ink = "#fff" } = {}) {
      return `<rect x="8" y="1" width="11" height="6" rx="2" fill="${wheel}"/><rect x="8" y="23" width="11" height="6" rx="2" fill="${wheel}"/>
        <rect x="38" y="2" width="10" height="5" rx="2" fill="${wheel}"/><rect x="38" y="23" width="10" height="5" rx="2" fill="${wheel}"/>
        <rect x="0" y="5" width="6" height="20" rx="1.5" fill="${color}" stroke="#0c0c0c" stroke-width="1"/>
        <path d="M5,9 L44,8 Q58,15 44,22 L5,21 Z" fill="${color}" stroke="#0c0c0c" stroke-width="1"/>
        <rect x="25" y="11" width="13" height="8" rx="4" fill="#0c0c0c" opacity=".8"/>
        <text x="16" y="18" font-size="8.5" font-weight="800" fill="${ink}" font-family="var(--display)">${esc(initials)}</text>`;
    },
    field({ width, top, lanes, laneHeight, labelWidth, startX, finishX }) {
      const bottom = top + lanes * laneHeight;
      const kerb = (y) => {
        const parts = [];
        for (let x = labelWidth + 10, i = 0; x < width - 10; x += 22, i++)
          parts.push(
            `<rect x="${x}" y="${y}" width="22" height="5" fill="var(--scene-edge-${i % 2 ? "b" : "a"})"/>`,
          );
        return parts.join("");
      };
      const rows = [];
      for (let i = 0; i < lanes; i++) {
        const y = top + i * laneHeight;
        rows.push(
          `<rect x="${labelWidth + 10}" y="${y}" width="${width - labelWidth - 20}" height="${laneHeight}" fill="var(--scene-ground)"/>`,
        );
        if (i)
          rows.push(
            `<line x1="${labelWidth + 10}" x2="${width - 10}" y1="${y}" y2="${y}" stroke="var(--scene-lane-line)" stroke-width="2" stroke-dasharray="18 14" opacity=".55"/>`,
          );
      }
      const checker = [];
      for (let y = top, i = 0; y < bottom; y += 8, i++) {
        const h = Math.min(8, bottom - y);
        checker.push(
          `<rect x="${finishX}" y="${y}" width="8" height="${h}" fill="${i % 2 ? "#111" : "#f2f2f2"}"/><rect x="${finishX + 8}" y="${y}" width="8" height="${h}" fill="${i % 2 ? "#f2f2f2" : "#111"}"/>`,
        );
      }
      return `<rect x="0" y="${top - 10}" width="${labelWidth + 2}" height="${lanes * laneHeight + 20}" rx="10" fill="var(--scene-pitwall)"/>
        <rect x="${labelWidth + 6}" y="${top - 9}" width="${width - labelWidth - 12}" height="${lanes * laneHeight + 18}" rx="4" fill="var(--scene-ground-edge)"/>
        ${rows.join("")}${kerb(top - 5)}${kerb(bottom)}
        <line x1="${startX}" x2="${startX}" y1="${top}" y2="${bottom}" stroke="var(--scene-start-line)" stroke-width="3"/>
        ${checker.join("")}`;
    },
    effects: {
      boost: () =>
        '<path d="M3,15 L-26,7 L-16,15 L-26,23 Z" fill="#ff6a1a"/><path d="M3,15 L-15,10 L-9,15 L-15,20 Z" fill="#ffd23f"/>',
    },
    start: { lights: 3, go: "GO!", button: "Go" },
    words: {
      grid: "{n} drivers on the grid",
      weekendDay: "PIT",
      weekendFlag: "Weekend at 2x",
      title: "{name} Grand Prix",
      results: "{name} results",
    },
    phrases: {
      lead: ["takes the lead from", "grabs the lead from", "moves ahead of"],
      pass: ["overtakes", "gets by", "slips past"],
      back: ["gets back past"],
      tie: ["tied for {place}"],
      boost: [
        "Finds another gear",
        "Turbo on",
        "Full throttle",
        "Hits the boost",
      ],
      weekend: [
        "Skipping the pit stop",
        "No pit stop this {day}",
        "Racing through the weekend",
      ],
      join: ["{a} joins the race"],
      leave: ["{a} heads for the pits"],
      start: ["And they're off!"],
      timeUp: ["Time's up! Last laps still running"],
      soFar: ["That's the race so far"],
      checkered: ["Checkered flag!"],
      finish: {
        first: {
          one: "{names} takes the checkered flag with {n}!",
          shared: "{names} share the checkered flag with {n}!",
        },
        second: {
          one: "{names} crosses in 2nd with {n}",
          shared: "{names} cross in 2nd with {n}",
        },
        third: {
          one: "{names} completes the podium with {n}",
          shared: "{names} complete the podium with {n}",
        },
        middle: {
          one: "{names} finishes {place} with {n}",
          shared: "{names} finish {place} with {n}",
        },
        last: {
          one: "{names} brings it home last with {n} {last}",
          shared: "{names} bring it home last with {n} {last}",
        },
        garage: {
          one: "{names} stays in the garage",
          shared: "{names} stay in the garage",
        },
      },
    },
    palette: { light: day, dark: night },
  };
})();
