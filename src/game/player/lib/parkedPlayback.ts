/**
 * What {@link ParkedPlayback} needs of a media element.
 * @internal
 */
export type PlayableElement = {
    readonly paused: boolean;
    readonly ended: boolean;
    pause(): void;
    play(): Promise<void>;
};

/**
 * The media side of a scene being parked behind a call.
 *
 * A parked scene keeps everything it has but stops painting it, and its music pauses - so its clips
 * and overlays, which are part of its stage, pause as well, and move again where they stopped when the
 * call returns. Hiding them alone is not enough: a clip that was running when the call was made went
 * on playing its sound over the scene that had been called.
 *
 * Playback asked for while the scene is parked is not lost either: a clip run without waiting for it
 * can be asked to play by a save loaded inside the call, and that play belongs to the moment the call
 * returns.
 * @internal
 */
export class ParkedPlayback {
    private parked = false;
    /** The element was playing when the scene was parked, or was asked to play while it was. */
    private playOnReturn = false;

    constructor(
        private readonly getElement: () => PlayableElement | null,
        private readonly onPlayError: (error: unknown) => void,
    ) {
    }

    public isParked(): boolean {
        return this.parked;
    }

    /** Park or unpark the element with its scene. Setting the state it is already in does nothing. */
    public setParked(parked: boolean): void {
        if (parked === this.parked) {
            return;
        }
        this.parked = parked;
        const el = this.getElement();
        if (parked) {
            if (el && !el.paused && !el.ended) {
                this.playOnReturn = true;
                el.pause();
            }
            return;
        }
        if (this.playOnReturn) {
            this.playOnReturn = false;
            el?.play().catch(this.onPlayError);
        }
    }

    /**
     * Ask whether playback may start now. While parked the answer is no, and the request is kept for
     * the return.
     */
    public requestPlay(): boolean {
        if (this.parked) {
            this.playOnReturn = true;
            return false;
        }
        return true;
    }

    /** The story stopped the element itself: nothing is to start again on the return. */
    public cancel(): void {
        this.playOnReturn = false;
    }
}
