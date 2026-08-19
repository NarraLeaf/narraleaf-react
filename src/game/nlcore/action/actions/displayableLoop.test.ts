import { describe, expect, it, vi } from "vitest";
import { Image } from "@core/elements/displayable/image";
import { DisplayableAction } from "./displayableAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { DisplayableActionTypes } from "@core/action/actionTypes";
import { Transform } from "@core/elements/transform/transform";
import type { TransformDefinitions } from "@core/elements/transform/type";

function taskLike() {
    return { onCancelled: vi.fn(), abort: vi.fn() };
}

/**
 * Duck-typed GameState carrying only what the loop branches touch. `mounted: false` stands for an
 * element the story has spoken about but the stage has not put up yet.
 */
function createStateLike({ mounted = true }: { mounted?: boolean } = {}) {
    const exposed = {
        applyLoop: vi.fn(),
        stopLoop: vi.fn((_options?: unknown, _onResolve?: () => void) => taskLike()),
        applyTransform: vi.fn(() => taskLike()),
        updateStyleSync: vi.fn(),
    };
    const undos: { handler: (...args: never[]) => void; args: never[] }[] = [];
    const attachTimeline = vi.fn(() => ({ attachChild: () => ({}) }));
    const state = {
        getExposedState: () => (mounted ? exposed : null),
        getExposedStateForce: () => exposed,
        actionHistory: {
            push: (_options: unknown, handler: (...args: never[]) => void, args: never[] = [] as never[]) => {
                undos.push({ handler, args });
            },
        },
        timelines: { attachTimeline },
        logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    return {
        state,
        exposed,
        attachTimeline,
        /** Run the undo handler pushed by the n-th action, newest last. */
        undo: (index = undos.length - 1) => undos[index].handler(...undos[index].args),
        undos,
    };
}

function breathe() {
    return Transform
        .create<TransformDefinitions.ImageTransformProps>()
        .scaleY(1.02)
        .commit({ duration: 900 });
}

function actionOf(
    image: Image,
    type: typeof DisplayableActionTypes[keyof typeof DisplayableActionTypes],
    content: unknown[],
    id: string,
) {
    const action = new DisplayableAction(
        { getSelf: () => image } as never,
        type as never,
        new ContentNode().setContent(content) as never,
    );
    action.setId(id);
    return action;
}

function run(
    image: Image,
    state: ReturnType<typeof createStateLike>["state"],
    type: typeof DisplayableActionTypes[keyof typeof DisplayableActionTypes],
    content: unknown[],
    id: string,
) {
    return actionOf(image, type, content, id).executeAction(state as never, { stackModel: {} } as never);
}

describe("displayable:applyLoop", () => {
    it("resolves on the spot and stays out of the timeline tree", () => {
        // The point of the whole design: an endless motion has no completion to wait for, so it is
        // not a step of the story. If this ever became an unsettled awaitable it would park the
        // stack model forever and be written into the save as a waiting action.
        const image = new Image({ src: "yuko.png" });
        const { state, attachTimeline } = createStateLike();

        const result = run(image, state, DisplayableActionTypes.applyLoop, [breathe(), undefined], "loop-1");

        expect(result).toBeTruthy();
        expect((result as { isSolved(): boolean }).isSolved()).toBe(true);
        expect(attachTimeline).not.toHaveBeenCalled();
    });

    it("records the loop on the element and starts the motion", () => {
        const image = new Image({ src: "yuko.png" });
        const { state, exposed } = createStateLike();
        const transform = breathe();

        run(image, state, DisplayableActionTypes.applyLoop, [transform, { repeatType: "mirror" }], "loop-1");

        expect(image._getLoop()?.transform).toBe(transform);
        expect(image._getLoop()?.options).toEqual({ repeatType: "mirror" });
        expect(image._getLoopActionId()).toBe("loop-1");
        expect(exposed.applyLoop).toHaveBeenCalledTimes(1);
    });

    it("records the loop even for an element that is not on stage", () => {
        // The binding is the truth, not the running animation - a host reconciles from it when it
        // mounts, so setting one early is not an error.
        const image = new Image({ src: "yuko.png" });
        const { state } = createStateLike({ mounted: false });

        expect(() => run(image, state, DisplayableActionTypes.applyLoop, [breathe(), undefined], "loop-1")).not.toThrow();
        expect(image._getLoop()).not.toBeNull();
    });

    it("is undone by ending the loop", () => {
        const image = new Image({ src: "yuko.png" });
        const { state, exposed, undo } = createStateLike();

        run(image, state, DisplayableActionTypes.applyLoop, [breathe(), undefined], "loop-1");
        undo();

        expect(image._getLoop()).toBeNull();
        expect(image._getLoopActionId()).toBeNull();
        expect(exposed.stopLoop).toHaveBeenCalledTimes(1);
    });

    it("is undone back to the loop that was running before it, not to no loop at all", () => {
        const image = new Image({ src: "yuko.png" });
        const { state, exposed, undo } = createStateLike();
        const first = breathe();
        const second = breathe();

        run(image, state, DisplayableActionTypes.applyLoop, [first, undefined], "loop-1");
        run(image, state, DisplayableActionTypes.applyLoop, [second, undefined], "loop-2");
        undo();

        expect(image._getLoop()?.transform).toBe(first);
        expect(image._getLoopActionId()).toBe("loop-1");
        expect(exposed.stopLoop).not.toHaveBeenCalled();
        expect(exposed.applyLoop).toHaveBeenLastCalledWith(first, {});
    });
});

describe("displayable:stopLoop", () => {
    it("clears the binding and eases the element back", () => {
        const image = new Image({ src: "yuko.png" });
        const { state, exposed } = createStateLike();

        run(image, state, DisplayableActionTypes.applyLoop, [breathe(), undefined], "loop-1");
        const result = run(image, state, DisplayableActionTypes.stopLoop, [{ duration: 300 }], "stop-1");

        expect(image._getLoop()).toBeNull();
        expect(exposed.stopLoop).toHaveBeenCalledTimes(1);
        expect(exposed.stopLoop.mock.calls[0][0]).toEqual({ duration: 300 });
        expect(result).toBeTruthy();
    });

    it("resolves without a host when the element is not on stage", () => {
        const image = new Image({ src: "yuko.png" });
        const { state } = createStateLike({ mounted: false });

        const result = run(image, state, DisplayableActionTypes.stopLoop, [undefined], "stop-1");

        expect((result as { isSolved(): boolean }).isSolved()).toBe(true);
    });

    it("leaves an element that was not looping completely alone", () => {
        // The way back is an ordinary transform, so reaching the host here would cancel whatever
        // move the element happened to be in the middle of - for a line that had nothing to do.
        const image = new Image({ src: "yuko.png" });
        const { state, exposed } = createStateLike();

        const result = run(image, state, DisplayableActionTypes.stopLoop, [undefined], "stop-1");

        expect(exposed.stopLoop).not.toHaveBeenCalled();
        expect(exposed.applyTransform).not.toHaveBeenCalled();
        expect((result as { isSolved(): boolean }).isSolved()).toBe(true);
    });

    it("is undone by putting the loop back", () => {
        // Undoing past a `stopLoop` has to start a motion that is not running, which is the mirror
        // image of undoing past a `loop` - and the half that is easy to leave out, because the
        // element already looks right the moment the binding is restored.
        const image = new Image({ src: "yuko.png" });
        const { state, exposed, undo } = createStateLike();
        const transform = breathe();

        run(image, state, DisplayableActionTypes.applyLoop, [transform, { repeatType: "mirror" }], "loop-1");
        run(image, state, DisplayableActionTypes.stopLoop, [undefined], "stop-1");
        undo();

        expect(image._getLoop()?.transform).toBe(transform);
        expect(image._getLoop()?.options).toEqual({ repeatType: "mirror" });
        expect(image._getLoopActionId()).toBe("loop-1");
        expect(exposed.applyLoop).toHaveBeenLastCalledWith(transform, { repeatType: "mirror" });
    });
});

describe("an authored transform against a looping element", () => {
    it("takes the element back - one transform at a time", () => {
        const image = new Image({ src: "yuko.png" });
        const { state } = createStateLike();

        run(image, state, DisplayableActionTypes.applyLoop, [breathe(), undefined], "loop-1");
        run(image, state, DisplayableActionTypes.applyTransform, [Transform.immediate({ opacity: 1 })], "move-1");

        expect(image._getLoop()).toBeNull();
        expect(image._getLoopActionId()).toBeNull();
    });

    it("gives the loop back when it is undone", () => {
        const image = new Image({ src: "yuko.png" });
        const { state, exposed, undo } = createStateLike();
        const transform = breathe();

        run(image, state, DisplayableActionTypes.applyLoop, [transform, undefined], "loop-1");
        run(image, state, DisplayableActionTypes.applyTransform, [Transform.immediate({ opacity: 1 })], "move-1");
        undo();

        expect(image._getLoop()?.transform).toBe(transform);
        expect(exposed.applyLoop).toHaveBeenLastCalledWith(transform, {});
    });
});
