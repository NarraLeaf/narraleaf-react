import {describe, expect, it} from "vitest";
import {puppetBoxStyles} from "./puppetBox";

/**
 * A puppet's box on a stage drawn at less (or more) than the game's own size.
 *
 * The box used to be laid out at its logical size in CSS pixels whatever the stage scale, so on a
 * 1920 x 1080 game shown 1400 wide, a puppet that defaults to the stage size took a 1920 x 1080 box
 * on a 1400 x 787.5 stage: drawn 1.37 times too large and cut off at the stage's edges. An image on
 * the same stage is sized at `naturalWidth * scale`; the puppet now is too.
 */
describe("puppetBoxStyles", () => {
    const stage = {width: 1920, height: 1080};
    const scale = 1400 / 1920;

    it("lays a stage-size puppet out exactly over a scaled stage", () => {
        const {outer} = puppetBoxStyles(stage, scale);
        expect(outer).toEqual({width: "1400px", height: "787.5px"});
    });

    it("scales a puppet of its own size by the same ratio as the stage", () => {
        const {outer, host} = puppetBoxStyles({width: 900, height: 1200}, 0.5);
        expect(outer).toEqual({width: "450px", height: "600px"});
        // The backend's element keeps the logical size it was told about and is scaled onto the box,
        // so a backend that sizes its canvas from `ctx.size` fits the box as well as one that fills
        // its container.
        expect(host).toMatchObject({width: "900px", height: "1200px", transform: "scale(0.5)", transformOrigin: "0 0"});
    });

    it("draws at the logical size on a stage shown at the game's own size", () => {
        const {outer, host} = puppetBoxStyles(stage, 1);
        expect(outer).toEqual({width: "1920px", height: "1080px"});
        expect(host).toMatchObject({width: "1920px", height: "1080px", transform: "scale(1)"});
    });

    it("grows with a stage shown larger than the game", () => {
        expect(puppetBoxStyles(stage, 2560 / 1920).outer).toEqual({width: "2560px", height: "1440px"});
    });

    it("draws nothing before the stage has been measured", () => {
        for (const unknown of [0, NaN, -1, Infinity]) {
            const {outer, host} = puppetBoxStyles(stage, unknown);
            expect(outer).toEqual({width: "0px", height: "0px"});
            expect(host).toMatchObject({transform: "scale(0)"});
        }
    });
});
