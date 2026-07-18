import { describe, expect, it, vi } from "vitest";
import { Image } from "@core/elements/displayable/image";
import { ImageAction } from "./imageAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { ImageActionTypes } from "@core/action/actionTypes";
import { Darkness } from "@core/elements/transition/transitions/image/darkness";

/**
 * Duck-typed GameState carrying only what the setDarkness branch touches.
 * `applyTransition` records what it was handed instead of running an animation.
 */
function createStateLike() {
    const applyTransition = vi.fn((_transition: unknown, _onResolve: () => void) => ({ abort: vi.fn() }));
    const state = {
        getExposedStateForce: () => ({ applyTransition, updateStyleSync: vi.fn() }),
        actionHistory: { push: vi.fn() },
        timelines: { attachTimeline: () => ({ attachChild: vi.fn() }) },
        logger: { debug: vi.fn() },
    };
    return { state, applyTransition };
}

function darkenAction(image: Image, args: [number, number?, string?]) {
    return new ImageAction(
        { getSelf: () => image } as never,
        ImageActionTypes.setDarkness,
        new ContentNode().setContent(args) as never,
    );
}

function run(args: [number, number?, string?]) {
    const image = new Image({ src: "yuko.png" });
    const { state, applyTransition } = createStateLike();
    const injection = { stackModel: {} } as never;

    darkenAction(image, args).executeAction(state as never, injection);
    return { image, applyTransition };
}

describe("image:setDarkness", () => {
    it("animates over the given duration even when no easing is passed", () => {
        // `darken(0.5, 300)` is the natural call; requiring an easing to honour the
        // duration would make it jump with no diagnostic.
        const { applyTransition } = run([0.5, 300]);

        expect(applyTransition).toHaveBeenCalled();
        expect(applyTransition.mock.calls[0][0]).toBeInstanceOf(Darkness);
    });

    it("animates when both duration and easing are passed", () => {
        const { applyTransition } = run([0.5, 300, "easeOut"]);

        expect(applyTransition).toHaveBeenCalled();
        expect(applyTransition.mock.calls[0][0]).toBeInstanceOf(Darkness);
    });

    it("applies instantly when no duration is passed", () => {
        const { image, applyTransition } = run([0.5]);

        expect(applyTransition).not.toHaveBeenCalled();
        expect(image.state.darkness).toBe(0.5);
    });
});
