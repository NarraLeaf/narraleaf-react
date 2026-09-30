import { describe, expect, it } from "vitest";
import { Image } from "@core/elements/displayable/image";
import { DisplayableAction } from "@core/action/actions/displayableAction";
import { DisplayableActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import { Transform } from "@core/elements/transform/transform";
import type { LogicAction } from "@core/action/logicAction";
import type { TransformDefinitions } from "@core/elements/transform/type";

/** An image marked as a wearable, the way `addWearable` marks one. */
function wearable(src: string) {
    const image = new Image({ src });
    new Image({ src: "carrier.png" }).addWearable(image);
    return image;
}

function breathe() {
    return Transform
        .create<TransformDefinitions.ImageTransformProps>()
        .scaleY(1.02)
        .commit({ duration: 900 });
}

/**
 * The action map `LiveGame.deserialize` builds, holding one loop action. This is the whole reason
 * a loop can be saved at all: the transform stays authored data hanging off the action, and only
 * the action's id travels through the save.
 */
function actionMapWith(image: Image, transform: Transform, id: string): Map<string, LogicAction.Actions> {
    const action = new DisplayableAction(
        { getSelf: () => image } as never,
        DisplayableActionTypes.applyLoop as never,
        new ContentNode().setContent([transform, {}]) as never,
    );
    action.setId(id);

    return new Map<string, LogicAction.Actions>([[id, action as never]]);
}

describe("a looping transform in a save", () => {
    it("travels as the id of the action that started it, and comes back as the transform", () => {
        const yuko = new Image({ src: "yuko.png" });
        const transform = breathe();
        yuko._setLoop(transform, { repeatType: "mirror", repeatDelay: 250 }, "loop-1");

        const raw = yuko.toData();
        expect(raw.loop).toEqual({ actionId: "loop-1", options: { repeatType: "mirror", repeatDelay: 250 } });

        const restored = new Image({ src: "yuko.png" });
        restored.fromData(raw);
        restored._rebindLoop(actionMapWith(restored, transform, "loop-1"));

        expect(restored._getLoop()?.transform).toBe(transform);
        expect(restored._getLoop()?.options).toEqual({ repeatType: "mirror", repeatDelay: 250 });
        expect(restored._getLoopActionId()).toBe("loop-1");
    });

    it("is still carried by a save taken before the anchor was resolved", () => {
        // `fromData` leaves the transform unresolved until the action map arrives. Serializing from
        // that window has to emit the anchor, or a load-then-save would silently lose the loop.
        const restored = new Image({ src: "yuko.png" });
        restored.fromData({
            ...new Image({ src: "yuko.png" }).toData(),
            loop: { actionId: "loop-1", options: {} },
        });

        expect(restored._getLoop()).toBeNull();
        expect(restored.toData().loop).toEqual({ actionId: "loop-1", options: {} });
    });

    it("is dropped, pose intact, when the story no longer has the action", () => {
        const yuko = new Image({ src: "yuko.png" });
        yuko.fromData({
            ...new Image({ src: "yuko.png" }).toData(),
            loop: { actionId: "gone", options: {} },
        });
        const pose = { ...yuko.transformState.get() };

        yuko._rebindLoop(new Map());

        expect(yuko._getLoop()).toBeNull();
        expect(yuko._getLoopActionId()).toBeNull();
        expect(yuko.transformState.get()).toEqual(pose);
    });

    it("is absent from a save written before loops existed", () => {
        const yuko = new Image({ src: "yuko.png" });
        const legacy = new Image({ src: "yuko.png" }).toData();
        delete legacy.loop;

        yuko.fromData(legacy);
        yuko._rebindLoop(new Map());

        expect(yuko._getLoop()).toBeNull();
    });

    it("does not survive a new game", () => {
        const yuko = new Image({ src: "yuko.png" });
        yuko._setLoop(breathe(), {}, "loop-1");

        yuko.reset();

        expect(yuko._getLoop()).toBeNull();
        expect(yuko._getLoopActionId()).toBeNull();
        expect(yuko.toData().loop).toBeNull();
    });
});

describe("a wearable", () => {
    it("carries its own loop, independently of the image wearing it", () => {
        // A wearable is a full Image rendered by the same host, so it has its own transform state,
        // its own exposed state and - here - its own binding: a halo can breathe while the
        // character it hangs on does not.
        const yuko = new Image({ src: "yuko.png" });
        const halo = new Image({ src: "halo.png" });
        yuko.addWearable(halo);

        const transform = breathe();
        halo._setLoop(transform, { repeatType: "mirror" }, "loop-halo");

        expect(halo._getLoop()?.transform).toBe(transform);
        expect(yuko._getLoop()).toBeNull();
        expect(halo.toData().loop).toEqual({ actionId: "loop-halo", options: { repeatType: "mirror" } });
        expect(yuko.toData().loop).toBeNull();
    });

    it("round-trips its loop through a save on its own element state", () => {
        const halo = wearable("halo.png");
        const transform = breathe();
        halo._setLoop(transform, {}, "loop-halo");

        const restored = wearable("halo.png");
        restored.fromData(halo.toData());
        restored._rebindLoop(actionMapWith(restored, transform, "loop-halo"));

        expect(restored._getLoop()?.transform).toBe(transform);
    });
});
