import type {GameConfig, GameSettings} from "./gameTypes";
import {deepMerge, DeepPartial} from "@lib/util/data";
import {LogicAction} from "@core/action/logicAction";
import {DefaultElements} from "@player/elements/elements";
import {ComponentsTypes} from "@player/elements/type";
import {LiveGame} from "@core/game/liveGame";
import {Preference} from "@core/game/preference";

enum GameSettingsNamespace {
    game = "game",
}

export type GamePreference = {
    autoForward: boolean;
    skip: boolean;
};

export class Game {
    /**@internal */
    static defaultSettings: GameSettings = {
        volume: 1,
    };
    public static ComponentTypes: {
        readonly [K in keyof ComponentsTypes]: K;
    } = {
        say: "say",
        menu: "menu",
    };
    /**@internal */
    static DefaultPreference: GamePreference = {
        autoForward: false,
        skip: true,
    };
    /**@internal */
    static Preferences: {
        readonly [K in keyof GamePreference]: K;
    } = {
        autoForward: "autoForward",
        skip: "skip",
    };
    /**@internal */
    static DefaultConfig: GameConfig = {
        player: {
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
        },
        elements: {
            say: {
                nextKey: [" "],
                textInterval: 50,
                use: DefaultElements.say,
                useAspectScale: true,
                autoForwardDelay: 3 * 1000,
            },
            img: {
                allowSkipTransform: true,
                allowSkipTransition: true,
            },
            menu: {
                use: DefaultElements.menu,
            },
            background: {
                allowSkipTransform: true,
                allowSkipTransition: false,
            },
            text: {
                allowSkipTransform: true,
                allowSkipTransition: true,
                width: 1920,
                height: 1080 * 0.2,
            },
        },
        elementStyles: {
            say: {
                contentContainerClassName: "",
                containerClassName: "",
                nameTextClassName: "",
                textContainerClassName: "",
                textSpanClassName: "",
                rubyClassName: "",
            },
            menu: {
                containerClassName: "",
                choiceButtonClassName: "",
                choiceButtonTextClassName: "",
            }
        },
        app: {
            debug: false,
            logger: {
                log: false,
                info: false,
                warn: true,
                error: true,
                debug: false,
                trace: false,
            },
            inspector: false,
        }
    };
    static GameSettingsNamespace = GameSettingsNamespace;

    /**@internal */
    readonly config: Readonly<GameConfig>;
    /**@internal */
    liveGame: LiveGame | null = null;
    /**
     * Game settings
     */
    public preference: Preference<GamePreference> = new Preference<GamePreference>(Game.DefaultPreference);

    /**
     * Create a new game
     * @param config - Game configuration
     */
    constructor(config: DeepPartial<GameConfig>) {
        this.config = deepMerge<GameConfig>(Game.DefaultConfig, config);
    }

    /**
     * Override the default component
     */
    public useComponent<T extends keyof ComponentsTypes>(key: T, components: ComponentsTypes[T]): this {
        if (!Object.keys(DefaultElements).includes(key)) {
            throw new Error(`Invalid key ${key}`);
        }
        if (typeof components !== "function") {
            throw new Error(`Invalid component for key ${key}`);
        }
        this.config.elements[key].use = components;
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

