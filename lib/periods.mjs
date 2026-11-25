const ms = (iso) => Date.parse(iso);

const fill = (template, slots) => {
  let missing = false;
  const out = template.replace(/\{(\w+)\}/g, (_, k) => {
    if (slots[k] === undefined || slots[k] === "") missing = true;
    return slots[k] ?? "";
  });
  return missing ? null : out;
};

export function periodFromSprint(sprint, naming = {}) {
  const slots = { jiraId: String(sprint.id), name: sprint.name };
  const match = naming.namePattern
    ? sprint.name.match(new RegExp(naming.namePattern))
    : null;
  if (match?.groups)
    for (const [k, v] of Object.entries(match.groups))
      if (v !== undefined) slots[k] = v;
  const id = fill(naming.id || "sprint-{jiraId}", slots);
  return {
    id: id
      ? id.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
      : `sprint-${sprint.id}`,
    kind: "sprint",
    name: sprint.name,
    label: fill(naming.label || "{name}", slots) || sprint.name,
    jiraSprintId: sprint.id,
    start: sprint.startDate,
    plannedEnd: sprint.endDate,
  };
}

export function syncSprints(periods, sprints, { boardId, naming } = {}) {
  const next = periods.map((p) => ({ ...p }));
  const latest = next.reduce(
    (a, p) => (!a || ms(p.start) > ms(a.start) ? p : a),
    null,
  );
  const changed = [];
  const own = sprints.filter(
    (s) => s.startDate && (boardId == null || s.originBoardId === boardId),
  );
  if (latest?.jiraSprintId != null) {
    const s = own.find((x) => x.id === latest.jiraSprintId);
    if (s?.endDate && s.endDate !== latest.plannedEnd) {
      latest.plannedEnd = s.endDate;
      changed.push(latest.id);
    }
  }
  const ids = new Set(next.map((p) => p.id));
  const added = [];
  for (const s of own
    .filter((x) => !latest || ms(x.startDate) > ms(latest.start))
    .sort((a, b) => ms(a.startDate) - ms(b.startDate))) {
    const p = periodFromSprint(s, naming);
    if (ids.has(p.id)) p.id = `sprint-${s.id}`;
    for (let n = 2; ids.has(p.id); n++) p.id = `sprint-${s.id}-${n}`;
    ids.add(p.id);
    next.push(p);
    added.push(p.id);
  }
  return { periods: next, added, changed };
}
