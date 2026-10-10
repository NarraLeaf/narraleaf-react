import {describe, expect, it} from "vitest";
import {cameraStageShift, MIN_PARALLAX_SCALE, parallaxStyle, ParallaxFrame} from "@core/elements/cameraParallax";
import {Layer} from "@core/elements/layer";
import {Scene} from "@core/elements/scene";
import {TransformState} from "@core/elements/transform/transform";

// The default story origin: measured from the bottom-left corner.
const frame: ParallaxFrame = {width: 1920, height: 1080, invertX: false, invertY: true};

function parse(style: object): { x: number; y: number; scale: number } {
    const transform = String((style as { transform?: unknown }).transform);
    const match = /^translate\((-?[\d.]+)%, (-?[\d.]+)%\) scale\((-?[\d.]+)\)$/.exec(transform);
    expect(match, `unexpected transform: ${transform}`).not.toBeNull();
    return {x: parseFloat(match![1]), y: parseFloat(match![2]), scale: parseFloat(match![3])};
}

/**
 * Where a point of the layer at its own centre-relative `local` ends up on screen, relative to the
 * stage centre, with the camera's own transform applied over the wrapper's - the composition the
 * player draws. Pixels throughout.
 */
function onScreen(
    camera: { shiftX: number; shiftY: number; zoom: number; rotation: number },
    wrapper: { x: number; y: number; scale: number },
    local: { x: number; y: number },
): { x: number; y: number } {
    const px = wrapper.x / 100 * frame.width + wrapper.scale * local.x;
    const py = wrapper.y / 100 * frame.height + wrapper.scale * local.y;
    const angle = camera.rotation * Math.PI / 180;
    const sx = camera.zoom * px;
    const sy = camera.zoom * py;
    return {
        x: camera.shiftX + Math.cos(angle) * sx - Math.sin(angle) * sy,
        y: camera.shiftY + Math.sin(angle) * sx + Math.cos(angle) * sy,
    };
}

describe("cameraStageShift", () => {
    it("reads the camera's offsets along the screen's axes, whatever corner the story measures from", () => {
        const shift = cameraStageShift({position: {xalign: 0.5, yalign: 0.5, xoffset: 100, yoffset: 54}}, frame);
        expect(shift.x).toBeCloseTo(100, 3);
        // Measured up from the bottom: a positive offset lifts the stage, which is up the screen.
        expect(shift.y).toBeCloseTo(-54, 3);
    });

    it("reads an align as the same distance the wrapper is moved", () => {
        const shift = cameraStageShift({position: {xalign: 0.25, yalign: 0.5}}, frame);
        expect(shift.x).toBeCloseTo(-480, 3);
        expect(shift.y).toBeCloseTo(0, 3);
    });

    it("reads a camera with no position as a camera that has not moved", () => {
        expect(cameraStageShift({}, frame)).toEqual({x: 0, y: 0});
    });
});

describe("parallaxStyle", () => {
    it("leaves a layer that follows the camera exactly where the camera puts it", () => {
        const style = parse(parallaxStyle({
            position: {xalign: 0.3, yalign: 0.6, xoffset: 40, yoffset: -20},
            zoom: 1.7,
            rotation: 12,
        }, 1, frame));
        expect(style.x).toBeCloseTo(0, 6);
        expect(style.y).toBeCloseTo(0, 6);
        expect(style.scale).toBe(1);
    });

    it("moves a far layer the share of the pan its distance gives it", () => {
        const style = parse(parallaxStyle({position: {xalign: 0.5, yalign: 0.5, xoffset: 100}}, 0.3, frame));
        const centre = onScreen({shiftX: 100, shiftY: 0, zoom: 1, rotation: 0}, style, {x: 0, y: 0});
        expect(centre.x).toBeCloseTo(30, 1);
        expect(centre.y).toBeCloseTo(0, 1);
    });

    it("moves a near layer further than the camera", () => {
        const style = parse(parallaxStyle({position: {xalign: 0.5, yalign: 0.5, xoffset: 100}}, 1.4, frame));
        const centre = onScreen({shiftX: 100, shiftY: 0, zoom: 1, rotation: 0}, style, {x: 0, y: 0});
        expect(centre.x).toBeCloseTo(140, 1);
    });

    it("grows a layer by its share of the camera's zoom", () => {
        const style = parse(parallaxStyle({zoom: 1.5}, 0.3, frame));
        // 1 + 0.3 * (1.5 - 1) = 1.15, drawn inside a camera that already grows it by 1.5.
        expect(style.scale * 1.5).toBeCloseTo(1.15, 3);
    });

    it("keeps a layer with no parallax still under a camera that pans and zooms at once", () => {
        const style = parse(parallaxStyle({position: {xalign: 0.5, yalign: 0.5, xoffset: 100, yoffset: 30}, zoom: 2}, 0, frame));
        const camera = {shiftX: 100, shiftY: -30, zoom: 2, rotation: 0};
        const centre = onScreen(camera, style, {x: 0, y: 0});
        expect(centre.x).toBeCloseTo(0, 1);
        expect(centre.y).toBeCloseTo(0, 1);
        // And at its own size: a point 100 px right of its centre is still 100 px right of the stage centre.
        expect(onScreen(camera, style, {x: 100, y: 0}).x).toBeCloseTo(100, 1);
    });

    it("undoes the camera's rotation before correcting the pan, so the correction is not turned with it", () => {
        const style = parse(parallaxStyle({position: {xalign: 0.5, yalign: 0.5, xoffset: 100}, rotation: 90}, 0, frame));
        const centre = onScreen({shiftX: 100, shiftY: 0, zoom: 1, rotation: 90}, style, {x: 0, y: 0});
        expect(centre.x).toBeCloseTo(0, 1);
        expect(centre.y).toBeCloseTo(0, 1);
    });

    it("never draws a near layer inside out when the camera pulls far back", () => {
        const style = parse(parallaxStyle({zoom: 0.2}, 1.5, frame));
        expect(style.scale * 0.2).toBeCloseTo(MIN_PARALLAX_SCALE, 4);
    });

    it("names the same two functions for every pose, so two poses interpolate rather than snap", () => {
        const still = String(parallaxStyle({}, 0.3, frame).transform);
        const moved = String(parallaxStyle({position: {xalign: 0.2, yalign: 0.5}, zoom: 1.3, rotation: 5}, 0.3, frame).transform);
        const functions = (value: string) => value.match(/[a-z]+(?=\()/gi);
        expect(functions(still)).toEqual(["translate", "scale"]);
        expect(functions(moved)).toEqual(functions(still));
    });
});

describe("Layer parallax", () => {
    it("follows the camera exactly unless told otherwise", () => {
        expect(new Layer("plain").getParallax()).toBe(1);
    });

    it("keeps the parallax it was built with, and through a copy", () => {
        const far = new Layer("far", {zIndex: -2, parallax: 0.3});
        expect(far.getParallax()).toBe(0.3);
        expect(far.copy().getParallax()).toBe(0.3);
    });

    it("is not part of the layer's transform, so it never reaches a save or a reset", () => {
        const far = new Layer("far", {parallax: 0.3});
        expect(Object.keys(far.transformState.get())).not.toContain("parallax");
        expect(TransformState.DefaultTransformState.keys()).not.toContain("parallax");
    });

    it("reads anything but a finite number as following the camera", () => {
        expect(new Layer("broken", {parallax: Number.NaN}).getParallax()).toBe(1);
    });
});

describe("Scene backgroundLayerParallax", () => {
    it("gives the scene's own background layer its parallax and leaves the sprites' layer alone", () => {
        const scene = new Scene("street", {backgroundLayerParallax: 0.6});
        expect(scene.backgroundLayer.getParallax()).toBe(0.6);
        expect(scene.displayableLayer.getParallax()).toBe(1);
    });

    it("does not leak into the next scene through the shared default layer", () => {
        new Scene("first", {backgroundLayerParallax: 0.2});
        expect(new Scene("second").backgroundLayer.getParallax()).toBe(1);
    });
});
