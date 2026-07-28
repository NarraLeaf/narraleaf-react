import type {TransformDefinitions} from "@core/elements/transform/type";
import {ContentNode} from "@core/action/tree/actionTree";
import {RuntimeScriptError} from "@core/common/Utils";
import {Scene} from "@core/elements/scene";
import {TransformState} from "@core/elements/transform/transform";
import {
    DisplayableActionContentType,
    DisplayableActionTypes,
    PuppetActionContentType,
    PuppetActionTypes,
} from "@core/action/actionTypes";
import {EmptyObject} from "@core/elements/transition/type";
import {IPosition, PositionUtils} from "@core/elements/transform/position";
import {EventDispatcher, Values} from "@lib/util/data";
import {Displayable} from "@core/elements/displayable/displayable";
import {EventfulDisplayable} from "@player/elements/displayable/type";
import {Config, ConfigConstructor} from "@lib/util/config";
import {DisplayableAction} from "@core/action/actions/displayableAction";
import {PuppetAction} from "@core/action/actions/puppetAction";
import {Chained, Proxied} from "@core/action/chain";
import {LogicAction} from "@core/action/logicAction";
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
    /**
     * Class names for the box, applied to the element the transition wrapper renders — the one
     * carrying the box's `position: relative` and its width and height.
     *
     * That is the **parent** of the container handed to
     * {@link import("@core/game/puppet/puppetBackend").PuppetBackend.mount}, not the container
     * itself: the backend owns the inside of the box and the engine empties it on dispose, so
     * anything styled here has to sit outside it. Note also that the wrapper above it — the one the
     * transform is written to — is not this element, so a class that sets `transform` here will be
     * overwritten frame by frame.
     */
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

/** How the story treats a one-shot {@link Puppet.command}. */
export type PuppetCommandOptions = {
    /**
     * Wait for the backend to finish the command before the story moves on.
     *
     * Off by default. The engine cannot tell a motion worth a beat from a parameter nudge, and a
     * backend that never resolves would otherwise park the story forever; opting in makes the wait
     * the author's decision, and only where they meant it. A waiting command is skippable like any
     * other timed action.
     *
     * @default false
     */
    await?: boolean;
};

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
 *
 * scene.action([
 *     alice.show({duration: 400}),
 *     alice.setMotion("idle"),
 *     alice.setExpression("smile"),
 *     alice.command("playMotion", {id: "wave"}, {await: true}),
 * ]);
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
     * Request a named motion — usually the loop the model settles into.
     *
     * This is persistent state, not a one-shot: it is saved, and re-applied in full the next time
     * the model mounts. Pass `null` to clear it. A motion meant to play once and end belongs in
     * {@link Puppet.command}.
     *
     * The story does not wait for the backend to take the pose.
     * @chainable
     * @example
     * ```ts
     * alice.setMotion("idle");
     * ```
     */
    public setMotion(motion: string | null): Proxied<Puppet, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(PuppetActionTypes.setMotion, [motion]));
    }

    /**
     * Request a named expression, or `null` to clear it. Persistent state, like the motion.
     * @chainable
     * @example
     * ```ts
     * alice.setExpression("smile");
     * ```
     */
    public setExpression(expression: string | null): Proxied<Puppet, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(PuppetActionTypes.setExpression, [expression]));
    }

    /**
     * Request a named skin or costume, or `null` to clear it. Persistent state, like the motion.
     * @chainable
     * @example
     * ```ts
     * alice.setSkin("winter");
     * ```
     */
    public setSkin(skin: string | null): Proxied<Puppet, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(PuppetActionTypes.setSkin, [skin]));
    }

    /**
     * Set one numeric parameter, leaving every other parameter as it stands.
     *
     * What an id means is the backend's business — a rig parameter, a bone override, a blend weight.
     * The engine only remembers it, saves it, and hands the whole map back on a load.
     * @chainable
     * @example
     * ```ts
     * alice.setParam("ParamAngleX", 12);
     * ```
     */
    public setParam(id: string, value: number): Proxied<Puppet, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(PuppetActionTypes.setParam, [id, value]));
    }

    /**
     * Set one free string slot, leaving every other slot as it stands. `null` clears that slot.
     *
     * Slots are for the named things `motion` / `expression` / `skin` do not cover — an attachment
     * point, a swapped-in prop, whatever a particular renderer calls its own.
     * @chainable
     * @example
     * ```ts
     * alice.setSlot("prop", "umbrella");
     * ```
     */
    public setSlot(id: string, value: string | null): Proxied<Puppet, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(PuppetActionTypes.setSlot, [id, value]));
    }

    /**
     * Send the backend a command the engine neither models nor interprets.
     *
     * `name` and `payload` are forwarded verbatim. This is the escape hatch for everything
     * {@link import("@core/game/puppet/puppetBackend").PuppetState} deliberately leaves out — a
     * motion that plays once and ends, a hit test, lip sync. None of it is saved, so a command is
     * not restored by a load and not taken back by an undo; anything that has to survive either
     * belongs in the state, through the `set*` methods above.
     *
     * **The story does not wait unless it is asked to.** See {@link PuppetCommandOptions}.
     * @chainable
     * @example
     * ```ts
     * alice.command("playMotion", {id: "wave"});                  // the story moves straight on
     * alice.command("playMotion", {id: "bow"}, {await: true});    // ...and here it waits for it
     * ```
     */
    public command(name: string, payload?: unknown, options?: PuppetCommandOptions): Proxied<Puppet, Chained<LogicAction.Actions>> {
        return this.chain(this.createAction(PuppetActionTypes.command, [name, payload, options]));
    }

    /**
     * What the backend drawing this puppet is currently doing.
     *
     * Two of the five are worth acting on. `"missing-backend"` means nothing answers to
     * `config.backend`, and `"error"` means the backend threw or the model failed to load; in both
     * cases the element is still on stage, still transforming and still saving — it is simply not
     * being drawn. The engine cannot decide what that should mean for a game, so it reports rather
     * than intervenes.
     *
     * The status describes the live instance and is not part of the saved game: a load re-mounts,
     * and the status starts over from `"unmounted"`.
     * @example
     * ```ts
     * if (alice.getStatus() === "missing-backend") {
     *     // the renderer this project depends on was never registered
     * }
     * ```
     */
    public getStatus(): PuppetStatus {
        return this.status;
    }

    /**
     * Listen for this puppet's status changing, receiving the new status.
     *
     * A backend fails asynchronously — the element mounts, then the model does or does not load — so
     * {@link Puppet.getStatus} alone cannot answer "did my renderer come up". Subscribe to be told.
     * Dispose the returned token to stop listening.
     * @example
     * ```ts
     * const token = alice.onStatusChange((status) => {
     *     if (status === "error") console.warn("Alice is not being drawn");
     * });
     * ```
     */
    public onStatusChange(listener: (status: PuppetStatus) => void): LiveGameEventToken {
        return this.events.on("event:puppet.statusChange", listener);
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
        return this.getStatus();
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
        return this.onStatusChange(listener);
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
     * Merge a patch into the state and return the state as it stood.
     *
     * The returned snapshot is complete, which is what lets an action undo itself with a single
     * {@link Puppet._applyState} instead of replaying anything.
     *
     * @internal
     */
    _patchState(patch: Partial<PuppetState>): PuppetState {
        const previous = Puppet.normalizeState(this.state);
        this.state = Puppet.mergeState(this.state, patch);
        return previous;
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
    private createAction<U extends Values<typeof PuppetActionTypes>>(
        type: U,
        content: PuppetActionContentType[U]
    ): PuppetAction<U> {
        return new PuppetAction<U>(
            this.chain(),
            type,
            ContentNode.create(content)
        );
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
