import { describe, expect, it } from "vitest";
// Through the public barrel, as consumers import it (see camera.test.ts on static-init order).
import { Character, DevTools, Scene, Story } from "@core/common/core";
import type { LogicAction } from "@core/action/logicAction";

/**
 * A scene the host named names the actions it builds for itself.
 *
 * The root and the steps that put a scene on the stage are built during construction, where no host
 * can reach them, so before this they were numbered by their place in a walk of the whole story. A
 * save can be taken while one of them waits, and a number resumes on whatever holds it today - a line
 * written ahead, or a different scene to start from, and it is some other action.
 */

type Built = { story: Story; ids: string[]; byType: Map<string, string[]> };

/**
 * Two scenes, the first jumping to the second, each with a line - and, optionally, a line written
 * ahead in the first scene. `named` gives both scenes static ids.
 */
function build({ named, lineAhead = false, entry = "a" }: { named: boolean; lineAhead?: boolean; entry?: "a" | "b" }): Built {
    const alice = new Character("Alice");
    const a = new Scene("a");
    const b = new Scene("b");
    if (named) {
        DevTools.setElementStaticId(a, "host:scene:a");
        DevTools.setElementStaticId(b, "host:scene:b");
    }
    a.action([
        ...(lineAhead ? [alice.say("written ahead")] : []),
        alice.say("in a"),
        a.jumpTo(b),
    ] as never);
    b.action([alice.say("in b")] as never);
    const story = new Story("test").entry(entry === "a" ? a : b);
    story.constructStory();
    const actions = (story.entryScene as Scene).getAllChildren(story, (story.entryScene as Scene).getSceneRoot(), { allowFutureScene: true }) as LogicAction.Actions[];
    const byType = new Map<string, string[]>();
    actions.forEach(action => {
        byType.set(action.type, [...(byType.get(action.type) ?? []), action.getId()]);
    });
    return { story, ids: actions.map(action => action.getId()), byType };
}

describe("actions a scene builds for itself", () => {
    it("are named after the scene when the host named the scene", () => {
        const { byType } = build({ named: true });
        expect(byType.get("scene:action")).toEqual(["host:scene:a:root", "host:scene:b:root"]);
        // The scene's own step, and one per built-in layer and the background, all after the scene.
        const inits = byType.get("scene:init") ?? [];
        expect(inits).toContain("host:scene:a:root:scene:init:self");
        expect(inits).toContain("host:scene:b:root:scene:init:self");
    });

    it("keep their names when a line is written ahead of them", () => {
        const before = build({ named: true });
        const after = build({ named: true, lineAhead: true });
        const builtBefore = before.ids.filter(id => id.startsWith("host:"));
        const builtAfter = after.ids.filter(id => id.startsWith("host:"));
        expect(builtBefore.length).toBeGreaterThan(0);
        expect(builtAfter).toEqual(builtBefore);
    });

    it("keep their names when the story starts from another scene", () => {
        const fromA = build({ named: true, entry: "a" });
        const fromB = build({ named: true, entry: "b" });
        const ofB = fromB.ids.filter(id => id.startsWith("host:scene:b:"));
        expect(ofB.length).toBeGreaterThan(0);
        for (const id of ofB) {
            expect(fromA.ids).toContain(id);
        }
    });

    it("are numbered exactly as before when the scenes are not named", () => {
        const { ids } = build({ named: false });
        expect(ids.every(id => /^a-\d+$/.test(id))).toBe(true);
        expect(ids).toEqual(ids.map((_, index) => `a-${index}`));
    });

    it("move no other action's number when they are named", () => {
        // The jump's own steps are not built by a scene, so they stay numbered - and keep the numbers
        // they had with the scenes unnamed.
        const unnamed = build({ named: false });
        const named = build({ named: true });
        const positional = (built: Built) => built.ids.flatMap((id, index) => (/^a-\d+$/.test(id) ? [[index, id]] : []));
        const namedPositional = positional(named);
        expect(namedPositional.length).toBeGreaterThan(0);
        for (const [index, id] of namedPositional) {
            expect(unnamed.ids[index as number]).toBe(id);
        }
    });

    it("never collide with a name the host already gave", () => {
        const alice = new Character("Alice");
        const a = new Scene("a");
        DevTools.setElementStaticId(a, "host:scene:a");
        const line = alice.say("hello");
        const actions = (line as unknown as { getActions(): LogicAction.Actions[] }).getActions();
        DevTools.setStaticId(actions[0], "host:scene:a:root");
        a.action([line] as never);
        const story = new Story("test").entry(a);
        expect(() => story.constructStory()).not.toThrow();
        const root = a.getSceneRoot();
        expect(root.getId()).toMatch(/^a-\d+$/);
        expect(actions[0].getId()).toBe("host:scene:a:root");
    });
});
