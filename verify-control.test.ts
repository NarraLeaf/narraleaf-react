import { expect, test } from "vitest";
import { Control } from "@core/elements/control";
import { Character } from "@core/elements/character";

// Regression guard for the repeat/while multi-statement body bug: the authoring path used to
// chain the body actions (BaseElement.construct), while the runtime loop (StackModel + the
// ControlAction.checkActionChain assertion) requires them unchained — so any loop body with more
// than one statement threw "Invalid action chain" at runtime. repeat/while now push unchained bodies.

test("Control.repeat multi-statement body is left unchained and passes checkActionChain", () => {
    const c = new Character("test");
    const chained = Control.repeat(3, [c.say("a"), c.say("b")]) as any;
    const action = chained.getActions()[0];
    const [body, times] = action.contentNode.getContent();

    expect(times).toBe(3);
    expect(body.length).toBeGreaterThan(1);
    // body actions must NOT be chained to each other:
    expect(!!body[0].contentNode.getChild()).toBe(false);
    // runtime assertion accepts the unchained body:
    expect(() => action.checkActionChain(body)).not.toThrow();
});

test("Control.whileLoop multi-statement body is left unchained and passes checkActionChain", () => {
    const c = new Character("test");
    const chained = Control.whileLoop(() => true, [c.say("a"), c.say("b")]) as any;
    const action = chained.getActions()[0];
    const [body] = action.contentNode.getContent();
    expect(body.length).toBeGreaterThan(1);
    expect(!!body[0].contentNode.getChild()).toBe(false);
    expect(() => action.checkActionChain(body)).not.toThrow();
});

test("Control.repeat single-statement body still works", () => {
    const c = new Character("test");
    const chained = Control.repeat(2, [c.say("only")]) as any;
    const action = chained.getActions()[0];
    const [body, times] = action.contentNode.getContent();
    expect(times).toBe(2);
    expect(body.length).toBe(1);
    expect(() => action.checkActionChain(body)).not.toThrow();
});
