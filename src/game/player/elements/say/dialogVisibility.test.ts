import { describe, expect, it } from "vitest";
import { resolveDialogVisibility } from "./dialogVisibility";

/**
 * How a dialog box that has been put away is hidden.
 *
 * The rule under test is not about looks. A box hidden with `visibility: hidden` or `display: none`
 * takes its whole subtree out of hit testing, and a host renders its own dialog into that subtree -
 * so hiding the box that way makes everything the host drew unreachable, silently, while it is all
 * still present and still styled to receive the pointer. These pin that hiding stays a statement
 * about drawing.
 */

describe("resolveDialogVisibility", () => {
    it("adds nothing to a box that is shown", () => {
        expect(resolveDialogVisibility(true)).toEqual({ className: "", ariaHidden: false });
    });

    it("hides a box by drawing nothing, not by leaving hit testing", () => {
        const { className } = resolveDialogVisibility(false);
        expect(className).toBe("opacity-0");
        // The two that would take the subtree out of hit testing, named so that putting either back
        // fails here rather than in a game.
        expect(className).not.toMatch(/\binvisible\b/);
        expect(className).not.toMatch(/\bhidden\b/);
    });

    it("takes a hidden box out of the accessibility tree explicitly", () => {
        // `opacity: 0` leaves it in, where `visibility: hidden` used to remove it as a side effect.
        expect(resolveDialogVisibility(false).ariaHidden).toBe(true);
    });

    it("claims no pointer-events in either state, so the layer stays in charge", () => {
        // A scene parked behind a returnable jump keeps a stage-covering layer that turns the
        // pointer off for everything inside it. A box overruling that swallows the clicks meant for
        // the scene in front of it.
        for (const shown of [true, false]) {
            expect(resolveDialogVisibility(shown).className).not.toMatch(/pointer-events/);
        }
    });
});
