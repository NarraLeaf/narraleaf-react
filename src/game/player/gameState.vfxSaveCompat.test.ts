import { describe, expect, it } from "vitest";
import { GameState, PlayerStateData } from "@player/gameState";
import { Vfx } from "@core/elements/vfx";
import type { LogicAction } from "@core/action/logicAction";

/**
 * Save backward-compatibility for the 0.16.0 "vfx" key.
 *
 * Constructing a full GameState needs a live game and a React stage, so these tests call
 * `loadData` on a minimal stub `this` instead — enough to drive the exact restore path,
 * including the hard requirement that saves created before 0.16.0 (no `vfx` key) load
 * without throwing (the `data.vfx ?? []` read).
 */

type LoadDataThis = {
    logger: { debug: (...args: unknown[]) => void };
    game: { getLiveGame: () => { story: object } };
    audioManager: { fromData: (...args: unknown[]) => void };
    state: { videos: unknown[]; vfx: Vfx[]; srcManagers: unknown[]; elements: unknown[] };
    registerSrcManager: (...args: unknown[]) => void;
    getExposedStateAsync: (...args: unknown[]) => { cancel: () => void };
};

function createLoadDataThis(): LoadDataThis {
    return {
        logger: { debug: () => void 0 },
        game: { getLiveGame: () => ({ story: {} }) },
        audioManager: { fromData: () => void 0 },
        state: {
            videos: [],
            // Pre-seeded with junk so the tests prove loadData rebuilds the array.
            vfx: [new Vfx({ src: "/fx/stale.webm" })],
            srcManagers: [],
            elements: [],
        },
        registerSrcManager: () => void 0,
        getExposedStateAsync: () => ({ cancel: () => void 0 }),
    };
}

const baseSave = {
    scenes: [],
    audio: { sounds: [], groups: [] },
    videos: [],
} as unknown as PlayerStateData;

function loadData(self: LoadDataThis, data: PlayerStateData, elementMap: Map<string, LogicAction.GameElement>): void {
    GameState.prototype.loadData.call(self as unknown as GameState, data, elementMap);
}

describe("GameState.loadData vfx save compatibility", () => {
    it("loads a pre-0.16.0 save that has no vfx key without throwing", () => {
        const self = createLoadDataThis();
        expect(() => loadData(self, { ...baseSave }, new Map())).not.toThrow();
        expect(self.state.vfx).toEqual([]);
    });

    it("restores vfx state from a save that carries the key", () => {
        const vfx = new Vfx({ src: "/fx/petals.webm" });
        vfx.setId("vfx-1");
        const self = createLoadDataThis();
        const save: PlayerStateData = {
            ...baseSave,
            vfx: [["vfx-1", { state: { display: true, paused: true } }]],
        };

        loadData(self, save, new Map<string, LogicAction.GameElement>([["vfx-1", vfx]]));

        expect(self.state.vfx).toEqual([vfx]);
        expect(vfx.state.display).toBe(true);
        expect(vfx.state.paused).toBe(true);
    });

    it("throws a descriptive error when a saved vfx id has no matching element", () => {
        const self = createLoadDataThis();
        const save: PlayerStateData = {
            ...baseSave,
            vfx: [["missing-id", { state: { display: true, paused: false } }]],
        };
        expect(() => loadData(self, save, new Map())).toThrow(/Vfx not found/);
    });
});
