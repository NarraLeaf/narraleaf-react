import { describe, expect, it, vi } from "vitest";
import { Video } from "@core/elements/video";
import { VideoAction } from "./videoAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { VideoActionTypes } from "@core/action/actionTypes";

/**
 * Declaring a video puts it on the stage without showing it.
 *
 * The component renders a `preload="auto"` element and keeps it hidden while `display` is false, so
 * being on the stage IS the buffering - and a story that declares its movie a few lines before it
 * plays does not make the player wait for the first frame.
 */

function createStateLike() {
    const videosOnStage: Video[] = [];
    const state = {
        state: {videos: videosOnStage},
        addVideo: (video: Video) => void videosOnStage.push(video),
        removeVideo: (video: Video) => {
            const index = videosOnStage.indexOf(video);
            if (index >= 0) videosOnStage.splice(index, 1);
        },
        isVideoAdded: (video: Video) => videosOnStage.includes(video),
        stage: {update: vi.fn()},
        actionHistory: {push: vi.fn()},
        logger: {debug: vi.fn(), weakWarn: vi.fn()},
    };
    return {state, videosOnStage};
}

function preload(video: Video, stateLike: ReturnType<typeof createStateLike>) {
    const action = new VideoAction(
        {getSelf: () => video} as never,
        VideoActionTypes.preload as never,
        new ContentNode().setContent([]) as never,
    );
    return action.executeAction(stateLike.state as never, {stackModel: {}} as never);
}

describe("video:preload", () => {
    it("puts the video on the stage without showing it", () => {
        const video = new Video({src: "/movies/opening.mp4"});
        const stateLike = createStateLike();

        preload(video, stateLike);

        expect(stateLike.videosOnStage).toEqual([video]);
        expect(video.state.display).toBe(false);
        expect(stateLike.state.stage.update).toHaveBeenCalled();
    });

    it("is idempotent", () => {
        const video = new Video({src: "/movies/opening.mp4"});
        const stateLike = createStateLike();

        preload(video, stateLike);
        preload(video, stateLike);

        expect(stateLike.videosOnStage).toEqual([video]);
    });
});
