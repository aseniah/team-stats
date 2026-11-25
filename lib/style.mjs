const CODES = {
  bold: [1, 22],
  dim: [2, 22],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  cyan: [36, 39],
};

// ANSI styling for a stream: on for a terminal, off for pipes and logs, NO_COLOR turns it off and FORCE_COLOR on.
export function styler(out = process.stdout, env = process.env) {
  const on = env.FORCE_COLOR
    ? env.FORCE_COLOR !== "0"
    : Boolean(out.isTTY) && !env.NO_COLOR;
  return Object.fromEntries(
    Object.entries(CODES).map(([name, [open, close]]) => [
      name,
      on ? (s) => `\x1b[${open}m${s}\x1b[${close}m` : (s) => String(s),
    ]),
  );
}
