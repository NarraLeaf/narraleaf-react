import { describe, expect, it } from "vitest";
import { RuntimeScriptError } from "@core/common/Utils";
import { Action } from "@core/action/action";
import { ContentNode } from "@core/action/tree/actionTree";
// Imported through the public barrel (as consumers do) so the module graph initialises in the
// order the library ships with.
import { Vfx } from "@core/common/core";

const SENTENCE =
    "Cannot call scene corridor: it is already on stage."
    + "\nA returnable jump suspends the scene it leaves rather than unloading it, so a scene"
    + " cannot be called from itself or from anything it has called.";

/**
 * A stand-in for the action a throw site names. A bare {@link Action} is enough: the error only
 * ever reads the id, the type and the construction stack.
 */
function anAction(id = "a-65", type = "scene:preSuspend"): Action {
    const action = new Action(null as never, type, new ContentNode());
    action.setId(id);
    return action;
}

describe("RuntimeScriptError", () => {
    describe("the author-facing sentence", () => {
        it("keeps message to the sentence, with nothing appended", () => {
            const action = anAction();
            const error = new RuntimeScriptError(SENTENCE, action);

            expect(error.message).toBe(SENTENCE);
            expect(error.message).not.toContain("Action:");
            expect(error.message).not.toContain("At:");
            expect(error.message).not.toContain(action.__stack);
        });

        it("joins an array of message parts without separators, as it always has", () => {
            const error = new RuntimeScriptError(["one ", "sentence"], anAction());

            expect(error.message).toBe("one sentence");
        });
    });

    describe("the offending action, as fields", () => {
        it("carries the action's id and type", () => {
            const error = new RuntimeScriptError(SENTENCE, anAction("a-65", "scene:preSuspend"));

            expect(error.action).toEqual({ id: "a-65", type: "scene:preSuspend" });
        });

        it("carries the action's construction stack in a field of its own", () => {
            const action = anAction();
            const error = new RuntimeScriptError(SENTENCE, action);

            expect(error.actionStack).toBe(action.__stack);
            expect(error.actionStack).toBeTruthy();
        });
    });

    describe("the composed form", () => {
        it("still reads exactly as the message used to", () => {
            const action = anAction();
            const error = new RuntimeScriptError(SENTENCE, action);

            expect(error.composedMessage).toBe(
                SENTENCE
                + `\nAction: (id: ${action.getId()}) ${action.type}`
                + `\nAt: ${action.__stack}`
            );
        });

        it("is what the error prints as, so a host that logs the object loses nothing", () => {
            const action = anAction();
            const error = new RuntimeScriptError(SENTENCE, action);

            // `console.error(err)` prints `err.stack`, so the detail taken out of `message` has to
            // still be reachable there.
            expect(error.stack).toContain(SENTENCE);
            expect(error.stack).toContain(`(id: ${action.getId()}) ${action.type}`);
            expect(error.stack).toContain(action.__stack);
        });

        it("uses one spelling of the tail, whichever door the trace came through", () => {
            const action = anAction();
            const composed = new RuntimeScriptError(SENTENCE, action).composedMessage;

            // `getActionTrace` used to spell this "Using action (id: X) / at:" while the scene
            // action sites spelled it "Action: (id: X) type / At:". A host could not tell which it
            // was looking at, so there is now only one.
            expect(composed).toBe(SENTENCE + RuntimeScriptError.getActionTrace(action));
            expect(RuntimeScriptError.toMessage(SENTENCE, action)).toBe(composed);
        });
    });

    describe("a throw site with no action to name", () => {
        it("leaves the action fields absent and the message clean", () => {
            let error: RuntimeScriptError | null = null;
            try {
                new Vfx({} as never);
            } catch (thrown) {
                error = thrown as RuntimeScriptError;
            }

            expect(error).toBeInstanceOf(RuntimeScriptError);
            expect(error!.message).toBe("Vfx must have a src");
            expect(error!.action).toBeUndefined();
            expect(error!.actionStack).toBeUndefined();
            expect(error!.composedMessage).toBe(error!.message);
        });
    });
});
