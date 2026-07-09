import { readFile } from "node:fs/promises";

/** Everything a command touches, injected so commands are testable. */
export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  readStdin: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
  now: () => number;
  isTty: boolean;
  env: Record<string, string | undefined>;
}

export function realIo(): CliIO {
  return {
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString("utf8");
    },
    readFile: (path) => readFile(path, "utf8"),
    now: () => Date.now(),
    isTty: process.stdout.isTTY ?? false,
    env: process.env,
  };
}
