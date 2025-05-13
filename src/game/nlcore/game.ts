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
    /**
     * If true, the game will automatically forward to the next sentence when the player has finished the current sentence
     * @default false
     */
    autoForward: boolean;
    /**
     * If true, the game will allow the player to skip the dialog
     * @default true
     */
    skip: boolean;
    /**
     * If true, the game will show the dialog
     * @default true
     */
    showDialog: boolean;
    /**
     * The multiplier of the dialog speed
     * 
     * Dialog speed will apply to:
     * - The text speed
     * - The auto-forward delay
     * @default 1.0
     */
    gameSpeed: number;
    /**
     * The speed of the text effects in characters per second.
     * @default 10
     */
    cps: number;
    /**
     * The volume of the voice
     * @default 1
     */
    voiceVolume: number;
    /**
     * The volume of the background music
     * @default 1
     */
    bgmVolume: number;
    /**
     * The volume of the sound effects
     * @default 1
     */
    soundVolume: number;
    /**
     * The volume of the global audio
     * @default 1
     */
    globalVolume: number;
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
        gameSpeed: 1,
        cps: 10,
        voiceVolume: 1,
        bgmVolume: 1,
        soundVolume: 1,
        globalVolume: 1,
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
        skipInterval: 100,
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
        fontSize: 16,
        fontWeight: 400,
        fontWeightBold: 700,
        fontFamily: "sans-serif",
        stage: null,
        defaultMenuChoiceColor: "#000",
    };
    static GameSettingsNamespace = GameSettingsNamespace;

    public readonly hooks: Hooks<GameHooks> = new Hooks<GameHooks>();
    /**@internal */
    config: GameConfig;
    /**@internal */
    liveGame: LiveGame | null = null;
    /**@internal */
    sideEffect: VoidFunction[] = [];
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

