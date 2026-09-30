import { describe, expect, it } from "vitest";
import { Character } from "@core/elements/character";
import { Control } from "@core/elements/control";
import { Menu } from "@core/elements/menu";
import { Scene } from "@core/elements/scene";
import { Dissolve } from "@core/elements/transition/transitions/image/dissolve";

/**
 * `setBackground` has to hand back an action, not a chain wrapping one.
 *
 * A menu branch links its statements together by reading `contentNode` off each of them, so a
 * statement that is still a chain has nothing to link and the story fails to build. That only
 * showed when a branch carried a background change and then kept going, which is why it survived
 * as long as it did: a branch whose last statement is the background change never links past it.
 */
describe("Scene.setBackground", () => {
    it("yields actions rather than a chain", () => {
        const scene = new Scene("scene", { background: "#000000" });
        const actions = scene
            .setBackground("background.png", new Dissolve({ duration: 500 }))
            .getActions();

        expect(actions).toHaveLength(1);
        expect(actions[0].contentNode).toBeDefined();
    });

    it("can be followed by another statement inside a menu branch", () => {
        const scene = new Scene("scene", { background: "#000000" });
        const character = new Character("Character");

        expect(() => scene.action([
            Control.label("menu"),
            Menu.prompt("Choose").choose("Change the background", [
                scene.setBackground("background.png", new Dissolve({ duration: 500 })),
                character.say("The background changed."),
                Control.jump("menu"),
            ]),
        ])).not.toThrow();
    });

    it("can appear twice in one menu branch", () => {
        const scene = new Scene("scene", { background: "#000000" });
        const character = new Character("Character");

        expect(() => scene.action([
            Control.label("menu"),
            Menu.prompt("Choose").choose("There and back", [
                scene.setBackground("other.png", new Dissolve({ duration: 500 })),
                character.say("Away."),
                scene.setBackground("background.png", new Dissolve({ duration: 500 })),
                Control.jump("menu"),
            ]),
        ])).not.toThrow();
    });
});
