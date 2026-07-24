import { describe, expect, it, vi } from "vitest";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";
import { ActionHistoryManager } from "./actionHistory";
import { LiveGame } from "@core/game/liveGame";
import { Control } from "@core/elements/control";
import { Character } from "@core/elements/character";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * Regression guard for an *implicit* contract that undo correctness rests on.
 *
 * `Control.allAsync([a, b])` forks one StackModel per body action, and each fork runs
 * synchronously up to its first await (StackModel.execute → roll → rollNext). So by the
 * time `executeAction` returns and the parent stack advances to the action that FOLLOWS
 * the allAsync (typically a blocking `character.say`), every fork's leaf action has
 * already executed — and therefore already been recorded in ActionHistory.
 *
 * That ordering is the whole reason undo is correct: `ActionHistoryManager.undoUntil`
 * rewinds by raw index and does NOT filter by which stack an entry came from. Because the
 * fork entries land BEFORE the say, an undo back to that say preserves the highlight this
 * line opened with and rewinds only the next line's — instead of tearing the set apart.
 *
 * `doAsync` is the cautionary opposite: it chains the body into a single stack, so only
 * the head runs synchronously and the rest land AFTER the following say. Auto-Highlight
 * (and anything else fanning parallel darken/transform out of one authored step) must use
 * allAsync; this test fails loudly if allAsync is ever quietly turned into doAsync, or if
 * the fork stops executing synchronously.
 *
 * Everything here is real — Control authoring, requestAsyncStackModel,
 * executeAsyncStackModel, StackModel.execute/roll/rollNext. Only the leaf
 * `liveGame.executeAction` is a spy, which is exactly the seam where the real code calls
 * `actionHistory.push`, so the spy's call order is the history order.
 */

/**
 * Fake LiveGame that runs the real async-stack plumbing. `executeAction` stands in for the
 * leaf action: it records the call (its position in ActionHistory) and returns a pending
 * awaitable, modelling a darken/say whose animation is still in flight.
 */
function harness() {
    const executed: unknown[] = [];
    const inFlight: Awaitable<CalledActionResult>[] = [];
    const gameStateObj = { logger: { error: () => void 0, debug: () => void 0 } };

    const liveGame = {
        game: { config: { maxStackModelLoop: 100 } },
        asyncStackModels: new Set<StackModel>(),
        gameState: gameStateObj,
        assertGameState: () => void 0, // a game is "running" for this test
        getGameStateForce: () => gameStateObj,
        requestAsyncStackModel: LiveGame.prototype.requestAsyncStackModel,
        executeAsyncStackModel: LiveGame.prototype.executeAsyncStackModel,
        executeAction: vi.fn((_state: unknown, action: unknown) => {
            executed.push(action);
            const awaitable = new Awaitable<CalledActionResult>(v => v);
            inFlight.push(awaitable);
            return awaitable;
        }),
    } as unknown as LiveGame;

    const gameState = {
        game: { getLiveGame: () => liveGame },
        timelines: { attachTimeline: (x: unknown) => x },
    } as never;

    return { liveGame, gameState, executed, inFlight };
}

/** Authoring returns a ChainedControl whose type reduces to `never`; take the action off it. */
function ctrlOf(chain: any): any {
    return chain.getActions()[0];
}

function bodyActionsOf(ctrl: any): any[] {
    return ctrl.contentNode.getContent()[0];
}

describe("Control async fork — the synchronous-execution half of the contract", () => {
    it("allAsync runs every branch synchronously before executeAction returns", () => {
        const { gameState, executed } = harness();
        const ctrl = ctrlOf(Control.allAsync([
            new Character("t").say("a"),
            new Character("t").say("b"),
        ]));
        const body = bodyActionsOf(ctrl);

        ctrl.executeAction(gameState, {} as never);

        // No await: both forks have already executed, so both are ordered before whatever
        // the parent stack runs next. If a fork were deferred, this would be empty here.
        expect(executed).toHaveLength(2);
        // ...and in body order (branch A before branch B).
        expect(executed[0]).toBe(body[0].contentNode.action);
        expect(executed[1]).toBe(body[1].contentNode.action);
    });

    it("doAsync runs only the head synchronously — the contrast that makes allAsync required", () => {
        const { gameState, executed } = harness();
        const ctrl = ctrlOf(Control.doAsync([
            new Character("t").say("a"),
            new Character("t").say("b"),
        ]));

        ctrl.executeAction(gameState, {} as never);

        // doAsync chains its body, so only the head has run synchronously; the second action
        // is parked behind the head's await and would land AFTER the following say — the
        // torn-undo failure mode allAsync avoids.
        expect(executed).toHaveLength(1);
    });
});

describe("Control async fork — the pure-index-undo half of the contract", () => {
    it("undoUntil rewinds by raw index, so fork entries before the say survive an undo to it", () => {
        const rewound: string[] = [];
        const fakeLiveGame = {
            getStackModelForce: () => ({ serialize: () => null }),
            constructMaps: () => [new Map()],
        } as unknown as LiveGame;
        const mgr = new ActionHistoryManager(100, fakeLiveGame);

        // Three entries in execution order: a fork's darken (landed before the say), the say,
        // and the next line's darken (landed after). undoUntil is stack-agnostic — only the
        // index relative to the target decides what rewinds.
        (mgr as unknown as { history: unknown[] }).history = [
            { id: "pre-say-darken", action: { type: "image:setDarkness" }, args: [], undo: () => rewound.push("pre") },
            { id: "say", action: { type: "character:say" }, args: [], undo: () => rewound.push("say") },
            { id: "next-line-darken", action: { type: "image:setDarkness" }, args: [], undo: () => rewound.push("post") },
        ];

        mgr.undoUntil("say");

        // The fork entry that preceded the say is kept; the say and everything after it rewind,
        // newest first.
        expect(rewound).toEqual(["post", "say"]);
        expect((mgr as unknown as { history: { id: string }[] }).history.map(h => h.id)).toEqual(["pre-say-darken"]);
    });
});
