import type { GameConfig, GameSettings } from "./gameTypes";
import { deepMerge, DeepPartial, Hooks } from "@lib/util/data";
import { LogicAction } from "@core/action/logicAction";
import { LiveGame } from "@core/game/liveGame";
import { Preference } from "@core/game/preference";
import { GameState } from "@player/gameState";
import { GuardWarningType } from "@player/guard";
import { DefaultElements } from "../player/elements/elements";
import { Plugins, IGamePluginRegistry } from "./game/plugin/plugin";
enum GameSettingsNamespace {
    game = "game",
}

export type GamePreference = {
    autoForward: boolean;
    skip: boolean;
    showDialog: boolean;
};

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
    };
    /**@internal */
    static Preferences: {
        readonly [K in keyof GamePreference]: K;
    } = {
            autoForward: "autoForward",
            skip: "skip",
            showDialog: "showDialog",
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
            screenshotQuality: 1,
        },
        contentContainerId: "__narraleaf_content",
        aspectRatio: 16 / 9,
        minWidth: 800,
        minHeight: 450,
        width: 1920,
        height: 1080,
        skipKey: ["Control"],
        skipInterval: 100,
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
        cps: 10,
        useAspectScale: true,
        autoForwardDelay: 3 * 1000,
        allowSkipImageTransform: true,
        allowSkipImageTransition: true,
        allowSkipBackgroundTransform: true,
        allowSkipBackgroundTransition: false,
        allowSkipTextTransform: true,
        allowSkipTextTransition: true,
        allowSkipLayersTransform: true,
        allowSkipVideo: false,
        dialogWidth: 1920,
        dialogHeight: 1080 * 0.2,
        defaultTextColor: "#000",
        defaultNametagColor: "#000",
        notification: DefaultElements.notification,
        menu: DefaultElements.menu,
        dialog: DefaultElements.say,
        onError: (error: Error) => {
            console.error(error);
        },
    };
    static GameSettingsNamespace = GameSettingsNamespace;

    /**@internal */
    hooks: Hooks<GameHooks> = new Hooks<GameHooks>();
    /**@internal */
    config: GameConfig;
    /**@internal */
    liveGame: LiveGame | null = null;
    /**
     * Game settings
     */
    public preference: Preference<GamePreference> = new Preference<GamePreference>(Game.DefaultPreference);
    /**
     * Plugin registry
     */
    public plugins: Plugins;

    /**
     * Create a new game
     * @param config - Game configuration
     */
    constructor(config: DeepPartial<GameConfig>) {
        this.config = deepMerge<GameConfig>(Game.DefaultConfig, config);
        this.plugins = new Plugins(this);
    }

    /**
     * Configure the game
     */
    public configure(config: DeepPartial<GameConfig>): this {
        this.config = deepMerge<GameConfig>(this.config, config);
        this.getLiveGame().getGameState()?.events.emit(GameState.EventTypes["event:state.player.requestFlush"]);
        return this;
    }

    /**
     * Use a plugin
     * @param plugin - The plugin to use
     */
    public use(plugin: IGamePluginRegistry): this {
        this.plugins.use(plugin).register(plugin);
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

