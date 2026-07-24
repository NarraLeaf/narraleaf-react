import { describe, expect, it } from "vitest";
import { Chained } from "../../src/game/nlcore/action/chain";
import { Video } from "../../src/game/nlcore/elements/video";
import { VideoActionTypes } from "../../src/game/nlcore/action/actionTypes";

function typesOf(actionLike: any): string[] {
    return Chained.toActions([actionLike]).map((a) => a.type);
}

describe("Video element", () => {
    describe("construction / config", () => {
        it("throws when src is missing", () => {
            expect(() => new Video({} as any)).toThrow(/src/);
        });

        it("throws when src is an empty string", () => {
            expect(() => new Video({ src: "" })).toThrow(/src/);
        });

        it("defaults muted to false", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(video.config.src).toBe("/clip.webm");
            expect(video.config.muted).toBe(false);
        });

        it("respects an explicit muted flag", () => {
            const video = new Video({ src: "/clip.webm", muted: true });
            expect(video.config.muted).toBe(true);
        });

        it("starts hidden (display=false)", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(video.state.display).toBe(false);
        });
    });

    describe("chainable actions", () => {
        it("show() emits a single video:show action", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(typesOf(video.show())).toEqual([VideoActionTypes.show]);
        });

        it("hide() emits a single video:hide action", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(typesOf(video.hide())).toEqual([VideoActionTypes.hide]);
        });

        it("play() emits a single video:play action", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(typesOf(video.play())).toEqual([VideoActionTypes.play]);
        });

        it("pause() emits a single video:pause action", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(typesOf(video.pause())).toEqual([VideoActionTypes.pause]);
        });

        it("resume() emits a single video:resume action", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(typesOf(video.resume())).toEqual([VideoActionTypes.resume]);
        });

        it("stop() emits a single video:stop action", () => {
            const video = new Video({ src: "/clip.webm" });
            expect(typesOf(video.stop())).toEqual([VideoActionTypes.stop]);
        });

        it("seek(time) emits a single video:seek action carrying the time", () => {
            const video = new Video({ src: "/clip.webm" });
            const actions = Chained.toActions([video.seek(3)]);
            expect(actions.map((a) => a.type)).toEqual([VideoActionTypes.seek]);
            expect(actions[0].contentNode.getContent()).toEqual([3]);
        });
    });

    describe("serialization", () => {
        it("round-trips display state through toData/fromData", () => {
            const video = new Video({ src: "/clip.webm" });
            video.state.display = true;

            const raw = video.toData();
            expect(raw).toEqual({ state: { display: true } });

            const restored = new Video({ src: "/clip.webm" });
            restored.fromData(raw as any);
            expect(restored.state.display).toBe(true);
        });

        it("reset() restores the initial hidden state", () => {
            const video = new Video({ src: "/clip.webm" });
            video.state.display = true;
            video.reset();
            expect(video.state.display).toBe(false);
        });
    });
});
