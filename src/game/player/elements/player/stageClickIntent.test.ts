import { describe, expect, it } from "vitest";
import { resolveStageClickIntent, StageClickInput } from "./stageClickIntent";

/**
 * What a click on the stage means once the announcer has decided it is the stage's.
 *
 * The case worth pinning is a click arriving while the dialog box has been put away. The box is what
 * a click on the stage acts on; with it gone the click has nothing on screen it could have been
 * aimed at, and the line it used to settle is one the player never read. Advancing there loses text
 * silently, which is the one failure a reader cannot recover from.
 *
 * There is no React harness in this repo, so the decision is a pure function and this exercises it
 * directly. What it cannot cover is the wiring - that the announcer reads the real preference and
 * writes it back - which is left to the real machine.
 */

function input(over: Partial<StageClickInput> = {}): StageClickInput {
    return { onStage: true, dialogShown: true, advanceSuspended: false, ...over };
}

describe("resolveStageClickIntent", () => {
    it("advances an ordinary click on the stage", () => {
        expect(resolveStageClickIntent(input())).toBe("advance");
    });

    it("ignores a click the announcer did not place on the stage", () => {
        expect(resolveStageClickIntent(input({ onStage: false }))).toBe("ignore");
    });

    it("ignores a click while something holds the line", () => {
        expect(resolveStageClickIntent(input({ advanceSuspended: true }))).toBe("ignore");
    });

    it("brings the box back rather than spending a line the player never saw", () => {
        expect(resolveStageClickIntent(input({ dialogShown: false }))).toBe("restoreDialog");
    });

    it("brings the box back even while something holds the line", () => {
        // A suspension is taken by something drawn inside the box, so with the box away the hold is
        // invisible. Left in charge it would strand the player: no way to bring the box back, and no
        // way to reach the thing holding the line either. Restoring settles nothing, so the hold is
        // still there and still in charge the moment the box is back.
        expect(resolveStageClickIntent(input({ dialogShown: false, advanceSuspended: true })))
            .toBe("restoreDialog");
    });

    it("still ignores a click that never belonged to the stage, box away or not", () => {
        // A click inside a menu or a page is not the stage's to interpret at all - the hidden box
        // must not turn every click in the game into a restore.
        expect(resolveStageClickIntent(input({ onStage: false, dialogShown: false }))).toBe("ignore");
    });
});
