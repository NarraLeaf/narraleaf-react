import {describe, expect, it} from "vitest";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {TransformDefinitions} from "@core/elements/transform/type";
import {GameState} from "@player/gameState";

const gameState = {
    getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})}),
    game: {config: {width: 1920, height: 1080}},
} as unknown as GameState;

// `constructAnimation` only ever puts these into the segment tuples — it never touches the DOM —
// so plain markers are enough to read the sequence back and see which element each segment drives.
const main = {tag: "main"} as unknown as Element;
const plateA = {tag: "plateA"} as unknown as Element;
const plateB = {tag: "plateB"} as unknown as Element;

function stateOf(props: Partial<TransformDefinitions.Types> = {}) {
    return new TransformState<TransformDefinitions.Types>({
        opacity: 1,
        ...props,
    });
}

function twoStep() {
    return new Transform<TransformDefinitions.Types>([
        {props: {opacity: 0.5, shutter: 1}, options: {duration: 180, ease: "easeInOut"}},
        {props: {opacity: 1, shutter: 0}, options: {duration: 220, ease: "easeInOut"}},
    ]);
}

function build(companions?: { el: Element; project: (props: Partial<TransformDefinitions.Types>) => Record<string, unknown> }[]) {
    return twoStep().constructAnimation({
        gameState,
        transformState: stateOf(),
        current: main,
        companions: companions as never,
    });
}

/**
 * The guarantee that makes this safe to land: every displayable except the camera passes no
 * companions, and for them the sequence has to be the array `.map` produced before — same length,
 * same order, same option objects. If this drifts, the change stopped being camera-only.
 */
describe("a transform with no companions is unchanged", () => {
    it("emits exactly one segment per sequence, all for the transformed element", () => {
        for (const built of [build(), build([])]) {
            expect(built.sequences).toHaveLength(2);
            expect(built.sequences.map(([el]) => el)).toEqual([main, main]);
        }
    });

    it("emits the same options it always did, with no `at`", () => {
        const [, , first] = build().sequences[0];
        expect(first).toEqual({duration: 0.18, ease: "easeInOut", delay: undefined, at: undefined});
    });

    /**
     * The camera-only props ride in the transform state but must not reach the transformed
     * element's own style. `constructStyle` is a literal, so this holds by construction — pinned
     * here because it is the reason no `image`/`text`/`layer`/`puppet` style changes.
     */
    it("never writes lens props into the element's own keyframes", () => {
        const [, keyframes] = build().sequences[0];
        expect(keyframes).not.toHaveProperty("shutter");
        expect(keyframes).not.toHaveProperty("vignette");
        expect(keyframes.opacity).toBe(0.5);
    });
});

describe("companions ride in the same sequence", () => {
    const companions = [
        {el: plateA, project: (props: Partial<TransformDefinitions.Types>) => ({top: `${props.shutter}px`})},
        {el: plateB, project: (props: Partial<TransformDefinitions.Types>) => ({left: `${props.opacity}px`})},
    ];

    it("appends one segment per companion after each main segment", () => {
        const {sequences} = build(companions);
        expect(sequences).toHaveLength(6);
        expect(sequences.map(([el]) => el)).toEqual([main, plateA, plateB, main, plateA, plateB]);
    });

    /**
     * `at: "<"` is what lines a companion up with the main segment it was derived from. `motion`
     * resolves it against the *previous* segment's start time, so the alignment holds for every
     * step of the sequence, not only the first.
     */
    it("starts each companion segment where its main segment starts", () => {
        const {sequences} = build(companions);
        for (const index of [1, 2, 4, 5]) {
            const [, , options] = sequences[index];
            const [, , mainOptions] = sequences[index <= 2 ? 0 : 3];
            expect(options).toEqual({...mainOptions, at: "<"});
        }
    });

    it("projects the state accumulated up to that segment, not the transform's final state", () => {
        const {sequences} = build(companions);
        expect(sequences[1][1]).toEqual({top: "1px"});
        expect(sequences[4][1]).toEqual({top: "0px"});
        expect(sequences[2][1]).toEqual({left: "0.5px"});
        expect(sequences[5][1]).toEqual({left: "1px"});
    });

    it("drops undefined fields so a partial projection cannot clear a style", () => {
        const {sequences} = build([
            {el: plateA, project: () => ({top: "1px", left: undefined})},
        ]);
        expect(sequences[1][1]).toEqual({top: "1px"});
        expect(sequences[1][1]).not.toHaveProperty("left");
    });

    it("leaves the transform's own final state alone", () => {
        expect(build(companions).finalState.get().shutter).toBe(0);
        expect(build(companions).finalState.get().opacity).toBe(1);
    });
});

/**
 * The sequence-level options are what `motion` spreads onto every element/value transition it
 * builds, companions included — verified against `framer-motion`'s `createAnimationsFromSequence`,
 * which applies them last and per element. So a repeated transform repeats its companions with it
 * rather than looping the camera against a lens that plays once.
 */
describe("sequence options are not per-element", () => {
    it("carries repeat through to the sequence, which motion applies to every element in it", () => {
        const {options} = twoStep().repeat(2).constructAnimation({
            gameState,
            transformState: stateOf(),
            current: main,
            companions: [{el: plateA, project: () => ({top: "0px"})}],
        });
        expect(options.repeat).toBe(2);
    });
});
