import type {CalledActionResult, GameConfig, GameSettings, SavedGame} from "./gameTypes";
import {Awaitable, deepMerge, DeepPartial} from "@lib/util/data";
import {Namespace, Storable} from "@core/store/storable";
import {Singleton} from "@lib/util/singleton";
import {Story} from "./elements/story";
import {LogicAction} from "@core/action/logicAction";
import {GameState} from "@player/gameState";

class IdManager extends Singleton<IdManager>() {
    private id = 0;

    public getId() {
        return this.id++;
    }

    public getStringId() {
        return (this.id++).toString();
    }

    prefix(prefix: string, value: string, separator = ":") {
        return prefix + separator + value;
    }
}

class GameIdManager {
    private id = 0;

    public getId() {
        return this.id++;
    }

    public getStringId() {
        return (this.id++).toString();
    }

    prefix(prefix: string, value: string, separator = ":") {
        return prefix + separator + value;
    }
}

enum GameSettingsNamespace {
    game = "game",
}

export class Game {
    static defaultSettings: GameSettings = {
        volume: 1,
    };
    static DefaultConfig: GameConfig = {
        version: "v0.0.0",
        player: {
            contentContainerId: "__narraleaf_content",
            aspectRatio: 16 / 9,
            minWidth: 800,
            minHeight: 450,
        },
        elements: {
            say: {
                skipKeys: [" "],
                textSpeed: 50,
            },
            img: {
                slowLoadWarning: true,
                slowLoadThreshold: 200,
            }
        }
    };
    static GameSettingsNamespace = GameSettingsNamespace;
    readonly config: Readonly<GameConfig>;
    liveGame: LiveGame | null = null;

    /**
     * Create a new game
     * @param config - Game configuration
     */
    constructor(config: DeepPartial<GameConfig>) {
        this.config = deepMerge<GameConfig>(Game.DefaultConfig, config);
    }

    static getIdManager() {
        return IdManager.getInstance();
    };

    /* Live Game */
    public getLiveGame(): LiveGame {
        if (!this.liveGame) {
            const liveGame = this.createLiveGame();
            this.liveGame = liveGame;
            return liveGame;
        }
        return this.liveGame;
    }

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
    storable: Storable;
    currentSceneNumber: number | null = null;
    currentSavedGame: SavedGame | null = null;
    story: Story | null = null;
    lockedAwaiting: Awaitable<CalledActionResult, any> | null = null;
    idManager: GameIdManager;
    _lockedCount = 0;
    private currentAction: LogicAction.Actions | null = null;

    constructor(game: Game) {
        this.game = game;
        this.storable = new Storable();

        this.initNamespaces();
        this.idManager = new GameIdManager();
    }

    getDefaultSavedGame(): SavedGame {
        return {
            name: "_",
            version: this.game.config.version,
            meta: {
                created: Date.now(),
                updated: Date.now(),
            },
            game: {
                store: {},
                elementState: [],
                nodeChildIdMap: {},
                stage: {
                    elements: [],
                },
                currentScene: 0,
                currentAction: null,
            }
        };
    }

    /* Store */
    initNamespaces() {
        this.storable.addNamespace(new Namespace<any>(LiveGame.GameSpacesKey.game, LiveGame.DefaultNamespaces.game));
        return this;
    }

    getStorable() {
        return this.storable;
    }

    /* Game */
    public loadStory(story: Story) {
        this.story = story;
        return this;
    }

    /**
     * Start a new game
     */
    public newGame() {
        this.initNamespaces();

        this.currentSceneNumber = 0;
        this.currentAction = this.story?.getActions()[this.currentSceneNumber] || null;

        const newGame = this.getDefaultSavedGame();
        newGame.name = "NewGame-" + Date.now();
        this.currentSavedGame = newGame;

        return this;
    }

    public deserialize(savedGame: SavedGame, {gameState}: { gameState: GameState }) {
        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        if (savedGame.version !== this.game.config.version) {
            throw new Error("Saved game version mismatch");
        }

        const actions = story.getAllActions();
        const {
            store,
            elementState,
            nodeChildIdMap,
            currentScene,
            currentAction,
            stage,
        } = savedGame.game;

        // restore storable
        this.storable.load(store);

        // restore action tree
        story._setAllElementState(elementState, actions);
        story._setNodeChildByMap(nodeChildIdMap, actions);

        // restore game state
        if (currentAction) {
            this.setCurrentAction(story.findActionById(currentAction, actions) || null);
        } else {
            this.setCurrentAction(null);
        }
        this.currentSceneNumber = currentScene;
        this.currentSavedGame = savedGame;
        gameState.loadData(stage, actions);
    }

    public serialize({gameState}: { gameState: GameState }): SavedGame {
        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        const actions = story.getAllActions();

        const elementState = story._getAllElementState(actions);
        const nodeChildIds = Object.fromEntries(story._getNodeChildIdMap(actions));
        const stage = gameState.toData();

        return {
            name: this.currentSavedGame?.name || "_",
            version: this.game.config.version,
            meta: {
                created: this.currentSavedGame?.meta.created || Date.now(),
                updated: Date.now(),
            },
            game: {
                store: this.storable.toData(),
                elementState: elementState,
                stage: stage,
                nodeChildIdMap: nodeChildIds,
                currentScene: this.currentSceneNumber || 0,
                currentAction: this.getCurrentAction()?.getId() || null,
            }
        };
    }

    getCurrentAction(): LogicAction.Actions | null {
        return this.currentAction;
    }

    setCurrentAction(action: LogicAction.Actions | null) {
        this.currentAction = action;
        return this;
    }

    next(state: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null {
        if (!this.story) {
            throw new Error("No story loaded");
        }
        if (!this.currentSceneNumber) {
            this.currentSceneNumber = 0;
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
            this.lockedAwaiting = null;
            return next || null;
        }

        this.currentAction = this.currentAction || this.story.getActions()[++this.currentSceneNumber];
        if (!this.currentAction) {
            console.warn("No current action"); // Congrats, you've reached the end of the story
            return null;
        }

        const nextAction = this.currentAction.executeAction(state);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            this.lockedAwaiting = nextAction;
            return nextAction;
        }

        this._lockedCount = 0;

        this.currentAction = nextAction.node?.child?.action || null;
        return nextAction;
    }

    executeAction(state: GameState, action: LogicAction.Actions): LogicAction.Actions | Awaitable<CalledActionResult, CalledActionResult> | null {
        const nextAction = action.executeAction(state);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            return nextAction;
        }
        return nextAction?.node?.child?.action || null;
    }
}

export default {
    Game,
    LiveGame,
};

export type {
    LogicAction
};

