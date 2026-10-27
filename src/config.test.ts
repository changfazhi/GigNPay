import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EnvSchema } from "@/server/env";

const root = process.cwd();
const read = (name: string) => readFileSync(join(root, name), "utf8");

describe("scaffold guarantees", () => {
  it("next.config.ts has no cache-components flags", () => {
    const text = read("next.config.ts");
    expect(text).not.toContain("cacheComponents");
    expect(text).not.toContain("partialPrefetching");
  });

  it("pins TypeScript to 5.9.x", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.devDependencies.typescript.startsWith("5.9.")).toBe(true);
  });

  it("pins every dependency exactly (no ^ or ~)", () => {
    const pkg = JSON.parse(read("package.json"));
    const all: Record<string, string> = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const loose = Object.entries(all)
      .filter(([, v]) => v.startsWith("^") || v.startsWith("~"))
      .map(([k]) => k);
    expect(loose).toEqual([]);
  });

  it("declares the supported Node range", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.engines.node).toBe(">=22.12 <25");
    expect(read(".node-version").trim()).toBe("24");
  });

  it(".gitignore covers env files and spike state", () => {
    const lines = read(".gitignore")
      .split(/\r?\n/)
      .map((l) => l.trim());
    expect(lines).toContain(".env*");
    expect(lines).toContain(".spike-state/");
  });
});

describe(".env.example", () => {
  const keyLines = read(".env.example")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l));

  it("has only empty values", () => {
    const nonEmpty = keyLines
      .filter((l) => l.slice(l.indexOf("=") + 1).trim() !== "")
      .map((l) => l.slice(0, l.indexOf("=")));
    expect(nonEmpty).toEqual([]);
  });

  it("matches the env schema key for key", () => {
    const keys = keyLines.map((l) => l.slice(0, l.indexOf("=")));
    expect(keys.length).toBeGreaterThan(0);
    const missing = keys.filter((k) => !(k in EnvSchema.shape));
    expect(missing).toEqual([]);
  });
});
