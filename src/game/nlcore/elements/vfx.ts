import {Actionable} from "@core/action/actionable";
import {ConfigConstructor, MergeConfig} from "@lib/util/config";
import {RuntimeScriptError} from "@core/common/Utils";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/game";
import {VfxActionContentType, VfxActionTypes} from "@core/action/actionTypes";
import {Values} from "@lib/util/data";
import {VfxAction} from "@core/action/actions/vfxAction";
import {ContentNode} from "../action/tree/actionTree";
import {EmptyObject} from "@core/elements/transition/type";
import {ElementStateRaw} from "@core/elements/story";
import type {TransformDefinitions} from "@core/elements/transform/type";

/**
 * How the overlay video is composited onto the stage.
 *
 * - `"normal"` — plain overlay for true-alpha material (VP9 `yuva420p` alpha WebM);
 *   colors stay faithful on any background.
 * - `"screen"` — additive blend for glow material rendered on a black background
 *   (light dust, rain, snow, magic sparks); tiny files, hardware decodable, but dark
 *   pixels get washed out on bright backgrounds.
 * - `"multiply"` — for shadow material rendered on a white background.
 */
export type VfxBlendMode =
    | "normal"
    | "screen"
    | "multiply"
    | "lighten"
    | "color-dodge"
    | "overlay";

export type VfxConfig = {
    src: string;
    blendMode: VfxBlendMode;
    loop: boolean;
    muted: boolean;
    opacity: number;
    playbackRate: number;
    fit: "cover" | "contain" | "fill";
    zIndex: number;
};

export type VfxFadeOptions = {
    duration?: number;
    easing?: TransformDefinitions.EasingDefinition;
};

export type VfxState = {
    display: boolean;
    paused: boolean;
};
export type VfxStateRaw = {
    state: VfxState;
};

/**
 * A full-screen looping video overlay for particle and ambience effects
 * (falling petals, light dust, rain, snow, fog, light flares).
 *
 * The effect is a pre-rendered video that plays above the scenes and videos of the
 * stage; camera transforms apply to it like any other stage content.
 */
export class Vfx extends Actionable<VfxStateRaw> {
    /**@internal */
    static DefaultVfxConfig = new ConfigConstructor<VfxConfig, EmptyObject>({
        src: "",
        blendMode: "normal",
        loop: true,
        muted: true,
        opacity: 1,
        playbackRate: 1,
        fit: "cover",
        zIndex: 0,
    });
    /**@internal */
    static DefaultVfxState = new ConfigConstructor<VfxState, EmptyObject>({
        display: false,
        paused: false,
    });

    /**@internal */
    public readonly config: Readonly<VfxConfig>;
    /**@internal */
    public state: VfxState;

    /**
     * Create a video overlay effect.
     * @param config - Source configuration; `src` is required.
     * @example
     * ```ts
     * // true-alpha material: faithful colors on any background
     * const petals = new Vfx({src: "/fx/petals-alpha.webm"});
     *
     * // black-background glow material + screen blending: tiny files
     * const dust = new Vfx({src: "/fx/dust-black.webm", blendMode: "screen", opacity: 0.9});
     * ```
     */
    constructor(config: Partial<VfxConfig> & { src: string }) {
        super();
        const vfxConfig = Vfx.DefaultVfxConfig.create(config);

        this.config = vfxConfig.get();
        this.state = this.getInitialState();

        if (!this.config.src) {
            throw new RuntimeScriptError("Vfx must have a src");
        }
    }

    /**
     * Add the overlay to the stage, fade it in, and start looping playback.
     *
     * The action waits for the fade-in to finish. Calling it while the overlay is
     * already shown is idempotent (the fade-in is re-applied).
     * @chainable
     */
    show(options?: VfxFadeOptions): Proxied<Vfx, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VfxActionTypes.show,
            [options]
        ));
    }

    /**
     * Fade the overlay out, then stop playback and remove it from the stage.
     *
     * The action waits for the fade-out to finish. Calling it while the overlay is
     * not shown is a no-op (a weak warning is logged).
     * @chainable
     */
    hide(options?: VfxFadeOptions): Proxied<Vfx, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VfxActionTypes.hide,
            [options]
        ));
    }

    /**
     * Freeze the overlay on its current frame.
     * @chainable
     */
    pause(): Proxied<Vfx, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VfxActionTypes.pause,
            []
        ));
    }

    /**
     * Continue playback from the current frame.
     * @chainable
     */
    resume(): Proxied<Vfx, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VfxActionTypes.resume,
            []
        ));
    }

    /**
     * Adjust the playback speed (e.g. `0.5` for slow drifting).
     *
     * Runtime rate changes are not persisted; after loading a saved game the rate
     * returns to `config.playbackRate`.
     * @chainable
     */
    setPlaybackRate(rate: number): Proxied<Vfx, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(
            VfxActionTypes.setRate,
            [rate]
        ));
    }

    /**@internal */
    toData(): VfxStateRaw {
        return {
            state: {
                display: this.state.display,
                paused: this.state.paused,
            }
        };
    }

    /**@internal */
    fromData(raw: ElementStateRaw): this {
        const {state} = raw;
        this.state = {
            display: state.display,
            paused: state.paused,
        };
        return this;
    }

    /**@internal */
    reset() {
        this.state = this.getInitialState();
        return this;
    }

    /**@internal */
    private getInitialState(): MergeConfig<VfxState> {
        return Vfx.DefaultVfxState.create().get();
    }

    /**@internal */
    private createAction<U extends Values<typeof VfxActionTypes>>(
        type: U,
        content: VfxActionContentType[U]
    ): VfxAction<U> {
        return new VfxAction<U>(
            this.chain(),
            type,
            ContentNode.create(content)
        );
    }
}
