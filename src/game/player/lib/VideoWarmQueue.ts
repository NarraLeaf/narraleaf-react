import type {Video} from "@core/elements/video";

/**
 * How many clips may be buffering ahead of the story at once.
 *
 * A ceiling rather than a target: the queue only ever reaches it when clips become playable faster
 * than the story moves. Each one held is a media pipeline with its own network read and its own
 * decoder, and on a host that serves assets off local disk it is also a file the process reads, so
 * the number that matters is "enough to cover the next thing that plays", not "everything the scene
 * mentions".
 */
const MaxWarmVideos = 3;

/**
 * How long one clip may hold up the queue before the next is started anyway.
 *
 * The queue admits clips one at a time and waits for each to say it can play, which is what makes
 * the concurrency follow the connection instead of a number somebody guessed. A clip that never
 * says so - a broken source, a stall, a codec the browser will not touch - must not stop the ones
 * behind it, so the wait has an end. Reaching it is not an error and is not reported: the worst it
 * costs is that two clips buffer at once.
 */
const AdmissionTimeoutMs = 5000;

export type VideoWarmQueueOptions = {
    /**
     * Whether the story itself has put this clip on the stage.
     *
     * Declared clips are the author's own instruction (`/video`, or a `Video.preload()` call) and
     * are never queued: they are already buffering, they are not subject to the ceiling, and
     * releasing one would take away something the story asked for.
     */
    isDeclared(video: Video): boolean;
    /** Ask the player to re-render the stage, because what is mounted has changed. */
    onChange(): void;
};

/**
 * Which clips are held on the stage buffering, and in what order they are started.
 *
 * ## Why a queue and not a number
 *
 * Warming a video is not warming an image. An image is bytes plus a decode, and the player can hold
 * both in a cache under a budget it can measure. A video is a `<video>` element that is in the
 * document: the browser buffers into it, the buffer belongs to that element, and the element that
 * buffered has to be the element that plays or the buffering bought nothing. So "warm this clip"
 * means "mount it hidden, early", and the only questions left are how many and in what order.
 *
 * Both are answered here rather than by whoever wrote the story or configured the game. The host's
 * plan says which clips are coming and in what order (nearest first); this admits them one at a
 * time and starts the next when the current one reports it can play. On a fast local disk that
 * empties the queue almost at once; on a slow connection it keeps a single read running instead of
 * five that finish together and too late. Nobody has to know what number to write, which is the
 * point - it is not a number an author could be expected to get right, and the browser is telling
 * us the answer anyway.
 */
export class VideoWarmQueue {
    /** Everything the current plan named, declared clips included - what {@link isPlanned} answers. */
    private planned: Set<Video> = new Set();
    /** What this queue may mount, in plan order, minus anything the story declared itself. */
    private desired: Video[] = [];
    /** Mounted by this queue, hidden and buffering. A subset of {@link desired}, in admission order. */
    private admitted: Video[] = [];
    /** The clip whose "can play" the queue is waiting for before it starts another. */
    private pending: Video | null = null;
    private pendingTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private readonly options: VideoWarmQueueOptions) {
    }

    /**
     * Take a plan's clips as the complete set this moment wants warm.
     *
     * Total replacement, like every other part of a plan: a clip the new plan does not name is
     * released as soon as this returns, because the scene that wanted it is behind the reader. What
     * the story declared is untouched - releasing that is the story's business, not the plan's.
     */
    public retain(next: readonly Video[]): void {
        this.planned = new Set(next);
        this.desired = next.filter(video => !this.options.isDeclared(video));

        let changed = false;
        const keep: Video[] = [];
        for (const video of this.admitted) {
            if (this.desired.includes(video)) {
                keep.push(video);
            } else {
                changed = true;
            }
        }
        this.admitted = keep;
        if (this.pending && !this.admitted.includes(this.pending)) {
            this.clearPending();
        }

        if (this.admit() || changed) {
            this.options.onChange();
        }
    }

    /**
     * A clip is playable, or has failed trying - either way the queue stops waiting for it.
     *
     * Fed from the player's exposed-state mount, which the video component performs on `canplay`
     * and, for a source that will not load, on `error`. Anything that is not the clip being waited
     * for is ignored, so this can be wired to every state mount there is.
     */
    public noteReady(video: unknown): void {
        if (!this.pending || this.pending !== video) {
            return;
        }
        this.clearPending();
        if (this.admit()) {
            this.options.onChange();
        }
    }

    /**
     * Stop holding a clip the story has taken over.
     *
     * Called when a row declares, shows or plays something this queue had mounted. The element does
     * not move and does not reload - it is the same element, now on the stage for a better reason -
     * so this only stops counting it against the ceiling and frees the queue to start another.
     */
    public forget(video: Video): void {
        const index = this.admitted.indexOf(video);
        if (index >= 0) {
            this.admitted.splice(index, 1);
        }
        this.desired = this.desired.filter(candidate => candidate !== video);
        if (this.pending === video) {
            this.clearPending();
        }
        if (this.admit()) {
            this.options.onChange();
        }
    }

    /** Clips this queue is holding on the stage, hidden. */
    public getAdmitted(): readonly Video[] {
        return this.admitted;
    }

    /** Whether the current plan named this clip at all, declared or not. */
    public isPlanned(video: Video): boolean {
        return this.planned.has(video);
    }

    /** Drop everything, for a player being torn down or reset. */
    public clear(): void {
        this.clearPending();
        this.planned = new Set();
        this.desired = [];
        if (this.admitted.length) {
            this.admitted = [];
            this.options.onChange();
        }
    }

    /** Start the next clip if there is room and nothing is being waited on. Reports whether it did. */
    private admit(): boolean {
        if (this.pending || this.admitted.length >= MaxWarmVideos) {
            return false;
        }
        const next = this.desired.find(video => !this.admitted.includes(video));
        if (!next) {
            return false;
        }
        this.admitted.push(next);
        this.pending = next;
        this.pendingTimer = setTimeout(() => {
            this.pendingTimer = null;
            this.pending = null;
            if (this.admit()) {
                this.options.onChange();
            }
        }, AdmissionTimeoutMs);
        return true;
    }

    private clearPending(): void {
        if (this.pendingTimer !== null) {
            clearTimeout(this.pendingTimer);
            this.pendingTimer = null;
        }
        this.pending = null;
    }
}
