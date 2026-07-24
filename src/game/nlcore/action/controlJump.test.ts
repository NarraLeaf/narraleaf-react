import { describe, expect, it } from "vitest";
// Import through the public barrel (as consumers do) so the module graph initialises in the same
// order the library ships with (see camera.test.ts for why isolated imports trip static-init order).
import { Control, Menu, Scene, Story } from "@core/common/core";
import { StackModel } from "@core/action/stackModel";
import { ControlActionTypes } from "@core/action/actionTypes";
import type { ControlAction } from "@core/action/actions/controlAction";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult } from "@core/gameTypes";
import type { GameState } from "@player/gameState";

/**
 * Control.label / Control.jump — in-scene jumping.
 *
 * A `label` is an invisible marker inside a scene; a `jump` moves the play head to a same-scene
 * label without unloading/re-initializing the scene (unlike Scene.jumpTo). Labels are collected and
 * jumps resolved once at construction (Scene.constructLabels), so bad references fail the build.
 *
 * Construction is exercised against a real Story; the runtime redirect is exercised at the
 * ControlAction seam with a duck-typed gameState/liveGame (same approach as controlParallel.test.ts
 * and fastForwardTarget.test.ts), driving a real StackModel so the push/serialize paths are real.
 */

/** Build and construct a real one-scene story from an action list. */
function buildScene(actions: (string | object)[]): Scene {
    const scene = new Scene("s1");
    scene.action(actions as never);
    new Story("test").entry(scene).constructStory();
    return scene;
}

/** Walk a constructed scene's linear child chain and collect every action. */
function linearActions(scene: Scene): LogicAction.Actions[] {
    const acts: LogicAction.Actions[] = [];
    const seen = new Set<object>();
    let node: ReturnType<typeof scene.getSceneRoot>["contentNode"] | null = scene.getSceneRoot().contentNode;
    while (node && !seen.has(node)) {
        seen.add(node);
        if (node.action) acts.push(node.action);
        node = node.getChild();
    }
    return acts;
}

const findByType = (scene: Scene, type: string): ControlAction =>
    linearActions(scene).find(a => a.type === type) as ControlAction;

/** Minimal LiveGame stand-in for a StackModel that never executes a real action. */
function fakeLiveGame(): LiveGame {
    return {
        game: { config: { maxStackModelLoop: 100, app: { debug: false } } },
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
    } as unknown as LiveGame;
}

/**
 * A gameState/liveGame stand-in wrapping a real root StackModel, exposing exactly what the
 * control:jump handler reaches for. `undoPushes` records every actionHistory.push so a test can
 * assert an undo entry was registered.
 */
function fakeGameState(mainStack: StackModel) {
    const undoPushes: unknown[][] = [];
    const liveGame = {
        getStackModelForce: () => mainStack,
        clearMainStack: () => { mainStack.reset(); return liveGame; },
        constructMaps: () => [new Map(), new Map()],
    };
    const gameState = {
        getLiveGame: () => liveGame,
        getGameStateForce: () => ({ logger: { debug: () => void 0 } }),
        actionHistory: {
            push: (_meta: unknown, _undo: unknown, args: unknown[]) => {
                undoPushes.push(args);
                return { id: "h-0" };
            },
        },
    };
    return { gameState: gameState as unknown as GameState, undoPushes };
}

describe("Control.label / Control.jump — construction", () => {
    it("registers a label so the scene can resolve it by name", () => {
        const scene = buildScene([
            Control.label("intro"),
            "hello",
        ]);
        const label = scene.getLabel("intro");
        expect(label).not.toBeNull();
        expect(label!.type).toBe(ControlActionTypes.label);
        expect(scene.getLabel("missing")).toBeNull();
    });

    it("resolves a jump to its target label (including a backward jump)", () => {
        const scene = buildScene([
            Control.label("top"),
            "a",
            Control.jump("top"),
        ]);
        const jump = findByType(scene, ControlActionTypes.jump);
        expect(jump.getJumpTarget()).toBe(scene.getLabel("top"));
    });

    it("collects a label and resolves a jump nested inside a menu choice", () => {
        // The primary use case: a menu choice that jumps back to a label. constructLabels walks
        // into menu branches, so the jump inside the choice resolves at build time.
        const scene = buildScene([
            Control.label("start"),
            Menu.prompt("Again?")
                .choose("Yes", [Control.jump("start")])
                .choose("No", []),
        ]);
        expect(scene.getLabel("start")).not.toBeNull();
        // Reaching here means constructStory did not throw resolving the nested jump.
    });

    it("throws when the same label name is declared twice in one scene", () => {
        expect(() => buildScene([
            Control.label("dup"),
            "a",
            Control.label("dup"),
        ])).toThrow(/Duplicate label "dup"/);
    });

    it("throws when a jump targets a label that does not exist in the scene", () => {
        expect(() => buildScene([
            Control.jump("nowhere"),
        ])).toThrow(/Jump target label "nowhere" not found/);
    });

    it("keeps label names scene-local (same name reused across scenes is fine)", () => {
        const second = new Scene("s2").action([Control.label("shared"), "b"]);
        const first = new Scene("s1");
        // A scene jump makes `second` reachable from `first`, so it is constructed too.
        first.action([
            Control.label("shared"),
            "a",
            first.jumpTo(second),
        ] as never);
        // Both scenes define "shared"; construction must not treat that as a duplicate.
        expect(() => new Story("test").entry(first).constructStory()).not.toThrow();
        expect(first.getLabel("shared")).not.toBeNull();
        expect(second.getLabel("shared")).not.toBeNull();
    });
});

describe("Control.label — runtime (pass-through marker)", () => {
    it("advances straight to its child, doing nothing visible", () => {
        const scene = buildScene([Control.label("x"), "after"]);
        const label = findByType(scene, ControlActionTypes.label);
        const mainStack = new StackModel(fakeLiveGame(), "$root");
        const { gameState } = fakeGameState(mainStack);

        const result = label.executeAction(gameState, { stackModel: mainStack }) as CalledActionResult;
        expect(StackModel.isCalledActionResult(result)).toBe(true);
        expect(result.node).toBe(label.contentNode.getChild());
    });
});

describe("Control.jump — runtime (in-scene redirect)", () => {
    it("clears the main stack and pushes the target label node, registering an undo entry", () => {
        const scene = buildScene([
            Control.label("top"),
            "a",
            Control.jump("top"),
        ]);
        const label = findByType(scene, ControlActionTypes.label);
        const jump = findByType(scene, ControlActionTypes.jump);

        const mainStack = new StackModel(fakeLiveGame(), "$root");
        // Prime the stack with some pending work the jump is expected to wipe.
        mainStack.push({ type: "character:say", node: null } as unknown as CalledActionResult);
        const { gameState, undoPushes } = fakeGameState(mainStack);

        const result = jump.executeAction(gameState, { stackModel: mainStack });

        expect(result).toBeNull();
        expect(mainStack.isEmpty()).toBe(false);
        expect(mainStack.getTopSync()?.node).toBe(label.contentNode);
        expect(undoPushes).toHaveLength(1); // stack snapshot captured for undo
    });

    it("round-trips the post-jump stack through serialize/deserialize (save-load safe)", () => {
        const scene = buildScene([
            Control.label("top"),
            "a",
            Control.jump("top"),
        ]);
        const label = findByType(scene, ControlActionTypes.label);
        const jump = findByType(scene, ControlActionTypes.jump);

        const mainStack = new StackModel(fakeLiveGame(), "$root");
        const { gameState } = fakeGameState(mainStack);
        jump.executeAction(gameState, { stackModel: mainStack });

        // Save
        const snapshot = mainStack.serialize();
        // Load into a fresh stack using the scene's id→action map (as LiveGame.deserialize does).
        const actionMap = new Map<string, LogicAction.Actions>();
        linearActions(scene).forEach(a => actionMap.set(a.getId(), a));
        const restored = StackModel.createStackModel(fakeLiveGame(), snapshot, actionMap);

        expect(restored.getTopSync()?.node).toBe(label.contentNode);
    });
});
