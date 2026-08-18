import type { GameConfig, GamePreference, GameSettings } from "./gameTypes";
import { deepMerge, DeepPartial, EventDispatcher, filterObjectExcept, Hooks, StringKeyOf } from "@lib/util/data";
import { LogicAction } from "@core/action/logicAction";
import { LiveGame } from "@core/game/liveGame";
import { Preference } from "@core/game/preference";
import { GameState } from "@player/gameState";
import { GuardWarningType } from "@player/guard";
import { DefaultElements } from "../player/elements/elements";
import { AudioBusMixer, createPreferenceBusAliases } from "./game/audioBus";
import { Plugins, IGamePluginRegistry } from "./game/plugin/plugin";
import { PuppetBackend, PuppetBackendRegistry } from "./game/puppet/puppetBackend";
import { ImageBackend, ImageBackendRegistry } from "./game/image/imageBackend";
import { LayoutRouter } from "../player/lib/PageRouter/router";
import { KeyMap } from "./game/keyMap";
import { KeyBindingType } from "./game/types";
import type { Storable } from "@core/elements/persistent/storable";
import type { Scene } from "@core/elements/scene";
import type { LiveGameEventHandler, LiveGameEventToken } from "./types";
enum GameSettingsNamespace {
    game = "game",
}

export type GameHooks = {
    /**
     * Hook when the game is initialized
     * 
     * This hook's behavior is similar to the `useEffect` hook in React. It will be called twice when the strict mode is enabled.  
     * It is used to configure the game.
     */
    "init": [];
    /**
     * Hook when preloading images
     * 
     * @param src - The source of the image
     * @param set - Calling this function will set the src and options of the fetch request. This is useful to proxy
     * - **Note**: "signal" is preserved from the original options
     */
    "preloadImage": [src: string, set: (src: string, options?: RequestInit) => void];
    /**
     * Hook before deserializing the game state
     */
    "beforeRestore": [];
    /**
     * Hook after deserializing the game state
     */
    "afterRestore": [];
};

export type GameLifecycleEventContext = {
    game: Game;
    gameState: GameState;
    liveGame: LiveGame;
    storable: Storable;
    scene: Scene | null;
};

export type GameLifecycleEvents = {
    "event:game.preloadComplete": [ctx: GameLifecycleEventContext];
    "event:game.firstSceneReady": [ctx: GameLifecycleEventContext];
};

export class Game {
    /**@internal */
    static defaultSettings: GameSettings = {
        volume: 1,
    };
    /**@internal */
    static DefaultPreference: GamePreference = {
        autoForward: false,
        skip: true,
        showDialog: true,
        gameSpeed: 1,
        cps: 10,
        voiceVolume: 1,
        voiceFadeDuration: 0,
        voiceEndMode: "stop",
        bgmVolume: 1,
        soundVolume: 1,
        globalVolume: 1,
        skipDelay: 0,
        skipInterval: 100,
    };
    /**@internal */
    static Preferences: {
        readonly [K in keyof GamePreference]: K;
    } = {
            autoForward: "autoForward",
            skip: "skip",
            showDialog: "showDialog",
            gameSpeed: "gameSpeed",
            cps: "cps",
            voiceVolume: "voiceVolume",
            voiceFadeDuration: "voiceFadeDuration",
            voiceEndMode: "voiceEndMode",
            bgmVolume: "bgmVolume",
            soundVolume: "soundVolume",
            globalVolume: "globalVolume",
            skipDelay: "skipDelay",
            skipInterval: "skipInterval",
        };
    /**@internal */
    static DefaultConfig: GameConfig = {
        app: {
            debug: false,
            logger: { log: false, info: false, warn: true, error: true, debug: false, trace: false, verbose: false, },
            inspector: false,
            guard: {
                [GuardWarningType.invalidExposedStateUnmounting]: true,
                [GuardWarningType.unexpectedTimelineStatusChange]: true,
            },
        },
        contentContainerId: "__narraleaf_content",
        aspectRatio: 16 / 9,
        minWidth: 800,
        minHeight: 450,
        width: 1920,
        height: 1080,
        useWindowListener: true,
        ratioUpdateInterval: 50,
        preloadDelay: 100,
        preloadConcurrency: 5,
        waitForPreload: true,
        preloadAllImages: true,
        forceClearCache: false,
        maxPreloadActions: 10,
        cursor: null,
        cursorHeight: 30,
        cursorWidth: 30,
        showOverflow: false,
        maxRouterHistory: 10,
        screenshotQuality: 1,
        useAspectScale: true,
        autoForwardDelay: 3 * 1000,
        autoForwardDefaultPause: 1000,
        allowSkipImageTransform: true,
        allowSkipImageTransition: true,
        allowSkipBackgroundTransform: true,
        allowSkipSceneTransition: true,
        allowSkipTextTransform: true,
        allowSkipTextTransition: true,
        allowSkipLayersTransform: true,
        allowSkipVideo: false,
        animationPropagate: false,
        dialogWidth: 1920,
        dialogHeight: 1080 * 0.2,
        notification: DefaultElements.notification,
        menu: DefaultElements.menu,
        dialog: DefaultElements.say,
        nvlDialog: DefaultElements.nvlDialog,
        onError: (error: Error) => { console.error(error); },
        stage: null,
        maxStackModelLoop: 1000,
        maxActionHistory: 100,
        audioBuses: [],
    };
    static GameSettingsNamespace = GameSettingsNamespace;

    public readonly hooks: Hooks<GameHooks> = new Hooks<GameHooks>();
    /**@internal */
    config: GameConfig;
    /**@internal */
    liveGame: LiveGame | null = null;
    /**@internal */
    sideEffect: VoidFunction[] = [];
    /**@internal */
    private freezeFields: (StringKeyOf<GameConfig>)[] = [];
    /**
     * Game settings
     */
    public preference: Preference<GamePreference> = new Preference<GamePreference>(Game.DefaultPreference);
    /**
     * The audio bus mixer: the tree declared in {@link GameConfig.audioBuses}, and what the player
     * has done to it.
     *
     * Every bus carries **two** numbers. The declaration holds the author's mix — where a bus sits
     * relative to the others in the game as shipped. This mixer holds the player's control, which
     * starts at 1 and means "leave the author's mix alone". The product is what reaches the gain
     * node, so neither half can silently erase the other and the layering is total: declared →
     * persisted player override → live change.
     *
     * It is on `Game` rather than on the audio manager because a bus volume is a player setting,
     * not game state — it exists before the audio context unlocks, it survives the player
     * unmounting, and a host restores it from its own storage whenever it likes. Setting a volume
     * at any point after `new Game(...)` is safe; if the channels do not exist yet the value is
     * applied the moment they do.
     *
     * `bgmVolume`, `soundVolume` and `voiceVolume` **are** the player's half of the three seeded
     * buses — not numbers copied onto them. `game.audioBuses.getVolume("voice")` and
     * `game.preference.getPreference("voiceVolume")` read the same storage and cannot disagree,
     * and writing either drives the audio graph immediately, mounted or not. Both surfaces stay
     * supported; use whichever suits, and use this one for buses the host declared.
     * (`globalVolume` is the master output, not a bus, and is unchanged.)
     *
     * @example
     * ```ts
     * // persist the player's half only - the author's mix comes back with the game
     * localStorage.setItem("mixer", JSON.stringify(game.audioBuses.getVolumes()));
     * // restore, any time after `new Game(...)` - no ordering requirement, seeded or not
     * game.audioBuses.setVolumes(JSON.parse(localStorage.getItem("mixer") ?? "{}"));
     * ```
     */
    public readonly audioBuses: AudioBusMixer = new AudioBusMixer(
        () => this.config.audioBuses ?? [],
        createPreferenceBusAliases(this.preference as never),
    );
    /**
     * Game key bindings
     */
    public keyMap: KeyMap = new KeyMap({
        [KeyBindingType.skipAction]: ["Control"],
        [KeyBindingType.nextAction]: [" "],
    });
    public static LifecycleEventTypes: { [K in keyof GameLifecycleEvents]: K } = {
        "event:game.preloadComplete": "event:game.preloadComplete",
        "event:game.firstSceneReady": "event:game.firstSceneReady",
    };
    /**
     * Plugin registry
     */
    public plugins: Plugins;
    public router: LayoutRouter;
    private readonly lifecycleEvents = new EventDispatcher<GameLifecycleEvents>();
    private readonly puppetBackends = new PuppetBackendRegistry();
    private readonly imageBackends = new ImageBackendRegistry();
    private preloadCompleteContext: GameLifecycleEventContext | null = null;
    private firstSceneReadyContext: GameLifecycleEventContext | null = null;

    /**
     * Create a new game
     * @param config - Game configuration
     */
    constructor(config: DeepPartial<GameConfig>) {
        this.config = deepMerge<GameConfig>(Game.DefaultConfig, config);
        this.plugins = new Plugins(this);
        this.router = new LayoutRouter(this);
    }

    /**
     * Configure the game
     */
    public configure(config: DeepPartial<GameConfig>): this {
        const [merged, filtered] = filterObjectExcept(config, this.freezeFields);
        if (filtered.length > 0) {
            console.warn(`NarraLeaf-React [Game] The following fields are not allowed to be configured: ${filtered.join(", ")}`);
        }

        this.config = deepMerge<GameConfig>(this.config, merged);
        // A re-declared tree has to be re-resolved, but only a tree that has not been realized into
        // channels yet can actually change: tearing a live channel down stops every sound under it.
        // Hosts that configure before mounting - which is the normal order - get what they declared.
        if (Object.prototype.hasOwnProperty.call(merged, "audioBuses")) {
            this.audioBuses.invalidate();
        }
        this.getLiveGame().getGameState()?.events.emit(GameState.EventTypes["event:state.player.requestFlush"]);

        return this;
    }

    /**
     * Configure the game and freeze the fields
     * 
     * This method is not recommended to be used without using NarraLeaf Engine or Plugin Environment.
     * @param config - Game configuration
     */
    public configureAndFreeze(config: DeepPartial<GameConfig>): this {
        this.configure(config);
        this.freeze(Object.keys(config) as (StringKeyOf<GameConfig>)[]);

        return this;
    }

    /**
     * Freeze the fields
     * 
     * This method is not recommended to be used without using NarraLeaf Engine or Plugin Environment.
     * @param fields - The fields to freeze
     */
    public freeze(fields: (StringKeyOf<GameConfig>)[]): this {
        this.freezeFields.push(...fields);

        return this;
    }

    /**
     * Use a plugin
     * @param plugin - The plugin to use
     */
    public use(plugin: IGamePluginRegistry): this {
        if (!this.plugins.has(plugin)) {
            this.plugins.use(plugin).register(plugin);
        }
        return this;
    }

    /**
     * Register a backend that draws {@link import("@core/elements/displayable/puppet").Puppet}
     * elements.
     *
     * The engine ships no renderer and understands none: a puppet is a box it positions, layers,
     * transforms and saves, and the backend registered here draws whatever belongs inside that box.
     * Register before the game mounts — a puppet whose backend is missing keeps its place on the
     * stage and draws nothing, warning once.
     *
     * Registering under a name already taken replaces the previous backend.
     *
     * This lives on `Game` rather than in the config on purpose: the config is deep-merged and can
     * be frozen, and a backend is a live object with methods, not serialisable data. A plugin can
     * call this from its own `register(game)`.
     *
     * @example
     * ```ts
     * game.registerPuppetBackend({
     *     name: "my-renderer",
     *     mount(container, ctx) {
     *         const model = MyRenderer.create(container, ctx.resolveSrc(ctx.src), ctx.size);
     *         return {
     *             ready: () => model.loaded,
     *             apply: (state) => model.setPose(state),
     *             command: (name, payload) => model.run(name, payload),
     *             resize: (size) => model.resize(size.width, size.height),
     *             dispose: () => model.destroy(),
     *         };
     *     },
     * });
     * ```
     */
    public registerPuppetBackend(backend: PuppetBackend): this {
        this.puppetBackends.register(backend);
        return this;
    }

    /**
     * The backend registered under the given name, or null.
     */
    public getPuppetBackend(name: string): PuppetBackend | null {
        return this.puppetBackends.get(name);
    }

    /**
     * Register a presenter for images that name it.
     *
     * The sibling of {@link registerPuppetBackend}, and the difference is what the engine hands
     * over. A puppet's backend is given an opaque `src` and told which named state to wear; an
     * image's backend is given the *sources the engine resolved* — so the engine keeps owning what
     * the image is showing, and the host only decides how it is shown.
     *
     * Register before the game mounts, for the same reason: an element looks its backend up once,
     * when its component mounts.
     *
     * @example
     * ```ts
     * game.registerImageBackend({
     *     name: "framed",
     *     mount(container, ctx) {
     *         const view = MyFrame.create(container, ctx.size, ctx.options);
     *         view.draw(ctx.content.srcs);
     *         return {
     *             apply: (content) => view.draw(content.srcs),
     *             resize: (size) => view.resize(size),
     *             dispose: () => view.destroy(),
     *         };
     *     },
     * });
     * ```
     */
    public registerImageBackend(backend: ImageBackend): this {
        this.imageBackends.register(backend);
        return this;
    }

    /**
     * The image backend registered under the given name, or null.
     */
    public getImageBackend(name: string): ImageBackend | null {
        return this.imageBackends.get(name);
    }

    /**@internal */
    public getImageBackendRegistry(): ImageBackendRegistry {
        return this.imageBackends;
    }

    /**
     * The names of every registered puppet backend, in registration order.
     */
    public listPuppetBackends(): string[] {
        return this.puppetBackends.list();
    }

    /**@internal */
    public getPuppetBackendRegistry(): PuppetBackendRegistry {
        return this.puppetBackends;
    }

    /**
     * Listen for the initial preload pass completing.
     *
     * This is the point where the initial preload pass has actually finished.
     * Use {@link whenPreloadComplete} if the listener may be registered after the event has fired.
     */
    public onPreloadComplete(fc: LiveGameEventHandler<GameLifecycleEvents["event:game.preloadComplete"]>): LiveGameEventToken {
        return this.lifecycleEvents.on(Game.LifecycleEventTypes["event:game.preloadComplete"], fc);
    }

    /**
     * Listen once for the initial preload pass completing.
     */
    public oncePreloadComplete(fc: LiveGameEventHandler<GameLifecycleEvents["event:game.preloadComplete"]>): LiveGameEventToken {
        return this.lifecycleEvents.once(Game.LifecycleEventTypes["event:game.preloadComplete"], fc);
    }

    /**
     * Resolve when the initial preload pass has completed.
     */
    public whenPreloadComplete(): Promise<GameLifecycleEventContext> {
        if (this.preloadCompleteContext) {
            return Promise.resolve(this.preloadCompleteContext);
        }
        return new Promise(resolve => {
            this.oncePreloadComplete(resolve);
        });
    }

    /**
     * Whether the initial preload pass has completed.
     */
    public isPreloadComplete(): boolean {
        return this.preloadCompleteContext !== null;
    }

    /**
     * Listen for the first scene being fully ready.
     *
     * This fires after the initial preload pass has actually finished, after the first
     * scene component is mounted, and after the browser has had a frame to render it.
     * Use {@link whenFirstSceneReady} if the listener may be registered after the event has fired.
     */
    public onFirstSceneReady(fc: LiveGameEventHandler<GameLifecycleEvents["event:game.firstSceneReady"]>): LiveGameEventToken {
        return this.lifecycleEvents.on(Game.LifecycleEventTypes["event:game.firstSceneReady"], fc);
    }

    /**
     * Listen once for the first scene being fully ready.
     */
    public onceFirstSceneReady(fc: LiveGameEventHandler<GameLifecycleEvents["event:game.firstSceneReady"]>): LiveGameEventToken {
        return this.lifecycleEvents.once(Game.LifecycleEventTypes["event:game.firstSceneReady"], fc);
    }

    /**
     * Resolve when the first scene is fully ready.
     */
    public whenFirstSceneReady(): Promise<GameLifecycleEventContext> {
        if (this.firstSceneReadyContext) {
            return Promise.resolve(this.firstSceneReadyContext);
        }
        return new Promise(resolve => {
            this.onceFirstSceneReady(resolve);
        });
    }

    /**
     * Whether the first scene is fully ready.
     */
    public isFirstSceneReady(): boolean {
        return this.firstSceneReadyContext !== null;
    }

    /**@internal */
    public markPreloadComplete(ctx: GameLifecycleEventContext): boolean {
        if (this.preloadCompleteContext) {
            return false;
        }
        this.preloadCompleteContext = ctx;
        this.lifecycleEvents.emit(Game.LifecycleEventTypes["event:game.preloadComplete"], ctx);
        return true;
    }

    /**@internal */
    public markFirstSceneReady(ctx: GameLifecycleEventContext): boolean {
        if (this.firstSceneReadyContext) {
            return false;
        }
        this.firstSceneReadyContext = ctx;
        this.lifecycleEvents.emit(Game.LifecycleEventTypes["event:game.firstSceneReady"], ctx);
        return true;
    }

    /* Live Game */
    public getLiveGame(): LiveGame {
        if (!this.liveGame) {
            const liveGame = this.createLiveGame();
            this.liveGame = liveGame;
            return liveGame;
        }
        return this.liveGame;
    }

    /**
     * Dispose the game and all its resources
     * 
     * **Note**: This action is irreversible.
     */
    public dispose() {
        this.audioBuses.dispose();
        this.plugins.unregisterAll();
        this.liveGame?.dispose();
        this.sideEffect.forEach(sideEffect => sideEffect());
    }

    /**@internal */
    public addSideEffect(sideEffect: VoidFunction) {
        this.sideEffect.push(sideEffect);
    }

    /**@internal */
    private createLiveGame() {
        return new LiveGame(this);
    }
}

export default {
    Game,
    LiveGame,
};

export type {
    LogicAction
};

