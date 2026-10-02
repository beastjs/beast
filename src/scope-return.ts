/**
 * Find a `return` that would leave a `scope` block from its setup source.
 *
 * Octane rejects such a return ("return is outside an authored return
 * boundary") without a source location, so Beast reports it first. The scan
 * is deliberately conservative: a `return` counts only when every enclosing
 * brace is provably a statement block (`if`/`switch`/`catch`/`with` bodies,
 * `else`, `try`, `finally`, or a bare block). Octane accepts a return inside a
 * loop body, so `for`/`while`/`do` bodies are hidden, braced or not, as is
 * anything that could be a function, method, class, or object body. Ambiguous
 * code falls through to Octane rather than being misreported.
 */
export function findScopeReturn(code: string): number | null {
  type Frame = "block" | "opaque" | "paren" | "template";
  const CONTROL = new Set(["if", "switch", "catch", "with"]);
  const LOOPS = new Set(["for", "while"]);
  const BLOCK_KEYWORDS = new Set(["else", "try", "finally", "catch"]);
  const REGEX_AFTER_WORDS = new Set([
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "throw", "case", "do", "else", "yield", "await",
  ]);
  const stack: Frame[] = [];
  const parenWords: (string | null)[] = [];
  // Previous significant token: a word, a punctuator, or null at the start.
  let previous: string | null = null;
  let previousIsWord = false;
  let closedParenWord: string | null = null;
  // A loop header was just closed (or `do` was read); its body is opaque.
  let pendingLoop = false;
  // Depth at which a braceless loop body began, hidden until its statement ends.
  let hiddenDepth: number | null = null;
  let index = 0;

  const opaque = (): boolean =>
    hiddenDepth !== null || stack.some((frame) => frame !== "block");
  const startToken = (isOpeningBrace: boolean): void => {
    if (!pendingLoop) return;
    pendingLoop = false;
    if (!isOpeningBrace) hiddenDepth = stack.length;
  };
  const regexAllowed = (): boolean =>
    previous === null ||
    (previousIsWord ? REGEX_AFTER_WORDS.has(previous) : !/^[)\]}]$/u.test(previous));

  const skipTemplate = (): void => {
    // Positioned after an opening backtick or a closing `}` of `${ … }`.
    while (index < code.length) {
      const char = code[index];
      if (char === "\\") {
        index += 2;
      } else if (char === "`") {
        index += 1;
        return;
      } else if (char === "$" && code[index + 1] === "{") {
        index += 2;
        stack.push("template");
        return;
      } else {
        index += 1;
      }
    }
  };

  while (index < code.length) {
    const char = code[index] ?? "";
    const next = code[index + 1];
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    if (char === "/" && next === "/") {
      const end = code.indexOf("\n", index);
      index = end === -1 ? code.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = code.indexOf("*/", index + 2);
      index = end === -1 ? code.length : end + 2;
      continue;
    }
    startToken(char === "{");
    if (char === "'" || char === '"') {
      index += 1;
      while (index < code.length && code[index] !== char && code[index] !== "\n") {
        index += code[index] === "\\" ? 2 : 1;
      }
      index += 1;
      previous = "string";
      previousIsWord = true;
      continue;
    }
    if (char === "`") {
      index += 1;
      skipTemplate();
      previous = "string";
      previousIsWord = true;
      continue;
    }
    if (char === "/" && regexAllowed()) {
      index += 1;
      let inClass = false;
      while (index < code.length && code[index] !== "\n") {
        const current = code[index];
        if (current === "\\") {
          index += 2;
          continue;
        }
        index += 1;
        if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) break;
      }
      while (/[a-z]/iu.test(code[index] ?? "")) index += 1;
      previous = "regex";
      previousIsWord = true;
      continue;
    }
    if (/[A-Za-z_$]/u.test(char)) {
      const start = index;
      while (/[\w$]/u.test(code[index] ?? "")) index += 1;
      const word = code.slice(start, index);
      if (word === "return" && previous !== "." && previous !== "?." && !opaque()) {
        return start;
      }
      if (word === "do" && previous !== "." && previous !== "?.") pendingLoop = true;
      previous = word;
      previousIsWord = true;
      continue;
    }
    if (char === "(") {
      parenWords.push(previousIsWord ? previous : null);
      stack.push("paren");
    } else if (char === ")") {
      if (stack.at(-1) === "paren") stack.pop();
      closedParenWord = parenWords.pop() ?? null;
      if (closedParenWord !== null && LOOPS.has(closedParenWord)) pendingLoop = true;
    } else if (char === ";") {
      if (hiddenDepth === stack.length) hiddenDepth = null;
    } else if (char === "{") {
      const block =
        (previous === ")" && closedParenWord !== null && CONTROL.has(closedParenWord)) ||
        (previousIsWord && previous !== null && BLOCK_KEYWORDS.has(previous)) ||
        previous === null ||
        previous === ";" ||
        previous === "}" ||
        (previous === "{" && stack.at(-1) === "block");
      stack.push(block ? "block" : "opaque");
    } else if (char === "}") {
      const frame = stack.pop();
      if (hiddenDepth !== null && stack.length < hiddenDepth) hiddenDepth = null;
      if (frame === "template") {
        index += 1;
        skipTemplate();
        previous = "string";
        previousIsWord = true;
        continue;
      }
    } else if (char === "=" && next === ">") {
      index += 2;
      previous = "=>";
      previousIsWord = false;
      continue;
    } else if (char === "?" && next === ".") {
      index += 2;
      previous = "?.";
      previousIsWord = false;
      continue;
    }
    index += 1;
    previous = char;
    previousIsWord = /[0-9]/u.test(char);
  }
  return null;
}
