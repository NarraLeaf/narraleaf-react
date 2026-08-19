import {describe, expect, it} from "vitest";
import {Camera} from "@core/elements/camera";
import {Layer} from "@core/elements/layer";
import {shutterTopStyle, vignetteStyle} from "@core/elements/cameraLens";
import {Transform} from "@core/elements/transform/transform";
import {TransformDefinitions} from "@core/elements/transform/type";
import {GameState} from "@player/gameState";

/**
 * **An element's `TransformState` object must outlive every lifecycle hook that empties it.**
 *
 * A React host binds a displayable ONCE — `useDisplayable({state: element.transformState})` — and
 * from then on that captured object is both what the exposed `applyTransform` animates and what the
 * settled-style repaint reads. Replacing the object on `reset()` (which is what `newGame()` calls)
 * or on `fromData()` therefore splits the element in two: the animation writes the orphan, the
 * repaint reads the replacement, and they disagree from that moment on.
 *
 * On the wrapper element the disagreement is invisible — `motion`'s layout projection re-applies the
 * wrapper's own transform after the settled repaint has wiped it, so a camera zoom looks like it
 * worked. On the camera's LENS plates there is nothing to re-apply: they are plain divs painted only
 * from the transform state, so a `vignette` measured after a real playthrough reads `0` while the
 * row that set it reports success. That is the shape this file exists to keep out.
 */

const gameState = {
    getStory: () => ({getInversionConfig: () => ({invertX: false, invertY: false})}),
    game: {config: {width: 1920, height: 1080}},
} as unknown as GameState;

/** The row `@transform camera zoom=2 vignette=0.72 d=1s` compiles to, applied to a held state. */
function playCameraRow(held: Camera["transformState"], props: Partial<TransformDefinitions.CameraTransformProps>) {
    const transform = new Transform<TransformDefinitions.CameraTransformProps>(
        props as TransformDefinitions.CameraTransformProps,
        {duration: 1000},
    );
    const plate = {tag: "vignette"} as unknown as Element;
    const built = transform.constructAnimation({
        gameState,
        transformState: held,
        current: {tag: "camera"} as unknown as Element,
        companions: [{el: plate, project: vignetteStyle as never}],
    });
    // What `Transform.animate` does when the sequence settles.
    const lock = held.lock();
    held.overwrite(lock, built.finalState.get()).unlock(lock);
    return built;
}

describe("the transform state survives the lifecycle hooks that empty it", () => {
    it("keeps its identity across reset(), so a host that captured it still holds the live one", () => {
        const camera = new Camera();
        const held = camera.transformState;

        camera.reset();

        expect(camera.transformState).toBe(held);
        expect(camera.transformState.get().zoom).toBe(1);
        expect(camera.transformState.get().vignette).toBe(0);
    });

    it("keeps its identity across fromData(), so a load does not orphan the mounted host", () => {
        const camera = new Camera();
        const held = camera.transformState;
        const saved = new Camera();
        saved.transformState.assign(saved.transformState.lock(), {zoom: 1.4, vignette: 0.3});

        camera.fromData(saved.toData());

        expect(camera.transformState).toBe(held);
        expect(camera.transformState.get().zoom).toBe(1.4);
        expect(camera.transformState.get().vignette).toBe(0.3);
    });

    it("does not stay locked across a reset, so the next transform can still take the lock", () => {
        const camera = new Camera();
        camera.transformState.lock();

        camera.reset();

        expect(() => camera.transformState.lock()).not.toThrow();
    });

    it("is one object on every displayable, not only the camera", () => {
        const layer = new Layer();
        const held = layer.transformState;
        layer.reset();
        expect(layer.transformState).toBe(held);
    });
});

/**
 * The end of the chain: the CSS the lens plates are painted with. Asserting the transform state is
 * not enough - the defect this pins was invisible in every intermediate value and only showed up in
 * the style a plate ended the row wearing.
 */
describe("the camera's lens is painted after a row that follows newGame()", () => {
    it("shows the vignette the row asked for", () => {
        const camera = new Camera();
        const held = camera.transformState;
        camera.reset();

        const built = playCameraRow(held, {zoom: 2, vignette: 0.72});

        // The animation itself drives the plate...
        expect(built.sequences).toHaveLength(2);
        expect((built.sequences[1][1] as Record<string, unknown>).opacity).toBe(0.72);
        // ...and the settled repaint, which is the only thing that paints a plate once no animation
        // owns it, agrees with it.
        expect(vignetteStyle(camera.transformState.get()).opacity).toBe(0.72);
        expect(camera.transformState.get().zoom).toBe(2);
    });

    it("shows the shutter the row asked for", () => {
        const camera = new Camera();
        const held = camera.transformState;
        camera.reset();

        playCameraRow(held, {shutter: 1});

        expect(shutterTopStyle(camera.transformState.get()).clipPath).toBe("inset(0 0 50% 0)");
    });
});
