import { describe, expect, it, vi } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with (see camera.test.ts for the background on this).
import { Puppet } from "@core/common/core";
import { RuntimeScriptError } from "@core/common/Utils";
import type { PuppetInstance } from "@core/game/puppet/puppetBackend";

function makePuppet(config: Record<string, unknown> = {}) {
    return new Puppet({
        backend: "test-backend",
        src: "models/alice.json",
        ...config,
    });
}

function fakeInstance(overrides: Partial<PuppetInstance> = {}): PuppetInstance {
    return {
        ready: () => Promise.resolve(),
        apply: () => undefined,
        command: () => undefined,
        resize: () => undefined,
        dispose: () => undefined,
        ...overrides,
    };
}

describe("Puppet element", () => {
    describe("construction / config", () => {
        it("throws when the backend name is missing", () => {
            expect(() => new Puppet({ src: "a.json" } as never)).toThrow(RuntimeScriptError);
            expect(() => new Puppet({ src: "a.json" } as never)).toThrow(/backend/);
        });

        it("throws when src is missing", () => {
            expect(() => new Puppet({ backend: "b" } as never)).toThrow(/src/);
        });

        it("applies the documented defaults", () => {
            const puppet = makePuppet();
            expect(puppet.config.backend).toBe("test-backend");
            expect(puppet.config.src).toBe("models/alice.json");
            expect(puppet.config.options).toEqual({});
            // null means "the stage size", resolved when the element mounts.
            expect(puppet.config.size).toBeNull();
            expect(puppet.config.layer).toBeUndefined();
            expect(puppet.state).toEqual({
                motion: null,
                expression: null,
                skin: null,
                params: {},
                slots: {},
            });
        });

        it("carries an explicit box size and backend options through untouched", () => {
            const puppet = makePuppet({
                size: { width: 900, height: 1200 },
                options: { antialias: true, nested: { depth: 2 } },
            });
            expect(puppet.config.size).toEqual({ width: 900, height: 1200 });
            expect(puppet.config.options).toEqual({ antialias: true, nested: { depth: 2 } });
        });

        it("resolves the box size to the stage size only when none was configured", () => {
            expect(makePuppet()._resolveSize({ width: 1920, height: 1080 }))
                .toEqual({ width: 1920, height: 1080 });
            expect(makePuppet({ size: { width: 400, height: 600 } })._resolveSize({ width: 1920, height: 1080 }))
                .toEqual({ width: 400, height: 600 });
        });

        it("seeds the persistent state from the constructor config", () => {
            const puppet = makePuppet({
                motion: "idle",
                expression: "smile",
                skin: "winter",
                params: { ParamAngleX: 12 },
                slots: { prop: "umbrella" },
            });
            expect(puppet.state).toEqual({
                motion: "idle",
                expression: "smile",
                skin: "winter",
                params: { ParamAngleX: 12 },
                slots: { prop: "umbrella" },
            });
        });

        it("takes transform props as constructor config, like every other displayable", () => {
            const puppet = makePuppet({ opacity: 1, scaleX: 0.5, rotation: 15 });
            const transformProps = puppet.transformState.get();
            expect(transformProps.opacity).toBe(1);
            expect(transformProps.scaleX).toBe(0.5);
            expect(transformProps.rotation).toBe(15);
        });
    });

    describe("serialization", () => {
        it("round-trips state and transform state through toData/fromData", () => {
            const puppet = makePuppet({ motion: "idle", opacity: 1, scaleX: 0.75 });
            puppet.state.expression = "angry";
            puppet.state.params.ParamAngleX = -8;
            puppet.state.slots.prop = null;

            const raw = puppet.toData();
            const restored = makePuppet();
            restored.fromData(raw);

            expect(restored.state).toEqual(puppet.state);
            expect(restored.transformState.serialize()).toEqual(puppet.transformState.serialize());
        });

        it("keeps keys it does not know, so a save from a newer engine survives the trip", () => {
            const puppet = makePuppet();
            const restored = makePuppet();
            restored.fromData({
                state: {
                    motion: "idle",
                    somethingNewer: { tint: "#ff0000" },
                },
                transformState: puppet.toData().transformState,
            });

            expect(restored.state.motion).toBe("idle");
            expect((restored.state as Record<string, unknown>).somethingNewer).toEqual({ tint: "#ff0000" });
            // ...and the keys it does know are filled in rather than left undefined.
            expect(restored.state.expression).toBeNull();
            expect(restored.state.params).toEqual({});
            expect(restored.state.slots).toEqual({});
        });

        it("drops values of the wrong shape instead of handing them to a backend", () => {
            const puppet = makePuppet();
            const restored = makePuppet();
            restored.fromData({
                state: {
                    motion: 42,
                    params: { good: 1.5, notANumber: "x", infinite: Infinity },
                    slots: { good: "a", cleared: null, notAString: 3 },
                },
                transformState: puppet.toData().transformState,
            });

            expect(restored.state.motion).toBeNull();
            expect(restored.state.params).toEqual({ good: 1.5 });
            expect(restored.state.slots).toEqual({ good: "a", cleared: null });
        });

        it("reset() returns to the constructor config, state and pose alike", () => {
            const puppet = makePuppet({ motion: "idle", params: { ParamAngleX: 0 }, opacity: 0.5 });
            const pose = puppet.transformState.serialize();

            puppet.state.motion = "wave";
            puppet.state.expression = "angry";
            puppet.state.params.ParamAngleX = 30;
            puppet.transformState.forceOverwrite({ opacity: 1, rotation: 90 });

            puppet.reset();

            expect(puppet.state).toEqual({
                motion: "idle",
                expression: null,
                skin: null,
                params: { ParamAngleX: 0 },
                slots: {},
            });
            expect(puppet.transformState.serialize()).toEqual(pose);
        });
    });

    describe("state merging", () => {
        it("merges params and slots key by key rather than replacing them", () => {
            const base = Puppet.normalizeState({
                motion: "idle",
                params: { a: 1, b: 2 },
                slots: { hat: "straw" },
            });
            const merged = Puppet.mergeState(base, {
                expression: "smile",
                params: { b: 3 },
                slots: { prop: "umbrella" },
            });

            expect(merged).toEqual({
                motion: "idle",
                expression: "smile",
                skin: null,
                params: { a: 1, b: 3 },
                slots: { hat: "straw", prop: "umbrella" },
            });
        });
    });

    describe("backend handle", () => {
        it("starts unmounted, and driving an unmounted puppet is a no-op rather than a throw", async () => {
            const puppet = makePuppet();

            expect(puppet._getStatus()).toBe("unmounted");
            expect(puppet._getInstance()).toBeNull();
            await expect(puppet._applyState()).resolves.toBeUndefined();
            await expect(puppet._runCommand("wave", null)).resolves.toBe(false);
            await expect(puppet._describe()).resolves.toBeNull();
        });

        it("pushes the complete state to an attached instance, not a diff", async () => {
            const apply = vi.fn();
            const puppet = makePuppet({ motion: "idle" });
            puppet._attachInstance(fakeInstance({ apply }));

            await puppet._applyState();

            expect(apply).toHaveBeenCalledTimes(1);
            expect(apply.mock.calls[0][0]).toEqual({
                motion: "idle",
                expression: null,
                skin: null,
                params: {},
                slots: {},
            });
        });

        it("forwards a command verbatim and reports that it ran", async () => {
            const command = vi.fn();
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({ command }));

            await expect(puppet._runCommand("playMotion", { id: "wave", loop: false })).resolves.toBe(true);
            expect(command).toHaveBeenCalledWith("playMotion", { id: "wave", loop: false });
        });

        it("returns null from describe() when the backend does not implement it", async () => {
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance());
            await expect(puppet._describe()).resolves.toBeNull();

            puppet._attachInstance(fakeInstance({
                describe: () => Promise.resolve({
                    motions: ["idle"],
                    expressions: [],
                    skins: [],
                    params: [],
                    size: null,
                }),
            }));
            await expect(puppet._describe()).resolves.toEqual({
                motions: ["idle"],
                expressions: [],
                skins: [],
                params: [],
                size: null,
            });
        });

        it("announces every status change once", () => {
            const puppet = makePuppet();
            const listener = vi.fn();
            const token = puppet._onStatusChange(listener);

            puppet._setStatus("loading");
            puppet._setStatus("loading");
            puppet._setStatus("ready");
            token.cancel();
            puppet._setStatus("unmounted");

            expect(listener.mock.calls.map(([status]) => status)).toEqual(["loading", "ready"]);
        });

        // The other half of this — that the box is still rendered, with its transform written to it —
        // is structural in `Puppet.tsx`: the JSX sits outside the mount effect entirely, so there is
        // no path on which a missing backend removes it. This repo has no DOM harness to assert that
        // with, so what is pinned here is the element's side: the state a save carries, and the fact
        // that a story driving an undrawn puppet neither throws nor loses anything.
        it("a backend nobody registered keeps its pose, its state and its saved game", async () => {
            const puppet = makePuppet({
                motion: "idle",
                params: { ParamAngleX: 12 },
                opacity: 0.5,
                scaleX: 0.75,
            });
            const pose = puppet.transformState.serialize();

            // What Puppet.tsx does when `game.getPuppetBackend(name)` comes back null: no instance is
            // ever attached, and the element says so.
            puppet._setStatus("missing-backend");

            expect(puppet.getStatus()).toBe("missing-backend");
            expect(puppet._getInstance()).toBeNull();

            // The story can go on posing and commanding it. Nothing throws, and a command reports
            // that it was dropped rather than pretending it ran.
            puppet._patchState({ expression: "smile" });
            await expect(puppet._applyState()).resolves.toBeUndefined();
            await expect(puppet._runCommand("playMotion", { id: "wave" })).resolves.toBe(false);
            await expect(puppet._describe()).resolves.toBeNull();

            // ...and the save is complete, so the run where the renderer *is* installed restores
            // everything this one could not draw.
            expect(puppet.toData().state).toEqual({
                motion: "idle",
                expression: "smile",
                skin: null,
                params: { ParamAngleX: 12 },
                slots: {},
            });
            expect(puppet.transformState.serialize()).toEqual(pose);
        });

        it("lets a game author read the status and subscribe to it without DevTools", () => {
            const puppet = makePuppet();
            const seen: string[] = [];
            const token = puppet.onStatusChange((status) => seen.push(status));

            expect(puppet.getStatus()).toBe("unmounted");
            puppet._setStatus("missing-backend");
            expect(puppet.getStatus()).toBe("missing-backend");
            token.cancel();
            puppet._setStatus("error");
            expect(puppet.getStatus()).toBe("error");

            expect(seen).toEqual(["missing-backend"]);
        });
    });
});
