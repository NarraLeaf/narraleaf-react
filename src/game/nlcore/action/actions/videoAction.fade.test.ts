import { describe, expect, it, vi } from "vitest";
import { Video, VideoFadeOptions } from "@core/elements/video";
import { VideoAction } from "./videoAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { VideoActionTypes } from "@core/action/actionTypes";
import type { Awaitable } from "@lib/util/data";

/**
 * `show` and `hide` with a duration, as the action sees them.
 *
 * The component draws the fade; what this pins is the bookkeeping around it, which is where a fade
 * can go wrong without anything on screen looking odd at first: when `display` changes, when the clip
 * leaves the stage, what a step back puts back, and what an abandoned fade leaves behind.
 */

type ExposedVideo = {
    show: (options?: VideoFadeOptions) => Promise<void>;
    hide: (options?: VideoFadeOptions) => Promise<void>;
    cancelFade: () => void;
};

/** A fade the test ends by hand, standing in for the component's timer. */
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => (resolve = r));
    return {promise, resolve};
}

function createStateLike(exposed: Partial<ExposedVideo> = {}) {
    const videosOnStage: Video[] = [];
    const warnings: string[] = [];
    const undos: (() => void)[] = [];
    const exposedState: ExposedVideo = {
        show: async () => void 0,
        hide: async () => void 0,
        cancelFade: () => void 0,
        ...exposed,
    };
    const state = {
        state: {videos: videosOnStage},
        addVideo: (video: Video) => void videosOnStage.push(video),
        addVideoFor: (video: Video) => void videosOnStage.push(video),
        removeVideo: (video: Video) => {
            const index = videosOnStage.indexOf(video);
            if (index >= 0) videosOnStage.splice(index, 1);
        },
        isVideoAdded: (video: Video) => videosOnStage.includes(video),
        isVideoOnStage: (video: Video) => videosOnStage.includes(video),
        // No scenes here: which scene a clip belongs to is pinned in videoAction.sceneBoundary.test.ts.
        getVideoOwner: () => null,
        setVideoOwner: () => void 0,
        getLastScene: () => null,
        reportUnwarmedVideo: () => void 0,
        stage: {update: vi.fn()},
        actionHistory: {
            push: vi.fn((_props: unknown, undo?: (...args: unknown[]) => void, args?: unknown[]) => {
                if (undo) undos.push(() => undo(...(args ?? [])));
            }),
        },
        logger: {
            debug: vi.fn(),
            weakWarn: (...args: unknown[]) => void warnings.push(args.map(String).join(" ")),
        },
        getExposedStateAsync: (_element: unknown, handler: (state: ExposedVideo) => void | Promise<void>) => {
            let cancelled = false;
            setTimeout(() => {
                if (!cancelled) void handler(exposedState);
            }, 0);
            return {cancel: () => void (cancelled = true)};
        },
    };
    /** Undo everything recorded so far, newest first, the way a step back unwinds. */
    const undoAll = () => {
        while (undos.length) undos.pop()!();
    };
    return {state, videosOnStage, warnings, exposedState, undoAll};
}

function run(
    video: Video,
    type: (typeof VideoActionTypes)[keyof typeof VideoActionTypes],
    content: unknown[],
    stateLike: ReturnType<typeof createStateLike>,
): Awaitable<unknown> {
    const action = new VideoAction(
        {getSelf: () => video} as never,
        type as never,
        new ContentNode().setContent(content) as never,
    );
    return action.executeAction(stateLike.state as never, {stackModel: {}} as never) as Awaitable<unknown>;
}

/** Lets the handler handed to `getExposedStateAsync` run, and whatever it awaits settle. */
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe("video:show with a duration", () => {
    it("turns `display` on when the fade starts, not when the action does", async () => {
        // The component shows what `display` says from the moment it mounts. Set any earlier, a clip
        // still loading would be on screen at full opacity and the fade would run from 1 to 1.
        const video = new Video({src: "/movies/opening.mp4"});
        const fade = deferred();
        const show = vi.fn(() => fade.promise);
        const stateLike = createStateLike({show});

        const awaitable = run(video, VideoActionTypes.show, [{duration: 400}], stateLike);
        expect(stateLike.videosOnStage).toEqual([video]);
        expect(video.state.display).toBe(false);

        await tick();
        expect(show).toHaveBeenCalledWith({duration: 400});
        expect(video.state.display).toBe(true);
        expect(awaitable.isSettled()).toBe(false);

        fade.resolve();
        await tick();
        expect(awaitable.isSettled()).toBe(true);
    });

    it("without a duration, shows at once exactly as before", async () => {
        const video = new Video({src: "/movies/opening.mp4"});
        const show = vi.fn(async () => void 0);
        const stateLike = createStateLike({show});

        run(video, VideoActionTypes.show, [undefined], stateLike);
        // Set before anything is waited for: an instant show has always been visible from mount.
        expect(video.state.display).toBe(true);
        await tick();
        expect(show).toHaveBeenCalledWith();
    });
});

describe("video:hide with a duration", () => {
    it("keeps the clip on stage and showing until the fade is over, then takes it off", async () => {
        const video = new Video({src: "/movies/opening.mp4"});
        const fade = deferred();
        const hide = vi.fn(() => fade.promise);
        const stateLike = createStateLike({hide});

        run(video, VideoActionTypes.show, [undefined], stateLike);
        await tick();
        const awaitable = run(video, VideoActionTypes.hide, [{duration: 250}], stateLike);
        await tick();

        expect(hide).toHaveBeenCalledWith({duration: 250});
        // Mid-fade: what a save taken now records, and so what a load reruns this hide from.
        expect(video.state.display).toBe(true);
        expect(stateLike.videosOnStage).toEqual([video]);
        expect(awaitable.isSettled()).toBe(false);

        fade.resolve();
        await tick();
        expect(video.state.display).toBe(false);
        expect(stateLike.videosOnStage).toEqual([]);
        expect(awaitable.isSettled()).toBe(true);
    });

    it("leaves nothing changed and nothing recorded when it is abandoned halfway", async () => {
        // A step back aborts the action at the top of the stack. The fade it abandons must not then
        // finish the job: a clip taken off the stage and a history entry pushed after the step back
        // has already unwound the history would both be things nobody can undo.
        const video = new Video({src: "/movies/opening.mp4"});
        const fade = deferred();
        const cancelFade = vi.fn(() => fade.resolve());
        const stateLike = createStateLike({hide: () => fade.promise, cancelFade});

        run(video, VideoActionTypes.show, [undefined], stateLike);
        await tick();
        const pushesBefore = stateLike.state.actionHistory.push.mock.calls.length;
        const awaitable = run(video, VideoActionTypes.hide, [{duration: 250}], stateLike);
        await tick();

        awaitable.abort();
        await tick();

        expect(cancelFade).toHaveBeenCalledTimes(1);
        expect(video.state.display).toBe(true);
        expect(stateLike.videosOnStage).toEqual([video]);
        expect(stateLike.state.actionHistory.push.mock.calls.length).toBe(pushesBefore);
    });

    it("never reaches the element when it is abandoned before the clip could take it", async () => {
        const video = new Video({src: "/movies/opening.mp4"});
        const hide = vi.fn(async () => void 0);
        const stateLike = createStateLike({hide});

        run(video, VideoActionTypes.show, [undefined], stateLike);
        await tick();
        const awaitable = run(video, VideoActionTypes.hide, [{duration: 250}], stateLike);
        awaitable.abort();
        await tick();

        expect(hide).not.toHaveBeenCalled();
        expect(stateLike.videosOnStage).toEqual([video]);
    });
});

describe("stepping back across a hide", () => {
    it.each([
        ["at once", undefined],
        ["with a fade", {duration: 250}],
    ])("puts the clip back on the stage (%s)", async (_label, options) => {
        // Hiding takes the clip off the stage, so restoring `display` alone left a step back with a
        // clip that was showing on the line it went back to and nothing on the stage to show it.
        const video = new Video({src: "/movies/opening.mp4"});
        const stateLike = createStateLike();

        run(video, VideoActionTypes.show, [undefined], stateLike);
        await tick();
        run(video, VideoActionTypes.hide, [options], stateLike);
        await tick();
        await tick();
        expect(stateLike.videosOnStage).toEqual([]);

        stateLike.undoAll();
        expect(stateLike.videosOnStage).toEqual([video]);
    });

    it("restores `display` to what it was before the hide", async () => {
        const video = new Video({src: "/movies/opening.mp4"});
        const pushes: [(...args: unknown[]) => void, unknown[]][] = [];
        const stateLike = createStateLike();
        stateLike.state.actionHistory.push.mockImplementation((_props: unknown, undo?: (...args: unknown[]) => void, args?: unknown[]) => {
            if (undo) pushes.push([undo, args ?? []]);
        });

        run(video, VideoActionTypes.show, [undefined], stateLike);
        await tick();
        run(video, VideoActionTypes.hide, [{duration: 250}], stateLike);
        await tick();
        await tick();

        const [undoHide, args] = pushes[pushes.length - 1];
        undoHide(...args);
        expect(video.state.display).toBe(true);
        expect(stateLike.videosOnStage).toEqual([video]);
    });
});

describe("video:hide on a clip that is not on the stage", () => {
    it("does nothing, rather than stopping the story", async () => {
        // What a hide finds after a cutscene that cleared itself away, or after another hide.
        const video = new Video({src: "/movies/opening.mp4"});
        const hide = vi.fn(async () => void 0);
        const stateLike = createStateLike({hide});

        const awaitable = run(video, VideoActionTypes.hide, [{duration: 250}], stateLike);
        await tick();

        expect(awaitable.isSettled()).toBe(true);
        expect(hide).not.toHaveBeenCalled();
        expect(stateLike.warnings.some(message => /not on the stage/.test(message))).toBe(true);
    });
});
