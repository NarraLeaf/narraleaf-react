import { beforeEach, describe, expect, it, vi } from "vitest";
import { Transform, TransformState } from "./transform";
import { CommonPosition, CommonPositionType } from "./position";
import type { TransformDefinitions } from "./type";

const animateMock = vi.fn();

// Partial: importing `transform.ts` drags in enough of the player tree that other `motion/react`
// exports have to stay real. Only `animate` is intercepted, which is the whole seam under test.
vi.mock("motion/react", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    animate: (...args: unknown[]) => animateMock(...args),
}));

/**
 * The slice of GameState the style projection reads. Nothing here runs an animation - `motion` is
 * mocked - so this only has to answer the inversion config and the stage size.
 */
function stateLike() {
    return {
        logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
        getStory: () => ({ getInversionConfig: () => ({ invertX: false, invertY: false }) }),
        game: { config: { width: 1920, height: 1080 } },
    } as never;
}

function transformStateLike() {
    return new TransformState<TransformDefinitions.ImageTransformProps>({
        opacity: 1,
        scaleX: 1,
        scaleY: 1,
        zoom: 1,
        rotation: 0,
        position: new CommonPosition(CommonPositionType.Center),
    });
}

function refLike() {
    return { current: {} as HTMLDivElement };
}

function playbackLike() {
    return {
        play: vi.fn(),
        stop: vi.fn(),
        complete: vi.fn(),
        then: vi.fn(),
    };
}

describe("an endless transform", () => {
    beforeEach(() => {
        animateMock.mockReset();
        animateMock.mockImplementation(() => playbackLike());
    });

    it("is refused by `animate`, which the story waits for", () => {
        // `repeat(Infinity)` typechecks and `motion` honours it, so before this guard the game
        // simply stopped: the animation never completed, the action never resolved and the stack
        // never advanced - with nothing logged anywhere.
        const transform = Transform
            .immediate<TransformDefinitions.ImageTransformProps>({ opacity: 0 })
            .repeat(Infinity);

        expect(() => transform.animate(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        })).toThrowError(/loop/);
        expect(animateMock).not.toHaveBeenCalled();
    });

    it("names `loop()` in the error, so the fix is in the message", () => {
        const transform = Transform
            .immediate<TransformDefinitions.ImageTransformProps>({ opacity: 0 })
            .repeat(Infinity);

        expect(() => transform.animate(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        })).toThrowError(/element\.loop\(transform\)/);
    });

    it("still lets a finite repeat through", () => {
        const transform = Transform
            .immediate<TransformDefinitions.ImageTransformProps>({ opacity: 0 })
            .repeat(3);

        expect(() => transform.animate(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        })).not.toThrow();
        expect(animateMock).toHaveBeenCalledTimes(1);
        expect((animateMock.mock.calls[0][1] as { repeat?: number }).repeat).toBe(3);
    });
});

describe("startLoop", () => {
    beforeEach(() => {
        animateMock.mockReset();
        animateMock.mockImplementation(() => playbackLike());
    });

    it("states where it starts, so a repeat never reads the element's current style", () => {
        // A first segment that names only a destination leaves `motion` to supply the start itself,
        // which makes a positional value resolve to exactly two keyframes - the one shape that sends
        // `motion` off to measure the element and re-emit the value in `px`. See the next test for
        // the mechanism; this one pins that the origin is stated and that it is the PRE-LOOP pose.
        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.02)
            .commit({ duration: 900 });
        const state = transformStateLike();

        transform.startLoop(state, { gameState: stateLike(), ref: refLike() });

        const sequences = animateMock.mock.calls[0][0] as [unknown, Record<string, unknown>, Record<string, unknown>][];
        expect(sequences.length).toBe(2);
        expect(sequences[0][2]).toMatchObject({ duration: 0 });
        // The origin IS the pre-loop pose, not a copy of the destination.
        expect(String(sequences[0][1].transform)).toContain("scaleY(1)");
        expect(String(sequences[1][1].transform)).toContain("scaleY(1.02)");
    });

    it("keeps every positional value above two keyframes, which is what stops `motion` measuring it", () => {
        // This is the whole reason the origin segment above is load-bearing, and it is not obvious
        // from reading `startLoop`, so it is pinned here rather than left to a comment.
        //
        // `motion` converts a positional value's units by measuring the element - but only when that
        // value resolves to EXACTLY two keyframes (`DOMKeyframesResolver.unresolveKeyframes`:
        // `if (!positionalKeys.has(name) || unresolvedKeyframes.length !== 2) return`, where
        // `positionalKeys` covers top/left/right/bottom/width/height). A lone segment is exactly
        // that shape, because `motion` supplies the missing start itself. The measurement runs
        // `getBoundingClientRect`, the value comes back in `px`, it is re-emitted every frame, and
        // each restore feeds the measured value back in as the next origin - which is how a looping
        // sprite's `bottom` reached 27353px and its `scaleY` -580.
        //
        // Three keyframes skip that branch entirely. **Keep a loop's sequence above one segment.**
        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.02)
            .commit({ duration: 900 });

        transform.startLoop(transformStateLike(), { gameState: stateLike(), ref: refLike() });

        const sequences = animateMock.mock.calls[0][0] as [unknown, Record<string, unknown>, Record<string, unknown>][];
        expect(sequences.length).toBeGreaterThan(1);
        // A positional key stated in only one frame still resolves to two keyframes, so it is not
        // enough that the segments exist - the key has to appear in more than one of them.
        for (const key of ["top", "bottom", "left", "right"]) {
            const stated = sequences.filter(([, frame]) => frame[key] !== undefined).length;
            expect({ key, stated }).toEqual({ key, stated: sequences.length });
        }
    });

    it("repeats forever, whatever the transform's own repeat count said", () => {
        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.02)
            .commit({ duration: 900 });

        transform.startLoop(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        });

        expect(animateMock).toHaveBeenCalledTimes(1);
        expect((animateMock.mock.calls[0][1] as { repeat?: number }).repeat).toBe(Infinity);
    });

    it("passes the repeat style through, and defaults to `loop`", () => {
        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.02)
            .commit({ duration: 900 });

        transform.startLoop(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        }, { repeatType: "mirror" });
        expect((animateMock.mock.calls[0][1] as { repeatType?: string }).repeatType).toBe("mirror");

        transform.startLoop(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        });
        expect((animateMock.mock.calls[1][1] as { repeatType?: string }).repeatType).toBe("loop");
    });

    it("takes the repeat delay in milliseconds, like every other duration in the API", () => {
        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.02)
            .commit({ duration: 900 });

        transform.startLoop(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        }, { repeatDelay: 400 });

        expect((animateMock.mock.calls[0][1] as { repeatDelay?: number }).repeatDelay).toBe(0.4);
    });

    it("leaves the element's transform state exactly where it was", () => {
        // The whole reason a loop is not an ordinary transform: the state is the pose a save
        // records and the pose the element eases back to, so a frame of the oscillation must never
        // land in it. It also must not be left locked - the next transform would throw.
        const state = transformStateLike();
        const before = { ...state.get() };
        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.4)
            .opacity(0.2)
            .commit({ duration: 900 });

        transform.startLoop(state, {
            gameState: stateLike(),
            ref: refLike(),
        });

        expect(state.get()).toEqual(before);
        expect(state.isLocked()).toBe(false);
    });

    it("hands back a handle that stops the motion where it is", () => {
        const playback = playbackLike();
        animateMock.mockImplementation(() => playback);

        const transform = Transform
            .create<TransformDefinitions.ImageTransformProps>()
            .scaleY(1.02)
            .commit({ duration: 900 });
        const handle = transform.startLoop(transformStateLike(), {
            gameState: stateLike(),
            ref: refLike(),
        });

        handle.stop();

        expect(playback.stop).toHaveBeenCalledTimes(1);
        // `cancel` would snap the element back to its pre-loop pose before the transform that
        // interrupted the loop had a chance to tween from where it actually was.
        expect(playback.complete).not.toHaveBeenCalled();
    });
});
