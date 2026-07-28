import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {RuntimeScriptError} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {TransformState} from "@core/elements/transform/transform";
import {DisplayableActionContentType, DisplayableActionTypes} from "@core/action/actionTypes";
import {EmptyObject} from "@core/elements/transition/type";
import {IPosition, PositionUtils} from "@core/elements/transform/position";
import {EventDispatcher} from "@lib/util/data";
import {Displayable} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Config, ConfigConstructor} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {Layer} from "@core/elements/layer";
import type {LiveGameEventToken} from "@core/types";
import type {
    PuppetDescription,
    PuppetInstance,
    PuppetSize,
    PuppetState,
    PuppetStatus,
} from "@core/game/puppet/puppetBackend";

export type PuppetConfig = {
    backend: string;
    src: string;
    options: Record<string, unknown>;
    size: PuppetSize | null;
    className?: string;
    layer: Layer | undefined;
};

export interface IPuppetUserConfig extends TransformDefinitions.ImageTransformProps {
    /**
     * Name of the registered backend that draws this puppet.
     *
     * See {@link import("@core/game").Game.registerPuppetBackend}.
     */
    backend: string;
    /**
     * The resource descriptor handed to the backend, passed through verbatim.
     *
     * **A puppet cannot change its `src`.** The backend's instance lives for as long as the element
     * is on stage, and swapping the model underneath it would mean tearing that instance down while
     * the engine's box, transform and saved state stay put. Use a second element instead.
     */
    src: string;
    /** Backend-specific options, passed through verbatim. */
    options: Record<string, unknown>;
    /**
     * The logical size of the box, in pixels. Defaults to the stage size.
     *
     * The backend scales its own content inside the box; the element's transform (position, zoom,
     * scale, rotation) applies on top of it, exactly as it would to an image.
     */
    size: PuppetSize | null;
    className?: string;
    /** Layer of the puppet. */
    layer?: Layer;
    /** Initial motion. Part of the saved state, so it survives a save/load round trip. */
    motion: string | null;
    /** Initial expression. */
    expression: string | null;
    /** Initial skin. */
    skin: string | null;
    /** Initial numeric parameters. */
    params: Record<string, number>;
    /** Initial string slots. */
    slots: Record<string, string | null>;
}

/**@internal */
export type PuppetDataRaw = {
    state: Record<string, any>;
    transformState: Record<string, any>;
};

/**@internal */
export type PuppetEvents = {
    "event:puppet.statusChange": [PuppetStatus];
};

/**
 * A displayable whose interior is drawn by a backend the host registered.
 *
 * The engine gives a puppet everything a displayable has — a position on a layer, a transform, an
 * opacity, an entry in the saved game — and nothing else. What appears inside its box is decided
 * entirely by {@link import("@core/game/puppet/puppetBackend").PuppetBackend}, which the engine
 * neither ships nor understands.
 *
 * When no backend answers to `config.backend`, the element degrades quietly: it keeps its place,
 * its transform and its state, warns once, and draws nothing.
 *
 * @example
 * ```ts
 * const alice = new Puppet({
 *     backend: "my-renderer",
 *     src: "models/alice/alice.model.json",
 *     size: {width: 900, height: 1200},
 *     position: {xalign: 0.3},
 * });
 * ```
 */
export class Puppet
    extends Displayable<PuppetDataRaw, Puppet, TransformDefinitions.ImageTransformProps>
    implements EventfulDisplayable {
    /**@internal */
    static DefaultUserConfig = new ConfigConstructor<IPuppetUserConfig, {
        position: IPosition;
    }>({
        backend: "",
        src: "",
        options: {},
        size: null,
        className: "",
        layer: undefined,
        motion: null,
        expression: null,
        skin: null,
        params: {},
        slots: {},
        ...TransformState.DefaultTransformState.getDefaultConfig(),
    }, {
        position: (value) => PositionUtils.tryParsePosition(value),
    });

    /**@internal */
    static DefaultPuppetConfig = new ConfigConstructor<PuppetConfig, EmptyObject>({
        backend: "",
        src: "",
        options: {},
        size: null,
        className: "",
        layer: undefined,
    });

    /**
     * Normalise a raw state object into a complete {@link PuppetState}.
     *
     * Keys this engine does not know are carried through untouched, so a save written by a newer
     * engine loads here without losing them and without crashing on them.
     *
     * @internal
     */
    static normalizeState(raw: unknown): PuppetState {
        const source: Record<string, unknown> =
            (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw as Record<string, unknown> : {};
        return {
            ...source,
            motion: typeof source.motion === "string" ? source.motion : null,
            expression: typeof source.expression === "string" ? source.expression : null,
            skin: typeof source.skin === "string" ? source.skin : null,
            params: Puppet.copyParams(source.params),
            slots: Puppet.copySlots(source.slots),
        } as PuppetState;
    }

    /**
     * Merge a patch over a state. `params` and `slots` are merged key by key rather than replaced,
     * so an editor can nudge one parameter without restating the rest.
     *
     * @internal
     */
    static mergeState(base: Readonly<PuppetState>, patch: Partial<PuppetState>): PuppetState {
        return Puppet.normalizeState({
            ...base,
            ...patch,
            params: {...base.params, ...(patch.params || {})},
            slots: {...base.slots, ...(patch.slots || {})},
        });
    }

    /**@internal */
    private static copyParams(raw: unknown): Record<string, number> {
        const result: Record<string, number> = {};
        if (!raw || typeof raw !== "object") {
            return result;
        }
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof value === "number" && Number.isFinite(value)) {
                result[key] = value;
            }
        }
        return result;
    }

    /**@internal */
    private static copySlots(raw: unknown): Record<string, string | null> {
        const result: Record<string, string | null> = {};
        if (!raw || typeof raw !== "object") {
            return result;
        }
        for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
            if (typeof value === "string" || value === null) {
                result[key] = value;
            }
        }
        return result;
    }

    /**@internal */
    readonly config: Readonly<PuppetConfig>;
    /**@internal */
    public transformState: TransformState<TransformDefinitions.ImageTransformProps>;
    /**@internal */
    public state: PuppetState;
    /**@internal */
    public readonly events = new EventDispatcher<PuppetEvents>();
    /**@internal */
    private userConfig: Config<IPuppetUserConfig, { position: IPosition }>;
    /**@internal */
    private instance: PuppetInstance | null = null;
    /**@internal */
    private status: PuppetStatus = "unmounted";

    constructor(config: Partial<IPuppetUserConfig> & { backend: string; src: string }) {
        super();
        const userConfig = Puppet.DefaultUserConfig.create(config);
        const puppetConfig = Puppet.DefaultPuppetConfig.create(userConfig.get());

        this.userConfig = userConfig;
        this.config = puppetConfig.get();
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState(userConfig);

        if (!this.config.backend) {
            throw new RuntimeScriptError("Puppet must have a backend name");
        }
        if (!this.config.src) {
            throw new RuntimeScriptError("Puppet must have a src");
        }
    }

    /**
     * Override the layer used to render this puppet.
     * @param layer - The layer to assign to the puppet.
     */
    public useLayer(layer: Layer): this {
        this.userConfig.get().layer = layer;
        Object.assign(this.config, {layer});
        return this;
    }

    /**@internal */
    toData(): PuppetDataRaw {
        return {
            state: Puppet.normalizeState(this.state) as Record<string, any>,
            transformState: this.transformState.serialize(),
        };
    }

    /**@internal */
    fromData(data: PuppetDataRaw): this {
        this.state = Puppet.normalizeState(data.state);
        this.transformState =
            TransformState.deserialize<TransformDefinitions.ImageTransformProps>(data.transformState);
        return this;
    }

    /**@internal */
    _init(scene?: Scene): DisplayableAction<typeof DisplayableActionTypes.init, Puppet> {
        return new DisplayableAction<typeof DisplayableActionTypes.init, Puppet>(
            this.chain(),
            DisplayableActionTypes.init,
            new ContentNode<DisplayableActionContentType["displayable:init"]>().setContent([
                scene || null, this.config.layer || null
            ])
        );
    }

    /**@internal */
    override reset() {
        this.state = this.getInitialState();
        this.transformState = this.getInitialTransformState(this.userConfig);
    }

    /**
     * The size of the box, resolving the default to the stage size the caller passes in.
     *
     * @internal
     */
    _resolveSize(stage: PuppetSize): PuppetSize {
        const size = this.config.size;
        if (!size) {
            return {width: stage.width, height: stage.height};
        }
        return {width: size.width, height: size.height};
    }

    /**@internal */
    _getStatus(): PuppetStatus {
        return this.status;
    }

    /**@internal */
    _setStatus(status: PuppetStatus): void {
        if (this.status === status) {
            return;
        }
        this.status = status;
        this.events.emit("event:puppet.statusChange", status);
    }

    /**@internal */
    _onStatusChange(listener: (status: PuppetStatus) => void): LiveGameEventToken {
        return this.events.on("event:puppet.statusChange", listener);
    }

    /**@internal */
    _attachInstance(instance: PuppetInstance | null): void {
        this.instance = instance;
    }

    /**@internal */
    _getInstance(): PuppetInstance | null {
        return this.instance;
    }

    /**
     * Push the current state to the mounted backend. A no-op when nothing is mounted — the state is
     * applied in full the next time one is.
     *
     * @internal
     */
    async _applyState(): Promise<void> {
        const instance = this.instance;
        if (!instance) {
            return;
        }
        await instance.apply(Puppet.normalizeState(this.state));
    }

    /**
     * Run a named command against the mounted backend.
     *
     * @returns whether a backend was there to run it.
     * @internal
     */
    async _runCommand(name: string, payload: unknown): Promise<boolean> {
        const instance = this.instance;
        if (!instance) {
            return false;
        }
        await instance.command(name, payload);
        return true;
    }

    /**
     * Ask the mounted backend to describe its model, or null when nothing is mounted or the backend
     * does not implement it.
     *
     * @internal
     */
    async _describe(): Promise<PuppetDescription | null> {
        const instance = this.instance;
        if (!instance || typeof instance.describe !== "function") {
            return null;
        }
        return await instance.describe();
    }

    /**@internal */
    private getInitialTransformState(
        userConfig: Config<IPuppetUserConfig, { position: IPosition }>
    ): TransformState<TransformDefinitions.ImageTransformProps> {
        const [transformState] = userConfig.extract(TransformState.DefaultTransformState.keys());
        return new TransformState(TransformState.DefaultTransformState.create(transformState.get()).get());
    }

    /**@internal */
    private getInitialState(): PuppetState {
        const config = this.userConfig.get();
        return Puppet.normalizeState({
            motion: config.motion,
            expression: config.expression,
            skin: config.skin,
            params: config.params,
            slots: config.slots,
        });
    }
}
