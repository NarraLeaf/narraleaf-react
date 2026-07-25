import { describe, expect, it } from "vitest";
import { StackModel } from "@core/action/stackModel";
import { LiveGame } from "@core/common/game";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * WI-3: read-only introspection for Studio tooling.
 *  ① current-action-id stream — LiveGame.onCurrentActionChange / getCurrentActionId (play head).
 *  ② StackModel.snapshot() + LiveGame.getStackSnapshot() — call-stack view.
 * Both are experimental / read-only and must never mutate runtime state.
 */

function fakeLiveGame(): LiveGame {
    return {
        game: { config: { maxStackModelLoop: 100, app: { debug: false } } },
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
    } as unknown as LiveGame;
}

const pendingAction = (id: string, type = "character:say"): CalledActionResult =>
    ({ type, node: { action: { getId: () => id, type } }, wait: null } as unknown as CalledActionResult);

function branch(item: CalledActionResult): StackModel {
    const s = new StackModel(fakeLiveGame());
    s.push(item);
    return s;
}

function waitLink(type: "all" | "any", branches: StackModel[], ctrlId: string): CalledActionResult {
    return {
        type: `control:${type}`,
        node: { action: { getId: () => ctrlId, type: `control:${type}` } },
        wait: { type, stackModels: branches },
    } as unknown as CalledActionResult;
}

describe("StackModel.snapshot (WI-3 ②)", () => {
    it("is empty for an empty stack", () => {
        expect(new StackModel(fakeLiveGame()).snapshot()).toEqual({ frames: [] });
    });

    it("lists frames top-first with nested parallel branches", () => {
        const parent = new StackModel(fakeLiveGame());
        parent.push(pendingAction("bottom"));
        parent.push(waitLink("all", [branch(pendingAction("bA")), branch(pendingAction("bB"))], "ctrl"));

        const snap = parent.snapshot();

        // top of stack first
        expect(snap.frames.map(f => f.actionId)).toEqual(["ctrl", "bottom"]);
        expect(snap.frames[0].branchWaitType).toBe("all");
        expect(snap.frames[0].branches).toHaveLength(2);
        expect(snap.frames[0].branches?.[0][0].actionId).toBe("bA");
        expect(snap.frames[0].branches?.[1][0].actionId).toBe("bB");
        // leaf frames carry no branches
        expect(snap.frames[1].branches).toBeUndefined();
    });

    it("surfaces loop configuration", () => {
        const loop = StackModel.createCountLoop(fakeLiveGame(), 3, []);
        expect(loop.snapshot().loop).toEqual({ type: "count", counter: 0, limit: 3, broken: false });
    });

    it("does not mutate the stack it describes", () => {
        const s = new StackModel(fakeLiveGame());
        s.push(pendingAction("x"));
        s.snapshot();
        expect(s.peekTopActionId()).toBe("x");
        expect(s.isEmpty()).toBe(false);
    });
});

describe("LiveGame current-action stream (WI-3 ①)", () => {
    function partialLiveGame(): any {
        const handlers: Array<(p: unknown) => void> = [];
        const lg: any = Object.create(LiveGame.prototype);
        lg.stackModel = {}; // truthy so executeAction does not bail
        lg._currentActionId = null;
        lg.events = {
            on: (_type: string, cb: (p: unknown) => void) => {
                handlers.push(cb);
                return { cancel: () => void 0 };
            },
            emit: (_type: string, payload: unknown) => handlers.forEach(h => h(payload)),
            hasListeners: () => handlers.length > 0,
        };
        return lg;
    }

    const fakeAction = (id: string, type = "character:say"): any =>
        ({ getId: () => id, type, executeAction: () => ({ type, node: null }) });

    it("emits {actionId, actionType} and updates getCurrentActionId as actions run", () => {
        const lg = partialLiveGame();
        const seen: unknown[] = [];
        lg.onCurrentActionChange((p: unknown) => seen.push(p));

        lg.executeAction({}, fakeAction("a1"), {});
        expect(seen).toEqual([{ actionId: "a1", actionType: "character:say" }]);
        expect(lg.getCurrentActionId()).toBe("a1");

        lg.executeAction({}, fakeAction("a2", "control:all"), {});
        expect(lg.getCurrentActionId()).toBe("a2");
        expect(seen).toHaveLength(2);
    });

    it("cancelling the token is honored by the dispatcher contract", () => {
        const lg = partialLiveGame();
        const token = lg.onCurrentActionChange(() => void 0);
        expect(typeof token.cancel).toBe("function");
    });

    it("updates getCurrentActionId even with no subscriber (payload build is skipped, not the id)", () => {
        // WI-0 nit: the per-action payload is only allocated when someone is listening, but the
        // pull-based play head must still track the current id for a later getCurrentActionId().
        const lg = partialLiveGame();
        let emitted = 0;
        const realEmit = lg.events.emit;
        lg.events.emit = (...args: unknown[]) => { emitted++; return realEmit(...args); };

        lg.executeAction({}, fakeAction("solo"), {});
        expect(lg.getCurrentActionId()).toBe("solo");
        expect(emitted).toBe(0); // no listeners → no emit / no payload allocation
    });
});

describe("LiveGame.getStackSnapshot (WI-3 ②)", () => {
    it("returns the root stack plus in-flight async stacks", () => {
        const lg: any = Object.create(LiveGame.prototype);
        const root = new StackModel(fakeLiveGame());
        root.push(pendingAction("top"));
        const asyncStack = new StackModel(fakeLiveGame());
        asyncStack.push(pendingAction("bg"));
        lg.stackModel = root;
        lg.asyncStackModels = new Set([asyncStack]);

        const snap = lg.getStackSnapshot();
        expect(snap.root.frames[0].actionId).toBe("top");
        expect(snap.async).toHaveLength(1);
        expect(snap.async[0].frames[0].actionId).toBe("bg");
    });

    it("is empty before the game starts", () => {
        const lg: any = Object.create(LiveGame.prototype);
        lg.stackModel = null;
        expect(lg.getStackSnapshot()).toEqual({ root: { frames: [] }, async: [] });
    });
});
