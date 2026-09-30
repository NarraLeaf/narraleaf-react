/**
 * The skip key, as a signal rather than a component.
 *
 * Holding the key down is a mode and tapping it is one advance, and the difference has to be made
 * somewhere: the key itself only reports "down" and "up". This turns those two into the stream of
 * advance requests the rest of the player consumes - one unforced request the moment the key goes
 * down, then forced ones for as long as it stays down.
 *
 * It lives apart from `KeyEventAnnouncer` because the announcer is DOM (window listeners, key
 * matching, the suspension guard) and this is not: it is timers and one boolean, which is the part
 * worth pinning and the part a test can reach.
 *
 * Comments in English per project convention.
 */

/** Emit one advance request. `forced` marks the skip mode rather than a single advance. */
export type SkipEmit = (forced: boolean) => void;

export type SkipKeySignalOptions = {
    /** How long the key must be held before the mode starts. `0` starts it on the next interval. */
    delay: number;
    /** How often the mode repeats while the key is held. */
    interval: number;
};

/**
 * Turn key-down and key-up into advance requests.
 *
 * `press` is idempotent: the OS repeats key-down while a key is held, and every repeat after the
 * first is the same press. `release` ends the mode; so does `dispose`, which the announcer calls
 * when it stops listening - a key released while the player is unmounted, or a window that lost
 * focus mid-press, must not leave an interval running against a game that has gone.
 */
export class SkipKeySignal {
    private held = false;
    private delayTimer: ReturnType<typeof setTimeout> | null = null;
    private repeatTimer: ReturnType<typeof setInterval> | null = null;

    public constructor(
        private readonly emit: SkipEmit,
        private readonly options: SkipKeySignalOptions,
    ) {}

    public isHeld(): boolean {
        return this.held;
    }

    /**
     * The key went down.
     *
     * The first thing a press produces is an ordinary advance - the same one a click produces - and
     * only what follows it is the mode. A tap therefore reads a line at the speed it was written,
     * pauses included; the player who wants the rest of the scene holds the key and says so.
     */
    public press(): void {
        if (this.held) {
            return;
        }
        this.clearTimers();
        this.held = true;
        this.emit(false);

        if (this.options.delay === 0) {
            this.startRepeating();
        } else {
            this.delayTimer = setTimeout(() => {
                this.delayTimer = null;
                this.startRepeating();
            }, this.options.delay);
        }
    }

    /** The key came up. */
    public release(): void {
        this.clearTimers();
        this.held = false;
    }

    /** Stop everything, whatever state the key is in. */
    public dispose(): void {
        this.release();
    }

    private startRepeating(): void {
        this.repeatTimer = setInterval(() => {
            this.emit(true);
        }, this.options.interval);
    }

    private clearTimers(): void {
        if (this.delayTimer !== null) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
        if (this.repeatTimer !== null) {
            clearInterval(this.repeatTimer);
            this.repeatTimer = null;
        }
    }
}
