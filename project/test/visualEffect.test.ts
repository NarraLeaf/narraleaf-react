import { describe, expect, it } from "vitest";
import { Image } from "../../src/game/nlcore/elements/displayable/image";
import { Transform } from "../../src/game/nlcore/elements/transform/transform";

const gameState = {
    getStory() {
        return {
            getInversionConfig() {
                return {
                    invertX: false,
                    invertY: false,
                };
            },
        };
    },
} as any;

describe("visual effect transform", () => {
    it("maps visual effect fields to standard and webkit DOM styles", () => {
        const style = Transform.constructStyle(gameState, {
            maskImage: "url(\"/mask.png\")",
            maskSize: "cover",
            maskPosition: "center",
            maskRepeat: "no-repeat",
            maskMode: "alpha",
            clipPath: "circle(50% at 50% 50%)",
            filter: "blur(2px)",
            backdropFilter: "blur(4px)",
            mixBlendMode: "screen",
        });

        expect(style).toMatchObject({
            maskImage: "url(\"/mask.png\")",
            WebkitMaskImage: "url(\"/mask.png\")",
            maskSize: "cover",
            WebkitMaskSize: "cover",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskMode: "alpha",
            WebkitMaskMode: "alpha",
            clipPath: "circle(50% at 50% 50%)",
            filter: "blur(2px)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            mixBlendMode: "screen",
        });
    });

    it("keeps visual effect fields in transform state serialization", () => {
        const image = new Image({
            src: "/image.png",
            maskImage: "url(\"/initial-mask.png\")",
            maskSize: "100% 100%",
            clipPath: "circle(40%)",
            filter: "grayscale(1)",
            mixBlendMode: "screen",
        });

        const raw = image.toData();

        expect(raw.transformState).toMatchObject({
            maskImage: "url(\"/initial-mask.png\")",
            maskSize: "100% 100%",
            clipPath: "circle(40%)",
            filter: "grayscale(1)",
            mixBlendMode: "screen",
        });
    });

    it("registers mask helper and raw url effect sources for preload", () => {
        const image = new Image({src: "/image.png"});

        image.mask("/mask.png", {
            maskSize: "cover",
            maskRepeat: "no-repeat",
        });
        image.effect({
            maskImage: "linear-gradient(black, transparent), url(\"/raw-mask.png\")",
        });

        const src = image.srcManager.getSrc().map(entry => `${entry.type}:${entry.src}`);

        expect(src).toContain("image:/image.png");
        expect(src).toContain("image:/mask.png");
        expect(src).toContain("image:/raw-mask.png");
    });

    it("uses explicit reset values for clear helpers", () => {
        const style = Transform.constructStyle(gameState, {
            maskImage: "none",
            maskSize: "auto",
            maskPosition: "0% 0%",
            maskRepeat: "repeat",
            maskMode: "match-source",
            clipPath: "none",
            filter: "none",
            mixBlendMode: "normal",
        });

        expect(style).toMatchObject({
            maskImage: "none",
            WebkitMaskImage: "none",
            maskSize: "auto",
            WebkitMaskSize: "auto",
            maskPosition: "0% 0%",
            WebkitMaskPosition: "0% 0%",
            maskRepeat: "repeat",
            WebkitMaskRepeat: "repeat",
            maskMode: "match-source",
            WebkitMaskMode: "match-source",
            clipPath: "none",
            filter: "none",
            mixBlendMode: "normal",
        });
    });
});
