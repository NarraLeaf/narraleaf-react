import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

/**
 * Every path that restores an element has to resolve its loop anchor, guarded by reading the source.
 *
 * A Transform cannot be serialized - its easing may be a function - so what a save or a snapshot
 * carries is the id of the action that started the loop. `fromData` restores that anchor and leaves
 * the transform unresolved on purpose; only a pass holding the story's action map can turn it back
 * into a Transform. There are two ways an element's state is put back, and BOTH need that pass:
 * `LiveGame.deserialize` (loading a save, and stepping to a line that has to be rebuilt) and
 * `GameState.restorePresentationSnapshot` (stepping back in place, which is what an ordinary undo
 * does).
 *
 * Missing it on the second one is the defect this file exists for, and it is worth stating why it
 * hid for a whole release. The element is left half-restored: `_getLoop()` finds no transform, so
 * the host never restarts the motion and the sprite simply stops moving, while `_serializeLoop()`
 * still finds the anchor, so the save keeps insisting the loop is there. Loading that save heals
 * it. And only the FIRST undo after a fresh start takes the in-place path at all - every later one
 * falls through to `deserialize`, which was already correct - so it presented as an intermittent
 * "sometimes the breathing stops", which is exactly the shape of bug that survives review.
 *
 * A text assertion rather than a behavioural one because the outcome needs a mounted React host and
 * a running story to observe, and this suite runs in node with no DOM. What can be pinned is the
 * structural fact the outcome follows from: each restore is followed by a rebind.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => fs.readFileSync(path.resolve(here, relative), "utf8");

/** The body of `name`, from its signature to the first line that closes at the same indent. */
function methodBody(source: string, name: string): string {
    const start = source.indexOf(`${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const end = source.indexOf("\n    }", start);
    expect(end, `${name} has no closing brace at method indent`).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("restoring an element resolves its loop anchor", () => {
    it("rebinds after stepping back in place", () => {
        // The half of the pair that was missing. Without it an ordinary undo past a `stopLoop`
        // leaves a sprite that declares a loop and does not run one.
        const gameState = read("./gameState.ts");

        expect(methodBody(gameState, "restorePresentationSnapshot")).toContain("this.rebindLoops()");
    });

    it("rebinds after loading a save", () => {
        const liveGame = read("../nlcore/game/liveGame.ts");

        expect(methodBody(liveGame, "deserialize")).toContain("_rebindLoop(actionMaps)");
    });

    it("resolves against the story's action map, not the snapshot", () => {
        // The anchor is only half the story - the Transform lives on the action, so the map has to
        // come from the story that is loaded now, which is what makes a loop survive a save at all.
        const gameState = read("./gameState.ts");

        // By name with its modifier, so this finds the definition and not the call site above.
        expect(methodBody(gameState, "private rebindLoops")).toContain("constructMaps()");
    });

    it("is safe to run after any restore, because rebinding an element twice does nothing", () => {
        // Why the pass can sit at the end of a restore rather than being threaded through each
        // element: it is a no-op for anything with no anchor or an already-resolved one.
        const displayable = read("../nlcore/elements/displayable/displayable.ts");

        expect(methodBody(displayable, "_rebindLoop"))
            .toContain("if (!this.loopActionId || this.loopTransform)");
    });
});
