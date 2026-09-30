import { describe, expect, it, vi } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with (see camera.test.ts for the background on this).
import { Puppet } from "@core/common/core";
import { PuppetAction } from "./puppetAction";
import { Chained } from "@core/action/chain";
import { PuppetActionContentType, PuppetActionTypes } from "@core/action/actionTypes";
import { ContentNode } from "@core/action/tree/actionTree";
import { Awaitable } from "@lib/util/data";
import type { PuppetInstance, PuppetState } from "@core/game/puppet/puppetBackend";
import type { Values } from "@lib/util/data";

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

function actionsOf(chained: unknown) {
    return Chained.toActions([chained as never]);
}

function typesOf(chained: unknown): string[] {
    return actionsOf(chained).map((a) => a.type);
}

/**
 * Duck-typed GameState carrying only what the puppet actions touch. Nothing here needs a renderer,
 * a DOM or a running game — the seam under test is "what does the action do to the element and to
 * the backend handle", which is exactly what a host has to be able to rely on.
 */
function fakeState() {
    const timeline = { id: "timeline" };
    return {
        actionHistory: { push: vi.fn() },
        timelines: { attachTimeline: vi.fn(() => timeline) },
        logger: { error: vi.fn(), weakWarn: vi.fn(), info: vi.fn(), debug: vi.fn() },
        timeline,
    };
}

function run(
    puppet: Puppet,
    type: Values<typeof PuppetActionTypes>,
    content: unknown[],
    state = fakeState()
) {
    const result = new PuppetAction(
        { getSelf: () => puppet } as never,
        type,
        new ContentNode().setContent(content) as never,
    ).executeAction(state as never, { stackModel: {} } as never);

    return { result, state };
}

/** Replay the undo callback the action pushed, the way ActionHistoryManager.undoUntil would. */
function undoLast(state: ReturnType<typeof fakeState>) {
    const calls = state.actionHistory.push.mock.calls;
    const [, onUndo, args] = calls[calls.length - 1] as [unknown, (...a: never[]) => void, never[]];
    onUndo(...(args || []));
}

/** Let every microtask queued by the action settle. */
function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("puppet actions", () => {
    describe("chainable shape", () => {
        it("emits exactly one action per call, carrying the author's arguments verbatim", () => {
            const puppet = makePuppet();

            expect(actionsOf(puppet.setMotion("idle"))
                .map((a) => [a.type, a.contentNode.getContent()]))
                .toEqual([[PuppetActionTypes.setMotion, ["idle"]]]);
            expect(actionsOf(makePuppet().setExpression("smile"))
                .map((a) => [a.type, a.contentNode.getContent()]))
                .toEqual([[PuppetActionTypes.setExpression, ["smile"]]]);
            expect(actionsOf(makePuppet().setSkin("winter"))
                .map((a) => [a.type, a.contentNode.getContent()]))
                .toEqual([[PuppetActionTypes.setSkin, ["winter"]]]);
            expect(actionsOf(makePuppet().setParam("ParamAngleX", 12))
                .map((a) => [a.type, a.contentNode.getContent()]))
                .toEqual([[PuppetActionTypes.setParam, ["ParamAngleX", 12]]]);
            expect(actionsOf(makePuppet().setSlot("prop", "umbrella"))
                .map((a) => [a.type, a.contentNode.getContent()]))
                .toEqual([[PuppetActionTypes.setSlot, ["prop", "umbrella"]]]);
        });

        it("takes null to clear a named slot of state", () => {
            expect(actionsOf(makePuppet().setMotion(null))[0].contentNode.getContent()).toEqual([null]);
            expect(actionsOf(makePuppet().setSlot("prop", null))[0].contentNode.getContent())
                .toEqual(["prop", null]);
        });

        it("command carries name, payload and options, and does not wait by default", () => {
            const actions = actionsOf(makePuppet().command("playMotion", { id: "wave" }));
            expect(actions.map((a) => a.type)).toEqual([PuppetActionTypes.command]);
            // The third slot is the options object, and its absence is what "do not wait" looks like
            // on the wire.
            expect(actions[0].contentNode.getContent()).toEqual(["playMotion", { id: "wave" }, undefined]);
        });

        it("command carries {await: true} through to the action", () => {
            const actions = actionsOf(makePuppet().command("playMotion", { id: "bow" }, { await: true }));
            expect(actions[0].contentNode.getContent()).toEqual(["playMotion", { id: "bow" }, { await: true }]);
        });

        it("chains onto the displayable's own actions in written order", () => {
            const puppet = makePuppet();
            expect(typesOf(puppet.setMotion("idle").setExpression("smile").command("wave"))).toEqual([
                PuppetActionTypes.setMotion,
                PuppetActionTypes.setExpression,
                PuppetActionTypes.command,
            ]);
        });
    });

    describe("action content types", () => {
        it("PuppetActionContentType keys cover exactly the PuppetActionTypes values", () => {
            type TypeValues = Values<typeof PuppetActionTypes>;
            // Compile-time: every action type value has a content entry...
            const coverage: Record<TypeValues, unknown> = null as unknown as PuppetActionContentType;
            // ...and every content entry corresponds to an action type value.
            const exact: TypeValues = null as unknown as keyof PuppetActionContentType;
            void coverage;
            void exact;

            expect(Object.values(PuppetActionTypes).sort()).toEqual([
                "puppet:action",
                "puppet:command",
                "puppet:setExpression",
                "puppet:setMotion",
                "puppet:setParam",
                "puppet:setSkin",
                "puppet:setSlot",
            ]);
        });
    });

    describe("state actions", () => {
        it("hands the backend the complete state, not the field that changed", () => {
            const apply = vi.fn();
            const puppet = makePuppet({ motion: "idle" });
            puppet._attachInstance(fakeInstance({ apply }));

            run(puppet, PuppetActionTypes.setExpression, ["smile"]);

            expect(puppet.state.expression).toBe("smile");
            expect(apply).toHaveBeenCalledTimes(1);
            expect(apply.mock.calls[0][0]).toEqual({
                motion: "idle",
                expression: "smile",
                skin: null,
                params: {},
                slots: {},
            });
        });

        it("setParam and setSlot edit one key and leave the rest of the map alone", () => {
            const puppet = makePuppet({ params: { a: 1, b: 2 }, slots: { hat: "straw" } });
            puppet._attachInstance(fakeInstance());

            run(puppet, PuppetActionTypes.setParam, ["b", 3]);
            run(puppet, PuppetActionTypes.setSlot, ["prop", "umbrella"]);

            expect(puppet.state.params).toEqual({ a: 1, b: 3 });
            expect(puppet.state.slots).toEqual({ hat: "straw", prop: "umbrella" });
        });

        it("undo restores the whole state and re-applies it once", () => {
            const apply = vi.fn();
            const puppet = makePuppet({ motion: "idle", params: { a: 1 } });
            puppet._attachInstance(fakeInstance({ apply }));

            const { state } = run(puppet, PuppetActionTypes.setMotion, ["wave"]);
            expect(puppet.state.motion).toBe("wave");

            undoLast(state);

            expect(puppet.state).toEqual({
                motion: "idle",
                expression: null,
                skin: null,
                params: { a: 1 },
                slots: {},
            });
            // Once for the action, once for the undo. A complete state means an undo is an apply,
            // never a replay.
            expect(apply).toHaveBeenCalledTimes(2);
            expect(apply.mock.calls[1][0]).toEqual(puppet.state);
        });

        it("carries state keys it does not know through an edit and its undo", () => {
            const puppet = makePuppet();
            (puppet.state as Record<string, unknown>).somethingNewer = { tint: "#ff0000" };
            puppet._attachInstance(fakeInstance());

            const { state } = run(puppet, PuppetActionTypes.setSkin, ["winter"]);
            expect((puppet.state as Record<string, unknown>).somethingNewer).toEqual({ tint: "#ff0000" });

            undoLast(state);
            expect((puppet.state as Record<string, unknown>).somethingNewer).toEqual({ tint: "#ff0000" });
            expect(puppet.state.skin).toBeNull();
        });

        it("returns without waiting for the backend, and never blocks the story on one", () => {
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({ apply: () => new Promise(() => undefined) }));

            const { result } = run(puppet, PuppetActionTypes.setMotion, ["idle"]);

            expect(Awaitable.isAwaitable(result)).toBe(false);
        });

        it("logs a backend that throws instead of taking the stage down with it", async () => {
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({
                apply: () => {
                    throw new Error("backend exploded");
                },
            }));

            const { state } = run(puppet, PuppetActionTypes.setMotion, ["idle"]);
            await flush();

            expect(state.logger.error).toHaveBeenCalled();
            // The state change still stands; only the backend failed to take it.
            expect(puppet.state.motion).toBe("idle");
        });

        it("edits the state of an unmounted puppet, to be applied in full when it mounts", () => {
            const puppet = makePuppet();
            run(puppet, PuppetActionTypes.setMotion, ["idle"]);
            expect(puppet.state.motion).toBe("idle");
        });
    });

    describe("command", () => {
        it("forwards name and payload verbatim and moves on at once", () => {
            const command = vi.fn();
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({ command }));

            const { result, state } = run(
                puppet, PuppetActionTypes.command, ["playMotion", { id: "wave" }, undefined]
            );

            expect(command).toHaveBeenCalledWith("playMotion", { id: "wave" });
            expect(Awaitable.isAwaitable(result)).toBe(false);
            // A one-shot leaves no state to restore and no wait to abort, so it books nothing.
            expect(state.actionHistory.push).not.toHaveBeenCalled();
        });

        it("leaves the persistent state untouched — a one-shot is not a pose", () => {
            const puppet = makePuppet({ motion: "idle" });
            puppet._attachInstance(fakeInstance());

            run(puppet, PuppetActionTypes.command, ["playMotion", { id: "wave" }, undefined]);

            expect(puppet.state).toEqual({
                motion: "idle",
                expression: null,
                skin: null,
                params: {},
                slots: {},
            });
        });

        it("with {await: true}, holds the story until the backend finishes", async () => {
            let finish: () => void = () => undefined;
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({
                command: () => new Promise<void>((resolve) => {
                    finish = resolve;
                }),
            }));

            const { result } = run(
                puppet, PuppetActionTypes.command, ["playMotion", { id: "bow" }, { await: true }]
            );
            const awaitable = result as Awaitable;

            expect(Awaitable.isAwaitable(awaitable)).toBe(true);
            await flush();
            expect(awaitable.isSettled()).toBe(false);

            finish();
            await flush();
            expect(awaitable.isSettled()).toBe(true);
        });

        it("books the wait so an undo landing mid-command can abort it", async () => {
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({ command: () => new Promise(() => undefined) }));

            const { result, state } = run(
                puppet, PuppetActionTypes.command, ["playMotion", null, { await: true }]
            );
            const awaitable = result as Awaitable;

            expect(state.timelines.attachTimeline).toHaveBeenCalledWith(awaitable);
            const [props] = state.actionHistory.push.mock.calls[0] as [{ timeline: unknown }];
            expect(props.timeline).toBe(state.timeline);

            undoLast(state);
            expect(awaitable.isSettled()).toBe(true);
        });

        it("does not hang when the puppet is not on stage, and says so", async () => {
            const puppet = makePuppet();

            const { result, state } = run(
                puppet, PuppetActionTypes.command, ["playMotion", null, { await: true }]
            );
            await flush();

            expect((result as Awaitable).isSettled()).toBe(true);
            expect(state.logger.weakWarn).toHaveBeenCalled();
        });

        it("survives a backend that throws, awaited or not", async () => {
            const puppet = makePuppet();
            puppet._attachInstance(fakeInstance({
                command: () => {
                    throw new Error("backend exploded");
                },
            }));

            const { result, state } = run(
                puppet, PuppetActionTypes.command, ["playMotion", null, { await: true }]
            );
            await flush();

            // The story carries on rather than parking on a command nothing will resolve.
            expect((result as Awaitable).isSettled()).toBe(true);
            expect(state.logger.error).toHaveBeenCalled();
        });
    });

    describe("save round trip", () => {
        it("replays nothing on load: the state the actions left is applied in one call", async () => {
            const apply = vi.fn();
            const authored = makePuppet();
            authored._attachInstance(fakeInstance());

            run(authored, PuppetActionTypes.setMotion, ["idle"]);
            run(authored, PuppetActionTypes.setExpression, ["smile"]);
            run(authored, PuppetActionTypes.setParam, ["ParamAngleX", 12]);
            run(authored, PuppetActionTypes.command, ["playMotion", { id: "wave" }, undefined]);

            const restored = makePuppet();
            restored.fromData(authored.toData());
            restored._attachInstance(fakeInstance({ apply }));
            await restored._applyState();

            expect(apply).toHaveBeenCalledTimes(1);
            expect(apply.mock.calls[0][0]).toEqual({
                motion: "idle",
                expression: "smile",
                skin: null,
                params: { ParamAngleX: 12 },
                slots: {},
            } satisfies PuppetState);
        });
    });
});
