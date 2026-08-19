import { describe, expect, it, vi } from "vitest";
import { Image } from "@core/elements/displayable/image";
import { Layer } from "@core/elements/layer";
import { Camera } from "@core/elements/camera";
import { GameState, PlayerStateData, PlayerStateElement } from "@player/gameState";
import { DisplayableAction } from "./displayableAction";
import { DisplayableActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import { Awaitable } from "@lib/util/data";
import type { LogicAction } from "@core/action/logicAction";

/**
 * `bringToFront` has no state of its own to check. What it does is reorder the array a layer draws
 * from, and everything that makes that a feature rather than a mutation lives at two seams:
 *
 * - the renderer draws a layer's array in order, so the last entry is the one on top;
 * - `toData` writes each layer out as that array's ids, in that order, and loading rebuilds it.
 *
 * The second is why this is a reordering rather than a new per-element depth number: the order is
 * already persisted. The `save` block below is the test holding that up.
 *
 * Constructing a real GameState needs a live game and a mounted stage, so these drive the action
 * against a stub carrying only what it reads — with the real `findElementByDisplayable`, `toData`
 * and `constructLayerMap` called on it, since those are the parts under test.
 */

type Undo = { undo?: (...args: never[]) => void; args: unknown[] };

function createStage(order: string[] = ["a", "b", "c"]) {
    const layer = new Layer("displayable");
    layer.setId("layer-0");

    const images = new Map(order.map(id => {
        const image = new Image({ src: id + ".png" });
        image.setId(id);
        return [id, image] as const;
    }));

    const elements = order.map(id => images.get(id)!) as LogicAction.DisplayableElements[];
    const element = {
        scene: { getId: () => "scene-0" },
        layers: new Map([[layer, elements]]),
        texts: [],
        menus: [],
    } as unknown as PlayerStateElement;

    const undos: Undo[] = [];
    const flush = vi.fn();
    const state = {
        state: { elements: [element], videos: [], vfx: [] },
        nvlState: {
            active: false,
            visible: false,
            sessionId: null,
            options: null,
            activeDialogId: null,
            phase: "idle",
            pendingAdvance: false,
            dialogs: [],
        },
        audioManager: { toData: () => ({ sounds: [], groups: [] }) },
        findElementByDisplayable(displayable: LogicAction.DisplayableElements) {
            return GameState.prototype.findElementByDisplayable.call(this as never, displayable);
        },
        flush,
        actionHistory: {
            push: (_props: unknown, undo?: (...args: never[]) => void, args?: unknown[]) => {
                undos.push({ undo, args: args || [] });
                return { id: "history-0" };
            },
        },
    };

    return {
        state,
        layer,
        images,
        elements,
        undos,
        flush,
        ids: () => elements.map(e => e.getId()),
        undoLast: () => {
            const last = undos[undos.length - 1];
            last.undo?.(...(last.args as never[]));
        },
    };
}

function bringToFront(state: unknown, target: LogicAction.DisplayableElements) {
    const action = new DisplayableAction(
        { getSelf: () => target } as never,
        DisplayableActionTypes.bringToFront,
        new ContentNode().setContent([]) as never,
    );
    return action.executeAction(state as never, { stackModel: {} } as never);
}

describe("displayable:bringToFront", () => {
    it("moves the element to the end of its layer, where the renderer draws it last", () => {
        const stage = createStage();

        bringToFront(stage.state, stage.images.get("b")!);

        expect(stage.ids()).toEqual(["a", "c", "b"]);
        expect(stage.flush).toHaveBeenCalled();
    });

    it("puts it back where it was on undo", () => {
        const stage = createStage();

        bringToFront(stage.state, stage.images.get("a")!);
        expect(stage.ids()).toEqual(["b", "c", "a"]);

        stage.undoLast();
        expect(stage.ids()).toEqual(["a", "b", "c"]);
    });

    it("undoes back to the index it started at, not to the front", () => {
        const stage = createStage(["a", "b", "c", "d"]);

        bringToFront(stage.state, stage.images.get("c")!);
        expect(stage.ids()).toEqual(["a", "b", "d", "c"]);

        stage.undoLast();
        expect(stage.ids()).toEqual(["a", "b", "c", "d"]);
    });

    it("leaves an element that is already in front alone, and still resolves", () => {
        // Not silently dropped: the action still settles and still records an entry, so a story
        // that calls it every line neither stalls nor puts a hole in the undo history.
        const stage = createStage();

        const result = bringToFront(stage.state, stage.images.get("c")!);

        expect(stage.ids()).toEqual(["a", "b", "c"]);
        expect(stage.flush).not.toHaveBeenCalled();
        expect(Awaitable.isAwaitable(result)).toBe(true);
        expect((result as Awaitable).isSettled()).toBe(true);
        expect(stage.undos).toHaveLength(1);

        stage.undoLast();
        expect(stage.ids()).toEqual(["a", "b", "c"]);
    });

    it("settles before it is handed back, because there is nothing to tween", () => {
        const stage = createStage();
        const result = bringToFront(stage.state, stage.images.get("a")!);

        expect(Awaitable.isAwaitable(result)).toBe(true);
        expect((result as Awaitable).isSettled()).toBe(true);
    });

    it("throws rather than doing nothing when the element is not on stage", () => {
        const stage = createStage();
        const offstage = new Image({ src: "offstage.png" });
        offstage.setId("offstage");

        expect(() => bringToFront(stage.state, offstage)).toThrow(/not found when bringing it to front/);
    });
});

describe("the order bringToFront leaves behind survives a save", () => {
    /**
     * The whole design rests on this. `toData` writes a layer as the ids of its array in order and
     * `constructLayerMap` reads them back in that order, so a reorder is persisted already and no
     * new field is needed to carry it. If either side stopped preserving order, `bringToFront`
     * would work right up until the player saved and quit.
     */
    it("writes the layer out in array order and reads it back the same way", () => {
        const stage = createStage();
        bringToFront(stage.state, stage.images.get("b")!);

        const data: PlayerStateData = GameState.prototype.toData.call(stage.state as never);
        const saved = data.scenes[0].elements.layers["layer-0"];

        expect(saved).toEqual(["a", "c", "b"]);
        expect(saved).toEqual(stage.ids());

        const elementMap = new Map<string, LogicAction.GameElement>([
            ["layer-0", stage.layer],
            ...[...stage.images].map(([id, image]) => [id, image] as [string, LogicAction.GameElement]),
        ]);
        const constructLayerMap = (GameState.prototype as never as Record<string, (...args: unknown[]) => unknown>)["constructLayerMap"];
        const rebuilt = constructLayerMap.call(
            stage.state as never,
            data.scenes[0].elements.layers,
            elementMap
        ) as Map<Layer, LogicAction.DisplayableElements[]>;

        expect([...rebuilt.keys()]).toEqual([stage.layer]);
        expect(rebuilt.get(stage.layer)!.map(e => e.getId())).toEqual(["a", "c", "b"]);
    });
});

describe("the subclasses that refuse the call", () => {
    it("Layer names the knob that does order layers", () => {
        // Layers are ordered by z-index and a layer is not inside any layer's array, so accepting
        // the call would read as if it raised the layer and play as if the line were not there.
        const layer = new Layer("foreground");

        expect(() => layer.bringToFront()).toThrow(/setZIndex/);
    });

    it("Camera says there is nothing to be in front of, not that it is not on stage yet", () => {
        // The camera inherits the method and never enters a layer array, so the base error would
        // have read "may not be on stage yet" — an invitation to wait for a moment that never
        // arrives. The refusal has to say why there is no front, not when there might be one.
        const camera = new Camera();

        expect(() => camera.bringToFront()).toThrow(/nothing to be in front of/);
        expect(() => camera.bringToFront()).not.toThrow(/on stage yet/);
    });
});
