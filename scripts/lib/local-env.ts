import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** The main checkout (works from inside a git worktree). Falls back to cwd when git fails. */
export function mainRoot(): string {
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return common ? dirname(common) : process.cwd();
}

/** The top level of the current checkout (the worktree root inside a worktree). */
export function repoTop(): string {
  return git(["rev-parse", "--show-toplevel"]) ?? process.cwd();
}

/**
 * Loads `<mainRoot>/.env.local`, then `<mainRoot>/.env`, into process.env when they exist.
 * Variables already set win, so the process environment beats `.env.local`, which beats `.env`.
 * Returns the key names found in the files, never values.
 */
export function loadLocalEnv(): string[] {
  const keys = new Set<string>();
  for (const name of [".env.local", ".env"]) {
    const file = join(mainRoot(), name);
    if (!existsSync(file)) continue;
    process.loadEnvFile(file);
    for (const k of Object.keys(parseEnv(readFileSync(file, "utf8")))) keys.add(k);
  }
  return [...keys];
}

/** `<mainRoot>/.spike-state` (gitignored, shared across worktrees). Created if missing. */
export function spikeStateDir(): string {
  const dir = join(mainRoot(), ".spike-state");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Evidence directory for one spike inside the current checkout. Created if missing. */
export function evidenceDir(id: string): string {
  const dir = join(
    repoTop(),
    ".planning",
    "phases",
    "01-foundation-deploy-spikes",
    "spike-evidence",
    id,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}
