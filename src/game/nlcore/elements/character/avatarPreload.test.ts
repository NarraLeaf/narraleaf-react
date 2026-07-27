import { describe, expect, it } from "vitest";
// The library entry point first: the element modules form an import cycle that only resolves when
// entered through `core` (see preloadPlan.test.ts).
import "@core/common/core";
import { Character, Image, Scene, Sentence, Story } from "narraleaf-react";
import { SrcManager } from "@core/action/srcManager";

/**
 * The image urls a scene registers for preload — the set the critical tier is built from.
 *
 * Driven through `constructStory`, which is the real path: it builds the scene roots first and
 * only then walks them for srcs. Calling `registerSrc` directly finds no `sceneRoot` and silently
 * registers nothing, which is a way to write a test that passes for the wrong reason.
 */
function registeredImages(scene: Scene): string[] {
    new Story("test").entry(scene).constructStory();
    return SrcManager.catSrc(scene.srcManager.src).image
        .map(entry => SrcManager.getSrc(entry))
        .filter((src): src is string => Boolean(src));
}

describe("Scene.registerSrc — dialog avatars", () => {
    it("registers a speaking character's avatar, so it is warm before the line shows", () => {
        const alice = new Character("Alice").setAvatar("/avatars/alice.png");
        const scene = new Scene("s");
        scene.action([alice.say("hello")]);

        // Before this branch existed no avatar reached the preloader at any level, so the first
        // line a character spoke fetched its avatar mid-dialog.
        expect(registeredImages(scene)).toContain("/avatars/alice.png");
    });

    it("registers every portrait's avatar, not just the one showing", () => {
        const alice = new Character("Alice")
            .addPortrait(new Image({ src: "/sprites/neutral.png" }), { avatar: "/avatars/neutral.png" })
            .addPortrait(new Image({ src: "/sprites/angry.png" }), { avatar: "/avatars/angry.png" });
        const scene = new Scene("s");
        scene.action([alice.say("hello")]);

        // A differential swap mid-scene must not be the moment its avatar starts downloading.
        const images = registeredImages(scene);
        expect(images).toContain("/avatars/neutral.png");
        expect(images).toContain("/avatars/angry.png");
    });

    it("registers a per-line override", () => {
        const alice = new Character("Alice");
        const scene = new Scene("s");
        scene.action([alice.say(new Sentence("...", { avatar: "/avatars/shocked.png" }))]);

        expect(registeredImages(scene)).toContain("/avatars/shocked.png");
    });

    it("leaves a resolver's avatars alone, since they cannot be enumerated", () => {
        const alice = new Character("Alice").setAvatar(({ tags }) => `/avatars/${tags?.[0] ?? "x"}.png`);
        const scene = new Scene("s");
        scene.action([alice.say("hello")]);

        // Same as a layer resolver: the answer comes from live state. Registering a guess would be
        // worse than registering nothing, so those are preloaded by hand.
        expect(registeredImages(scene)).toEqual([]);
    });
});
