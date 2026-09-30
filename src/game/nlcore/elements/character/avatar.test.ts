import { describe, expect, it } from "vitest";
// Imported through the entry: reaching into the element modules directly pulls scene -> layer in
// an order that leaves `TransformState` uninitialized (see imageAction.setAppearance.test.ts).
import { Character, Image, Sentence } from "narraleaf-react";
import { collectStaticAvatarSources } from "@core/elements/character/avatar";

describe("collectStaticAvatarSources", () => {
    it("collects the character's own avatar", () => {
        const alice = new Character("Alice").setAvatar("/avatars/alice.png");
        expect(collectStaticAvatarSources(alice)).toEqual(["/avatars/alice.png"]);
    });

    it("collects every portrait's avatar, so a differential swap is already warm", () => {
        const alice = new Character("Alice")
            .addPortrait(new Image({ src: "/sprites/neutral.png" }), { avatar: "/avatars/neutral.png" })
            .addPortrait(new Image({ src: "/sprites/angry.png" }), { avatar: "/avatars/angry.png" });

        expect(collectStaticAvatarSources(alice))
            .toEqual(["/avatars/neutral.png", "/avatars/angry.png"]);
    });

    it("collects a per-line override", () => {
        const alice = new Character("Alice").setAvatar("/avatars/alice.png");
        const sentence = new Sentence("...", { avatar: "/avatars/shocked.png" });

        expect(collectStaticAvatarSources(alice, sentence))
            .toEqual(["/avatars/shocked.png", "/avatars/alice.png"]);
    });

    it("skips a resolver, whose answers are not knowable ahead of time", () => {
        // Same limitation as a layer resolver: the answer comes from the portrait's live state.
        // A project driving avatars this way registers them with `scene.preloadImage` itself.
        const alice = new Character("Alice").setAvatar(({ tags }) => `/avatars/${tags?.[0] ?? "x"}.png`);
        expect(collectStaticAvatarSources(alice)).toEqual([]);
    });

    it("skips `false`, which asks for no avatar rather than for a missing one", () => {
        const alice = new Character("Alice", { avatar: false });
        expect(collectStaticAvatarSources(alice)).toEqual([]);
        expect(collectStaticAvatarSources(alice, new Sentence("...", { avatar: false }))).toEqual([]);
    });

    it("skips a portrait registered without an avatar", () => {
        const alice = new Character("Alice").addPortrait(new Image({ src: "/sprites/neutral.png" }));
        expect(collectStaticAvatarSources(alice)).toEqual([]);
    });

    it("survives a character built with no portraits at all", () => {
        expect(collectStaticAvatarSources(new Character("Alice"))).toEqual([]);
    });
});
