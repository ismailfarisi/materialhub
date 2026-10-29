import { format } from "date-fns";
import { resolvePath } from "./path.ts";

interface ParsedCall {
  name: string;
  args: (string | number)[];
}

interface InternalArg {
  kind: "literal" | "path";
  value: string | number;
}

const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...a: any[]) => unknown }> = {
  formatDate: { arity: [2, 2], fn: (v, fmt) => format(new Date(v as string), fmt as string) },
  concat: {
    arity: [1, Number.POSITIVE_INFINITY],
    fn: (...args) => {
      // last arg is separator if there are 3+ args and last is a short string
      const last = args[args.length - 1];
      if (args.length >= 3 && typeof last === "string" && last.length <= 3) {
        return args.slice(0, -1).join(last);
      }
      return args.join("");
    },
  },
  multiply: { arity: [2, 2], fn: (v, n) => Number(v) * Number(n) },
  divide: { arity: [2, 2], fn: (v, n) => Number(v) / Number(n) },
  default: { arity: [2, 2], fn: (v, fb) => (v === null || v === undefined ? fb : v) },
  toUpper: { arity: [1, 1], fn: (v) => String(v).toUpperCase() },
  toLower: { arity: [1, 1], fn: (v) => String(v).toLowerCase() },
};

const EXPR_RE = /^\s*(\w+)\s*\((.*)\)\s*$/s;

function parseArgsInternal(text: string): InternalArg[] {
  const args: InternalArg[] = [];
  let i = 0;
  while (i < text.length) {
    while (text[i] === " " || text[i] === ",") i++;
    if (i >= text.length) break;
    if (text[i] === "'" || text[i] === '"') {
      const quote = text[i];
      i++;
      let s = "";
      while (i < text.length && text[i] !== quote) {
        s += text[i++];
      }
      i++; // consume closing quote
      args.push({ kind: "literal", value: s });
    } else {
      let s = "";
      while (i < text.length && text[i] !== ",") s += text[i++];
      s = s.trim();
      const n = Number(s);
      if (!Number.isNaN(n) && s !== "") {
        args.push({ kind: "literal", value: n });
      } else {
        args.push({ kind: "path", value: s });
      }
    }
  }
  return args;
}

export function parseExpression(expr: string): ParsedCall {
  const m = EXPR_RE.exec(expr);
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(`malformed expression: ${expr}`);
  }
  const name = m[1];
  if (!FUNCTIONS[name]) throw new Error(`unknown expression function: ${name}`);
  const parsed = parseArgsInternal(m[2]);
  return { name, args: parsed.map((a) => a.value) };
}

export function callExpression(expr: string, ctx: unknown): unknown {
  const m = EXPR_RE.exec(expr);
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(`malformed expression: ${expr}`);
  }
  const name = m[1];
  const def = FUNCTIONS[name];
  if (!def) throw new Error(`unknown expression function: ${name}`);
  const parsed = parseArgsInternal(m[2]);
  if (parsed.length < def.arity[0] || parsed.length > def.arity[1]) {
    throw new Error(`expression ${name} arity mismatch: got ${parsed.length}`);
  }
  const resolved = parsed.map((a) => {
    if (a.kind === "literal") return a.value;
    return resolvePath(ctx, String(a.value));
  });
  return def.fn(...resolved);
}
