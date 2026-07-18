import { describe, expect, it } from "vitest";
// Import the heavy displayable graph first so the transform module-init cycle resolves
// before the pure position/transform helpers are used (see visualEffect.test.ts).
import { Chained } from "../../src/game/nlcore/action/chain";
import { Image } from "../../src/game/nlcore/elements/displayable/image";
import { Transform } from "../../src/game/nlcore/elements/transform/transform";
import { Coord2D, PositionUtils } from "../../src/game/nlcore/elements/transform/position";

void Chained;
void Image;

// invertY mirrors the default "bottom left" stage origin, so the vertical axis resolves to `bottom`.
const gameStateWithConfig = {
    getStory() {
        return {
            getInversionConfig() {
                return { invertX: false, invertY: true };
            },
        };
    },
    game: { config: { width: 1920, height: 1080 } },
} as any;

// A game state without a resolved config (mirrors the render-agnostic unit test doubles).
const gameStateWithoutConfig = {
    getStory() {
        return {
            getInversionConfig() {
                return { invertX: false, invertY: false };
            },
        };
    },
} as any;

describe("position folding", () => {
    it("folds a pixel offset into a percentage of the design dimension", () => {
        // 50% + 192px of 1920 => 50% + 10% => 60%
        expect(PositionUtils.calc("50%", 192, 1920)).toBe("60%");
        // 50% + 108px of 1080 => 50% + 10% => 60%
        expect(PositionUtils.calc("50%", 108, 1080)).toBe("60%");
    });

    it("keeps the base percentage when there is no offset", () => {
        expect(PositionUtils.calc("50%", undefined, 1920)).toBe("50%");
        expect(PositionUtils.calc("50%", 0, 1920)).toBe("50%");
    });

    it("supports negative offsets", () => {
        // 50% - 192px of 1920 => 50% - 10% => 40%
        expect(PositionUtils.calc("50%", -192, 1920)).toBe("40%");
    });

    it("converts pixel positions into a design-relative percentage", () => {
        // 960px of 1920 => 50%
        expect(PositionUtils.calc(960, undefined, 1920)).toBe("50%");
        // 960px + 96px of 1920 => 50% + 5% => 55%
        expect(PositionUtils.calc(960, 96, 1920)).toBe("55%");
    });

    it("falls back to calc(px) when no design dimension is available", () => {
        expect(PositionUtils.calc("50%", 68)).toBe("calc(50% + 68px)");
        expect(PositionUtils.calc("50%")).toBe("calc(50% + 0px)");
    });

    it("resolves an unknown position to auto", () => {
        expect(PositionUtils.calc(PositionUtils.Unknown as any, 68, 1920)).toBe("auto");
    });

    it("preserves alignment when a raw align position also carries offsets", () => {
        // An object with xalign/yalign AND offsets must be parsed as an align position;
        // otherwise it is misread as a Coord2D and the alignment is dropped to the base.
        const coord = PositionUtils.rawPositionToCoord2D({ xalign: 0.5, yalign: 0.55, xoffset: 68, yoffset: 200 });

        // The alignment must survive as a percentage (not be dropped to Unknown/base).
        expect(PositionUtils.isUnknown(coord.x)).toBe(false);
        expect(PositionUtils.isUnknown(coord.y)).toBe(false);
        expect(parseFloat(coord.x as string)).toBeCloseTo(50, 6);
        expect(parseFloat(coord.y as string)).toBeCloseTo(55, 6);
        expect(coord.xoffset).toBe(68);
        expect(coord.yoffset).toBe(200);
    });

    it("still parses offset-only and coordinate positions as Coord2D", () => {
        const offsetOnly = PositionUtils.rawPositionToCoord2D({ xoffset: 10, yoffset: 20 });
        expect(offsetOnly.xoffset).toBe(10);
        expect(offsetOnly.yoffset).toBe(20);
        expect(PositionUtils.isUnknown(offsetOnly.x)).toBe(true);

        const coord = PositionUtils.rawPositionToCoord2D({ x: "40%", y: "60%", xoffset: 5 });
        expect(coord.x).toBe("40%");
        expect(coord.y).toBe("60%");
        expect(coord.xoffset).toBe(5);
    });

    it("folds align + offset through D2PositionToCSS with the design dimensions", () => {
        const coord = Coord2D.fromAlignPosition({ xalign: 0.5, yalign: 0.5, xoffset: 192, yoffset: 108 });
        const css = PositionUtils.D2PositionToCSS(coord.toCSS(), false, true, { width: 1920, height: 1080 });

        expect(css).toMatchObject({
            left: "60%",
            bottom: "60%",
            top: "auto",
            right: "auto",
        });
    });

    it("emits a single animatable percentage from constructStyle when a config is present", () => {
        const style = Transform.constructStyle(gameStateWithConfig, {
            position: { xalign: 0.5, yalign: 0.5, xoffset: 192, yoffset: 108 } as any,
        });

        // A single percentage (not a mixed calc()) so `motion` can interpolate the whole position.
        expect(style.left).toBe("60%");
        expect(style.bottom).toBe("60%");
    });

    it("keeps the legacy calc() form when no config is available", () => {
        const style = Transform.constructStyle(gameStateWithoutConfig, {
            position: { xalign: 0.5, yalign: 0.5, xoffset: 192, yoffset: 108 } as any,
        });

        expect(style.left).toBe("calc(50% + 192px)");
        expect(style.top).toBe("calc(50% + 108px)");
    });
});
