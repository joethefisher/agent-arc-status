export interface ParsedArgs {
  /** Positional arguments (a lone "-" means stdin). */
  positional: string[];
  flags: Record<string, string | boolean>;
}

/**
 * Zero-dependency argument parser. Supports `--flag`, `--key=value`, `--` (end
 * of flags), and `-` (stdin positional). A bare `--key` consumes the next token
 * as its value only when `key` is in `valueFlags`; otherwise it is a boolean, so
 * `tail file --follow` does not swallow `file`.
 */
export function parseArgs(argv: string[], valueFlags: Set<string> = new Set()): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let onlyPositional = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (onlyPositional) {
      positional.push(token);
      continue;
    }
    if (token === "--") {
      onlyPositional = true;
      continue;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const key = token.slice(2);
        const next = argv[i + 1];
        if (valueFlags.has(key) && next !== undefined) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (token.startsWith("-") && token.length > 1) {
      flags[token.slice(1)] = true;
    } else {
      positional.push(token);
    }
  }

  return { positional, flags };
}
