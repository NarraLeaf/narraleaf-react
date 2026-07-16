import { describe, expect, it, vi } from "vitest";
// Imported through the entry: reaching into the element modules directly pulls scene -> layer in
// an order that leaves `TransformState` uninitialized.
import { Image } from "narraleaf-react";
import { ImageAction } from "./imageAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { ImageActionTypes } from "@core/action/actionTypes";

function tagImage() {
    return new Image({
        src: {
            groups: [["normal", "happy"], ["school", "casual"]],
            defaults: ["normal", "school"],
            resolve: (emotion: string, outfit: string) => `/assets/${emotion}-${outfit}.png`,
        },
    } as never);
}

function run(tags: string[]) {
    const image = tagImage();
    const updateStyleSync = vi.fn();
    const update = vi.fn();
    const state = {
        getExposedState: () => ({ updateStyleSync }),
        actionHistory: { push: vi.fn() },
        logger: { debug: vi.fn() },
        stage: { update },
    };

    new ImageAction(
        { getSelf: () => image } as never,
        ImageActionTypes.setAppearance,
        new ContentNode().setContent([tags, undefined]) as never,
    ).executeAction(state as never, { stackModel: {} } as never);

    return { image, updateStyleSync, update };
}

describe("image:setAppearance without a transition", () => {
    it("syncs the resolved appearance to the rendered element", () => {
        // A non-layered tag image resolves its tags to a url only when the element is synced, so
        // the flush-free path would store the new tags and leave the old appearance on screen.
        // The layered path needs only the re-render, since its layers are a real React prop.
        const { image, updateStyleSync, update } = run(["happy"]);

        expect(image.state.currentSrc).toEqual(["happy", "school"]);
        expect(update).toHaveBeenCalled();
        expect(updateStyleSync).toHaveBeenCalled();
    });

    it("resolves a partial tag set against the current appearance", () => {
        // One tag replaces only its own group; the rest are kept.
        const { image } = run(["casual"]);

        expect(image.state.currentSrc).toEqual(["normal", "casual"]);
    });
});
