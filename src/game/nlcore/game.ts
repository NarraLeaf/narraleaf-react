import type { GameConfig, GamePreference, GameSettings } from "./gameTypes";
import { deepMerge, DeepPartial, filterObjectExcept, Hooks, StringKeyOf } from "@lib/util/data";
import { LogicAction } from "@core/action/logicAction";
import { LiveGame } from "@core/game/liveGame";
import { Preference } from "@core/game/preference";
import { GameState } from "@player/gameState";
import { GuardWarningType } from "@player/guard";
import { DefaultElements } from "../player/elements/elements";
import { Plugins, IGamePluginRegistry } from "./game/plugin/plugin";
import { LayoutRouter } from "../player/lib/PageRouter/router";
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
        bgmVolume: 1,
        soundVolume: 1,
        globalVolume: 1,
        skipDelay: 500,
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
            logger: {
                log: false,
                info: false,
                warn: true,
                error: true,
                debug: false,
                trace: false,
                verbose: false,
            },
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
        skipKey: ["Control"],
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
        nextKey: [" "],
        useAspectScale: true,
        autoForwardDelay: 3 * 1000,
        autoForwardDefaultPause: 1000,
        allowSkipImageTransform: true,
        allowSkipImageTransition: true,
        allowSkipBackgroundTransform: true,
        allowSkipBackgroundTransition: false,
        allowSkipTextTransform: true,
        allowSkipTextTransition: true,
        allowSkipLayersTransform: true,
        allowSkipVideo: false,
        animationPropagate: false,
        dialogWidth: 1920,
        dialogHeight: 1080 * 0.2,
        defaultTextColor: "#000",
        defaultNametagColor: "#000",
        notification: DefaultElements.notification,
        menu: DefaultElements.menu,
        dialog: DefaultElements.say,
        onError: (error: Error) => { console.error(error); },
        fontSize: 16,
        fontWeight: 400,
        fontWeightBold: 700,
        fontFamily: "sans-serif",
        stage: null,
        defaultMenuChoiceColor: "#000",
        maxStackModelLoop: 1000,
        maxActionHistory: 100,
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
     * Plugin registry
     */
    public plugins: Plugins;
    public router: LayoutRouter;

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

