import { describe, expect, it, vi } from "vitest";
import { Image } from "@core/elements/displayable/image";
import { ImageAction } from "./imageAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { ImageActionTypes } from "@core/action/actionTypes";

/**
 * Duck-typed GameState carrying only what the setSrc branch touches.
 */
function createStateLike(exposed: { updateStyleSync: () => void } | null) {
    const update = vi.fn();
    const state = {
        getExposedState: () => exposed,
        actionHistory: { push: vi.fn() },
        logger: { debug: vi.fn() },
        stage: { update },
    };
    return { state, update };
}

function run(exposed: { updateStyleSync: () => void } | null) {
    const image = new Image({ src: "yuko.png" });
    const { state, update } = createStateLike(exposed);
    const action = new ImageAction(
        { getSelf: () => image } as never,
        ImageActionTypes.setSrc,
        new ContentNode().setContent(["mizuki.png"]) as never,
    );

    action.executeAction(state as never, { stackModel: {} } as never);
    return { image, update };
}

describe("image:setSrc", () => {
    it("syncs the new src to the rendered element", () => {
        // A non-layered image's `src` is written imperatively, so a re-render alone keeps the old
        // image on screen: `setBackground(src)` / `char(src)` with no transition would paint nothing.
        const updateStyleSync = vi.fn();
        const { image, update } = run({ updateStyleSync });

        expect(image.state.currentSrc).toBe("mizuki.png");
        expect(update).toHaveBeenCalled();
        expect(updateStyleSync).toHaveBeenCalled();
    });

    it("still sets the src when the element is not mounted yet", () => {
        // No exposed state means nothing is rendered to sync — the mount applies the state itself.
        const { image } = run(null);

        expect(image.state.currentSrc).toBe("mizuki.png");
    });
});
