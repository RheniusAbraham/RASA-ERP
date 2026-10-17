/**
 * The maths behind the header calculator: an expression evaluator and the key-press rules.
 * Pure functions with no UI, so they can be tested on their own.
 *
 * The expression is kept as text, e.g. "200+10%" or "(2+3)×4", using × ÷ − for the operators.
 */

export type Evaluation = { value: number } | { error: string } | null; // null = not a complete expression yet

class Incomplete extends Error {}
class MathError extends Error {}

type Tok = number | "+" | "−" | "×" | "÷" | "(" | ")" | "%";

function tokenize(expr: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const text = expr.slice(i, j);
      if (text === "." || (text.match(/\./g) ?? []).length > 1) throw new Incomplete();
      tokens.push(parseFloat(text));
      i = j;
    } else if ("+−×÷()%".includes(ch)) {
      tokens.push(ch as Tok);
      i++;
    } else if (ch === " ") {
      i++;
    } else {
      throw new MathError("Invalid input");
    }
  }
  return tokens;
}

/** Rounds away floating point noise so 0.1 + 0.2 shows 0.3. */
const clean = (n: number) => Number(n.toPrecision(12));

export function evaluate(expr: string): Evaluation {
  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) return null;
    let pos = 0;
    const peek = () => tokens[pos];

    // A "term" remembers whether it was just a percentage (e.g. "10%"), because after + or − that means
    // "10% of the number so far": 200 + 10% = 220, while 200 × 10% = 20.
    type Part = { v: number; pct: boolean };

    const primary = (): number => {
      const t = tokens[pos++];
      if (typeof t === "number") return t;
      if (t === "(") {
        const inner = additive();
        if (peek() === ")") pos++; // a missing ")" at the end is closed for you
        return inner;
      }
      throw new Incomplete();
    };
    const postfix = (): Part => {
      let v = primary();
      let pct = false;
      while (peek() === "%") {
        pos++;
        v /= 100;
        pct = true;
      }
      return { v, pct };
    };
    const unary = (): Part => {
      if (peek() === "−") {
        pos++;
        const p = unary();
        return { v: -p.v, pct: p.pct };
      }
      if (peek() === "+") {
        pos++;
        return unary();
      }
      return postfix();
    };
    const multiplicative = (): Part => {
      let left = unary();
      let combined = false;
      while (peek() === "×" || peek() === "÷") {
        const op = tokens[pos++];
        const right = unary();
        if (op === "÷" && right.v === 0) throw new MathError("Can't divide by zero");
        left = { v: op === "×" ? left.v * right.v : left.v / right.v, pct: false };
        combined = true;
      }
      return combined ? left : { v: left.v, pct: left.pct };
    };
    const additive = (): number => {
      let left = multiplicative().v;
      while (peek() === "+" || peek() === "−") {
        const op = tokens[pos++];
        const right = multiplicative();
        const amount = right.pct ? left * right.v : right.v;
        left = op === "+" ? left + amount : left - amount;
      }
      return left;
    };

    const value = additive();
    if (pos < tokens.length) return null; // something is left over, e.g. a stray ")"
    if (!Number.isFinite(value)) return { error: "Result is too large" };
    return { value: clean(value) };
  } catch (e) {
    if (e instanceof MathError) return { error: e.message };
    return null;
  }
}

/** 1234567.5 -> "12,34,567.5" (Indian digit grouping); very large / tiny numbers switch to scientific form. */
export function formatNumber(n: number): string {
  if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-9)) return n.toExponential(6).replace(/\.?0+e/, "e");
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 10 }).format(n);
}

/** The same number without grouping, to put back into the expression ("1234567.5"). */
export const plainNumber = (n: number) => String(clean(n)).replace("e+", "e");

export type CalcState = { expr: string; done: boolean; error?: string };
export const EMPTY: CalcState = { expr: "", done: false };

const isOp = (c: string) => "+−×÷".includes(c);
const isDigit = (c: string) => c >= "0" && c <= "9";
const endsValue = (expr: string) => {
  const last = expr.slice(-1);
  return isDigit(last) || last === ")" || last === "%" || last === ".";
};

/** Applies one key to the calculator and returns the new state. */
export function pressKey(state: CalcState, key: string): CalcState {
  if (state.error) state = EMPTY; // any key after an error starts fresh
  const { expr, done } = state;
  const last = expr.slice(-1);

  if (key === "AC") return EMPTY;
  if (key === "⌫") return done ? EMPTY : { expr: expr.slice(0, -1), done: false };

  if (key === "=") {
    const result = evaluate(expr);
    if (result && "value" in result) return { expr: plainNumber(result.value), done: true };
    if (result && "error" in result) return { expr, done: false, error: result.error };
    return state;
  }

  if (isDigit(key)) {
    if (done) return { expr: key, done: false };
    if (last === ")" || last === "%") return { expr: `${expr}×${key}`, done: false };
    if (/(^|[^0-9.])0$/.test(expr)) return { expr: expr.slice(0, -1) + key, done: false }; // 0 then 7 -> 7, not 07
    return { expr: expr + key, done: false };
  }

  if (key === ".") {
    if (done) return { expr: "0.", done: false };
    if (last === ")" || last === "%") return { expr: `${expr}×0.`, done: false };
    const currentNumber = expr.match(/[0-9.]*$/)?.[0] ?? "";
    if (currentNumber.includes(".")) return state;
    return { expr: currentNumber === "" ? `${expr}0.` : `${expr}.`, done: false };
  }

  if (isOp(key)) {
    if (expr === "") return key === "−" ? { expr: "−", done: false } : state;
    if (last === "(") return key === "−" ? { expr: expr + key, done: false } : state;
    if (last === "." ) return { expr: expr.slice(0, -1) + key, done: false };
    if (isOp(last)) {
      // a second operator replaces the first ("5+" then "×" -> "5×"); a minus after × or ÷ is a negative number
      if (key === "−" && (last === "×" || last === "÷")) return { expr: expr + key, done: false };
      const base = expr.slice(0, -1);
      return { expr: (isOp(base.slice(-1)) ? base.slice(0, -1) : base) + key, done: false };
    }
    return { expr: expr + key, done: false };
  }

  if (key === "%") return endsValue(expr) && last !== "." ? { expr: expr + key, done: false } : state;

  if (key === "(") {
    if (done) return { expr: "(", done: false };
    return { expr: endsValue(expr) ? `${expr}×(` : `${expr}(`, done: false };
  }
  if (key === ")") {
    const open = (expr.match(/\(/g) ?? []).length - (expr.match(/\)/g) ?? []).length;
    return open > 0 && endsValue(expr) && last !== "." ? { expr: expr + key, done: false } : state;
  }

  if (key === "±") {
    const wrapped = expr.match(/\(−([0-9.]+)\)$/);
    if (wrapped) return { expr: expr.slice(0, wrapped.index) + wrapped[1], done: false };
    const number = expr.match(/[0-9.]+$/);
    if (number) return { expr: `${expr.slice(0, number.index)}(−${number[0]})`, done: false };
    return state;
  }

  return state;
}
