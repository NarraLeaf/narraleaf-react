import { describe, expect, it } from "vitest";
import { Game } from "@core/game";
import { Preference } from "./preference";

describe("Preference", () => {
    it("copies the defaults instead of adopting them", () => {
        const defaults = { volume: 1 };
        const preference = new Preference(defaults);

        preference.setPreference("volume", 0.2);

        expect(defaults.volume).toBe(1);
        expect(preference.getPreference("volume")).toBe(0.2);
    });
});

/**
 * Two games, two settings objects.
 *
 * `Game` hands `Preference` the module-level `Game.DefaultPreference`, and `Preference` used to
 * keep and write into whatever it was handed. So every `Game` in the process shared one object: a
 * second game opened with the first player's volume, and moving a slider permanently rewrote the
 * framework's own defaults.
 */
describe("Game preferences", () => {
    it("does not share preference state between games", () => {
        const first = new Game({});
        const second = new Game({});

        first.preference.setPreference("bgmVolume", 0.1);

        expect(second.preference.getPreference("bgmVolume")).toBe(1);
        expect(Game.DefaultPreference.bgmVolume).toBe(1);
    });

    it("leaves the static defaults intact for a game created afterwards", () => {
        const first = new Game({});
        first.preference.setPreference("voiceVolume", 0);

        const later = new Game({});

        expect(later.preference.getPreference("voiceVolume")).toBe(1);
    });
});
