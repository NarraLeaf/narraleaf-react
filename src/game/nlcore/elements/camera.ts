import {LogicAction} from "@core/action/logicAction";
import {Config, ConfigConstructor} from "@lib/util/config";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {EmptyObject} from "./transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {Displayable, DisplayableLoopRaw} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {CommonPosition, CommonPositionType} from "@core/elements/transform/position";
import {Chained, Proxied} from "../action/chain";
import {RuntimeGameError} from "@core/common/Utils";
import {CameraLensDefaults} from "@core/elements/cameraLens";

/**
 * The public constructor config for a {@link Camera}.
 *
 * A camera is transformed exactly like any other displayable, so its initial pose is described
 * with the same {@link TransformDefinitions.ImageTransformProps} fields (position, zoom, scale,
 * rotation, opacity, filter, ...), plus the lens channels
 * ({@link TransformDefinitions.CameraLensProps}) only a camera has.
 */
export type ICameraUserConfig = TransformDefinitions.CameraTransformProps;

/**@internal */
type CameraConfig = {
    name: string;
};
export type CameraDataRaw = {
    transformState: Record<string, any>;
    loop?: DisplayableLoopRaw | null;
};

/**
 * A stage-wide camera.
 *
 * The camera applies a {@link Transform} (pan / zoom / rotate / scale / opacity) and a
 * darken/color-grade to the **whole stage as a single unit** — every scene, its backgrounds and
 * sprites, and videos move together, while the dialog box, menus and NVL layer stay fixed.
 *
 * A story always has one default camera, reachable as {@link Story.camera}; you rarely construct
 * one yourself. Camera actions are authored like any other displayable action:
 *
 * @example
 * ```ts
 * scene.action([
 *     story.camera.zoom(2, 800, "easeInOut"),  // zoom the whole stage in
 *     story.camera.pan({ xalign: 0.3 }, 800),  // slide the view left
 *     story.camera.darken(0.6, 500),           // dim the stage
 *     jS`It's getting dark...`,
 *     story.camera.resetCamera(600),           // return to the neutral pose
 * ]);
 * ```
 */
export class Camera
    extends Displayable<CameraDataRaw, Camera, TransformDefinitions.CameraTransformProps>
    implements EventfulDisplayable {

    /**@internal */
    private static _defaultUserConfig: ConfigConstructor<ICameraUserConfig, EmptyObject> | null = null;

    /**
     * Built on first use rather than while this module is evaluating.
     *
     * The spread reads `TransformState` out of another module, and this one is reached from
     * `story.ts` inside a cycle with it — so at evaluation time `TransformState` is still `undefined`
     * and the throw names neither module. Reading the defaults on demand settles it rather than
     * depending on where in the cycle this module lands.
     *
     * This is also the camera's *transform state* default table, not merely its constructor
     * defaults, and the two roles are the same table on purpose. `ConfigConstructor` copies only the
     * keys its own defaults declare, so a prop missing from whichever table
     * {@link Camera.getInitialTransformState} reads is dropped on the floor at construction with no
     * error anywhere — which is exactly what would happen to the lens channels if this deferred to
     * the shared `TransformState.DefaultTransformState`. Adding them *there* is the other wrong
     * answer: that table is every image's, text's, layer's and puppet's too, and none of them has a
     * lens.
     *
     * @internal
     * {@link ICameraUserConfig}
     */
    static get DefaultUserConfig(): ConfigConstructor<ICameraUserConfig, EmptyObject> {
        return (Camera._defaultUserConfig ??= new ConfigConstructor<ICameraUserConfig, EmptyObject>({
            ...TransformState.DefaultTransformState.getDefaultConfig(),
            // The camera wraps the whole stage; a default opacity of 0 (inherited from the transform
            // defaults) would hide everything, so it must start fully opaque like a Layer does.
            opacity: 1,
            ...CameraLensDefaults,
        }));
    }

    /**
     * @internal
     * {@link CameraConfig}
     */
    static DefaultConfig = new ConfigConstructor<CameraConfig, EmptyObject>({
        name: "(camera)",
    });

    /**@internal */
    public config: CameraConfig;
    /**@internal */
    public readonly transformState: TransformState<TransformDefinitions.CameraTransformProps>;
    /**@internal */
    private userConfig: Config<ICameraUserConfig>;

    /**
     * Create a camera. A story already owns a default one ({@link Story.camera}); construct your
     * own only to override the initial pose via the story config.
     * @param config - Optional initial pose (zoom, position, rotation, ...).
     * @example
     * ```ts
     * const camera = new Camera({ zoom: 1.2 });
     * const story = new Story("entry", { camera });
     * ```
     */
    constructor(config: Partial<ICameraUserConfig> = {}) {
        super();
        const userConfig = Camera.DefaultUserConfig.create(config);
        const cameraConfig = Camera.DefaultConfig.create();

        this.userConfig = userConfig;
        this.config = cameraConfig.get();
        this.transformState = this.getInitialTransformState();
    }

    /**
     * Pan the camera so the given position sits at the centre of the view.
     *
     * Alias of {@link Displayable.pos} with camera-oriented naming.
     * @chainable
     */
    public pan(
        position: TransformDefinitions.ImageTransformProps["position"],
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Camera, Chained<LogicAction.Actions>> {
        return this.pos(position, duration, easing);
    }

    /**
     * Darken the whole stage.
     *
     * Uses the same mechanism as {@link Image.darken}: it drives the camera's CSS `filter` to
     * `brightness(1 - darkness)`. Because darken shares the single `filter` channel, combining it
     * with other filters (e.g. `blur`) means writing the full filter string yourself via
     * {@link Displayable.filter}.
     * @param darkness - How dark, between `0` (normal) and `1` (black).
     * @chainable
     */
    public darken(
        darkness: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Camera, Chained<LogicAction.Actions, Camera>> {
        const clamped = Math.max(0, Math.min(1, darkness));
        return this.filter(`brightness(${1 - clamped})`, {duration, ease: easing});
    }

    /**
     * Close or open the shutter: two blades that meet in the middle of the frame.
     *
     * `1` is fully shut and `0` fully open, and everything between is a partial cover — which makes
     * a small standing value a letterbox rather than a blink, `0.12` being about a cinematic matte.
     * A blink is this driven to `1` and back; the timing of one is the story's to choose, so the
     * engine offers the channel rather than a named routine.
     *
     * @param shutter - Coverage between `0` (open) and `1` (shut). Out-of-range values are clamped.
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     story.camera.shutter(1, 180, "easeInOut"),
     *     story.camera.shutter(0, 220, "easeInOut"),
     * ]);
     * ```
     */
    public shutter(
        shutter: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Camera, Chained<LogicAction.Actions, Camera>> {
        return this.lens({shutter: Camera.clampLens(shutter)}, {duration, ease: easing});
    }

    /**
     * Darken the corners of the frame.
     *
     * Unlike {@link Camera.darken}, which is a filter over the picture, this is a plate over the
     * *view*: it does not move with the camera, so a vignette holds still while the stage
     * underneath it zooms, pans and rotates. Adjust its falloff with {@link Camera.lens}.
     *
     * @param vignette - Strength between `0` (none) and `1`. Out-of-range values are clamped.
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     story.camera.vignette(0.72, 300, "easeInOut"),
     *     jS`Everything narrowed to the middle of the room.`,
     *     story.camera.vignette(0, 300, "easeInOut"),
     * ]);
     * ```
     */
    public vignette(
        vignette: number,
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Camera, Chained<LogicAction.Actions, Camera>> {
        return this.lens({vignette: Camera.clampLens(vignette)}, {duration, ease: easing});
    }

    /**
     * Set any of the lens channels at once — the two strengths and the colour and falloff geometry
     * they are drawn with.
     *
     * The geometry fields take effect the next time the strength they belong to is above `0`, so
     * they are usually set as a cut before the effect is faded in.
     *
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     story.camera.lens({vignetteColor: "#1a0b2e", vignetteInner: "20%", vignetteOuter: "95%"}),
     *     story.camera.vignette(0.9, 400),
     * ]);
     * ```
     */
    public lens(
        lens: TransformDefinitions.CameraLensProps,
        options?: TransformDefinitions.VisualEffectOptions
    ): Proxied<Camera, Chained<LogicAction.Actions, Camera>> {
        return this.transform(new Transform<TransformDefinitions.CameraTransformProps>(
            lens,
            options
        ));
    }

    /**
     * Return the camera to its neutral pose: centred, zoom `1`, no rotation, fully opaque, no
     * filter (which also clears {@link Camera.darken}) and no lens effect — the shutter opens and
     * the vignette lifts.
     *
     * Named `resetCamera` rather than `reset` because every element already owns an internal
     * `reset()` lifecycle hook — the one the engine calls when a new game starts — and an authoring
     * helper of the same name would quietly stand in for it.
     * @chainable
     * @example
     * ```ts
     * scene.action([
     *     story.camera.zoom(2, 800),
     *     story.camera.resetCamera(600),
     * ]);
     * ```
     */
    public resetCamera(
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Camera, Chained<LogicAction.Actions, Camera>> {
        // Two sequences, and the split is the whole point: the filter is dropped in its own
        // zero-duration step BEFORE the pose eases.
        //
        // A filter chain carrying `hue-rotate` cannot be interpolated back to neutral. Easing
        // `grayscale(1) sepia(1) hue-rotate(185deg) saturate(4) brightness(0.55)` toward `"none"`
        // walks the angle back through 185 degrees of the colour wheel while `grayscale`
        // simultaneously lets the source's own hues return underneath it, so the midpoint is not
        // a paler grade but a different colour outright — blue, then cyan, then green, then
        // olive, on the way out of a moonlight grade. Every other prop here interpolates
        // perfectly well, which is why only the filter is lifted out instead of the whole
        // reset being made instant.
        //
        // The lens geometry is restored in a third step, after the fade rather than with the
        // filter, for the same class of reason: snapping the falloff radius while the vignette is
        // still visible is a visible jump, whereas once the strength has reached 0 the geometry is
        // inert and can be cut back to neutral without showing.
        return this.transform(new Transform<TransformDefinitions.CameraTransformProps>([
            {
                props: {filter: "none"},
                options: {duration: 0},
            },
            {
                props: {
                    position: new CommonPosition(CommonPositionType.Center),
                    scaleX: 1,
                    scaleY: 1,
                    zoom: 1,
                    rotation: 0,
                    opacity: 1,
                    // Eased, not cut: this is the only way out of a closed shutter an author has,
                    // and a cut would open the eyes with a snap.
                    shutter: CameraLensDefaults.shutter,
                    vignette: CameraLensDefaults.vignette,
                },
                options: {duration, ease: easing},
            },
            {
                props: {
                    shutterColor: CameraLensDefaults.shutterColor,
                    vignetteColor: CameraLensDefaults.vignetteColor,
                    vignetteInner: CameraLensDefaults.vignetteInner,
                    vignetteOuter: CameraLensDefaults.vignetteOuter,
                },
                options: {duration: 0},
            },
        ]));
    }

    /**
     * Lens strengths are read straight into a CSS `inset()` and an opacity, so they are clamped at
     * the authoring end rather than trusted.
     * @internal
     */
    private static clampLens(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }
        return Math.max(0, Math.min(1, value));
    }

    /**
     * Not available on a camera: a camera has no front or back to be moved to.
     *
     * `bringToFront` reorders the list of elements a layer draws, and the camera is in no such list
     * — it is the thing those lists are drawn *inside*. Every layer of every scene moves with it as
     * one unit, which is the whole point of it, and there is therefore no sprite it could be put in
     * front of. This is not a matter of the camera not being on stage yet, which is what the
     * inherited error would have said: waiting changes nothing, because the camera never enters a
     * layer at all.
     *
     * Reach for a transform instead — `zoom`, or {@link Camera.pan} — if the goal was to
     * bring something into view.
     *
     * @throws RuntimeGameError - always
     */
    public override bringToFront(): never {
        throw new RuntimeGameError(
            "A camera cannot be brought to front. It is not an element inside a layer, it is what the layers are viewed through, "
            + "so it has nothing to be in front of — waiting for it to be added to the stage will not help. "
            + `Use a camera transform such as Camera.zoom or Camera.pan to change what is in view. (camera: ${this.config.name})`
        );
    }

    /**
     * The lifecycle hook, not the authoring helper — see {@link Camera.resetCamera} for the
     * chainable one. Returns the camera to the pose its constructor config describes, so a new game
     * or a freshly loaded save never inherits the previous playthrough's framing.
     *
     * **The state object is emptied, never replaced** ({@link TransformState.resetTo}). The mounted
     * `<Camera>` captured this object when it bound the element and keeps animating and repainting
     * THAT object for as long as it stays mounted; handing the camera a fresh one here — while
     * `newGame()` runs, with the player already on screen — would leave the host driving an orphan.
     * The camera is where that goes visibly wrong, because its lens plates are painted only from the
     * settled state: a `vignette` the story set would be drawn for one frame and then wiped by the
     * next settled repaint, which reads the replacement and finds nothing there.
     * @internal
     */
    override reset(): this {
        super.reset();
        this.transformState.resetTo(this.getInitialTransformState().get());
        return this;
    }

    /**@internal */
    public toData(): CameraDataRaw {
        return {
            transformState: this.transformState.serialize(),
            loop: this._serializeLoop(),
        };
    }

    /**@internal */
    public fromData(data: CameraDataRaw): this {
        this.transformState.resetTo(
            TransformState.deserialize<TransformDefinitions.CameraTransformProps>(data.transformState).get());
        this._deserializeLoop(data.loop);
        return this;
    }

    /**@internal */
    copy(): Camera {
        return new Camera(this.userConfig.get());
    }

    /**@internal */
    private getInitialTransformState(): TransformState<TransformDefinitions.CameraTransformProps> {
        // Both the key list and the merge come from the camera's own table. Reading them from the
        // shared image defaults instead is how a new camera-only prop gets silently dropped here.
        const [transformState] =
            this.userConfig.extract(Camera.DefaultUserConfig.keys() as Extract<keyof ICameraUserConfig, string>[]);
        return new TransformState(Camera.DefaultUserConfig.create(transformState.get()).get());
    }
}
