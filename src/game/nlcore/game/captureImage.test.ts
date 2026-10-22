import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveGame } from "@core/common/game";
import { captureImagePixelRatio } from "@core/game/captureImage";

/**
 * `LiveGame.captureImage`: the stage drawn straight at the size it is wanted and encoded once.
 * html-to-image is stubbed at the seam - what is pinned here is what it is asked to draw and how
 * the answer is encoded, not the rasterising itself.
 */

type CanvasCall = { node: unknown; options: Record<string, unknown> };

function liveGameWithStage(stage: { clientWidth: number; clientHeight: number }, screenshotQuality = 1) {
    const calls: CanvasCall[] = [];
    const encodings: { type: string; quality: unknown }[] = [];
    const liveGame = Object.create(LiveGame.prototype) as LiveGame;
    Object.assign(liveGame, {
        game: { config: { screenshotQuality } },
        gameState: {
            playerCurrent: {},
            mainContentNode: stage,
            htmlToImage: {
                toCanvas: async (node: unknown, options: Record<string, unknown>) => {
                    calls.push({ node, options });
                    return {
                        toDataURL: (type: string, quality: unknown) => {
                            encodings.push({ type, quality });
                            return `data:${type};base64,AAAA`;
                        },
                    };
                },
            },
        },
    });
    return { liveGame, calls, encodings };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("captureImagePixelRatio", () => {
    it("draws the longest edge at maxEdge", () => {
        expect(captureImagePixelRatio({ width: 1920, height: 1080 }, 960, 2)).toBe(0.5);
        expect(captureImagePixelRatio({ width: 1080, height: 1920 }, 960, 2)).toBe(0.5);
    });

    it("never draws larger than the device ratio", () => {
        expect(captureImagePixelRatio({ width: 400, height: 225 }, 960, 2)).toBe(2);
    });

    it("is the device ratio without a usable maxEdge or size", () => {
        expect(captureImagePixelRatio({ width: 1920, height: 1080 }, undefined, 2)).toBe(2);
        expect(captureImagePixelRatio({ width: 1920, height: 1080 }, 0, 2)).toBe(2);
        expect(captureImagePixelRatio({ width: 0, height: 0 }, 960, 2)).toBe(2);
    });
});

describe("LiveGame.captureImage", () => {
    it("asks html-to-image for the stage at the thumbnail's pixel ratio and encodes it once", async () => {
        vi.stubGlobal("window", { devicePixelRatio: 2 });
        const stage = { clientWidth: 1400, clientHeight: 787.5 };
        const { liveGame, calls, encodings } = liveGameWithStage(stage);

        const picture = await liveGame.captureImage({
            maxEdge: 700,
            type: "image/webp",
            quality: 0.85,
            backgroundColor: "#000",
        });

        expect(picture).toBe("data:image/webp;base64,AAAA");
        expect(calls).toHaveLength(1);
        expect(calls[0].node).toBe(stage);
        expect(calls[0].options).toMatchObject({ pixelRatio: 0.5, backgroundColor: "#000", quality: 1 });
        expect(encodings).toEqual([{ type: "image/webp", quality: 0.85 }]);
    });

    it("draws what capturePng draws when nothing is asked for", async () => {
        vi.stubGlobal("window", { devicePixelRatio: 2 });
        const { liveGame, calls, encodings } = liveGameWithStage({ clientWidth: 1400, clientHeight: 787.5 }, 0.9);

        await liveGame.captureImage();

        expect(calls[0].options.pixelRatio).toBe(2);
        expect(calls[0].options).not.toHaveProperty("backgroundColor");
        expect(encodings).toEqual([{ type: "image/png", quality: 0.9 }]);
    });

    it("refuses without a mounted player, like the other captures", async () => {
        const { liveGame } = liveGameWithStage({ clientWidth: 1400, clientHeight: 787.5 });
        (liveGame as unknown as { gameState: { playerCurrent: unknown } }).gameState.playerCurrent = null;

        await expect(liveGame.captureImage({ maxEdge: 960 })).rejects.toThrow("Player Element Not Mounted");
    });
});
