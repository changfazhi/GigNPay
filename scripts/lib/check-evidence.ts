// Evidence secret gate. Usage: npx tsx scripts/lib/check-evidence.ts <evidence-id|path>
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { evidenceDir, loadLocalEnv } from "./local-env";
import { assertNoSecrets } from "./redact";

function filesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name)));
}

function main(): number {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: check-evidence <evidence-id|path>");
    return 2;
  }
  loadLocalEnv();

  const asPath = resolve(target);
  const isPath = target.includes("/") || target.includes("\\") || existsSync(asPath);
  const dir = isPath ? asPath : evidenceDir(target);
  if (!existsSync(dir)) {
    console.error(`evidence path not found: ${target}`);
    return 2;
  }

  const offenders: string[] = [];
  for (const file of filesUnder(dir)) {
    try {
      assertNoSecrets(readFileSync(file, "utf8"));
    } catch {
      offenders.push(file);
    }
  }

  if (offenders.length > 0) {
    console.error("secret values found in:");
    for (const file of offenders) console.error(`  ${file}`);
    return 1;
  }
  console.log(`no secrets in ${target}`);
  return 0;
}

process.exit(main());
