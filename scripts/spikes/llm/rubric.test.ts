import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AVG_BAR,
  MIN_BAR,
  Rubric,
  TOLERANCE,
  criterionAverage,
  meetsAutoReleaseBar,
  vendorGap,
} from "./rubric";

type RubricValue = z.infer<typeof Rubric>;

function make(scores: [number, number, number, number, number]): RubricValue {
  const [a, b, c, d, e] = scores;
  const crit = (score: number) => ({ score, reason: "r", evidence_ref: 1 });
  return {
    criteria: {
      checklist_met: crit(a),
      visible_change: crit(b),
      workmanship: crit(c),
      working_proof: crit(d),
      site_clean: crit(e),
    },
    items: [{ item_id: "filter_clean", verdict: "met", reason: "ok" }],
    instructional_text_in_media: false,
    suspicious_text_quote: null,
  };
}

describe("Rubric schema", () => {
  it("accepts a valid object", () => {
    expect(Rubric.safeParse(make([8, 8, 8, 8, 8])).success).toBe(true);
  });

  it.each([11, -1, 7.5])("rejects a criterion score of %s", (bad) => {
    expect(Rubric.safeParse(make([bad, 8, 8, 8, 8])).success).toBe(false);
  });

  it("rejects a missing criterion", () => {
    const r = make([8, 8, 8, 8, 8]) as unknown as {
      criteria: Record<string, unknown>;
    };
    delete r.criteria.site_clean;
    expect(Rubric.safeParse(r).success).toBe(false);
  });

  it("rejects an item verdict outside met/unmet/unclear", () => {
    const r = make([8, 8, 8, 8, 8]);
    (r.items[0] as { verdict: string }).verdict = "maybe";
    expect(Rubric.safeParse(r).success).toBe(false);
  });

  it("exposes the five criterion keys in its JSON schema", () => {
    const json = JSON.stringify(z.toJSONSchema(Rubric));
    for (const key of [
      "checklist_met",
      "visible_change",
      "workmanship",
      "working_proof",
      "site_clean",
    ]) {
      expect(json).toContain(`"${key}"`);
    }
  });
});

describe("comparison helpers", () => {
  it("criterionAverage is the mean of the five scores", () => {
    expect(criterionAverage(make([10, 8, 6, 4, 2]))).toBe(6);
  });

  it("vendorGap is the absolute difference of averages", () => {
    expect(vendorGap(make([8, 8, 8, 8, 8]), make([6, 6, 6, 6, 6]))).toBe(2);
    expect(vendorGap(make([6, 6, 6, 6, 6]), make([8, 8, 8, 8, 8]))).toBe(2);
  });

  it("meetsAutoReleaseBar needs avg >= 8 and every criterion >= 6", () => {
    expect(meetsAutoReleaseBar(make([8, 8, 8, 8, 8]))).toBe(true);
    expect(meetsAutoReleaseBar(make([10, 10, 10, 10, 5]))).toBe(false);
    expect(meetsAutoReleaseBar(make([7, 7, 7, 7, 7]))).toBe(false);
    expect(meetsAutoReleaseBar(make([10, 10, 10, 6, 6]))).toBe(true);
  });

  it("exports the thresholds", () => {
    expect([TOLERANCE, AVG_BAR, MIN_BAR]).toEqual([1.5, 8, 6]);
  });
});
