import { describe, expect, it, vi } from "vitest";
import { Scene } from "@core/elements/scene";
import { Sound, SoundType } from "@core/elements/sound";
import {
    acceptsAudioBus,
    AudioBusError,
    AudioBusMixer,
    AudioBusTree,
    DefaultAudioBusIds,
    MaxAudioBusDepth,
} from "./audioBus";

/** Resolving through a mixer is what publishes the tree the story-time checks read. */
function publish(declarations: Parameters<typeof AudioBusTree.resolve>[0]): AudioBusTree {
    return new AudioBusMixer(() => declarations ?? []).getTree();
}

describe("AudioBusTree", () => {
    it("seeds bgm, sound and voice even when nothing is declared", () => {
        const tree = AudioBusTree.resolve();

        expect(tree.getNodes().map(node => node.id).sort()).toEqual(["bgm", "sound", "voice"]);
        tree.getNodes().forEach(node => {
            expect(node.parentId).toBeNull();
            expect(node.depth).toBe(1);
        });
    });

    it("keeps the seeded ids identical to SoundType", () => {
        // Every save ever written and every story ever compiled names these three strings. The two
        // lists are declared in different modules; this is the assertion that they cannot drift.
        expect(Object.values(DefaultAudioBusIds).sort()).toEqual(Object.values(SoundType).sort());
    });

    it("hands every bus out after its parent, however it was declared", () => {
        const tree = AudioBusTree.resolve([
            { id: "alice", parentId: "cast" },
            { id: "cast", parentId: "voice" },
        ]);

        const order = tree.getNodes().map(node => node.id);
        expect(order.indexOf("voice")).toBeLessThan(order.indexOf("cast"));
        expect(order.indexOf("cast")).toBeLessThan(order.indexOf("alice"));
        expect(tree.get("alice")!.depth).toBe(3);
    });

    it("lets a declaration move a seeded bus without removing it", () => {
        const tree = AudioBusTree.resolve([
            { id: "diegetic" },
            { id: DefaultAudioBusIds.voice, parentId: "diegetic", volume: 0.5 },
        ]);

        expect(tree.get("voice")).toMatchObject({ parentId: "diegetic", volume: 0.5, depth: 2 });
        expect(tree.has("bgm")).toBe(true);
    });

    it("clamps a declared volume to what a bus can actually do", () => {
        // A bus attenuates; it never boosts.
        expect(AudioBusTree.resolve([{ id: "a", volume: 4 }]).get("a")!.volume).toBe(1);
        expect(AudioBusTree.resolve([{ id: "b", volume: -1 }]).get("b")!.volume).toBe(0);
        expect(AudioBusTree.resolve([{ id: "c", volume: NaN }]).get("c")!.volume).toBe(1);
    });

    it("rejects a parent nothing declared", () => {
        expect(() => AudioBusTree.resolve([{ id: "alice", parentId: "cast" }]))
            .toThrow(AudioBusError);
        expect(() => AudioBusTree.resolve([{ id: "alice", parentId: "cast" }]))
            .toThrow(/unknown parent "cast"/);
    });

    it("rejects a bus parented to itself", () => {
        expect(() => AudioBusTree.resolve([{ id: "a", parentId: "a" }]))
            .toThrow(/cycle/);
    });

    it("rejects a mutual pair", () => {
        expect(() => AudioBusTree.resolve([
            { id: "a", parentId: "b" },
            { id: "b", parentId: "a" },
        ])).toThrow(/cycle/);
    });

    it("rejects a longer ring", () => {
        expect(() => AudioBusTree.resolve([
            { id: "a", parentId: "c" },
            { id: "b", parentId: "a" },
            { id: "c", parentId: "b" },
        ])).toThrow(/cycle/);
    });

    it("rejects a chain deeper than the cap", () => {
        const chain = Array.from({ length: MaxAudioBusDepth + 2 }, (_, index) => ({
            id: `b${index}`,
            parentId: index === 0 ? null : `b${index - 1}`,
        }));

        expect(() => AudioBusTree.resolve(chain)).toThrow(new RegExp(`deeper than ${MaxAudioBusDepth}`));
    });

    it("rejects a duplicate id and an empty one", () => {
        expect(() => AudioBusTree.resolve([{ id: "a" }, { id: "a" }])).toThrow(/more than once/);
        expect(() => AudioBusTree.resolve([{ id: "  " }])).toThrow(/non-empty string/);
    });

    it("counts a bus as being under itself", () => {
        const tree = AudioBusTree.resolve([{ id: "alice", parentId: "voice" }]);

        // The equality test this replaces said exactly this, and content depends on it.
        expect(tree.isUnder("voice", "voice")).toBe(true);
        expect(tree.isUnder("alice", "voice")).toBe(true);
        expect(tree.isUnder("alice", "bgm")).toBe(false);
        expect(tree.isUnder("nope", "voice")).toBe(false);
    });
});

describe("acceptsAudioBus", () => {
    it("accepts a bus id nothing has declared", () => {
        publish([]);

        // Scenes are usually constructed before the host constructs its Game, so a valid custom bus
        // is routinely not yet declared when this runs. Rejecting would fail story compile for
        // correct games depending on module evaluation order.
        expect(acceptsAudioBus("alice", [DefaultAudioBusIds.voice])).toBe(true);
    });

    it("still catches a known bus in the wrong slot", () => {
        publish([]);

        // The one thing the check is actually for, and the seeded three are known from the moment
        // the module loads - so this works in every possible ordering.
        expect(acceptsAudioBus(DefaultAudioBusIds.bgm, [DefaultAudioBusIds.voice, DefaultAudioBusIds.sound]))
            .toBe(false);
    });

    it("accepts a declared descendant", () => {
        publish([{ id: "cast", parentId: "voice" }, { id: "alice", parentId: "cast" }]);

        expect(acceptsAudioBus("alice", [DefaultAudioBusIds.voice])).toBe(true);
        expect(acceptsAudioBus("alice", [DefaultAudioBusIds.bgm])).toBe(false);
    });
});

/**
 * The two checks that `throw` at story-build time. A voice on a per-character bus failing here is
 * what blocked the whole feature.
 */
describe("scene bus validation", () => {
    it("accepts a voice on a bus beneath voice", () => {
        publish([{ id: "alice", parentId: "voice" }]);

        expect(() => Scene.validateVoice(Sound.voice({ src: "alice-01.mp3", type: "alice" })))
            .not.toThrow();
    });

    it("still refuses music in a voice slot", () => {
        publish([{ id: "alice", parentId: "voice" }]);

        expect(() => Scene.validateVoice(Sound.bgm("theme.mp3"))).toThrow();
    });

    it("accepts scene background music on a bus beneath bgm", () => {
        publish([{ id: "ambience", parentId: "bgm" }]);

        expect(() => new Scene("s", {
            backgroundMusic: Sound.bgm({ src: "rain.mp3", type: "ambience" }),
        })).not.toThrow();
    });

    it("still refuses a voice clip in the background-music slot", () => {
        publish([{ id: "ambience", parentId: "bgm" }]);

        expect(() => new Scene("s", { backgroundMusic: Sound.voice("line.mp3") })).toThrow();
    });
});

describe("AudioBusMixer", () => {
    it("keeps the author's mix and the player's control as two separate numbers", () => {
        const mixer = new AudioBusMixer(() => [{ id: "alice", parentId: "voice", volume: 0.4 }]);

        // Untouched by the player reads 1, whatever the author declared - that is what makes a
        // slider bound to it sit at maximum on a fresh install, and what makes the persisted value
        // mean "what the player did".
        expect(mixer.getVolume("alice")).toBe(1);
        expect(mixer.getDeclaredVolume("alice")).toBe(0.4);
        expect(mixer.getEffectiveVolume("alice")).toBeCloseTo(0.4);

        mixer.setVolume("alice", 0.5);
        expect(mixer.getDeclaredVolume("alice")).toBe(0.4);
        expect(mixer.getEffectiveVolume("alice")).toBeCloseTo(0.2);

        expect(mixer.getVolume("nope")).toBe(1);
        expect(mixer.getEffectiveVolume("nope")).toBe(1);
    });

    it("accepts a volume for a bus the tree does not have yet", () => {
        // A host restoring saved settings does not know, and should not have to know, whether the
        // tree has been resolved.
        const mixer = new AudioBusMixer(() => [{ id: "alice", parentId: "voice" }]);
        mixer.setVolumes({ alice: 0.2, ghost: 0.3 });

        expect(mixer.getVolume("alice")).toBe(0.2);
        expect(mixer.getVolume("ghost")).toBe(0.3);
    });

    it("announces every change", () => {
        const mixer = new AudioBusMixer(() => []);
        const seen = vi.fn();
        mixer.onVolumeChange(seen);

        mixer.setVolume("bgm", 0.5);

        // The player's value and what actually reaches the gain node, so a listener can drive
        // either a slider or the graph without doing the multiplication itself.
        expect(seen).toHaveBeenCalledWith("bgm", 0.5, 0.5);
    });

    it("persists the player's half only, so a later re-mix still reaches the player", () => {
        const shipped = new AudioBusMixer(() => [{ id: "alice", parentId: "voice", volume: 0.8 }]);
        shipped.setVolume("alice", 0.5);

        const persisted = shipped.getVolumes();
        expect(persisted.alice).toBe(0.5);

        // The author re-mixes and ships an update; the returning player's saved settings must not
        // pin the old mix. A single conflated number cannot express this.
        const remixed = new AudioBusMixer(() => [{ id: "alice", parentId: "voice", volume: 0.4 }]);
        remixed.setVolumes(persisted);

        expect(remixed.list()).toContainEqual({
            id: "alice", parentId: "voice", volume: 0.5, declaredVolume: 0.4, effectiveVolume: 0.2,
        });
    });

    it("re-reads the declaration after it is invalidated, keeping volumes", () => {
        let declarations = [{ id: "alice", parentId: "voice" }];
        const mixer = new AudioBusMixer(() => declarations);
        mixer.setVolume("alice", 0.3);
        expect(mixer.getTree().has("bob")).toBe(false);

        declarations = [{ id: "alice", parentId: "voice" }, { id: "bob", parentId: "voice" }];
        mixer.invalidate();

        expect(mixer.getTree().has("bob")).toBe(true);
        expect(mixer.getVolume("alice")).toBe(0.3);
    });
});
