import {
    Control,
    Image,
    Layer,
    Transform,
} from "narraleaf-react";
import type {
    Scene,
    TransformDefinitions,
} from "narraleaf-react";

export type ScreenEffectColor = string | {
    r: number;
    g: number;
    b: number;
    a?: number;
};

export type EffectLayerOptions = {
    name?: string;
    zIndex?: number;
};

export type BlinkOptions = {
    closeDuration?: number;
    hold?: number;
    openDuration?: number;
    easing?: TransformDefinitions.EasingDefinition;
    color?: ScreenEffectColor;
};

export type VignetteOptions = {
    duration?: number;
    opacity?: number;
    color?: ScreenEffectColor;
    inner?: string;
    outer?: string;
    hold?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

const sceneEffectLayers = new WeakMap<Scene, Layer>();

export function effectLayer(scene: Scene, options: EffectLayerOptions = {}): Layer {
    const existingLayer = sceneEffectLayers.get(scene);
    if (existingLayer) {
        return existingLayer;
    }

    const layer = new Layer(options.name ?? "[[Effect Layer of " + scene.config.name + "]]", {
        zIndex: options.zIndex ?? 1000,
    });
    scene.config.layers.push(layer);
    sceneEffectLayers.set(scene, layer);

    return layer;
}

/**
 * @deprecated Superseded by the camera lens in 0.31.0. This draws into a scene-level layer,
 * which sits inside the camera transform, so it scales and rotates with the camera; it is also
 * tied to a scene while the camera is tied to the story. Use `Camera.shutter()` instead.
 */
export function blink(scene: Scene, options: BlinkOptions = {}): ReturnType<typeof Control.do> {
    const {
        closeDuration = 180,
        hold = 100,
        openDuration = 220,
        easing = "easeInOut",
        color = "#000",
    } = options;
    const layer = effectLayer(scene);
    const top = createScreenOverlay("[[Blink Top of " + scene.config.name + "]]", color, layer);
    const bottom = createScreenOverlay("[[Blink Bottom of " + scene.config.name + "]]", color, layer);

    return Control.do([
        Control.all([
            top.transform(createVisualEffectTransform([
                [{opacity: 1, clipPath: "inset(0 0 100% 0)"}, {duration: 0}],
                [{clipPath: "inset(0 0 50% 0)"}, {duration: closeDuration, ease: easing}],
            ])),
            bottom.transform(createVisualEffectTransform([
                [{opacity: 1, clipPath: "inset(100% 0 0 0)"}, {duration: 0}],
                [{clipPath: "inset(50% 0 0 0)"}, {duration: closeDuration, ease: easing}],
            ])),
        ]),
        ...(hold > 0 ? [Control.sleep(hold)] : []),
        Control.all([
            top.transform(createVisualEffectTransform([
                [{clipPath: "inset(0 0 50% 0)"}, {duration: 0}],
                [{clipPath: "inset(0 0 100% 0)"}, {duration: openDuration, ease: easing}],
                [{opacity: 0, clipPath: "inset(0 0 100% 0)"}, {duration: 0}],
            ])),
            bottom.transform(createVisualEffectTransform([
                [{clipPath: "inset(50% 0 0 0)"}, {duration: 0}],
                [{clipPath: "inset(100% 0 0 0)"}, {duration: openDuration, ease: easing}],
                [{opacity: 0, clipPath: "inset(100% 0 0 0)"}, {duration: 0}],
            ])),
        ]),
        Control.all([
            Control.do([
                top.opacity(0, 0),
                top.clearClip({duration: 0}),
            ]),
            Control.do([
                bottom.opacity(0, 0),
                bottom.clearClip({duration: 0}),
            ]),
        ]),
    ]);
}

/**
 * @deprecated Superseded by the camera lens in 0.31.0. This draws into a scene-level layer,
 * which sits inside the camera transform, so it scales and rotates with the camera; it is also
 * tied to a scene while the camera is tied to the story. Use `Camera.vignette()` instead.
 */
export function vignette(scene: Scene, options: VignetteOptions = {}): ReturnType<typeof Control.do> {
    const {
        duration = 300,
        opacity = 0.72,
        color = "#000",
        inner = "44%",
        outer = "78%",
        hold = 600,
        easing = "easeInOut",
    } = options;
    const layer = effectLayer(scene);
    const overlay = createScreenOverlay("[[Vignette of " + scene.config.name + "]]", color, layer);
    const maskImage = `radial-gradient(circle at center, transparent ${inner}, black ${outer})`;

    return Control.do([
        overlay.transform(createVisualEffectTransform([
            [{
                opacity: 0,
                maskImage,
                maskSize: "100% 100%",
                maskPosition: "center",
                maskRepeat: "no-repeat",
                maskMode: "alpha",
            }, {duration: 0}],
            [{opacity}, {duration, ease: easing}],
        ])),
        ...(hold > 0 ? [Control.sleep(hold)] : []),
        overlay.transform(createVisualEffectTransform([
            [{opacity: 0}, {duration, ease: easing}],
        ])),
        overlay.clearMask({duration: 0}),
    ]);
}

function createScreenOverlay(name: string, color: ScreenEffectColor, layer: Layer): Image {
    return new Image({
        name,
        src: color as any,
        autoFit: true,
        opacity: 0,
        layer,
    });
}

function createVisualEffectTransform(
    frames: readonly (readonly [
        Partial<TransformDefinitions.ImageTransformProps>,
        TransformDefinitions.VisualEffectOptions
    ])[]
): Transform<TransformDefinitions.ImageTransformProps> {
    return new Transform<TransformDefinitions.ImageTransformProps>(frames.map(([props, options]) => ({
        props,
        options,
    })));
}
