import {Awaitable, EventDispatcher, Lock, MultiLock} from "@lib/util/data";
import type {CalledActionResult, SavedGame} from "@core/gameTypes";
import {Story} from "@core/elements/story";
import {GameState} from "@player/gameState";
import {Namespace, Storable} from "@core/elements/persistent/storable";
import {LogicAction} from "@core/action/logicAction";
import {StorableType} from "@core/elements/persistent/type";
import {Game} from "@core/game";
import {ContentNode} from "@core/action/tree/actionTree";
import {ConditionAction} from "@core/action/actions/conditionAction";
import {SceneAction} from "@core/action/actions/sceneAction";
import {ControlActionTypes, SceneActionTypes} from "@core/action/actionTypes";
import {Scene} from "@core/elements/scene";
import {ControlAction} from "@core/action/actions/controlAction";
import {LiveGameEventHandler, LiveGameEventToken} from "@core/types";
import {Character} from "@core/elements/character";
import {Sentence} from "@core/elements/character/sentence";

/**@internal */
type LiveGameEvent = {
    "event:character.prompt": [{
        /**
         * The character who says the sentence
         */
        character: Character | null,
        /**
         * The sentence said by the character
         */
        sentence: Sentence,
        /**
         * The text of the sentence
         */
        text: string;
    }];
    "event:menu.choose": [{
        /**
         * The sentence selected by the player
         */
        sentence: Sentence,
        /**
         * The text of the sentence
         */
        text: string;
    }];
};

export class LiveGame {
    static DefaultNamespaces = {
        game: {},
    };
    static GameSpacesKey = {
        game: "game",
    } as const;
    static EventTypes = {
        "event:character.prompt": "event:character.prompt",
        "event:menu.choose": "event:menu.choose",
    } as const;

    public game: Game;
    public gameLock = new MultiLock();
    public events: EventDispatcher<LiveGameEvent> = new EventDispatcher();
    /**@internal */
    currentSavedGame: SavedGame | null = null;
    /**@internal */
    story: Story | null = null;
    /**@internal */
    lockedAwaiting: Awaitable<CalledActionResult, any> | null = null;
    /**@internal */
    gameState: GameState | undefined = undefined;
    /**@internal */
    private readonly storable: Storable;
    /**@internal */
    private _lockedCount = 0;
    /**@internal */
    private currentAction: LogicAction.Actions | null = null;
    /**@internal */
    private _nextLock = new Lock();

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
        if (this.story) {
            this.story.initPersistent(this.storable);
        }
        return this;
    }

    public getStorable() {
        return this.storable;
    }

    /* Game */
    /**@internal */
    loadStory(story: Story) {
        this.story = story
            .constructStory();
        return this;
    }

    /**
     * Serialize the current game state
     *
     * You can use this to save the game state to a file or a database
     *
     * Note: even if you change just a single line of script, the saved game might not be compatible with the new version
     */
    public serialize(): SavedGame {
        if (!this.gameState) {
            throw new Error("No game state");
        }
        const gameState = this.gameState;

        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        // get all element states
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
     * Note: even if you change just a single line of script, the saved game might not be compatible with the new version
     *
     * After calling this method, the current game state will be lost, and the stage will trigger force reset
     */
    public deserialize(savedGame: SavedGame) {
        if (!this.gameState) {
            throw new Error("No game state");
        }
        const gameState = this.gameState;

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
        story.forEachChild(story, story.entryScene?.getSceneRoot() || [], action => {
            actionMaps.set(action.getId(), action);
            elementMaps.set(action.callee.getId(), action.callee);
        });

        // restore storable
        this.storable.clear().load(store);

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
     * When a character says something
     */
    public onCharacterPrompt(fc: LiveGameEventHandler<LiveGameEvent["event:character.prompt"]>): LiveGameEventToken {
        const eventName = LiveGame.EventTypes["event:character.prompt"];
        const event = this.events.on(eventName, fc);
        return {
            cancel: () => {
                this.events.off(eventName, event);
            }
        };
    }

    /**
     * When a player chooses a menu
     */
    public onMenuChoose(fc: LiveGameEventHandler<LiveGameEvent["event:menu.choose"]>): LiveGameEventToken {
        const eventName = LiveGame.EventTypes["event:menu.choose"];
        const event = this.events.on(eventName, fc);
        return {
            cancel: () => {
                this.events.off(eventName, event);
            }
        };
    }

    /**
     * Start a new game
     */
    public newGame() {
        if (!this.gameState) {
            throw new Error("No game state");
        }
        const gameState = this.gameState;
        const logGroup = gameState.logger.group("LiveGame");

        this.reset({gameState});
        this.initNamespaces();

        const newGame = this.getNewSavedGame();
        newGame.name = "NewGame-" + Date.now();
        this.currentSavedGame = newGame;
        this.currentAction = this.story?.entryScene?.getSceneRoot() || null;

        const elements: Map<string, LogicAction.GameElement> | undefined =
            this.story?.getAllElementMap(this.story, this.story?.entryScene?.getSceneRoot() || []);
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
        logGroup.end();

        return this;
    }

    /**@internal */
    reset({gameState}: { gameState: GameState }) {
        if (this.lockedAwaiting) {
            this.lockedAwaiting.abort();
        }

        this.currentAction = null;
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
    next(state: GameState): CalledActionResult | Awaitable<CalledActionResult> | MultiLock | null {
        if (this.gameLock.isLocked()) {
            return this.gameLock;
        }

        if (this._nextLock.isLocked()) {
            return null;
        }
        this._nextLock.lock();

        if (!this.story) {
            throw new Error("No story loaded");
        }

        if (this.lockedAwaiting) {
            if (!this.lockedAwaiting.solved) {
                this._lockedCount++;

                if (this._lockedCount > 1000) {
                    // sometimes react will make it stuck and enter a dead cycle
                    // that's not cool, so it needs to throw an error to break it
                    throw new Error("LiveGame locked: dead cycle detected\nPlease refresh the page");
                }

                this._nextLock.unlock();
                return this.lockedAwaiting;
            }
            const next = this.lockedAwaiting.result;
            this.currentAction = next?.node?.action || null;
            this.lockedAwaiting = null;
            if (!this.currentAction) {
                state.events.emit(GameState.EventTypes["event:state.end"]);
            }

            state.logger.debug("next action (lockedAwaiting)", next);

            this._nextLock.unlock();
            return next || null;
        }

        if (!this.currentAction) {
            state.logger.weakWarn("LiveGame", "No current action"); // Congrats, you've reached the end of the story

            this._nextLock.unlock();
            return null;
        }

        const nextAction = this.currentAction.executeAction(state);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            this.lockedAwaiting = nextAction;

            this._nextLock.unlock();
            return nextAction;
        }

        state.logger.debug("next action", nextAction);

        this._lockedCount = 0;
        this.currentAction = nextAction.node?.action || null;

        this._nextLock.unlock();
        return nextAction;
    }

    /**@internal */
    isPlaying() {
        return !!this.currentAction;
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
    setGameState(state: GameState | undefined) {
        this.gameState = state;
        return this;
    }

    getGameState() {
        return this.gameState;
    }

    /**@internal */
    getAllPredictableActions(story: Story, action?: LogicAction.Actions | null, limit?: number): LogicAction.Actions[] {
        let current: ContentNode | null = action?.contentNode || null;
        const actions: LogicAction.Actions[] = [];
        const queue: LogicAction.Actions[] = [];
        const seenScene = new Set<Scene>();

        while (current || queue.length) {
            if (limit && actions.length >= limit) {
                break;
            }
            if (!current) {
                current = queue.pop()!.contentNode;
            }

            if ([ConditionAction].some(a => current?.action && current.action instanceof a)) {
                current = null;
                continue;
            }
            if (current.action && current.action.is<SceneAction<"scene:jumpTo">>(SceneAction, SceneActionTypes.jumpTo)) {
                const [targetScene] = current.action.contentNode.getContent();
                const scene = story.getScene(targetScene);
                if (!scene) {
                    throw current.action._sceneNotFoundError(current.action.getSceneName(targetScene));
                }

                if (seenScene.has(scene)) {
                    current = null;
                    continue;
                }
                seenScene.add(scene);

                current = scene.getSceneRoot()?.contentNode || null;
                continue;
            } else if (current.action &&
                current.action.is<ControlAction<"control:do">>(ControlAction as any, ControlActionTypes.do)
            ) {
                const [content] = current.action.contentNode.getContent();
                if (current.getChild()?.action) queue.push(current.getChild()!.action!);
                current = content[0]?.contentNode || null;
            }
            if (current.action) actions.push(current.action);
            current = current.getChild();
        }

        return actions;
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
                currentAction: this.story?.entryScene?.getSceneRoot().getId() || null,
            }
        };
    }
}