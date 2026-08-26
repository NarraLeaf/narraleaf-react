import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers do - see elementSparseSave.test.ts for why an isolated
// import trips the pre-existing circular static-init order.
import { Condition, Control, Game, Menu, Scene, Script, Sound, Story } from "@core/common/core";
import { GameState } from "@player/gameState";
import { Awaitable } from "@lib/util/data";
import { StackModel } from "./stackModel";
import type { Chosen } from "@player/type";
import type { LiveGame } from "@core/common/game";
import type { LogicAction } from "@core/action/logicAction";
import type { CalledActionResult } from "@core/gameTypes";

/**
 * A concurrent or looping group written as the last statement of a block.
 *
 * `Control.all`, `Control.any`, `Control.repeat` and `Control.whileLoop` do not run their bodies on
 * the stack they were reached from. Each hands its body to `StackModel`s of its own and returns a
 * result carrying two things: the action chained after the group, and a `wait` naming those branch
 * stacks. The branch stacks are the only handle anyone holds on the bodies - nothing else knows
 * they exist - so a result dropped on its way to the stack takes the whole group with it.
 *
 * Written last in a block there is no action chained after the group, and that is the shape these
 * tests are about: the group still has to be waited on, and its bodies still have to run, when the
 * result names no action at all.
 *
 * The blocks a group can end are all covered below - a scene body, a `Control.do` body, a condition
 * branch, a menu choice, a branch of another group - along with the forms that were never at risk:
 * `Control.do` inlines its body onto the same stack, and the async forms hand theirs to
 * `LiveGame`'s async stacks before returning.
 */

type Harness = {
    game: Game;
    state: GameState;
    liveGame: LiveGame;
    /** What the bodies ran, in order. */
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

    // Stand in for the React tree - see sceneCallControlFlow.test.ts, where the same stub is
    // explained: both halves of a scene entering the stage park on a mounted component.
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
        } as never);
    });
    return { game, state, liveGame, log };
}

/**
 * Roll the main stack the way `Player.tsx` does: `LiveGame.next()`, and a result that is a
 * still-waiting concurrent group is handed to `StackModel.executeStackModelGroup`.
 *
 * A group reached any other way behaves differently - see controlLoopDriving.test.ts, which pins
 * both drivers side by side. Everything here is asserted under the driver a game actually uses.
 */
async function drivePlayer(h: Harness, steps: number = 200): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.liveGame.getStackModelForce().isEmpty()) {
            return;
        }
        // `next()` also reports the game lock, which nothing here takes.
        const result = h.liveGame.next() as CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null;
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(result)) {
            if (!result.isSettled()) {
                await tick();
                if (!result.isSettled()) {
                    throw new Error("drivePlayer: parked on an awaitable that never settled");
                }
            }
        } else if (
            StackModel.isCalledActionResult(result)
            && result.wait
            && StackModel.isStackModelsAwaiting(result.wait.type, result.wait.stackModels)
        ) {
            const group = StackModel.executeStackModelGroup(result.wait.type, result.wait.stackModels);
            for (let j = 0; j < 60 && !group.isSettled(); j++) {
                await tick();
            }
            if (!group.isSettled()) {
                throw new Error(`drivePlayer: the group never completed (log: ${h.log.join(",")})`);
            }
        }
        await tick();
    }
    throw new Error(`drivePlayer: ran out of steps (log: ${h.log.join(",")})`);
}

/** Roll until a menu is waiting for the player, the way `LiveGame.fastForward` watches for one. */
async function driveUntilMenu(h: Harness, steps: number = 200): Promise<void> {
    for (let i = 0; i < steps; i++) {
        if (h.state.hasActiveMenu()) {
            return;
        }
        if (h.liveGame.getStackModelForce().isEmpty()) {
            throw new Error(`driveUntilMenu: story ended before a menu (log: ${h.log.join(",")})`);
        }
        h.liveGame.next();
        await tick();
    }
    throw new Error(`driveUntilMenu: no menu appeared (log: ${h.log.join(",")})`);
}

/** Take the choice at `index`, as a click on the rendered option does. */
function chooseMenuOption(h: Harness, index: number): void {
    const scene = h.state.getLastScene();
    if (!scene) {
        throw new Error("chooseMenuOption: no scene on stage");
    }
    const menus = h.state.findElementByScene(scene)?.menus ?? [];
    if (!menus.length) {
        throw new Error("chooseMenuOption: no menu waiting");
    }
    const choice = menus[0].action.choices[index];
    if (!choice) {
        throw new Error(`chooseMenuOption: no choice at ${index}`);
    }
    menus[0].onClick({ ...choice, evaluated: "" } satisfies Chosen);
}

/** Wait for the async stacks a story left running to drain. */
async function settleAsync(h: Harness, steps: number = 40): Promise<void> {
    for (let i = 0; i < steps && h.liveGame.asyncStackModels.size > 0; i++) {
        await tick();
    }
}

const mark = (log: string[], name: string) => Script.execute(() => {
    log.push(name);
});

/** Run a one-scene story to the end and hand back what its bodies logged. */
async function play(build: (log: string[]) => Scene): Promise<string[]> {
    const log: string[] = [];
    const main = build(log);
    const h = harness(log, main);

    h.liveGame.newGame();
    await drivePlayer(h);
    await settleAsync(h);

    expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    expect(h.liveGame.asyncStackModels.size).toBe(0);
    return log;
}

describe("a group written as the last statement of a scene", () => {
    it("runs every branch of a trailing Control.all", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.all([mark(log, "X"), mark(log, "Y")]),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "X", "Y"]);
    });

    it("runs the branch of a trailing Control.any", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.any([mark(log, "X")]),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "X"]);
    });

    it("runs a trailing Control.repeat as many times as it was asked", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.repeat(3, [mark(log, "P")]),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "P", "P", "P"]);
    });

    it("runs a trailing Control.whileLoop until its condition goes false", async () => {
        const counter = { n: 0 };
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.whileLoop(() => counter.n < 3, [
                    Script.execute(() => {
                        counter.n++;
                        log.push(`P${counter.n}`);
                    }),
                ]),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "P1", "P2", "P3"]);
        expect(counter.n).toBe(3);
    });

    it("still runs the action chained after a group", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.all([mark(log, "X"), mark(log, "Y")]),
                mark(log, "A2"),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "X", "Y", "A2"]);
    });
});

describe("a group written as the last statement of a nested body", () => {
    it("runs inside a Control.do body", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.do([mark(log, "D1"), Control.repeat(3, [mark(log, "P")])] as never),
                mark(log, "A2"),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "D1", "P", "P", "P", "A2"]);
    });

    it("runs inside a branch of another group", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.all([
                    Control.do([Control.repeat(3, [mark(log, "P")])] as never),
                    Control.do([mark(log, "Q")] as never),
                ]),
                mark(log, "A2"),
            ] as never);
            return main;
        });

        expect(log.filter(entry => entry === "P")).toHaveLength(3);
        expect(log).toContain("Q");
        expect(log[0]).toBe("A1");
        expect(log[log.length - 1]).toBe("A2");
    });

    it("runs inside a condition branch", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Condition.If(() => true, [
                    mark(log, "C1"),
                    Control.all([mark(log, "X"), mark(log, "Y")]),
                ] as never),
                mark(log, "A2"),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "C1", "X", "Y", "A2"]);
    });

    it("runs inside a menu choice", async () => {
        const log: string[] = [];
        const main = new Scene("main");
        main.action([
            mark(log, "A1"),
            Menu.prompt("go?")
                .choose("yes", [
                    mark(log, "P1"),
                    Control.all([mark(log, "X"), mark(log, "Y")]),
                ] as never)
                .choose("no", [mark(log, "N1")] as never),
            mark(log, "A2"),
        ] as never);

        const h = harness(log, main);
        h.liveGame.newGame();
        await driveUntilMenu(h);
        chooseMenuOption(h, 0);
        await drivePlayer(h);

        expect(log).toEqual(["A1", "P1", "X", "Y", "A2"]);
        expect(h.liveGame.getStackModelForce().isEmpty()).toBe(true);
    });
});

/**
 * The forms that never depended on an action being chained after them: `Control.do` pushes its body
 * onto the stack it was reached from, and the async forms register their stacks with `LiveGame`
 * before returning. Pinned so that a change to how trailing results are kept has to leave them
 * alone.
 */
describe("the forms that run their bodies elsewhere", () => {
    it("runs a trailing Control.do body", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.do([mark(log, "D1"), mark(log, "D2")] as never),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "D1", "D2"]);
    });

    it("runs a trailing Control.doAsync body", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.doAsync([mark(log, "D1"), mark(log, "D2")] as never),
            ] as never);
            return main;
        });

        expect(log).toEqual(["A1", "D1", "D2"]);
    });

    it("runs a trailing Control.allAsync body", async () => {
        const log = await play(log => {
            const main = new Scene("main");
            main.action([
                mark(log, "A1"),
                Control.allAsync([mark(log, "X"), mark(log, "Y")]),
            ] as never);
            return main;
        });

        expect(log.slice().sort()).toEqual(["A1", "X", "Y"]);
    });
});
