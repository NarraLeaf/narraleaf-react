import {LogicAction} from "@core/action/logicAction";
import {Config, ConfigConstructor} from "@lib/util/config";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {EmptyObject} from "./transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {Displayable} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {CommonPosition, CommonPositionType} from "@core/elements/transform/position";
import {Chained, Proxied} from "../action/chain";
import {RuntimeGameError} from "@core/common/Utils";

/**
 * The public constructor config for a {@link Camera}.
 *
 * A camera is transformed exactly like any other displayable, so its initial pose is described
 * with the same {@link TransformDefinitions.ImageTransformProps} fields (position, zoom, scale,
 * rotation, opacity, filter, ...).
 */
export type ICameraUserConfig = TransformDefinitions.ImageTransformProps;

/**@internal */
type CameraConfig = {
    name: string;
};
export type CameraDataRaw = {
    transformState: Record<string, any>;
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
    extends Displayable<CameraDataRaw, Camera, TransformDefinitions.ImageTransformProps>
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
     * @internal
     * {@link ICameraUserConfig}
     */
    static get DefaultUserConfig(): ConfigConstructor<ICameraUserConfig, EmptyObject> {
        return (Camera._defaultUserConfig ??= new ConfigConstructor<ICameraUserConfig, EmptyObject>({
            ...TransformState.DefaultTransformState.getDefaultConfig(),
            // The camera wraps the whole stage; a default opacity of 0 (inherited from the transform
            // defaults) would hide everything, so it must start fully opaque like a Layer does.
            opacity: 1,
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
    public transformState: TransformState<TransformDefinitions.ImageTransformProps>;
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
     * Return the camera to its neutral pose: centred, zoom `1`, no rotation, fully opaque and no
     * filter (which also clears {@link Camera.darken}).
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
        return this.transform(new Transform<TransformDefinitions.ImageTransformProps>([
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
                },
                options: {duration, ease: easing},
            },
        ]));
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
     * @internal
     */
    override reset(): this {
        super.reset();
        this.transformState = this.getInitialTransformState();
        return this;
    }

    /**@internal */
    public toData(): CameraDataRaw {
        return {
            transformState: this.transformState.serialize(),
        };
    }

    /**@internal */
    public fromData(data: CameraDataRaw): this {
        this.transformState =
            TransformState.deserialize<TransformDefinitions.ImageTransformProps>(data.transformState);
        return this;
    }

    /**@internal */
    copy(): Camera {
        return new Camera(this.userConfig.get());
    }

    /**@internal */
    private getInitialTransformState(): TransformState<TransformDefinitions.ImageTransformProps> {
        const [transformState] = this.userConfig.extract(TransformState.DefaultTransformState.keys());
        return new TransformState(TransformState.DefaultTransformState.create(transformState.get()).get());
    }
}
