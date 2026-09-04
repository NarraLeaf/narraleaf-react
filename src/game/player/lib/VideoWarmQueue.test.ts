import {beforeEach, describe, expect, it, vi} from "vitest";
import {Video} from "@core/elements/video";
import {VideoWarmQueue} from "./VideoWarmQueue";

/**
 * The queue's whole job is to turn "these clips are coming, in this order" into "this one is
 * buffering, and the next starts when it can play". These tests state that as behaviour: what is
 * mounted, when the next one joins it, and what happens to a clip the story has moved past.
 */

function clip(src: string): Video {
    return new Video({src});
}

function createQueue(declared: Video[] = []) {
    const onChange = vi.fn();
    const queue = new VideoWarmQueue({
        isDeclared: video => declared.includes(video),
        onChange,
    });
    return {queue, onChange};
}

beforeEach(() => {
    vi.useFakeTimers();
});

describe("VideoWarmQueue", () => {
    it("starts one clip and waits for it before starting the next", () => {
        const first = clip("a.mp4");
        const second = clip("b.mp4");
        const {queue, onChange} = createQueue();

        queue.retain([first, second]);

        expect(queue.getAdmitted()).toEqual([first]);
        expect(onChange).toHaveBeenCalledTimes(1);

        queue.noteReady(first);
        expect(queue.getAdmitted()).toEqual([first, second]);
    });

    it("ignores a readiness report for something it is not waiting on", () => {
        const first = clip("a.mp4");
        const second = clip("b.mp4");
        const {queue} = createQueue();

        queue.retain([first, second]);
        queue.noteReady(second);
        queue.noteReady({not: "a video"});

        expect(queue.getAdmitted()).toEqual([first]);
    });

    it("starts the next clip anyway when one never reports it can play", () => {
        const first = clip("a.mp4");
        const second = clip("b.mp4");
        const {queue} = createQueue();

        queue.retain([first, second]);
        expect(queue.getAdmitted()).toEqual([first]);

        vi.advanceTimersByTime(5000);

        expect(queue.getAdmitted()).toEqual([first, second]);
    });

    it("holds no more than three clips at once", () => {
        const clips = ["a", "b", "c", "d", "e"].map(name => clip(`${name}.mp4`));
        const {queue} = createQueue();

        queue.retain(clips);
        for (const video of clips) {
            queue.noteReady(video);
        }

        expect(queue.getAdmitted()).toEqual(clips.slice(0, 3));
    });

    it("releases a clip the next plan does not name, and starts what took its place", () => {
        const first = clip("a.mp4");
        const second = clip("b.mp4");
        const {queue} = createQueue();

        queue.retain([first]);
        expect(queue.getAdmitted()).toEqual([first]);

        queue.retain([second]);

        expect(queue.getAdmitted()).toEqual([second]);
    });

    it("never mounts a clip the story declared itself", () => {
        const declared = clip("a.mp4");
        const planned = clip("b.mp4");
        const {queue} = createQueue([declared]);

        queue.retain([declared, planned]);

        expect(queue.getAdmitted()).toEqual([planned]);
        // The declaration row is still a plan entry as far as reporting goes: it is warm, and
        // nothing should be told otherwise.
        expect(queue.isPlanned(declared)).toBe(true);
    });

    it("stops counting a clip the story takes over, and frees the slot", () => {
        const first = clip("a.mp4");
        const second = clip("b.mp4");
        const {queue} = createQueue();

        queue.retain([first, second]);
        expect(queue.getAdmitted()).toEqual([first]);

        // The story shows the clip the queue was waiting on: it is on the stage for a better
        // reason now, and the queue may start the next one.
        queue.forget(first);

        expect(queue.getAdmitted()).toEqual([second]);
    });

    it("drops everything on clear", () => {
        const first = clip("a.mp4");
        const {queue, onChange} = createQueue();

        queue.retain([first]);
        onChange.mockClear();
        queue.clear();

        expect(queue.getAdmitted()).toEqual([]);
        expect(queue.isPlanned(first)).toBe(false);
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("an empty plan releases the warm set", () => {
        const first = clip("a.mp4");
        const {queue} = createQueue();

        queue.retain([first]);
        queue.retain([]);

        expect(queue.getAdmitted()).toEqual([]);
    });
});
