import type {CalledActionResult, GameConfig, GameSettings, SavedGame} from "./gameTypes";
import {Awaitable, deepMerge, DeepPartial} from "@lib/util/data";
import {Namespace, Storable} from "@core/store/storable";
import {Story} from "./elements/story";
import {LogicAction} from "@core/action/logicAction";
import {GameState} from "@player/gameState";
import {DefaultElements} from "@player/elements/elements";
import {ComponentsTypes} from "@player/elements/type";
import {StorableType} from "@core/store/type";

enum GameSettingsNamespace {
    game = "game",
}

export class Game {
    static defaultSettings: GameSettings = {
        volume: 1,
    };
    static ComponentTypes: {
        [K in keyof ComponentsTypes]: K;
    } = {
        say: "say",
        menu: "menu",
    };
    // noinspection MagicNumberJS
    static DefaultConfig: GameConfig = {
        player: {
            contentContainerId: "__narraleaf_content",
            aspectRatio: 16 / 9,
            minWidth: 800,
            minHeight: 450,
            width: "100%",
            height: "100%",
            skipKey: ["Control"],
            skipInterval: 100,
        },
        elements: {
            say: {
                nextKey: [" "],
                textInterval: 50,
                use: DefaultElements.say,
            },
            img: {
                slowLoadWarning: true,
                slowLoadThreshold: 2000,
            },
            menu: {
                use: DefaultElements.menu,
            }
        },
        elementStyles: {
            say: {
                container: "",
                nameText: "",
                textContainer: "",
                textSpan: "",
            },
            menu: {
                container: "",
                choiceButton: "",
                choiceButtonText: "",
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
        }
    };
    static GameSettingsNamespace = GameSettingsNamespace;

    /**@internal */
    readonly config: Readonly<GameConfig>;
    /**@internal */
    liveGame: LiveGame | null = null;

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

export class LiveGame {
    static DefaultNamespaces = {
        game: {},
    };
    static GameSpacesKey = {
        game: "game",
    } as const;

    game: Game;
    /**@internal */
    storable: Storable;

    /**@internal */
    currentSavedGame: SavedGame | null = null;
    /**@internal */
    story: Story | null = null;
    /**@internal */
    lockedAwaiting: Awaitable<CalledActionResult, any> | null = null;

    /**@internal */
    _lockedCount = 0;
    /**@internal */
    private currentAction: LogicAction.Actions | null = null;

    /**@internal */
    constructor(game: Game) {
        this.game = game;
        this.storable = new Storable();

        this.initNamespaces();
    }

    /* Store */
    /**@internal */
    initNamespaces() {
        this.storable.clear().addNamespace(new Namespace<Partial<{
            [key: string]: StorableType | undefined
        }>>(LiveGame.GameSpacesKey.game, LiveGame.DefaultNamespaces.game));
        return this;
    }

    public getStorable() {
        return this.storable;
    }

    /* Game */
    /**@internal */
    loadStory(story: Story) {
        this.story = story.constructStory();
        return this;
    }

    /**
     * Serialize the current game state
     *
     * You can use this to save the game state to a file or a database
     *
     * Note: Even if you change just a single line of script, the saved game might not be compatible with the new version
     */
    public serialize({gameState}: { gameState: GameState }): SavedGame {
        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        // get all element state
        const store = this.storable.toData();
        const stage = gameState.toData();
        const currentAction = this.getCurrentAction()?.getId() || null;
        const elementStates = story.getAllElementStates();

        return {
            name: this.currentSavedGame?.name || "",
            meta: {
                created: this.currentSavedGame?.meta.created || Date.now(),
                updated: Date.now(),
            },
            game: {
                store,
                stage,
                currentAction,
                elementStates,
            }
        };
    }

    /**
     * Load a saved game
     *
     * Note: Even if you change just a single line of script, the saved game might not be compatible with the new version
     *
     * After calling this method, the current game state will be lost, and the stage will trigger force reset
     */
    public deserialize(savedGame: SavedGame, {gameState}: { gameState: GameState }) {
        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        this.reset({gameState});
        gameState.stage.forceUpdate();

        const actionMaps = new Map<string, LogicAction.Actions>();
        const elementMaps = new Map<string, LogicAction.GameElement>();
        const {
            game: {
                store,
                stage,
                elementStates,
                currentAction,
            }
        } = savedGame;

        // construct maps
        story.forEachChild(story.entryScene?.sceneRoot || [], action => {
            actionMaps.set(action.getId(), action);
            elementMaps.set(action.callee.getId(), action.callee);
        });

        // restore storable
        this.storable.load(store);

        // restore elements
        elementStates.forEach(({id, data}) => {
            gameState.logger.debug("restore element", id);

            const element = elementMaps.get(id);
            if (!element) {
                throw new Error("Element not found, id: " + id + "\nNarraLeaf cannot find the element with the id from the saved game");
            }
            element.reset();
            element.fromData(data as any);
        });

        // restore game state
        this.currentSavedGame = savedGame;
        gameState.loadData(stage, elementMaps);
        if (currentAction) {
            const action = actionMaps.get(currentAction);
            if (!action) {
                throw new Error("Action not found, id: " + currentAction + "\nNarraLeaf cannot find the action with the id from the saved game");
            }
            this.currentAction = action;
        }

        gameState.stage.forceUpdate();
        gameState.stage.next();
    }

    /**
     * Start a new game
     */
    public newGame({gameState}: { gameState: GameState }) {
        this.reset({gameState});
        this.initNamespaces();

        const newGame = this.getNewSavedGame();
        newGame.name = "NewGame-" + Date.now();
        this.currentSavedGame = newGame;

        const elements: Map<string, LogicAction.GameElement> | undefined =
            this.story?.getAllElementMap(this.story?.entryScene?.sceneRoot || []);
        if (elements) {
            elements.forEach((element) => {
                gameState.logger.debug("reset element", element);
                element.reset();
            });
        } else {
            gameState.logger.warn("No elements found");
        }

        gameState.stage.forceUpdate();
        gameState.stage.next();

        return this;
    }

    /**@internal */
    reset({gameState}: { gameState: GameState }) {
        if (this.lockedAwaiting) {
            this.lockedAwaiting.abort();
        }

        this.currentAction = this.story?.entryScene?.sceneRoot || null;
        this.lockedAwaiting = null;
        this.currentSavedGame = null;

        gameState.forceReset();
    }

    /**@internal */
    getCurrentAction(): LogicAction.Actions | null {
        return this.currentAction;
    }

    /**@internal */
    setCurrentAction(action: LogicAction.Actions | null) {
        this.currentAction = action;
        return this;
    }

    /**@internal */
    next(state: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null {
        if (!this.story) {
            throw new Error("No story loaded");
        }

        if (this.lockedAwaiting) {
            if (!this.lockedAwaiting.solved) {
                this._lockedCount++;

                if (this._lockedCount > 1000) {
                    // sometimes react will make it stuck and enter a dead cycle
                    // that's not cool, so we need to throw an error to break it
                    // my computer froze for 5 minutes because of this
                    throw new Error("Locked awaiting");
                }

                return this.lockedAwaiting;
            }
            const next = this.lockedAwaiting.result;
            this.currentAction = next?.node?.action || null;

            state.logger.debug("next action", next);

            this.lockedAwaiting = null;
            return next || null;
        }

        if (!this.currentAction) {
            state.events.emit(GameState.EventTypes["event:state.end"]);
            state.logger.warn("LiveGame", "No current action"); // Congrats, you've reached the end of the story
            return null;
        }

        const nextAction = this.currentAction.executeAction(state);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            this.lockedAwaiting = nextAction;
            return nextAction;
        }

        state.logger.debug("next action", nextAction);

        this._lockedCount = 0;

        this.currentAction = nextAction.node?.action || null;
        return nextAction;
    }

    /**@internal */
    abortAwaiting() {
        if (this.lockedAwaiting) {
            const next = this.lockedAwaiting.abort();
            this.currentAction = next?.node?.action || null;
            this.lockedAwaiting = null;
        }
    }

    /**@internal */
    executeAction(state: GameState, action: LogicAction.Actions): LogicAction.Actions | Awaitable<CalledActionResult, CalledActionResult> | null {
        const nextAction = action.executeAction(state);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            return nextAction;
        }
        return nextAction?.node?.action || null;
    }

    /**@internal */
    private getNewSavedGame(): SavedGame {
        return {
            name: "",
            meta: {
                created: Date.now(),
                updated: Date.now(),
            },
            game: {
                store: {},
                stage: {
                    scenes: [],
                },
                elementStates: [],
                currentAction: this.story?.entryScene?.sceneRoot?.getId() || null,
            }
        };
    }
}

export default {
    Game,
    LiveGame,
};

export type {
    LogicAction
};

