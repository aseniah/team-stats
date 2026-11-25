import { styler } from "./style.mjs";

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const MARKS = { waiting: "·", done: "✓", failed: "✗", skipped: "–" };

// One status line per task. On a terminal the lines redraw in place with a spinner;
// otherwise each start and finish prints once, so logs and agents get plain lines.
export function progressBoard(
  names,
  { out = process.stdout, intervalMs = 80, style = styler(out) } = {},
) {
  const rows = names.map((name) => ({
    name,
    state: "waiting",
    text: "waiting",
  }));
  const tty = Boolean(out.isTTY);
  const paint = {
    waiting: { mark: style.dim, name: style.dim, text: style.dim },
    running: { mark: style.cyan, name: style.bold, text: String },
    done: { mark: style.green, name: style.bold, text: style.dim },
    failed: { mark: style.red, name: style.bold, text: style.red },
    skipped: { mark: style.yellow, name: String, text: style.dim },
  };
  let frame = 0;
  let drawn = 0;
  let timer = null;

  const line = (r) => {
    const mark =
      r.state === "running" ? FRAMES[frame % FRAMES.length] : MARKS[r.state];
    const head = `${mark} ${r.name}: `;
    const room = (out.columns ? out.columns - 1 : Infinity) - head.length;
    const text =
      r.text.length > room
        ? `${r.text.slice(0, Math.max(0, room - 1))}…`
        : r.text;
    const p = paint[r.state];
    return `${p.mark(mark)} ${p.name(r.name)}: ${p.text(text)}`;
  };
  const draw = () => {
    if (drawn) out.write(`\x1b[${drawn}A`);
    out.write(rows.map((r) => `\x1b[2K${line(r)}\n`).join(""));
    drawn = rows.length;
  };
  const set = (i, state, text) => {
    Object.assign(rows[i], { state, text });
    if (!tty && state !== "running") out.write(`${line(rows[i])}\n`);
  };

  return {
    begin() {
      if (!tty) return;
      draw();
      timer = setInterval(() => {
        frame++;
        draw();
      }, intervalMs);
    },
    start(i) {
      rows[i].state = "running";
      rows[i].text = "starting";
      if (!tty) out.write(`${rows[i].name}: started\n`);
    },
    update(i, text) {
      rows[i].text = text;
    },
    done: (i, text) => set(i, "done", text),
    failed: (i, text) => set(i, "failed", text),
    skipped: (i, text) => set(i, "skipped", text),
    end() {
      clearInterval(timer);
      if (tty) draw();
    },
  };
}
