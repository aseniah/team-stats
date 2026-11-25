// The build inlines this file into both pages by stripping `export `, so it must stay import-free.

export const SERIES = Array.from({ length: 10 }, (_, i) => `--series-${i + 1}`);
export const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };
export const COLOR_MODES = ["auto", "light", "dark"];
export const MODE_ICONS = {
  auto: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 0 12z" class="fill"/></svg>',
  light:
    '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/></svg>',
  dark: '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/></svg>',
};

const STORE_KEY = "teamstats.v2";
export const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  },
  set(v) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...store.get(), ...v }));
    } catch {
      /* storage unavailable */
    }
  },
};

export function applyColorMode(mode) {
  if (mode === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

export function modeButtonHtml(mode) {
  return `${MODE_ICONS[mode]}<span>${mode[0].toUpperCase()}${mode.slice(1)}</span>`;
}

export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const memberLabel = (m) => m.displayName || m.name.split(" ")[0];
export const initials = (m) =>
  (m.displayName
    ? m.displayName.slice(0, 2)
    : m.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
  ).toUpperCase();

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// `#team/period`. A single segment may be a team id or, from links made before teams existed, a period id.
export function parseHash(raw) {
  const s = String(raw ?? "").replace(/^#/, "");
  if (!s) return { teamId: null, periodId: null };
  const i = s.indexOf("/");
  if (i < 0) return { teamId: decode(s), periodId: decode(s) };
  return {
    teamId: decode(s.slice(0, i)) || null,
    periodId: decode(s.slice(i + 1)) || null,
  };
}

export function resolveSelection(teams, { teamId, periodId }, savedTeamId) {
  const byId = (id) => teams.find((t) => t.id === id);
  const hashTeam = byId(teamId);
  const team = hashTeam || byId(savedTeamId) || teams[0] || null;
  const single = teamId !== null && teamId === periodId;
  const pid = single && hashTeam ? null : periodId;
  return {
    team,
    periodId: team?.periods.some((p) => p.id === pid) ? pid : null,
  };
}

export function hashFor(teamId, periodId) {
  return `#${encodeURIComponent(teamId)}${periodId ? `/${encodeURIComponent(periodId)}` : ""}`;
}

// Nav links carry only the team, so each report opens on its own default sprint.
export function topBarHtml({ reports, current, teams, teamId, mode }) {
  const nav = reports
    .map(
      (r) =>
        `<a href="${esc(r.href)}${hashFor(teamId)}"${r.id === current ? ' aria-current="page"' : ""}>${esc(r.title)}</a>`,
    )
    .join("");
  const team = teams.find((t) => t.id === teamId);
  const picker =
    teams.length > 1
      ? `<label class="team-picker"><span class="visually-hidden">Team</span><select id="ctl-team">${teams.map((t) => `<option value="${esc(t.id)}"${t.id === teamId ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>`
      : `<span class="team-name">${esc(team?.name ?? "")}</span>`;
  return `<div class="topbar-inner">
    <a class="brand" href="${esc(reports[0]?.href ?? "#")}${hashFor(teamId)}"><svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="8" width="3.4" height="6.5" rx="1"/><rect x="6.3" y="3" width="3.4" height="11.5" rx="1"/><rect x="11.1" y="5.5" width="3.4" height="9" rx="1"/></svg>TeamStats</a>
    <nav class="nav" aria-label="Reports">${nav}</nav>
    <div class="topbar-tools">${picker}<button type="button" id="ctl-mode" class="theme-toggle" title="Color mode: ${mode}. Click to change." aria-label="Color mode: ${mode}">${modeButtonHtml(mode)}</button></div>
  </div>`;
}

// Renders the bar into `el` and wires it. `onMode` runs after the mode is applied and saved.
export function mountTopBar(el, opts, { onTeam, onMode }) {
  el.innerHTML = topBarHtml(opts);
  el.querySelector("#ctl-team")?.addEventListener("change", (e) =>
    onTeam(e.target.value),
  );
  el.querySelector("#ctl-mode").addEventListener("click", () => {
    const mode =
      COLOR_MODES[(COLOR_MODES.indexOf(opts.mode) + 1) % COLOR_MODES.length];
    store.set({ theme: mode });
    applyColorMode(mode);
    mountTopBar(el, { ...opts, mode }, { onTeam, onMode });
    el.querySelector("#ctl-mode").focus();
    onMode?.(mode);
  });
}

export const savedMode = () =>
  COLOR_MODES.includes(store.get().theme) ? store.get().theme : "auto";

const AXIS_STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];

// Smallest step that covers `v` in at most 5 gridlines, so the axis grows by 25 rather than doubling.
export function niceScale(v) {
  const step =
    AXIS_STEPS.find((s) => Math.ceil(v / s) <= 5) ?? AXIS_STEPS.at(-1);
  const ticks = Math.max(1, Math.ceil(v / step));
  return step === 1 && ticks < 5
    ? { max: 5, ticks: 5 }
    : { max: ticks * step, ticks };
}
