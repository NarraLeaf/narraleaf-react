import {describe, expect, it} from "vitest";
import {Align, Coord2D, PositionUtils} from "./position";
import {Image} from "@core/elements/displayable/image";

/**
 * Zero is a position, not an absent one.
 *
 * Both guards this file covers read a component with `!value`, which is true for the left edge and
 * the bottom edge as much as it is for "nothing was stated". The visible symptom was a displayable
 * placed at `yalign: 0` disappearing: the alignment became Unknown, `calc` answered `auto`, and an
 * absolutely positioned element with neither `top` nor `bottom` falls back to its static position -
 * which, for a stage-wide sprite, is off the stage.
 */
describe("a zero component survives to CSS", () => {
    const design = {width: 1920, height: 1080};

    it("keeps a zero alignment when an align position becomes a coordinate", () => {
        const coord = Coord2D.fromAlignPosition({xalign: 0, yalign: 0});
        expect(coord.x).toBe("0%");
        expect(coord.y).toBe("0%");
    });

    it("still reads an absent alignment as Unknown, which is what merging leaves alone", () => {
        const coord = Coord2D.fromAlignPosition({xalign: 0.25});
        expect(coord.x).toBe("25%");
        expect(PositionUtils.isUnknown(coord.y)).toBe(true);
    });

    it("places a zero alignment on the edge rather than dropping the axis", () => {
        const css = PositionUtils.D2PositionToCSS(new Align({xalign: 0.5, yalign: 0}).toCSS(), false, true, design);
        expect(css).toMatchObject({left: "50%", bottom: "0%"});
    });

    it("resolves a zero pixel coordinate to a length", () => {
        expect(PositionUtils.calc(0, undefined, 1080)).toBe("0%");
        expect(PositionUtils.calc(0)).toBe("calc(0px + 0px)");
    });

    it("still resolves an absent component to auto", () => {
        expect(PositionUtils.calc(PositionUtils.Unknown as never, undefined, 1080)).toBe("auto");
    });

    it("carries a zero alignment from a displayable's constructor config to its CSS", () => {
        const image = new Image({src: "portrait.png", position: {xalign: 0.5, yalign: 0}});
        const position = PositionUtils.toCoord2D(image.transformState.get().position);
        expect(PositionUtils.D2PositionToCSS(position.toCSS(), false, true, design))
            .toMatchObject({left: "50%", bottom: "0%"});
    });

    it("places a negative alignment below the stage, which is how a tall sprite is framed", () => {
        const css = PositionUtils.D2PositionToCSS(new Align({xalign: 0.5, yalign: -0.4}).toCSS(), false, true, design);
        expect(css).toMatchObject({bottom: "-40%"});
    });
});
