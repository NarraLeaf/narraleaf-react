import { describe, expect, it, vi } from "vitest";
import { Video } from "@core/elements/video";
import { VideoAction } from "./videoAction";
import { ContentNode } from "@core/action/tree/actionTree";
import { VideoActionTypes } from "@core/action/actionTypes";
import type { Awaitable } from "@lib/util/data";

/**
 * Pause, resume, seek and stop aimed at a clip that has already left the stage.
 *
 * Which side of a clip leaving such a row lands on is not always the author's to decide: a clip run
 * without waiting for it leaves the stage when it ends, at a moment set by how quickly the player
 * reads. The row a click earlier worked; a click later it used to throw, and the story stopped where
 * it stood. It does nothing now, and says so - what `hide` has done since 1.1.0 - while a clip that
 * is on the stage is driven exactly as it always was.
 */

type Transport = "pause" | "resume" | "seek" | "stop";

const TRANSPORT: [Transport, (typeof VideoActionTypes)[keyof typeof VideoActionTypes], unknown[]][] = [
    ["pause", VideoActionTypes.pause, []],
    ["resume", VideoActionTypes.resume, []],
    ["seek", VideoActionTypes.seek, [3]],
    ["stop", VideoActionTypes.stop, []],
];

function createStateLike(onStage: Video[]) {
    const warnings: string[] = [];
    const exposed = {
        pause: vi.fn(),
        resume: vi.fn(async () => void 0),
        seek: vi.fn(),
        stop: vi.fn(),
    };
    const state = {
        isVideoOnStage: (video: Video) => onStage.includes(video),
        logger: {
            debug: vi.fn(),
            weakWarn: (...args: unknown[]) => void warnings.push(args.map(String).join(" ")),
        },
        getExposedStateAsync: (_element: unknown, handler: (state: typeof exposed) => void | Promise<void>) => {
            let cancelled = false;
            setTimeout(() => {
                if (!cancelled) void handler(exposed);
            }, 0);
            return {cancel: () => void (cancelled = true)};
        },
    };
    return {state, warnings, exposed};
}

function run(video: Video, type: (typeof VideoActionTypes)[keyof typeof VideoActionTypes], content: unknown[], state: unknown) {
    const action = new VideoAction(
        {getSelf: () => video} as never,
        type as never,
        new ContentNode().setContent(content) as never,
    );
    return () => action.executeAction(state as never, {stackModel: {}} as never) as Awaitable<unknown>;
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe.each(TRANSPORT)("video:%s", (name, type, content) => {
    it("on a clip that is not on the stage, does nothing, says so, and lets the story carry on", async () => {
        const video = new Video({src: "/movies/gone.mp4"});
        const {state, warnings, exposed} = createStateLike([]);

        let result: Awaitable<unknown> | undefined;
        expect(() => (result = run(video, type, content, state)())).not.toThrow();
        // Settled at once: the row is over, and the next one runs.
        expect(result!.isSettled()).toBe(true);
        await tick();
        expect(exposed[name]).not.toHaveBeenCalled();
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("not on the stage");
        expect(warnings[0]).toContain("/movies/gone.mp4");
    });

    it("on a clip that is on the stage, drives it exactly as before", async () => {
        const video = new Video({src: "/movies/here.mp4"});
        const {state, warnings, exposed} = createStateLike([video]);

        const result = run(video, type, content, state)();
        await tick();
        await tick();
        expect(exposed[name]).toHaveBeenCalledTimes(1);
        if (name === "seek") {
            expect(exposed.seek).toHaveBeenCalledWith(3);
        }
        expect(result.isSettled()).toBe(true);
        expect(warnings).toEqual([]);
    });
});
