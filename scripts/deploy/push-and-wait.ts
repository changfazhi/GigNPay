import { execFileSync } from "node:child_process";
import { loadLocalEnv } from "../lib/local-env";

// Safe push to origin main, then wait until /api/health reports a deployed commit that contains HEAD.
// Flags: --no-wait, --wait-only, --timeout <seconds> (default 900).

const args = process.argv.slice(2);
const noWait = args.includes("--no-wait");
const waitOnly = args.includes("--wait-only");
const tIdx = args.indexOf("--timeout");
const timeoutS = tIdx >= 0 ? Number(args[tIdx + 1]) : 900;

function git(a: string[], opts: { allowFail?: boolean } = {}): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e) {
    if (!opts.allowFail) throw e;
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  }
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function preflight(): void {
  if (git(["status", "--porcelain"]).out) fail("working tree is dirty; commit or stash first");
  const tracked = git(["ls-files"]).out.split("\n");
  const bad = tracked.filter(
    (f) => (/(^|\/)\.env/.test(f) && !f.endsWith(".env.example")) || f.startsWith(".spike-state/"),
  );
  if (bad.length) fail(`refusing to push: secret-like files are tracked: ${bad.join(", ")}`);
}

function syncWithOrigin(): void {
  git(["fetch", "origin"], { allowFail: true });
  const hasMain = git(["rev-parse", "--verify", "--quiet", "origin/main"], { allowFail: true }).ok;
  if (!hasMain) return;
  if (git(["merge-base", "--is-ancestor", "origin/main", "HEAD"], { allowFail: true }).ok) return;
  if (!git(["merge", "--no-edit", "origin/main"], { allowFail: true }).ok) {
    git(["merge", "--abort"], { allowFail: true });
    fail("merge with origin/main conflicted; resolve by hand");
  }
}

function push(): void {
  preflight();
  syncWithOrigin();
  if (git(["push", "origin", "HEAD:main"], { allowFail: true }).ok) return;
  syncWithOrigin();
  const again = git(["push", "origin", "HEAD:main"], { allowFail: true });
  if (!again.ok) fail(`push rejected: ${again.out}`);
}

async function wait(): Promise<void> {
  loadLocalEnv();
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base) fail("missing APP_BASE_URL in .env.local or .env");
  const head = git(["rev-parse", "HEAD"]).out;
  const started = Date.now();
  let last: string | null = null;
  while ((Date.now() - started) / 1000 < timeoutS) {
    try {
      const res = await fetch(`${base}/api/health`);
      const body = (await res.json()) as { db?: string; commit?: string | null };
      if (body.db === "ok" && body.commit) {
        last = body.commit;
        git(["fetch", "origin"], { allowFail: true });
        if (git(["merge-base", "--is-ancestor", head, body.commit], { allowFail: true }).ok) {
          console.log(`deployed ${body.commit} at ${base} after ${Math.round((Date.now() - started) / 1000)}s`);
          return;
        }
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  fail(`timed out after ${timeoutS}s; last deployed commit seen: ${last ?? "none"}`);
}

async function main(): Promise<void> {
  if (!waitOnly) push();
  if (!noWait) await wait();
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
