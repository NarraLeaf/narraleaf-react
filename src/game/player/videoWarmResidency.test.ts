import {describe, expect, it, vi} from "vitest";
import {Game} from "@core/game";
import {GameState} from "@player/gameState";
import {Video} from "@core/elements/video";

/**
 * Two kinds of clip can be on the stage at once, and only one of them is state.
 *
 * What the story put there - a declaration row, a show, a play - is what a save records and what an
 * undo takes back. What the preloader is holding is a property of this run: it exists so the clip
 * that plays next is already buffering, and writing it into a save would let a story edit invalidate
 * saves that have nothing to do with the change, because loading one throws on a video id the story
 * no longer has.
 */

function harness() {
    const game = new Game({app: {debug: false}});
    const state = new GameState(game, {
        update: () => void 0,
        forceUpdate: () => void 0,
        forceRemount: () => void 0,
        next: () => void 0,
    });
    return {game, state};
}

describe("warmed videos", () => {
    it("are rendered, are not the story's, and stay out of a save", () => {
        const {state} = harness();
        const clip = new Video({src: "opening.mp4"});

        state.retainWarmVideos([clip]);

        expect(state.getVideos()).toEqual([clip]);
        expect(state.isVideoOnStage(clip)).toBe(true);
        expect(state.isVideoAdded(clip)).toBe(false);
        expect(state.toData().videos).toEqual([]);
    });

    it("are counted once when the story takes the same clip over", () => {
        const {state} = harness();
        const clip = new Video({src: "opening.mp4"});

        state.retainWarmVideos([clip]);
        state.addVideo(clip);

        expect(state.getVideos()).toEqual([clip]);
        expect(state.isVideoAdded(clip)).toBe(true);
        expect(state.toData().videos).toHaveLength(1);
    });

    it("are released when a later plan does not name them", () => {
        const {state} = harness();
        const first = new Video({src: "a.mp4"});
        const second = new Video({src: "b.mp4"});

        state.retainWarmVideos([first]);
        state.retainWarmVideos([second]);

        expect(state.getVideos()).toEqual([second]);
    });

    it("survive a plan that says nothing about video", () => {
        const {state} = harness();
        const clip = new Video({src: "a.mp4"});

        state.retainWarmVideos([clip]);
        // A plan with no `video` key never reaches `retainWarmVideos` at all - the same rule the
        // rest of a plan follows for `keep`. Nothing here should have moved.
        expect(state.getVideos()).toEqual([clip]);
    });
});

describe("the unwarmed-clip report", () => {
    it("names a clip no plan asked for, once", () => {
        const {state} = harness();
        const report = vi.fn();
        const clip = new Video({src: "surprise.mp4"});

        state.useVideoMissingReporter(report);
        state.reportUnwarmedVideo(clip);
        state.reportUnwarmedVideo(clip);

        expect(report).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenCalledWith({type: "video", src: "surprise.mp4"});
    });

    it("says nothing about a clip the plan named", () => {
        const {state} = harness();
        const report = vi.fn();
        const clip = new Video({src: "planned.mp4"});

        state.useVideoMissingReporter(report);
        state.retainWarmVideos([clip]);
        state.reportUnwarmedVideo(clip);

        expect(report).not.toHaveBeenCalled();
    });

    it("says nothing about a clip the story declared for itself", () => {
        const {state} = harness();
        const report = vi.fn();
        const clip = new Video({src: "declared.mp4"});

        state.useVideoMissingReporter(report);
        state.addVideo(clip);
        state.reportUnwarmedVideo(clip);

        expect(report).not.toHaveBeenCalled();
    });
});
