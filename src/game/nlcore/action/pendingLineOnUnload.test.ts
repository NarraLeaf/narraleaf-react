import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Character, Control, Game, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * A line of dialogue that is still waiting for a click when its scene leaves the stage.
 *
 * A pending line lives as a `Clickable` in the scene's own stage entry, and the click callback in it
 * is the only thing that settles the action waiting on it. Taking the entry away used to drop the
 * line with it: nothing rendered it any more, so no click could reach it, and whatever was waiting
 * waited for ever.
 *
 * On the main stack that is invisible, because every path that unloads a scene also clears the stack
 * it would have blocked. A concurrent branch has a stack of its own, and `Control.all` waits for
 * every branch - so one line left behind by a returning scene call stopped the story dead, with no
 * error and every click inert. `Control.any` hides the same thing, because it settles on the first
 * branch to drain and never looks at the one that cannot.
 *
 * The stories below are the shortest shape that gets there: a branch whose line is created while the
 * called scene is on stage, and is still unclicked when the call returns.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    log: string[];
};

function tick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function harness(log: string[], entry: Scene): Harness {
    const game = new Game({ app: { debug: false } });
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    const story = new Story("t").entry(entry);
    story.constructStory();

    const liveGame = game.getLiveGame();
    liveGame.setGameState(state);
    liveGame.loadStory(story);

    const [, elements] = (liveGame as unknown as {
        constructMaps: () => [Map<string, LogicAction.Actions>, Map<string, LogicAction.GameElement>];
    }).constructMaps();
    elements.forEach(element => {
        if (state.isStateMounted(element as never)) {
            return;
        }
        state.mountState(element as never, {
            initDisplayable: (onMounted: VoidFunction) => onMounted(),
            setBackgroundMusic: async (music: Sound | null) => {
                (element as unknown as Scene).state.backgroundMusic = music;
            },
            applyTransform: () => Awaitable.resolve<void>(undefined),
            updateStyleSync: () => void 0,
        } as never);
    });
    return { game, state, liveGame, log };
}

/**
 * A click on the stage, as the player component delivers it: `event:state.player.stageClick` is a
 * broadcast, and every scene on the stage renders its own dialog box and listens for it - so a click
 * reaches every line pending anywhere, not only the one the story is "in".
 */
function stageClick(h: Harness): number {
    let clicked = 0;
    for (const element of h.state.getSceneElements()) {
        // Copied: the click callback splices the entry out of the array being walked.
        for (const text of [...element.texts]) {
            (text as unknown as { onClick: () => void }).onClick();
            clicked++;
        }
    }
    return clicked;
}

/** Roll the main stack the way `Player.tsx` does, clicking as `click` decides. */
async function drive(h: Harness, click: (h: Harness) => number, steps: number = 80): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        // `next()` also reports the game lock, which nothing here takes.
        const result = h.liveGame.next() as CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null;
        if (
            StackModel.isCalledActionResult(result)
            && result.wait
            && StackModel.isStackModelsAwaiting(result.wait.type, result.wait.stackModels)
        ) {
            const group = StackModel.executeStackModelGroup(result.wait.type, result.wait.stackModels);
            for (let j = 0; j < 40 && !group.isSettled(); j++) {
                await tick();
                click(h);
            }
            if (!group.isSettled()) {
                throw new Error(`drive: the group never completed (log: ${h.log.join(",")})`);
            }
        }
        await tick();
        click(h);
        await tick();
    }
    throw new Error(`drive: ran out of steps (log: ${h.log.join(",")})`);
}

/**
 * A player who is watching the called scene and has not clicked the line stacked behind it. What
 * happens to a line nobody clicked before its scene left is the whole question.
 */
const holdWhileCalleeIsUp = (h: Harness) => (h.state.getSceneElements().length > 1 ? 0 : stageClick(h));

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/**
 * One branch calls a scene; the other speaks once the called scene is on the stage, so its line
 * belongs to the called scene. The call then returns with that line still unclicked.
 */
function lineLeftOnTheCallee(kind: "all" | "any") {
    const log: string[] = [];
    const narrator = new Character("n");
    let openGate: () => void = () => void 0;
    const onStage = new Promise<void>(resolve => {
        openGate = resolve;
    });
    const vault = new Scene("vault");
    const corridor = new Scene("corridor");
    vault.action([
        Script.execute(() => openGate()),
        Control.sleep(30),
        mark(log, "V"),
    ] as never);
    const group = kind === "all" ? Control.all : Control.any;
    corridor.action([
        mark(log, "A1"),
        group([
            Control.do([Control.sleep(onStage), narrator.say("the other branch"), mark(log, "Q")] as never),
            Control.do([corridor.jumpTo(vault, { returnable: true })] as never),
        ]),
        mark(log, "A2"),
    ] as never);
    return { log, corridor };
}

describe("a line still pending when its scene leaves the stage", () => {
    it("does not stop a Control.all group from finishing", async () => {
        const { log, corridor } = lineLeftOnTheCallee("all");
        const h = harness(log, corridor);

        h.liveGame.newGame();
        await drive(h, holdWhileCalleeIsUp);

        // The branch that spoke carries on, and the story gets past the group.
        expect(log).toEqual(["A1", "V", "Q", "A2"]);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });

    it("leaves nothing pending on the scene that left", async () => {
        const { log, corridor } = lineLeftOnTheCallee("all");
        const h = harness(log, corridor);

        h.liveGame.newGame();
        await drive(h, holdWhileCalleeIsUp);

        expect(h.state.getSceneElements().map(element => element.scene.config.name)).toEqual(["corridor"]);
        expect(h.state.getSceneElements().flatMap(element => element.texts)).toHaveLength(0);
        expect(h.state.getSuspendedScenes()).toEqual([]);
    });

    it("does not stop a Control.any group either, where it was silent before", async () => {
        const { log, corridor } = lineLeftOnTheCallee("any");
        const h = harness(log, corridor);

        h.liveGame.newGame();
        await drive(h, holdWhileCalleeIsUp);

        expect(log).toContain("A2");
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });

    it("leaves a line alone while its own scene is still on the stage", async () => {
        // The control: nothing is unloaded, so the line waits for the player exactly as it always
        // has, and only a click advances it.
        const log: string[] = [];
        const narrator = new Character("n");
        const corridor = new Scene("corridor");
        corridor.action([mark(log, "A1"), narrator.say("a line"), mark(log, "A2")] as never);

        const h = harness(log, corridor);
        h.liveGame.newGame();
        for (let i = 0; i < 30; i++) {
            h.liveGame.next();
            await tick();
        }

        expect(log).toEqual(["A1"]);
        expect(h.state.getSceneElements().flatMap(element => element.texts)).toHaveLength(1);

        await drive(h, stageClick);
        expect(log).toEqual(["A1", "A2"]);
    });
});
