import { ConditionAction } from "@core/action/actions/conditionAction";
import { ControlAction } from "@core/action/actions/controlAction";
import { SceneAction } from "@core/action/actions/sceneAction";
import { ControlActionTypes, SceneActionTypes } from "@core/action/actionTypes";
import { LogicAction } from "@core/action/logicAction";
import { ContentNode, RawData } from "@core/action/tree/actionTree";
import { RuntimeGameError, RuntimeInternalError } from "@core/common/Utils";
import { Character } from "@core/elements/character";
import { Sentence } from "@core/elements/character/sentence";
import { Namespace, Storable } from "@core/elements/persistent/storable";
import { StorableType } from "@core/elements/persistent/type";
import { Scene } from "@core/elements/scene";
import { ElementStateRaw, Story } from "@core/elements/story";
import { Game } from "@core/game";
import type { CalledActionResult, NotificationToken, SavedGame } from "@core/gameTypes";
import { LiveGameEventHandler, LiveGameEventToken } from "@core/types";
import { Awaitable, EventDispatcher, generateId, MultiLock } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { Options } from "html-to-image/lib/types";
import { ActionExecutionInjection, ExecutedActionResult } from "../action/action";
import { GameHistory } from "../action/gameHistory";
import { StackModel, StackModelRawData } from "../action/stackModel";

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
    public events: EventDispatcher<LiveGameEvent> = new EventDispatcher();
    /**@internal */
    story: Story | null = null;
    /**@internal */
    gameLock = new MultiLock();
    /**@internal */
    currentSavedGame: SavedGame | null = null;
    /**@internal */
    gameState: GameState | undefined = undefined;
    /**@internal */
    stackModel: StackModel | null = null;
    /**@internal */
    asyncStackModels: Set<StackModel> = new Set();
    /**@internal */
    lastDialog: {
        sentence: string;
        speaker: string | null;
    } | null = null;
    /**@internal */
    private readonly _storable: Storable;
    /**@internal */
    private mapCache: [actionMap: Map<string, LogicAction.Actions>, elementMap: Map<string, LogicAction.GameElement>] | null = null;

    /**@internal */
    constructor(game: Game) {
        this.game = game;
        this._storable = new Storable();

        this.initNamespaces();
    }

    /* Store */
    /**@internal */
    initNamespaces() {
        this._storable.clear().addNamespace(new Namespace<Partial<{
            [key: string]: StorableType | undefined
        }>>(LiveGame.GameSpacesKey.game, LiveGame.DefaultNamespaces.game));
        if (this.story) {
            this.story.initPersistent(this._storable);
        }
        return this;
    }

    public getStorable() {
        return this._storable;
    }

    public get storable() {
        return this._storable;
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

        if (!this.currentSavedGame || !this.stackModel) {
            throw new Error("Failed when trying to serialize the game: The game has not started");
        }

        // get all element states
        const store = this._storable.toData();
        const stage = gameState.toData();
        const elementStates: RawData<ElementStateRaw>[] = story.getAllElementStates();
        const stackModel: StackModelRawData = this.stackModel.serialize();
        const asyncStackModels: StackModelRawData[] = Array.from(this.asyncStackModels).map(stack => stack.serialize());

        return {
            name: this.currentSavedGame.name,
            meta: {
                created: this.currentSavedGame.meta.created,
                updated: Date.now(),
                id: this.currentSavedGame.meta.id,
                lastSentence: this.lastDialog?.sentence || null,
                lastSpeaker: this.lastDialog?.speaker || null,
            },
            game: {
                store,
                stage,
                elementStates,
                stackModel,
                asyncStackModels,
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

        // Prevent the player from rolling the stack
        gameState.rollLock.lock();

        this.reset();
        gameState.stage.forceRemount();

        const {
            game: {
                store,
                stage,
                elementStates,
                services,
                stackModel,
                asyncStackModels,
            }
        } = savedGame;

        // construct maps
        const [actionMaps, elementMaps] = this.constructMaps();

        // restore storable
        this._storable.clear().load(store);

        // restore elements
        elementStates.forEach(({ id, data }) => {
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

        // restore stack model
        this.stackModel.deserialize(stackModel, actionMaps);
        asyncStackModels.forEach(stack => this.asyncStackModels.add(StackModel.createStackModel(this, stack, actionMaps)));
        this.asyncStackModels.forEach(stack => gameState.timelines.attachTimeline(stack.execute()));

        // restore services
        story.deserializeServices(services);

        gameState.events.once(GameState.EventTypes["event:state.onRender"], () => {
            gameState.schedule(() => {
                gameState.rollLock.unlock();
                gameState.stage.next();
            }, 0);
        });
        gameState.stage.forceUpdate();
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
        if (!this.gameState.actionHistory.ableToUndo(this.gameState.gameHistory)) {
            this.gameState.logger.warn("LiveGame.undo", "No action to undo");
            return;
        }

        const lock = this.gameLock.register().lock();

        this.stackModel.abortStackTop();

        const actionHistory = id
            ? this.gameState.actionHistory.undoUntil(id)
            : this.gameState.actionHistory.undo(this.gameState.gameHistory);

        if (actionHistory) {
            const [actionMaps] = this.constructMaps();
            const { rootStackSnapshot, stackModel } = actionHistory;

            this.stackModel.deserialize(rootStackSnapshot, actionMaps);
            if (stackModel === this.stackModel) {
                this.stackModel.push(StackModel.fromAction(actionHistory.action as LogicAction.Actions));
            }

            this.gameLock.off(lock.unlock());

            this.gameState.logger.info("LiveGame.undo", "Undo until", id, "action", actionHistory);
    
            this.gameState.stage.forceUpdate();
            this.gameState.stage.next();
            this.gameState.schedule(() => {
                if (this.gameState) this.gameState.forceAnimation();
            }, 0);
        } else {
            this.gameState.logger.warn("LiveGame.undo", "No action found");
            this.gameLock.off(lock.unlock());
        }
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
    public notify(message: string, duration: number | null = 3000): NotificationToken {
        this.assertGameState();

        const id = this.gameState.idManager.generateId();
        const awaitable = this.gameState.notificationMgr.consume({ id, message, duration });

        const promise = Awaitable.toPromiseForce(awaitable);

        return {
            cancel: () => {
                awaitable.abort();
            },
            promise,
        };
    }

    /**
     * Skip the current dialog
     */
    public skipDialog() {
        this.assertGameState();

        this.gameState.events.emit(GameState.EventTypes["event:state.player.skip"], true);
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

        this.reset();
        this.initNamespaces();

        const newGame = this.getNewSavedGame();
        newGame.name = "NewGame-" + Date.now();
        this.currentSavedGame = newGame;
        
        const sceneRoot = this.story?.entryScene?.getSceneRoot();
        if (sceneRoot) {
            this.stackModel.push(StackModel.fromAction(sceneRoot));
        } else {
            gameState.logger.warn("No scene root found");
        }

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

    public waitForRouterExit(): {
        promise: Promise<void>;
        cancel: VoidFunction;
    } {
        let token: LiveGameEventToken | null = null;
        return {
            promise: new Promise((resolve, reject) => {
                this.assertGameState();
                const gameState = this.gameState;
                if (!gameState.pageRouter) {
                    reject(new RuntimeInternalError("Page router is not mounted"));
                    return;
                }

                token = gameState.pageRouter.onceExitComplete(() => {
                    resolve();
                });
            }),
            cancel: () => {
                if (token) {
                    token.cancel();
                }
            }
        };
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
    constructMaps(): [actionMap: Map<string, LogicAction.Actions>, elementMap: Map<string, LogicAction.GameElement>] {
        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        if (this.mapCache) {
            return this.mapCache;
        }

        const actionMaps = new Map<string, LogicAction.Actions>();
        const elementMaps = new Map<string, LogicAction.GameElement>();

        // construct maps
        story.forEachChild(story, story.entryScene?.getSceneRoot() || [], action => {
            actionMaps.set(action.getId(), action);
            elementMaps.set(action.callee.getId(), action.callee);
        }, { allowFutureScene: true });

        this.mapCache = [actionMaps, elementMaps];

        return this.mapCache;
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

    /**
     * Listen to the events of the window
     */
    onWindowEvent<K extends keyof WindowEventMap>(
        type: K,
        listener: (this: Window, ev: WindowEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): LiveGameEventToken {
        window.addEventListener(type, listener, options);
        return {
            cancel: () => window.removeEventListener(type, listener, options),
        };
    }

    /**
     * Reset the game state
     * 
     * **Note**: calling this method will lose the current game state
     */
    public reset() {
        this.assertGameState();
        const gameState = this.gameState;

        this.resetStackModels();
        this.stackModel.reset();
        this.currentSavedGame = null;
        this.lastDialog = null;

        gameState.forceReset();
    }

    /**@internal */
    next(): CalledActionResult | Awaitable<CalledActionResult> | MultiLock | null {
        this.assertGameState();
        const gameState = this.gameState;

        if (this.gameLock.isLocked()) {
            return this.gameLock;
        }

        if (!this.story) {
            throw new Error("No story loaded");
        }

        // If the action stack is empty
        if (this.stackModel.isEmpty()) {
            gameState.logger.weakWarn("LiveGame", "No current action");
            if (this.currentSavedGame) {
                gameState.events.emit("event:state.end");
            } else {
                this.currentSavedGame = null;
            }
            return null;
        }

        return this.stackModel.rollNext();
    }

    /**@internal */
    setLastDialog(sentence: string, speaker: string | null) {
        this.lastDialog = {
            sentence,
            speaker,
        };
    }

    /**
     * **IMPORTANT**: Experimental
     * @internal
     */
    requestAsyncStackModel(value: (CalledActionResult | Awaitable<CalledActionResult>)[]): StackModel {
        this.assertGameState();
        
        const stack = new StackModel(this);
        this.asyncStackModels.add(stack);

        stack.push(...value);

        return stack;
    }

    /**@internal */
    createStackModel(value: (CalledActionResult | Awaitable<CalledActionResult>)[]): StackModel {
        const stack = new StackModel(this);
        stack.push(...value);

        return stack;
    }

    /**@internal */
    resetStackModels() {
        this.asyncStackModels.forEach(stackModel => stackModel.reset());
        this.asyncStackModels.clear();
    }

    /**@internal */
    isPlaying() {
        return this.stackModel && !this.stackModel.isEmpty();
    }

    /**@internal */
    executeAction(state: GameState, action: LogicAction.Actions, injection: ActionExecutionInjection): ExecutedActionResult {
        if (!this.stackModel) {
            throw new Error("Stack model is not initialized");
        }

        const nextAction = action.executeAction(state, injection);
        if (Awaitable.isAwaitable<CalledActionResult, CalledActionResult>(nextAction)) {
            return nextAction;
        }
        return nextAction || null;
    }

    /**@internal */
    setGameState(state: GameState | undefined) {
        if (state && this.gameState) {
            throw new RuntimeInternalError("GameState already set");
        }

        this.gameState = state;
        if (state && !this.stackModel) {
            this.stackModel = new StackModel(this, "$root");
        }
        return this;
    }

    getGameState() {
        return this.gameState;
    }

    getGameStateForce() {
        if (!this.gameState) {
            throw new RuntimeInternalError("GameState not set");
        }
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
    clearMainStack(): this {
        if (!this.stackModel) {
            throw new RuntimeInternalError("No stack model found");
        }
        this.stackModel.reset();

        return this;
    }

    /**@internal */
    getStackModelForce() {
        if (!this.stackModel) {
            throw new RuntimeInternalError("No stack model found");
        }
        return this.stackModel;
    }

    /**@internal */
    private getNewSavedGame(): SavedGame {
        return {
            name: "",
            meta: {
                created: Date.now(),
                updated: Date.now(),
                id: generateId(),
                lastSentence: null,
                lastSpeaker: null,
            },
            game: {
                store: {},
                stage: {
                    scenes: [],
                    audio: {
                        sounds: [],
                        groups: [],
                    },
                    videos: [],
                },
                elementStates: [],
                services: {},
                stackModel: [],
                asyncStackModels: [],
            }
        };
    }

    /**
     * @internal
     * @throws {RuntimeGameError} - If the game state isn't found
     */
    private assertGameState(): asserts this is { gameState: GameState } & { stackModel: StackModel } {
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