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
  const dusk = {
    stage: "#2c5a2e",
    stageStripe: "#285329",
    pitwall: "#1b2417",
    ground: "#4e8a3a",
    groundEdge: "#3f7330",
    groundStripe: "rgb(255 255 255 / 6%)",
    laneLine: "#f4f1e8",
    rail: "#fbfbf6",
    railPost: "#d9d6cc",
    tick: "rgb(255 255 255 / 80%)",
    grid: "rgb(255 255 255 / 8%)",
    startLine: "#f4f1e8",
    gate: "#6b7076",
    post: "#c8362e",
    text: "#f6f4ec",
    textShadow: "rgb(0 0 0 / 40%)",
    weekendDay: "#3a4a2a",
    weekendText: "#e6edcf",
    labelText: "#f3f5f7",
    labelSub: "#aeb6bf",
    dayText: "#aeb6bf",
    dayLine: "rgb(255 255 255 / 6%)",
    marker: "#fbfbf8",
  };
  const day = {
    stage: "#8fc27a",
    stageStripe: "#86b970",
    pitwall: "#f1f3ea",
    ground: "#6aa851",
    groundEdge: "#5a9443",
    groundStripe: "rgb(255 255 255 / 10%)",
    laneLine: "#ffffff",
    rail: "#ffffff",
    railPost: "#c9c6ba",
    tick: "rgb(20 45 15 / 75%)",
    grid: "rgb(0 0 0 / 6%)",
    startLine: "#ffffff",
    gate: "#8a9096",
    post: "#c8362e",
    text: "#1c3317",
    textShadow: "rgb(255 255 255 / 55%)",
    weekendDay: "#d6e6c4",
    weekendText: "#33501f",
    labelText: "#1f2a1b",
    labelSub: "#59654f",
    dayText: "#46523e",
    dayLine: "rgb(0 0 0 / 8%)",
    marker: "#1f2a1b",
  };

  window.RACE_THEMES = window.RACE_THEMES || {};
  window.RACE_THEMES.horses = {
    id: "horses",
    label: "Horses",
    size: { w: 64, h: 36 },
    racer(color, initials, { wheel = "#2a1a10", ink = "#fff" } = {}) {
      const coat = "#7a4a2a";
      return `<path d="M12,17 Q4,15 2,24 Q8,20 13,21 Z" fill="${wheel}"/>
        <path d="M22,24 L15,33 M25,25 L22,35 M41,24 L48,32 M38,25 L42,35" stroke="${coat}" stroke-width="3" stroke-linecap="round"/>
        <path d="M15,33 l-2,1 M22,35 l-2,0 M48,32 l2,1 M42,35 l2,0" stroke="${wheel}" stroke-width="3" stroke-linecap="round"/>
        <ellipse cx="30" cy="19" rx="18" ry="7.5" fill="${coat}"/>
        <path d="M42,15 Q47,7 53,4 L63,9 Q63,12 60,12 L55,11 Q50,17 46,22 Z" fill="${coat}"/>
        <path d="M44,13 Q48,6 53,4 L50,9 Q47,12 46,16 Z" fill="${wheel}"/>
        <circle cx="57" cy="7.5" r="1" fill="#111"/>
        <rect x="22" y="13" width="16" height="11" rx="2" fill="${color}" stroke="#111" stroke-width=".8"/>
        <text x="30" y="21.5" font-size="8" font-weight="800" fill="${ink}" text-anchor="middle" font-family="var(--display)">${esc(initials)}</text>
        <path d="M27,13 Q29,4 37,3 L41,6 Q35,8 33,13 Z" fill="${color}" stroke="#111" stroke-width=".8"/>
        <circle cx="40" cy="2.8" r="3" fill="${color}" stroke="#111" stroke-width=".8"/>
        <path d="M38,6 L45,10" stroke="#f1c9a5" stroke-width="1.6" stroke-linecap="round"/>`;
    },
    field({ width, top, lanes, laneHeight, labelWidth, startX, finishX }) {
      const bottom = top + lanes * laneHeight;
      const left = labelWidth + 10;
      const rail = (y) => {
        const posts = [];
        for (let x = left; x < width - 10; x += 40)
          posts.push(
            `<rect x="${x}" y="${y - 1}" width="3" height="7" fill="var(--scene-rail-post)"/>`,
          );
        return `<rect x="${left}" y="${y}" width="${width - left - 10}" height="3" fill="var(--scene-rail)"/>${posts.join("")}`;
      };
      const rows = [];
      for (let i = 0; i < lanes; i++) {
        const y = top + i * laneHeight;
        rows.push(
          `<rect x="${left}" y="${y}" width="${width - left - 10}" height="${laneHeight}" fill="var(--scene-ground)"/>`,
        );
        rows.push(
          `<rect x="${left}" y="${y}" width="${width - left - 10}" height="${laneHeight / 2}" fill="var(--scene-ground-stripe)"/>`,
        );
        if (i)
          rows.push(
            `<line x1="${left}" x2="${width - 10}" y1="${y}" y2="${y}" stroke="var(--scene-lane-line)" stroke-width="1.5" opacity=".5"/>`,
          );
      }
      const gate = [];
      for (let i = 0; i <= lanes; i++)
        gate.push(
          `<rect x="${startX - 3}" y="${top + i * laneHeight - 3}" width="10" height="6" rx="1" fill="var(--scene-gate)"/>`,
        );
      return `<rect x="0" y="${top - 10}" width="${labelWidth + 2}" height="${lanes * laneHeight + 20}" rx="10" fill="var(--scene-pitwall)"/>
        <rect x="${labelWidth + 6}" y="${top - 9}" width="${width - labelWidth - 12}" height="${lanes * laneHeight + 18}" rx="4" fill="var(--scene-ground-edge)"/>
        ${rows.join("")}${rail(top - 6)}${rail(bottom + 2)}
        <line x1="${startX}" x2="${startX}" y1="${top}" y2="${bottom}" stroke="var(--scene-start-line)" stroke-width="3" stroke-dasharray="6 4"/>
        ${gate.join("")}
        <rect x="${finishX}" y="${top}" width="14" height="${bottom - top}" fill="#fbfbf6"/>
        <rect x="${finishX + 5}" y="${top}" width="4" height="${bottom - top}" fill="var(--scene-post)"/>
        <rect x="${finishX - 3}" y="${top - 22}" width="20" height="20" rx="10" fill="var(--scene-post)" stroke="#fbfbf6" stroke-width="3"/>`;
    },
    effects: {
      boost:
        () => `<path d="M-30,14 L-6,14 M-36,20 L-10,20 M-28,26 L-8,26" stroke="#fbfbf6" stroke-width="2" stroke-linecap="round" opacity=".8"/>
        <g stroke="#6e4f2c" stroke-width="1">
          <circle cx="-22" cy="30" r="5" fill="#d8bd92"/><circle cx="-12" cy="28" r="7" fill="#c9a877"/>
          <circle cx="-1" cy="31" r="7" fill="#b8925f"/><circle cx="9" cy="34" r="5" fill="#b8925f"/>
        </g>
        <circle cx="-30" cy="25" r="2" fill="#5a3b1e"/><circle cx="-18" cy="21" r="1.8" fill="#5a3b1e"/><circle cx="-34" cy="32" r="1.6" fill="#5a3b1e"/>`,
    },
    start: { lights: 3, go: "GO!", button: "Open the gates" },
    words: {
      grid: "{n} horses in the starting gate",
      weekendDay: "REST",
      weekendFlag: "Weekend at 2x",
      title: "{name} Derby",
      results: "{name} results",
    },
    phrases: {
      lead: [
        "takes the lead from",
        "moves to the front past",
        "hits the front ahead of",
      ],
      pass: ["gallops past", "edges by", "runs down"],
      back: ["gets back past"],
      tie: ["neck and neck for {place}"],
      boost: [
        "Kicks for home",
        "Full gallop",
        "Turns on the speed",
        "Finds another stride",
      ],
      weekend: [
        "No rest this {day}",
        "Out on the gallops this {day}",
        "Training through the weekend",
      ],
      join: ["{a} joins the field"],
      leave: ["{a} heads back to the stables"],
      start: ["And they're off!"],
      timeUp: ["Time's up! Still galloping in"],
      soFar: ["That's the race so far"],
      checkered: ["Past the post!"],
      finish: {
        first: {
          one: "{names} wins the race with {n}!",
          shared: "{names} share the win in a dead heat with {n}!",
        },
        second: {
          one: "{names} places 2nd with {n}",
          shared: "{names} place 2nd in a dead heat with {n}",
        },
        third: {
          one: "{names} shows in 3rd with {n}",
          shared: "{names} show in 3rd with {n}",
        },
        middle: {
          one: "{names} finishes {place} with {n}",
          shared: "{names} finish {place} with {n}",
        },
        last: {
          one: "{names} trots home last with {n} {last}",
          shared: "{names} trot home last with {n} {last}",
        },
        garage: {
          one: "{names} stays in the stable",
          shared: "{names} stay in the stable",
        },
      },
    },
    palette: { light: day, dark: dusk },
  };
})();
