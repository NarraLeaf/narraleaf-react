import { describe, expect, it } from "vitest";
import { Character } from "@core/elements/character";
import { Scene } from "@core/elements/scene";
import { Story } from "@core/elements/story";
import { Menu } from "@core/elements/menu";
import { Control } from "@core/elements/control";
import { Condition } from "@core/elements/condition";
import { ContentNode } from "@core/action/tree/actionTree";
import { Chained } from "@core/action/chain";
import type { LogicAction } from "@core/action/logicAction";
import type { MenuAction } from "@core/action/actions/menuAction";

/**
 * A list of statements takes a plain string anywhere in it as a line of narration, and the
 * README's first example writes character lines, narration and a menu side by side in one list.
 * The runtime always read a list one statement at a time, but the type said a list was all actions
 * or all strings, so that example did not compile.
 *
 * The lists below are written inline, straight into each public call, on purpose: the type check
 * over this file is half of what it pins, so no list is ever cast.
 */
describe("a list of statements", () => {
    const john = new Character("John Smith");

    // A line's callee is the character itself, not the callable proxy `new Character()` hands the
    // script, so it is told apart by name. The narrator is the one character without one.
    function read(actions: LogicAction.Actions[]): string[] {
        return actions.map(action => {
            if (action.type === "character:say") {
                const who = (action.callee as Character).state.name || "narration";
                return `${who}: ${String(action.contentNode.getContent())}`;
            }
            return action.type;
        });
    }

    it("mixes narration and actions in a scene", () => {
        const scene = new Scene("scene");
        scene.action([
            john`Hello, world!`,
            "By the way, the documentation is on the website.",
            Menu.prompt("Start the journey").choose("Yes", [john`Great!`]),
            john.say("Goodbye."),
        ]);
        new Story("story").entry(scene).constructStory();

        const actions: LogicAction.Actions[] = [];
        ContentNode.forEachChild(scene.getSceneRoot().contentNode, node => {
            if (node.action && (node.action.type === "character:say" || node.action.type === "menu:action")) {
                actions.push(node.action);
            }
        });

        expect(read(actions)).toEqual([
            "John Smith: Hello, world!",
            "narration: By the way, the documentation is on the website.",
            "menu:action",
            "John Smith: Goodbye.",
        ]);
    });

    it("mixes narration and actions in a menu choice", () => {
        const menu = Menu.prompt("Start the journey")
            .choose("Yes", [john`Great!`, "The journey begins."]);

        // A menu builds its action when the chain is read, not when a choice is added.
        const [menuAction] = Chained.toActions([menu]) as MenuAction[];
        const [choice] = menuAction.contentNode.getContent().choices;

        expect(read(choice.action)).toEqual([
            "John Smith: Great!",
            "narration: The journey begins.",
        ]);
    });

    it("mixes narration and actions in a control block", () => {
        // Only the result is cast. Inside the source a chained `Control` reads as `never` - its
        // private `push` meets the chain's own - which the published declarations do not share.
        const block = Control.do(["It is quiet.", john`Too quiet.`]) as any;

        const [body] = block.getActions()[0].contentNode.getContent();

        expect(read(body)).toEqual([
            "narration: It is quiet.",
            "John Smith: Too quiet.",
        ]);
    });

    it("mixes narration and actions in a condition branch", () => {
        const condition = Condition.If(() => true, [john`Yes.`, "He nods."]);

        const branch = condition.getActions()[0].contentNode.getContent().If.action;

        expect(read(branch)).toEqual([
            "John Smith: Yes.",
            "narration: He nods.",
        ]);
    });

    it("still takes a list of nothing but strings", () => {
        const block = Control.do(["One.", "Two."]) as any;

        const [body] = block.getActions()[0].contentNode.getContent();

        expect(read(body)).toEqual(["narration: One.", "narration: Two."]);
    });
});
