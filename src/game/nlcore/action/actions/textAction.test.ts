import { describe, expect, it, vi } from "vitest";
// Imported through the entry: reaching for `@core/elements/displayable/text` directly pulls
// scene -> layer in an order that leaves `TransformState` uninitialized.
import { Text } from "narraleaf-react";
import { TextAction } from "./textAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { TextActionTypes } from "@core/action/actionTypes";

/**
 * Duck-typed GameState carrying only what the text actions touch.
 */
function run(type: typeof TextActionTypes[keyof typeof TextActionTypes], content: unknown[]) {
    const text = new Text({ text: "before", fontSize: 10 });
    const exposed = { flush: vi.fn(), updateStyleSync: vi.fn() };
    const state = {
        getExposedStateForce: () => exposed,
        actionHistory: { push: vi.fn() },
    };

    new TextAction(
        { getSelf: () => text } as never,
        type,
        new ContentNode().setContent(content) as never,
    ).executeAction(state as never, { stackModel: {} } as never);

    return { text, exposed };
}

describe("text actions", () => {
    it("syncs the new font size to the rendered element", () => {
        // The font size is written to the span imperatively, so the flush alone would store the
        // new size and leave the old one on screen — `setFontSize(size)` defaults to no duration,
        // which is exactly the path that never runs a transition.
        const { text, exposed } = run(TextActionTypes.setFontSize, [90]);

        expect(text.state.fontSize).toBe(90);
        expect(exposed.updateStyleSync).toHaveBeenCalled();
    });

    it("re-renders on a text change", () => {
        // The text itself is a rendered child, so flushing is enough here.
        const { text, exposed } = run(TextActionTypes.setText, ["after"]);

        expect(text.state.text).toBe("after");
        expect(exposed.flush).toHaveBeenCalled();
    });
});
