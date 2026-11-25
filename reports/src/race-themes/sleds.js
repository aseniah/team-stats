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
  const day = {
    stage: "#e4edf5",
    stageStripe: "#dbe6f0",
    pitwall: "#f7fafd",
    ground: "#f8fbfe",
    groundEdge: "#c3d4e4",
    laneLine: "#9fb8cf",
    edgeA: "#b9d0e6",
    edgeB: "#d6453d",
    tick: "#3d5873",
    grid: "rgb(30 60 90 / 10%)",
    startLine: "#d6453d",
    flake: "rgb(255 255 255 / 90%)",
    text: "#20344a",
    textShadow: "rgb(255 255 255 / 70%)",
    weekendDay: "#c8dbec",
    weekendText: "#20344a",
    bannerLight: "#b9d0e6",
    labelText: "#20344a",
    labelSub: "#52708d",
    dayText: "#3d5873",
    dayLine: "rgb(30 60 90 / 12%)",
    marker: "#20344a",
  };
  const night = {
    stage: "#1c2a3b",
    stageStripe: "#192636",
    pitwall: "#0f1923",
    ground: "#cdd9e5",
    groundEdge: "#7f93a8",
    laneLine: "#8ea6bd",
    edgeA: "#f4f7fa",
    edgeB: "#c9403a",
    tick: "rgb(220 232 244 / 85%)",
    grid: "rgb(255 255 255 / 8%)",
    startLine: "#e05a52",
    flake: "rgb(255 255 255 / 70%)",
    text: "#e6eef6",
    textShadow: "rgb(0 0 0 / 45%)",
    weekendDay: "#2b3d52",
    weekendText: "#d7e6f3",
    bannerLight: "#ffffff",
    labelText: "#f3f5f7",
    labelSub: "#aeb6bf",
    dayText: "#aeb6bf",
    dayLine: "rgb(255 255 255 / 6%)",
    marker: "#fbfbf8",
  };

  window.RACE_THEMES = window.RACE_THEMES || {};
  window.RACE_THEMES.sleds = {
    id: "sleds",
    label: "Sleds",
    size: { w: 62, h: 40 },
    racer(color, initials, { wheel = "#4d5662", ink = "#fff" } = {}) {
      return `<g transform="translate(0,8)"><path d="M2,29 L50,29 Q60,29 60,22 Q60,19 57,19" fill="none" stroke="${wheel}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M10,29 L12,25 M26,29 L28,25 M42,29 L44,25" stroke="${wheel}" stroke-width="2"/>
        <rect x="4" y="21" width="50" height="5" rx="2" fill="#a8743f" stroke="#5e3e1f" stroke-width=".8"/>
        <rect x="33" y="15" width="17" height="6" rx="3" fill="${color}" stroke="#111" stroke-width=".8"/>
        <rect x="48" y="14" width="6" height="7" rx="2" fill="#2b2f36"/>
        <path d="M14,21 Q13,9 22,6 L31,6 Q37,8 36,21 Z" fill="${color}" stroke="#111" stroke-width=".8"/>
        <path d="M22,7 Q19,10 18,14" stroke="#111" stroke-width="4.4" stroke-linecap="round" fill="none"/>
        <path d="M22,7 Q19,10 18,14" stroke="#fbfbf8" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <path d="M21.4,9 L19.2,10.6 M20,12.2 L18,13" stroke="${color}" stroke-width="1.3"/>
        <rect x="21" y="5" width="13" height="3.5" rx="1.5" fill="#fbfbf8" stroke="#111" stroke-width=".7"/>
        <path d="M25,5 L25,8.5 M29,5 L29,8.5 M33,5 L33,8.5" stroke="${color}" stroke-width="1.4"/>
        <circle cx="29" cy="2" r="4.6" fill="#f1c9a5"/>
        <path d="M24.4,1.4 Q25,-4.6 29.6,-4.6 Q34,-4.6 33.8,1.2 Z" fill="${color}" stroke="#111" stroke-width=".7"/>
        <circle cx="29.4" cy="-5.6" r="2.2" fill="#fbfbf8" stroke="#111" stroke-width=".7"/>
        <text x="25" y="17" font-size="8" font-weight="800" fill="${ink}" text-anchor="middle" font-family="var(--display)">${esc(initials)}</text></g>`;
    },
    field({ width, top, lanes, laneHeight, labelWidth, startX, finishX }) {
      const bottom = top + lanes * laneHeight;
      const left = labelWidth + 10;
      const edge = (y) => {
        const parts = [];
        for (let x = left, i = 0; x < width - 10; x += 16, i++)
          parts.push(
            `<rect x="${x}" y="${y}" width="16" height="5" fill="var(--scene-edge-${i % 2 ? "b" : "a"})"/>`,
          );
        return parts.join("");
      };
      const rows = [];
      for (let i = 0; i < lanes; i++) {
        const y = top + i * laneHeight;
        rows.push(
          `<rect x="${left}" y="${y}" width="${width - left - 10}" height="${laneHeight}" fill="var(--scene-ground)"/>`,
        );
        rows.push(
          `<path d="M${left},${y + laneHeight - 14} Q${(left + width) / 2},${y + laneHeight - 20} ${width - 10},${y + laneHeight - 14}" stroke="var(--scene-lane-line)" stroke-width="1" opacity=".35" fill="none"/>`,
        );
        if (i)
          rows.push(
            `<line x1="${left}" x2="${width - 10}" y1="${y}" y2="${y}" stroke="var(--scene-lane-line)" stroke-width="2" stroke-dasharray="4 10" stroke-linecap="round"/>`,
          );
      }
      const flakes = [];
      for (let k = 0; k < 26; k++) {
        const x = (k * 197) % width;
        const y = ((k * 89) % (bottom + 10 - (top - 30))) + top - 30;
        if (x > labelWidth + 4 || y < top - 12)
          flakes.push(
            `<circle cx="${x}" cy="${y}" r="${1 + (k % 3)}" fill="var(--scene-flake)"/>`,
          );
      }
      const banner = [];
      for (let y = top, i = 0; y < bottom; y += 10, i++)
        banner.push(
          `<rect x="${finishX}" y="${y}" width="16" height="${Math.min(10, bottom - y)}" fill="${i % 2 ? "#d6453d" : "var(--scene-banner-light)"}"/>`,
        );
      return `<rect x="0" y="${top - 10}" width="${labelWidth + 2}" height="${lanes * laneHeight + 20}" rx="10" fill="var(--scene-pitwall)"/>
        <rect x="${labelWidth + 6}" y="${top - 9}" width="${width - labelWidth - 12}" height="${lanes * laneHeight + 18}" rx="6" fill="var(--scene-ground-edge)"/>
        ${rows.join("")}${edge(top - 5)}${edge(bottom)}
        <line x1="${startX}" x2="${startX}" y1="${top}" y2="${bottom}" stroke="var(--scene-start-line)" stroke-width="3"/>
        ${banner.join("")}
        <path d="M${finishX - 4},${top - 4} L${finishX - 4},${top - 26} M${finishX + 20},${top - 4} L${finishX + 20},${top - 26}" stroke="#7a5a3a" stroke-width="3"/>
        <rect x="${finishX - 8}" y="${top - 30}" width="32" height="9" rx="2" fill="#d6453d"/>
        ${flakes.join("")}`;
    },
    effects: {
      boost: () => `<g transform="translate(0,8)">
        <path d="M-34,8 L-10,8 M-40,14 L-14,14 M-32,20 L-12,20" stroke="#3f78b0" stroke-width="2" stroke-linecap="round" opacity=".75"/>
        <path d="M4,26 Q-8,16 -30,20 Q-18,25 -32,30 Q-14,31 4,32 Z" fill="#dcebf7" stroke="#5b8dbd" stroke-width="1.6" stroke-linejoin="round"/>
        <g fill="#dcebf7" stroke="#5b8dbd" stroke-width="1.2"><circle cx="-20" cy="15" r="2.8"/><circle cx="-36" cy="25" r="2.4"/><circle cx="-26" cy="35" r="2.2"/><circle cx="-10" cy="12" r="2"/></g>
      </g>`,
    },
    start: { lights: 3, go: "GO!", button: "Push off" },
    words: {
      grid: "{n} sleds at the top of the hill",
      weekendDay: "COCOA",
      weekendFlag: "Weekend at 2x",
      title: "{name} Sled Run",
      results: "{name} results",
    },
    phrases: {
      lead: ["takes the lead from", "slides ahead of", "shoots past"],
      pass: ["glides past", "zips by", "carves past"],
      back: ["slides back past"],
      tie: ["side by side for {place}"],
      boost: [
        "Hits the ice",
        "Downhill rush",
        "Full speed downhill",
        "Catches the slope",
      ],
      weekend: [
        "Skipping hot cocoa this {day}",
        "Still sledding this {day}",
        "Sledding through the weekend",
      ],
      join: ["{a} joins the run"],
      leave: ["{a} heads in to the lodge"],
      start: ["And they're off!"],
      timeUp: ["Time's up! Still sliding in"],
      soFar: ["That's the race so far"],
      checkered: ["Finish line!"],
      finish: {
        first: {
          one: "{names} wins the run with {n}!",
          shared: "{names} share the win with {n}!",
        },
        second: {
          one: "{names} slides in 2nd with {n}",
          shared: "{names} slide in 2nd with {n}",
        },
        third: {
          one: "{names} takes 3rd with {n}",
          shared: "{names} take 3rd with {n}",
        },
        middle: {
          one: "{names} finishes {place} with {n}",
          shared: "{names} finish {place} with {n}",
        },
        last: {
          one: "{names} skids in last with {n} {last}",
          shared: "{names} skid in last with {n} {last}",
        },
        garage: {
          one: "{names} stays in the lodge",
          shared: "{names} stay in the lodge",
        },
      },
    },
    palette: { light: day, dark: night },
  };
})();
