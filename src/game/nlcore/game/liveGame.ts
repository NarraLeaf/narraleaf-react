import {Awaitable, EventDispatcher, generateId, MultiLock} from "@lib/util/data";
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
import {RuntimeGameError} from "@core/common/Utils";
import { GameHistory } from "../action/gameHistory";
import { Options } from "html-to-image/lib/types";

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
    public story: Story | null = null;
    /**@internal */
    currentSavedGame: SavedGame | null = null;
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
        this.assertGameState();
        const gameState = this.gameState;

        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        if (!this.currentSavedGame) {
            throw new Error("Failed when trying to serialize the game: The game has not started");
        }

        // get all element states
        const store = this.storable.toData();
        const stage = gameState.toData();
        const currentAction = this.getCurrentAction()?.getId() || null;
        const elementStates = story.getAllElementStates();

        return {
            name: this.currentSavedGame.name,
            meta: {
                created: this.currentSavedGame.meta.created,
                updated: Date.now(),
                id: this.currentSavedGame.meta.id,
            },
            game: {
                store,
                stage,
                currentAction,
                elementStates,
                services: story.serializeServices(),
            },
        } satisfies SavedGame;
    }

    /**
     * Load a saved game
     *
     * Note: even if you change just a single line of script, the saved game might not be compatible with the new version
     *
     * After calling this method, the current game state will be lost, and the stage will trigger force reset
     */
    public deserialize(savedGame: SavedGame) {
        this.assertGameState();
        const gameState = this.gameState;

        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        this.reset({gameState});
        gameState.stage.forceRemount();

        const actionMaps = new Map<string, LogicAction.Actions>();
        const elementMaps = new Map<string, LogicAction.GameElement>();
        const {
            game: {
                store,
                stage,
                elementStates,
                currentAction,
                services,
            }
        } = savedGame;

        // construct maps
        story.forEachChild(story, story.entryScene?.getSceneRoot() || [], action => {
            actionMaps.set(action.getId(), action);
            elementMaps.set(action.callee.getId(), action.callee);
        }, {allowFutureScene: true});

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

        // restore services
        story.deserializeServices(services);

        gameState.stage.forceUpdate();
        gameState.events.once(GameState.EventTypes["event:state.onRender"], () => {
            gameState.schedule(() => {
                gameState.stage.next();
            }, 0);
        });
    }

    /**
     * Get the history of the game
     * 
     * The history is a list of element actions that have been executed  
     * For example, when a character says something, the history will record the sentence and voice
     * 
     * You can use the id to undo the action by using `liveGame.undo(id)`
     * 
     * This method is an utility method for creating a backlog
     */
    public getHistory(): GameHistory[] {
        this.assertGameState();
        return this.gameState.gameHistory.getHistory();
    }

    /**
     * Undo the action
     * 
     * - If the id is provided, it will undo the action **by id**  
     * - If the id is not provided, it will undo **the last action**
     */
    public undo(id?: string) {
        this.assertGameState();

        if (this.lockedAwaiting) {
            this.lockedAwaiting.abort();
            this.lockedAwaiting = null;
        }

        let action = this.currentAction;
        if (id) {
            action = this.gameState.actionHistory.undoUntil(id);
        } else {
            action = this.gameState.actionHistory.undo();
        }
        if (action) {
            this.currentAction = action;
        } else {
            this.gameState.logger.warn("LiveGame.undo", "No action found");
        }
        this.gameState.logger.info("LiveGame.undo", "Undo until", id, "currentAction", this.currentAction, "action", action);
        
        this.gameState.stage.forceUpdate();
        this.gameState.stage.next();
        this.gameState.schedule(() => {
            if (this.gameState) this.gameState.forceAnimation();
        }, 0);
    }

    /**@internal */
    public dispose() {
        this.events.clear();
        this.gameState?.dispose();
    }

    /**
     * Notify the player with a message
     * 
     * @param message - The message to notify the player with
     * @param duration - The duration of the notification in milliseconds, default is 3000ms
     */
    public notify(message: string, duration: number = 3000) {
        this.assertGameState();

        const id = this.gameState.idManager.generateId();
        this.gameState.notificationMgr.consume({id, message, duration});
    }

    private assertScreenshot(): asserts this is { gameState: GameState & { playerCurrent: HTMLDivElement } } {
        this.assertGameState();
        this.assertPlayerElement();
    }

    /**
     * Capture the game screenshot, will only include the player element
     *
     * Returns a PNG image base64-encoded data URL
     */
    capturePng(): Promise<string> {
        this.assertScreenshot();
        return this.gameState.htmlToImage.toPng(this.gameState.mainContentNode!, this.getScreenshotOptions());
    }

    /**
     * Capture the game screenshot, will only include the player element
     *
     * Returns compressed JPEG image data URL
     */
    captureJpeg(): Promise<string> {
        this.assertScreenshot();
        return this.gameState.htmlToImage.toJpeg(this.gameState.mainContentNode!, this.getScreenshotOptions());
    }

    /**
     * Capture the game screenshot, will only include the player element
     *
     * Returns an SVG data URL
     */
    captureSvg(): Promise<string> {
        this.assertScreenshot();
        return this.gameState.htmlToImage.toSvg(this.gameState.mainContentNode!, this.getScreenshotOptions());
    }

    /**
     * Capture the game screenshot, will only include the player element
     *
     * Returns a PNG image blob
     */
    capturePngBlob(): Promise<Blob | null> {
        this.assertScreenshot();
        this.assertGameState();
        this.assertPlayerElement();
        return this.gameState.htmlToImage.toBlob(this.gameState.mainContentNode!, this.getScreenshotOptions());
    }

    /**
     * When a character says something
     */
    public onCharacterPrompt(fc: LiveGameEventHandler<LiveGameEvent["event:character.prompt"]>): LiveGameEventToken {
        return this.events.on(LiveGame.EventTypes["event:character.prompt"], fc);
    }

    /**
     * When a player chooses a menu
     */
    public onMenuChoose(fc: LiveGameEventHandler<LiveGameEvent["event:menu.choose"]>): LiveGameEventToken {
        return this.events.on(LiveGame.EventTypes["event:menu.choose"], fc);
    }

    /**
     * Start a new game
     */
    public newGame() {
        this.assertGameState();
        const gameState = this.gameState;
        const logGroup = gameState.logger.group("LiveGame (newGame)", true);

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

    /**
     * Request full screen on Chrome/Safari/Firefox/IE/Edge/Opera, the player element will be full screen
     *
     * **Note**: this method should be called in response to a user gesture (for example, a click event)
     *
     * Safari iOS and Webview iOS aren't supported,
     * for more information,
     * see [MDN-requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
     */
    public requestFullScreen(options?: FullscreenOptions | undefined): Promise<void> | void {
        this.assertGameState();
        const LogTag = "LiveGame.requestFullScreen";
        try {
            const element = this.gameState.playerCurrent;
            if (!element) {
                this.gameState.logger.warn(LogTag, "No player element found");
                return;
            }
            if (element.requestFullscreen) {
                return element.requestFullscreen(options);
            } else {
                this.gameState.logger.warn(LogTag, "Fullscreen is not supported");
            }
        } catch (e) {
            this.gameState.logger.error(LogTag, e);
        }
    }

    /**
     * Exit full screen
     */
    public exitFullScreen(): Promise<void> | void {
        this.assertGameState();
        const LogTag = "LiveGame.exitFullScreen";
        try {
            if (document.exitFullscreen) {
                return document.exitFullscreen();
            } else {
                this.gameState.logger.warn(LogTag, "Fullscreen is not supported");
            }
        } catch (e) {
            this.gameState.logger.error(LogTag, e);
        }
    }

    /**@internal */
    getScreenshotOptions(): Options {
        return {
            quality: this.game.config.screenshotQuality
        };
    }

    /**
     * Listen to the events of the player element
     */
    onPlayerEvent<K extends keyof HTMLElementEventMap>(
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): LiveGameEventToken {
        this.assertPlayerElement();
        const element = this.gameState.playerCurrent;
        if (!element) {
            this.gameState.logger.warn("LiveGame.onEvent", "No player element found");
            return {
                cancel: () => {
                },
            };
        }
        element.addEventListener(type, listener, options);
        return {
            cancel: () => element.removeEventListener(type, listener, options),
        };
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

        if (!this.story) {
            throw new Error("No story loaded");
        }

        if (this.lockedAwaiting) {
            if (!this.lockedAwaiting.isSettled()) {
                this._lockedCount++;

                if (this._lockedCount > 1000) {
                    // sometimes react will make it stuck and enter a dead cycle
                    // that's not cool, so it needs to throw an error to break it
                    throw new Error("LiveGame locked: dead cycle detected\nPlease refresh the page");
                }

                return this.lockedAwaiting;
            }
            const next = this.lockedAwaiting.result;
            this.currentAction = next?.node?.action || null;
            this.lockedAwaiting = null;
            if (!this.currentAction) {
                state.events.emit(GameState.EventTypes["event:state.end"]);
            }
            this._lockedCount = 0;

            state.logger.debug("next action (lockedAwaiting)", next);

            return next || null;
        }

        if (!this.currentAction) {
            state.logger.weakWarn("LiveGame", "No current action"); // Congrats, you've reached the end of the story

            return null;
        }

        const nextAction = this.currentAction.executeAction(state);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            this.lockedAwaiting = nextAction;
            this._lockedCount = 0;

            return nextAction;
        }

        state.logger.debug("next action", nextAction);

        this._lockedCount = 0;
        this.currentAction = nextAction.node?.action || null;

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
    executeActionRaw(state: GameState, action: LogicAction.Actions): CalledActionResult | Awaitable<CalledActionResult, any> | null {
        return action.executeAction(state);
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
                id: generateId(),
            },
            game: {
                store: {},
                stage: {
                    scenes: [],
                    audio: {
                        sounds: [],
                    },
                    videos: [],
                },
                elementStates: [],
                currentAction: this.story?.entryScene?.getSceneRoot().getId() || null,
                services: {},
            }
        };
    }

    /**
     * @internal
     * @throws {RuntimeGameError} - If the game state isn't found
     */
    private assertGameState(): asserts this is { gameState: GameState } {
        if (!this.gameState) {
            throw new RuntimeGameError("No game state found, make sure you call this method in effect hooks or event handlers");
        }
    }

    /**
     * @internal
     * @throws {RuntimeGameError} - If the player element isn't mounted
     */
    private assertPlayerElement(): asserts this is { gameState: GameState & { playerCurrent: HTMLDivElement } } {
        this.assertGameState();
        if (!this.gameState.playerCurrent) {
            throw new RuntimeGameError("Player Element Not Mounted");
        }
    }
}