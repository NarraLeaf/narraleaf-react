import {LogicAction} from "@core/action/logicAction";
import {Config, ConfigConstructor} from "@lib/util/config";
import {Transform, TransformState} from "@core/elements/transform/transform";
import {EmptyObject} from "./transition/type";
import {TransformDefinitions} from "@core/elements/transform/type";
import {Displayable} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {CommonPosition, CommonPositionType} from "@core/elements/transform/position";
import {Chained, Proxied} from "../action/chain";

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
/**@internal */
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
 *     story.camera.reset(600),                 // return to the neutral pose
 * ]);
 * ```
 */
export class Camera
    extends Displayable<CameraDataRaw, Camera, TransformDefinitions.ImageTransformProps>
    implements EventfulDisplayable {

    /**
     * @internal
     * {@link ICameraUserConfig}
     */
    static DefaultUserConfig = new ConfigConstructor<ICameraUserConfig, EmptyObject>({
        ...TransformState.DefaultTransformState.getDefaultConfig(),
        // The camera wraps the whole stage; a default opacity of 0 (inherited from the transform
        // defaults) would hide everything, so it must start fully opaque like a Layer does.
        opacity: 1,
    });

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
     * @chainable
     */
    public reset(
        duration?: number,
        easing?: TransformDefinitions.EasingDefinition
    ): Proxied<Camera, Chained<LogicAction.Actions, Camera>> {
        return this.transform(new Transform<TransformDefinitions.ImageTransformProps>({
            position: new CommonPosition(CommonPositionType.Center),
            scaleX: 1,
            scaleY: 1,
            zoom: 1,
            rotation: 0,
            opacity: 1,
            filter: "none",
        }, {duration, ease: easing}));
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
