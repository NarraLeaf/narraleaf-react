import { expect, test } from "vitest";
import { Control } from "@core/elements/control";
import { Character } from "@core/elements/character";

test("Control.repeat body actions are chained at authoring time, but executeAction asserts unchained", () => {
    const c = new Character("test");
    const chained = Control.repeat(3, [c.say("a"), c.say("b")]) as any;
    const action = chained.getActions()[0];
    const [body, times] = action.contentNode.getContent();

    expect(times).toBe(3);
    expect(body.length).toBeGreaterThan(1);
    // authoring path (Control.push -> BaseElement.construct) chained the body actions:
    expect(!!body[0].contentNode.getChild()).toBe(true);
    // runtime path (ControlAction.executeAction -> checkActionChain) rejects chained bodies:
    expect(() => action.checkActionChain(body)).toThrow(/Invalid action chain/);
});

test("Control.whileLoop body actions are also chained", () => {
    const c = new Character("test");
    const chained = Control.whileLoop(() => true, [c.say("a"), c.say("b")]) as any;
    const action = chained.getActions()[0];
    const [body] = action.contentNode.getContent();
    expect(!!body[0].contentNode.getChild()).toBe(true);
    expect(() => action.checkActionChain(body)).toThrow(/Invalid action chain/);
});
