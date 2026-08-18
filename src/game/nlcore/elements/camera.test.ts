import { describe, expect, it } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with; importing camera.ts in isolation trips a pre-existing circular
// static-init order between transform/gameState/scene/text.
import { Camera, Story } from "@core/common/core";
import { Chained } from "@core/action/chain";
import { DisplayableActionTypes } from "@core/action/actionTypes";

/**
 * Pull the props of the first `applyTransform` transform out of a chained camera action, so a test
 * can assert the pose a helper produces without running an animation. `sequences` is internal, but
 * reading it here keeps the assertions concrete.
 */
function firstTransformProps(chain: unknown): Record<string, unknown> {
    const actions = Chained.toActions([chain as never]);
    const action = actions.find((a) => a.type === DisplayableActionTypes.applyTransform);
    if (!action) {
        throw new Error("camera helper produced no applyTransform action");
    }
    const [transform] = (action.contentNode as { getContent: () => [unknown] }).getContent();
    const sequences = (transform as { sequences: { props: Record<string, unknown> }[] }).sequences;
    return sequences[0]?.props ?? {};
}

/**
 * Every sequence of the transform, so a helper that deliberately runs in two steps can be read as
 * the two steps it is.
 */
function transformSequences(chain: unknown): { props: Record<string, unknown>; options?: Record<string, unknown> }[] {
    const actions = Chained.toActions([chain as never]);
    const action = actions.find((a) => a.type === DisplayableActionTypes.applyTransform);
    if (!action) {
        throw new Error("camera helper produced no applyTransform action");
    }
    const [transform] = (action.contentNode as { getContent: () => [unknown] }).getContent();
    return (transform as { sequences: { props: Record<string, unknown>; options?: Record<string, unknown> }[] }).sequences;
}

describe("Camera", () => {
    it("starts fully opaque so the wrapped stage is visible", () => {
        // The transform default opacity is 0; a camera that inherited it would hide the whole stage.
        expect(new Camera().transformState.get().opacity).toBe(1);
    });

    it("honours an initial pose from its config", () => {
        expect(new Camera({ zoom: 1.5 }).transformState.get().zoom).toBe(1.5);
    });

    it("darken maps to a brightness filter of (1 - darkness)", () => {
        expect(firstTransformProps(new Camera().darken(0.6)).filter).toBe("brightness(0.4)");
    });

    it("darken clamps out-of-range values", () => {
        expect(firstTransformProps(new Camera().darken(2)).filter).toBe("brightness(0)");
        expect(firstTransformProps(new Camera().darken(-1)).filter).toBe("brightness(1)");
    });

    // The split is the fix, not an implementation detail: a filter carrying `hue-rotate` cannot be
    // eased back to "none" without walking the picture through the colour wheel, so the filter is
    // dropped in its own zero-duration step and only the pose is allowed to interpolate.
    it("resetCamera drops the filter instantly, then eases the pose", () => {
        const sequences = transformSequences(new Camera({ zoom: 3 }).resetCamera(600));
        expect(sequences).toHaveLength(2);

        expect(sequences[0].props.filter).toBe("none");
        expect(sequences[0].options?.duration).toBe(0);

        expect(sequences[1].props.zoom).toBe(1);
        // The pose must not restate the filter, or it would ease it right back out of the cut above.
        expect(sequences[1].props).not.toHaveProperty("filter");
    });


    it("round-trips its transform state through toData/fromData", () => {
        const data = new Camera({ zoom: 2 }).toData();
        expect(new Camera().fromData(data).transformState.get().zoom).toBe(2);
    });

    it("gives every story a stable default camera", () => {
        const story = new Story("s");
        expect(story.camera).toBeInstanceOf(Camera);
        expect(story.camera).toBe(story.camera);
    });

    it("uses a camera provided via story config", () => {
        const camera = new Camera({ zoom: 1.2 });
        expect(new Story("s", { camera }).camera).toBe(camera);
    });
});
