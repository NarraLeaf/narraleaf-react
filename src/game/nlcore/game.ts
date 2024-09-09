import type {CalledActionResult, GameConfig, GameSettings, SavedGame} from "./gameTypes";
import {Awaitable} from "@lib/util/data";
import {Namespace, Storable, StorableData} from "./save/storable";
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
        clientGame: null,
        app: {
            info: {
                version: "v0.0.0",
            },
            player: {
                contentContainerId: "content",
            }
        }
    }
    static GameSettingsNamespace = GameSettingsNamespace;
    config: GameConfig;
    liveGame: LiveGame | null = null;
    settings: Record<GameSettingsNamespace, Record<string, any>> = {
        game: {}
    };

    constructor(config: GameConfig) {
        this.config = config;
    }

    static getIdManager() {
        return IdManager.getInstance();
    };

    async init(): Promise<void> {}

    /* Live Game */
    public getLiveGame() {
        if (!this.liveGame) {
            this.createLiveGame();
        }
        return this.liveGame;
    }

    public createLiveGame() {
        this.liveGame = new LiveGame(this);
        return this.liveGame;
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
            version: this.game.config.app.info.version,
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
        this.storable.addNamespace(new Namespace<StorableData>(LiveGame.GameSpacesKey.game, LiveGame.DefaultNamespaces.game));
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

    public newGame() {
        this.initNamespaces();

        this.currentSceneNumber = 0;
        this.currentAction = this.story?.getActions()[this.currentSceneNumber];

        const newGame = this.getDefaultSavedGame();
        newGame.name = "NewGame-" + Date.now();
        this.currentSavedGame = newGame;

        return this;
    }

    public loadSavedGame(savedGame: SavedGame, {gameState}: { gameState: GameState }) {
        const story = this.story;
        if (!story) {
            console.warn("No story loaded");
            return;
        }

        if (savedGame.version !== this.game.config.app.info.version) {
            throw new Error("Saved game version mismatch");
        }

        const actions = this.story.getAllActions();
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
        this.story.setAllElementState(elementState, actions);
        this.story.setNodeChildByMap(nodeChildIdMap, actions);

        // restore game state
        this.setCurrentAction(this.story.findActionById(currentAction, actions) || null);
        this.currentSceneNumber = currentScene;
        this.currentSavedGame = savedGame;
        gameState.loadData(stage, actions);
    }

    public generateSavedGame({gameState}: { gameState: GameState }): SavedGame {
        const story = this.story;
        if (!story) {
            console.warn("No story loaded");
            return null;
        }

        const actions = this.story.getAllActions();

        const elementState = this.story.getAllElementState(actions);
        const nodeChildIds = Object.fromEntries(this.story.getNodeChildIdMap(actions));
        const stage = gameState.toData();

        return {
            name: this.currentSavedGame?.name || "_",
            version: this.game.config.app.info.version,
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

    getCurrentAction(): LogicAction.Actions {
        return this.currentAction;
    }

    setCurrentAction(action: LogicAction.Actions) {
        this.currentAction = action;
        return this;
    }

    next(state: GameState): CalledActionResult | Awaitable<CalledActionResult, CalledActionResult> | null {
        if (this.lockedAwaiting) {
            if (!this.lockedAwaiting.solved) {
                console.log("Locked awaiting");
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
            this.currentAction = next.node?.action || null;
            this.lockedAwaiting = null;
            return next;
        }

        this.currentAction = this.currentAction || this.story.getActions()[++this.currentSceneNumber];
        if (!this.currentAction) {
            console.warn("No current action"); // Congrats, you've reached the end of the story
            return null;
        }

        const nextAction = this.currentAction.executeAction(state);
        if (Awaitable.isAwaitable(nextAction)) {
            this.lockedAwaiting = nextAction;
            return nextAction;
        }

        this._lockedCount = 0;

        this.currentAction = nextAction.node.child?.action;
        return nextAction;
    }

    executeAction(state: GameState, action: LogicAction.Actions): LogicAction.Actions | Awaitable<CalledActionResult, CalledActionResult> | null {
        const nextAction = action.executeAction(state);
        if (Awaitable.isAwaitable(nextAction)) {
            return nextAction;
        }
        return nextAction.node.child?.action;
    }
}

export default {
    Game,
    LiveGame,
}

export type {
    LogicAction
}

