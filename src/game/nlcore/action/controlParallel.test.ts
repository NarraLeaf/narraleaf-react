import { describe, expect, it, vi } from "vitest";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";
import { Control } from "@core/elements/control";
import { Character } from "@core/elements/character";
import type { LiveGame } from "@core/common/game";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * Hardening round for concurrent orchestration (Control.all / Control.any / Control.allAsync)
 * under the three disturbances the Studio performance lens will lean on:
 *   - skip / fast-forward  → how an all/any group settles (executeStackModelGroup)
 *   - save / load          → a mid-flight parallel group round-tripping through serialize()
 *   - undo / rewind        → abortStackTop() rewinding every in-flight branch
 *
 * These sit at the StackModel + ControlAction seam (the same level as
 * stackModel.abort.test.ts): Control.all/any compile to a `wait: {type, stackModels}`
 * result, and StackModel is what drives, serializes and aborts those branches.
 */

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/**
 * Minimal LiveGame stand-in — StackModel only reaches back into it for the loop bound,
 * the debug flag and a logger. None of the parallel paths exercised here execute a real
 * action, so `executeAction` is never called.
 */
function fakeLiveGame(): LiveGame {
    return {
        game: { config: { maxStackModelLoop: 100, app: { debug: false } } },
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
    } as unknown as LiveGame;
}

/** A drained-body result: has a `type` (so the stack accepts it) but no action to run. */
const doneResult = (tag = "done"): CalledActionResult =>
    ({ type: tag, node: null } as unknown as CalledActionResult);

/** A pending body action sitting in a branch stack, keyed by id for serialization. */
const pendingAction = (id: string, type = "character:say"): CalledActionResult =>
    ({ type, node: { action: { getId: () => id, type } }, wait: null } as unknown as CalledActionResult);

/** A branch stack primed with one queued item (action result or awaitable). */
function branch(item: CalledActionResult | Awaitable<CalledActionResult>): StackModel {
    const stack = new StackModel(fakeLiveGame());
    stack.push(item);
    return stack;
}

/** The `wait` link a Control.all/any leaves on the parent stack. */
function waitLink(
    type: "all" | "any",
    branches: StackModel[],
    ctrlId = "ctrl",
): CalledActionResult {
    return {
        type: `control:${type}`,
        node: { action: { getId: () => ctrlId, type: `control:${type}` } },
        wait: { type, stackModels: branches },
    } as unknown as CalledActionResult;
}

describe("Control parallel — completion semantics (skip / fast-forward)", () => {
    it("all: settles only after every branch drains", async () => {
        const a = new Awaitable<CalledActionResult>(v => v);
        const b = new Awaitable<CalledActionResult>(v => v);
        const settled = vi.fn();

        StackModel.executeStackModelGroup("all", [branch(a), branch(b)]).onSettled(settled);
        await tick();
        expect(settled).not.toHaveBeenCalled();

        a.resolve(doneResult());
        await tick();
        // one branch done, the other still in flight → still waiting
        expect(settled).not.toHaveBeenCalled();

        b.resolve(doneResult());
        await tick();
        expect(settled).toHaveBeenCalled();
    });

    it("any: settles as soon as the first branch drains", async () => {
        const a = new Awaitable<CalledActionResult>(v => v);
        const b = new Awaitable<CalledActionResult>(v => v);
        const settled = vi.fn();

        StackModel.executeStackModelGroup("any", [branch(a), branch(b)]).onSettled(settled);
        await tick();
        expect(settled).not.toHaveBeenCalled();

        a.resolve(doneResult());
        await tick();
        expect(settled).toHaveBeenCalled();
    });

    it("isStackModelsAwaiting encodes the all/any wait rule", () => {
        const empty = new StackModel(fakeLiveGame());
        const busy = branch(pendingAction("x"));

        // all: still waiting while *any* branch has work left
        expect(StackModel.isStackModelsAwaiting("all", [busy, empty])).toBe(true);
        expect(StackModel.isStackModelsAwaiting("all", [empty, empty])).toBe(false);

        // any: still waiting only while *every* branch has work left
        expect(StackModel.isStackModelsAwaiting("any", [busy, busy])).toBe(true);
        expect(StackModel.isStackModelsAwaiting("any", [busy, empty])).toBe(false);
    });
});

describe("Control parallel — serialize / deserialize (save / load)", () => {
    it("round-trips a mid-flight all-group: wait type + every branch's pending action", () => {
        const parent = new StackModel(fakeLiveGame());
        parent.push(waitLink("all", [branch(pendingAction("a")), branch(pendingAction("b"))]));

        const raw = parent.serialize();
        const link = raw.items[raw.items.length - 1];

        expect(link.type).toBe("link");
        expect(link.type === "link" && link.stackWaitType).toBe("all");
        expect(link.type === "link" && link.stacks).toHaveLength(2);
        expect(link.type === "link" && link.stacks[0].items[0].action).toBe("a");
        expect(link.type === "link" && link.stacks[1].items[0].action).toBe("b");

        const actionMap = new Map<string, any>([
            ["ctrl", { getId: () => "ctrl", type: "control:all", contentNode: { marker: "ctrl" } }],
            ["a", { getId: () => "a", type: "character:say", contentNode: { marker: "a" } }],
            ["b", { getId: () => "b", type: "character:say", contentNode: { marker: "b" } }],
        ]);
        const restored = new StackModel(fakeLiveGame()).deserialize(raw, actionMap);

        const top = restored.getTopSync();
        expect(top?.wait?.type).toBe("all");
        expect(top?.wait?.stackModels).toHaveLength(2);
        // an all-group with non-empty branches resumes as "still waiting"
        expect(restored.isWaiting()).toBe(true);
    });

    it("round-trips an any-group and preserves its wait type", () => {
        const parent = new StackModel(fakeLiveGame());
        parent.push(waitLink("any", [branch(pendingAction("a")), branch(pendingAction("b"))]));

        const raw = parent.serialize();
        const link = raw.items[raw.items.length - 1];
        expect(link.type === "link" && link.stackWaitType).toBe("any");

        const actionMap = new Map<string, any>([
            ["ctrl", { getId: () => "ctrl", type: "control:any", contentNode: {} }],
            ["a", { getId: () => "a", type: "character:say", contentNode: {} }],
            ["b", { getId: () => "b", type: "character:say", contentNode: {} }],
        ]);
        const restored = new StackModel(fakeLiveGame()).deserialize(raw, actionMap);
        expect(restored.getTopSync()?.wait?.type).toBe("any");
    });

    it("round-trips an asymmetric group where one branch has already drained", () => {
        const parent = new StackModel(fakeLiveGame());
        // branch B is empty (already finished) — the save must keep it empty, not resurrect it
        parent.push(waitLink("all", [branch(pendingAction("a")), new StackModel(fakeLiveGame())]));

        const raw = parent.serialize();
        const link = raw.items[raw.items.length - 1];
        expect(link.type === "link" && link.stacks[0].items).toHaveLength(1);
        expect(link.type === "link" && link.stacks[1].items).toHaveLength(0);

        const actionMap = new Map<string, any>([
            ["ctrl", { getId: () => "ctrl", type: "control:all", contentNode: {} }],
            ["a", { getId: () => "a", type: "character:say", contentNode: {} }],
        ]);
        const restored = new StackModel(fakeLiveGame()).deserialize(raw, actionMap);
        const branches = restored.getTopSync()?.wait?.stackModels ?? [];
        expect(branches).toHaveLength(2);
        expect(branches[0].isEmpty()).toBe(false);
        expect(branches[1].isEmpty()).toBe(true);
    });
});

describe("Control parallel — abortStackTop (undo / rewind)", () => {
    it("rewinds the in-flight awaitable of every branch", () => {
        const inFlightA = new Awaitable<CalledActionResult>(v => v);
        const inFlightB = new Awaitable<CalledActionResult>(v => v);

        const parent = new StackModel(fakeLiveGame());
        parent.push(waitLink("all", [branch(inFlightA), branch(inFlightB)]));

        parent.abortStackTop();

        expect(inFlightA.isAborted()).toBe(true);
        expect(inFlightB.isAborted()).toBe(true);
    });

    it("recurses through a nested parallel group (branch-of-a-branch)", () => {
        const deep = new Awaitable<CalledActionResult>(v => v);

        // outer all-group → branch is itself an all-group → its branch holds the in-flight action
        const innerBranch = branch(deep);
        const middle = new StackModel(fakeLiveGame());
        middle.push(waitLink("all", [innerBranch]));

        const parent = new StackModel(fakeLiveGame());
        parent.push(waitLink("all", [middle]));

        parent.abortStackTop();

        expect(deep.isAborted()).toBe(true);
    });

    it("leaves an already-settled branch untouched", () => {
        const settled = new Awaitable<CalledActionResult>(v => v);
        settled.resolve(doneResult());
        const inFlight = new Awaitable<CalledActionResult>(v => v);

        const parent = new StackModel(fakeLiveGame());
        parent.push(waitLink("any", [branch(settled), branch(inFlight)]));

        parent.abortStackTop();

        expect(settled.isAborted()).toBe(false);
        expect(inFlight.isAborted()).toBe(true);
    });
});

describe("Control parallel — authoring/execution contract", () => {
    const makers: Array<[string, () => any]> = [
        ["all", () => Control.all([new Character("t").say("a"), new Character("t").say("b")])],
        ["any", () => Control.any([new Character("t").say("a"), new Character("t").say("b")])],
        ["allAsync", () => Control.allAsync([new Character("t").say("a"), new Character("t").say("b")])],
    ];

    it.each(makers)("Control.%s leaves its multi-statement body unchained", (_name, make) => {
        const action = make().getActions()[0];
        const [body] = action.contentNode.getContent();

        expect(body.length).toBeGreaterThan(1);
        // no body action may link to the next — the runtime asserts this (checkActionChain)
        expect(body.every((a: any) => !a.contentNode.getChild())).toBe(true);
        expect(() => action.checkActionChain(body)).not.toThrow();
    });

    const emptyMakers: Array<[string, () => any]> = [
        ["all", () => Control.all([])],
        ["any", () => Control.any([])],
        ["allAsync", () => Control.allAsync([])],
        ["do", () => Control.do([])],
        ["doAsync", () => Control.doAsync([])],
    ];

    it.each(emptyMakers)("empty Control.%s passes through to the child without spawning a branch", (name, make) => {
        const action = make().getActions()[0];
        // empty bodies never touch gameState — they fall straight through to the chained child
        const result = action.executeAction({} as any, {} as any);

        expect(Array.isArray(result)).toBe(false);
        expect((result as any).wait).toBeUndefined();
        expect((result as any).type).toBe(`control:${name}`);
    });
});
