import { describe, it, expect } from "vitest";
import { reduceArcForest, renderArcForest } from "../src/forest.js";
import { validate } from "../src/validate.js";
import type { ArcStatusEvent } from "../src/types.js";

/** A minimal complete arc, optionally with a parent link and a base time. */
function arc(
  id: string,
  opts: { parent?: string; title?: string; minute?: number } = {},
): ArcStatusEvent[] {
  const mm = String(opts.minute ?? 0).padStart(2, "0");
  const started: ArcStatusEvent = {
    arc_id: id,
    phase: "started",
    title: opts.title ?? id,
    sent_at: `2026-06-14T09:${mm}:00Z`,
  };
  if (opts.parent) started["x_parent_arc_id"] = opts.parent;
  const done: ArcStatusEvent = {
    arc_id: id,
    phase: "done",
    title: `${id} done`,
    sent_at: `2026-06-14T09:${mm}:30Z`,
  };
  return [started, done];
}

describe("reduceArcForest", () => {
  it("degrades to a flat list of roots when no x_parent_arc_id is present", () => {
    const forest = reduceArcForest({ a: arc("a"), b: arc("b", { minute: 1 }) });
    expect(forest.roots.map((n) => n.state.arc_id)).toEqual(["a", "b"]);
    expect(forest.roots.every((n) => n.depth === 0 && n.children.length === 0)).toBe(true);
    expect(forest.orphans).toEqual([]);
    expect(forest.cycleBroken).toEqual([]);
  });

  it("nests children under their parent", () => {
    const forest = reduceArcForest({
      root: arc("root"),
      childA: arc("childA", { parent: "root", minute: 1 }),
      childB: arc("childB", { parent: "root", minute: 2 }),
      grandchild: arc("grandchild", { parent: "childA", minute: 3 }),
    });
    expect(forest.roots.map((n) => n.state.arc_id)).toEqual(["root"]);
    const root = forest.roots[0]!;
    expect(root.children.map((n) => n.state.arc_id)).toEqual(["childA", "childB"]);
    expect(root.children[0]!.children.map((n) => n.state.arc_id)).toEqual(["grandchild"]);
    expect(root.children[0]!.children[0]!.depth).toBe(2);
  });

  it("surfaces an orphan (missing parent) and still roots it", () => {
    const forest = reduceArcForest({ child: arc("child", { parent: "ghost" }) });
    expect(forest.orphans.map((n) => n.state.arc_id)).toEqual(["child"]);
    expect(forest.roots.map((n) => n.state.arc_id)).toEqual(["child"]);
  });

  it("breaks a cycle deterministically and never hangs", () => {
    const forest = reduceArcForest({
      a: arc("a", { parent: "c" }),
      b: arc("b", { parent: "a", minute: 1 }),
      c: arc("c", { parent: "b", minute: 2 }),
    });
    expect(forest.cycleBroken.length).toBe(1);
    // Exactly one node became a root by cutting its link; all three remain reachable.
    const seen = new Set<string>();
    const walk = (n: { state: { arc_id: string }; children: typeof forest.roots }): void => {
      seen.add(n.state.arc_id);
      n.children.forEach(walk);
    };
    forest.roots.forEach(walk);
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps every event with x_parent_arc_id schema-valid (no wire change)", () => {
    for (const e of arc("child", { parent: "root" })) {
      expect(validate(e).ok).toBe(true);
    }
  });
});

describe("renderArcForest", () => {
  it("indents children under their parent", () => {
    const forest = reduceArcForest({
      root: arc("root", { title: "ship migration" }),
      child: arc("child", { parent: "root", title: "schema backfill", minute: 1 }),
    });
    const out = renderArcForest(forest);
    const lines = out.split("\n");
    // title comes from the started event; phase is the latest (done).
    expect(lines[0]).toBe("■ ship migration  (done)");
    expect(lines[1]).toBe("  ■ schema backfill  (done)");
  });
});
