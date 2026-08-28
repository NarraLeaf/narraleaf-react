import { describe, expect, it } from "vitest";
import { DialogAdvanceInput, resolveDialogAdvanceIntent } from "./dialogAdvanceIntent";

/**
 * What one request to get on with the line means.
 *
 * The rule this pins is that a single advance never forces, whoever asked for it. Forcing is the
 * skip mode, and the mode is allowed to ignore a `Pause`; one advance is not, because a pause is
 * the author asking the player for the next click and spending it silently loses the reveal.
 *
 * There is no React harness in this repo, so the decision is a pure function and this exercises it
 * directly. What it cannot cover is the wiring - that the dialog dispatches on the answer - which
 * `dialogAdvance.test.ts` drives against the real `DialogState`.
 */

function input(over: Partial<DialogAdvanceInput> = {}): DialogAdvanceInput {
    return { active: true, forced: false, ...over };
}

describe("resolveDialogAdvanceIntent", () => {
    it("asks the line to complete on an ordinary advance", () => {
        expect(resolveDialogAdvanceIntent(input())).toBe("requestComplete");
    });

    it("answers a click on the stage exactly as it answers a click on the box", () => {
        // Both arrive here as an unforced advance. The box covers part of the stage and nothing
        // tells a player which half of a dialogue they hit, so the two cannot differ.
        expect(resolveDialogAdvanceIntent(input({ forced: false })))
            .toBe(resolveDialogAdvanceIntent(input({ forced: false })));
        expect(resolveDialogAdvanceIntent(input({ forced: false }))).toBe("requestComplete");
    });

    it("forces only when the request is the skip mode", () => {
        expect(resolveDialogAdvanceIntent(input({ forced: true }))).toBe("forceSkip");
    });

    it("ignores an advance aimed at a box that does not hold the line", () => {
        expect(resolveDialogAdvanceIntent(input({ active: false }))).toBe("ignore");
    });

    it("ignores a forced advance too when the box does not hold the line", () => {
        // Skipping is not a licence to answer for a box that is a picture of a line that is over.
        expect(resolveDialogAdvanceIntent(input({ active: false, forced: true }))).toBe("ignore");
    });
});
