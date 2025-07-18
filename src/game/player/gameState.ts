import {CalledActionResult} from "@core/gameTypes";
import {Awaitable, EventDispatcher, IdManager, Lock, Values} from "@lib/util/data";
import {MenuData} from "@core/elements/menu";
import {Scene} from "@core/elements/scene";
import {Sound} from "@core/elements/sound";
import * as Howler from "howler";
import {SrcManager} from "@core/action/srcManager";
import {LogicAction} from "@core/action/logicAction";
import {Storable} from "@core/elements/persistent/storable";
import {Game} from "@core/game";
import {Clickable, MenuElement, TextElement} from "@player/gameState.type";
import {Sentence} from "@core/elements/character/sentence";
import {SceneAction} from "@core/action/actions/sceneAction";
import {Logger} from "@lib/util/logger";
import {RuntimeGameError, RuntimeInternalError} from "@core/common/Utils";
import {Story} from "@core/elements/story";
import {Script} from "@core/elements/script";
import {LiveGame} from "@core/game/liveGame";
import {Word} from "@core/elements/character/word";
import {Chosen, ExposedKeys, ExposedState, ExposedStateType} from "@player/type";
import {AudioManager, AudioManagerDataRaw} from "@player/lib/AudioManager";
import {Layer} from "@core/elements/layer";
import {GameStateGuard, GuardWarningType} from "@player/guard";
import {LiveGameEventToken} from "@core/types";
import * as htmlToImage from "html-to-image";
import {Video, VideoStateRaw} from "@core/elements/video";
import {Timeline, Timelines} from "@player/Tasks";
import {Notification, NotificationManager} from "@player/lib/notification";
import {ActionHistoryManager} from "@lib/game/nlcore/action/actionHistory";
import {GameHistoryManager} from "@lib/game/nlcore/action/gameHistory";
import { Displayable } from "../nlcore/elements/displayable/displayable";
import { Transform } from "../nlcore/common/elements";

type Legacy_PlayerStateElement = {
    texts: Clickable<TextElement>[];
    menus: Clickable<MenuElement, Chosen>[];
    displayable: LogicAction.DisplayableElements[];
};
type ScheduleHandle = {
    retry: () => void;
    onCleanup: (fn: VoidFunction) => void;
};
export type PlayerState = {
    sounds: Sound[];
    videos: Video[];
    srcManagers: SrcManager[];
    elements: PlayerStateElement[];
};
export type PlayerStateElement = {
    scene: Scene,
    /**@deprecated */
    ele?: Legacy_PlayerStateElement;
    layers: Map<Layer, LogicAction.DisplayableElements[]>;
    texts: Clickable<TextElement>[];
    menus: Clickable<MenuElement, Chosen>[];
};
export type PlayerStateData = {
    scenes: {
        sceneId: string;
        elements: {
            /**@deprecated */
            displayable?: string[];
            /**
             * { [layerName]: [displayableId][] }
             */
            layers: Record<string, string[]>;
        };
    }[],
    audio: AudioManagerDataRaw;
    videos: [videoId: string, videoState: VideoStateRaw][];
};
/**@internal */
export type PlayerStateElementSnapshot = {
    scene: Scene,
    layers: Map<Layer, [LogicAction.DisplayableElements, Record<string, any>][]>;
};
/**@internal */
export type PlayerAction = CalledActionResult;

interface StageUtils {
    update: () => void;
    forceUpdate: () => void;
    forceRemount: () => void;
    next: () => void;
}


type GameStateEvents = {
    "event:state.end": [];
    "event:state.player.skip": [force?: boolean];
    "event:state.player.requestFlush": [];
    "event.state.onExpose": [unknown, ExposedState[ExposedStateType]];
    "event:state.onRender": [];
    "event:state:flushPreloadedScenes": [];
};

/**
 * Core game state management class
 * Manages all game-related states including sounds, videos, elements and their lifecycle
 */
export class GameState {
    static EventTypes: { [K in keyof GameStateEvents]: K } = {
        "event:state.end": "event:state.end",
        "event:state.player.skip": "event:state.player.skip",
        "event:state.player.requestFlush": "event:state.player.requestFlush",
        "event.state.onExpose": "event.state.onExpose",
        "event:state.onRender": "event:state.onRender",
        "event:state:flushPreloadedScenes": "event:state:flushPreloadedScenes",
    };
    private state: PlayerState = {
        sounds: [],
        videos: [],
        srcManagers: [],
        elements: [],
    };
    currentHandling: CalledActionResult | null = null;
    stage: StageUtils;
    game: Game;
    playerCurrent: HTMLDivElement | null = null;
    mainContentNode: HTMLDivElement | null = null;
    exposedState: Map<Values<ExposedKeys>, object> = new Map();
    guard: GameStateGuard;
    timelines: Timelines;
    preloadingScene: Scene | null = null;
    flushDep: number = 0;
    rollLock: Lock = new Lock();
    public readonly notificationMgr: NotificationManager;
    public readonly events: EventDispatcher<GameStateEvents>;
    public readonly logger: Logger;
    public readonly audioManager: AudioManager;
    public readonly htmlToImage = htmlToImage;
    public readonly idManager: IdManager;
    public readonly actionHistory: ActionHistoryManager;
    public readonly gameHistory: GameHistoryManager;
    public pageRouter: null = null;

    constructor(game: Game, stage: StageUtils) {
        this.stage = stage;
        this.game = game;
        this.events = new EventDispatcher();
        this.logger = new Logger(game, "NarraLeaf-React");
        this.audioManager = new AudioManager(this);
        this.guard = new GameStateGuard(game.config.app.guard).observe(this);
        this.timelines = new Timelines(this.guard);
        this.notificationMgr = new NotificationManager(this, []);
        this.idManager = new IdManager();
        this.actionHistory = new ActionHistoryManager(game.config.maxActionHistory, this.game.getLiveGame());
        this.gameHistory = new GameHistoryManager(this.actionHistory);
    }

    public get deps(): number {
        return this.flushDep;
    }

    public addVideo(video: Video): this {
        this.state.videos.push(video);
        return this;
    }

    public removeVideo(video: Video): this {
        const index = this.state.videos.indexOf(video);
        if (index === -1) {
            this.logger.weakWarn("Video not found when removing", video.getId());
            return this;
        }
        this.state.videos.splice(index, 1);
        return this;
    }

    public isVideoAdded(video: Video): boolean {
        return this.state.videos.includes(video);
    }

    public getVideos(): Video[] {
        return this.state.videos;
    }

    public findElementByScene(scene: Scene): PlayerStateElement | null {
        return this.state.elements.find(e => e.scene === scene) || null;
    }

    public findElementByDisplayable(displayable: LogicAction.DisplayableElements, layer: Layer | null = null): PlayerStateElement | null {
        return this.state.elements.find(e => {
            if (layer) {
                return e.layers.get(layer)?.includes(displayable) || false;
            }
            for (const elements of e.layers.values()) {
                if (elements.includes(displayable)) return true;
            }
            return false;
        }) || null;
    }

    public getLiveGame(): LiveGame {
        return this.game.getLiveGame();
    }

    public removeElement(element: PlayerStateElement): this {
        const index = this.state.elements.indexOf(element);
        if (index === -1) {
            this.logger.weakWarn("Element not found when removing", element.scene.getId());
            return this;
        }

        this.logger.debug("GameState", "Removing element", element.scene.getId());

        this.state.elements.splice(index, 1);
        return this;
    }

    public preloadScene(arg: Scene | Story): this {
        const scene = Scene.isScene(arg) ? arg : arg.entryScene;
        if (!scene) {
            throw new RuntimeGameError("Trying to preload a story but the story is not loaded");
        }
        this.preloadingScene = scene;
        this.events.emit(GameState.EventTypes["event:state:flushPreloadedScenes"]);
        return this;
    }

    public getPreloadingScene(): Scene | null {
        return this.preloadingScene;
    }

    public addElement(element: PlayerStateElement): this {
        this.state.elements.push(element);
        this.logger.debug("GameState", "Adding element", element.scene.getId());

        return this;
    }

    public addScene(scene: Scene): this {
        if (this.sceneExists(scene)) return this;
        this.state.elements.unshift({
            scene,
            texts: [],
            menus: [],
            layers: new Map(
                scene.config.layers.map(layer => [layer, [] as LogicAction.DisplayableElements[]])
            ),
        });
        this.logger.debug("GameState", "Adding scene", scene.getId());

        return this;
    }

    public flush(): this {
        this.stage.update();
        return this;
    }

    public popScene(): this {
        const scene = this.state.elements.pop();
        if (!scene) return this;
        this.removeElements(scene.scene);
        this.logger.debug("GameState", "Popping scene", scene.scene.getId());

        return this;
    }

    public removeScene(scene: Scene): this {
        this.removeElements(scene);
        this.logger.debug("GameState", "Removing scene", scene.getId());

        return this;
    }

    public getSceneElements() {
        return this.state.elements;
    }

    public getLastScene(): Scene | null {
        return this.state.elements[this.state.elements.length - 1]?.scene || null;
    }

    public sceneExists(scene?: Scene): boolean {
        if (!scene) return !!this.getLastScene();
        return this.state.elements.some(s => s.scene === scene);
    }

    public isSceneActive(scene: Scene): boolean {
        for (const {scene: s} of this.state.elements) {
            if (s === scene) return true;
        }
        return false;
    }

    public wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public schedule(callback: (scheduleHandle: ScheduleHandle) => void, ms: number): () => void {
        const cleanup: VoidFunction[] = [];
        const timeout = setTimeout(() => {
            callback({
                retry: () => {
                    this.schedule(callback, 0);
                },
                onCleanup: (fn) => {
                    cleanup.push(fn);
                }
            });
        }, ms);
        return () => {
            cleanup.forEach(fn => fn());
            clearTimeout(timeout);
        };
    }

    public notify(notification: Notification) {
        this.notificationMgr.addNotification(notification);
    }

    handle(action: PlayerAction): this {
        if (this.currentHandling === action) return this;
        this.currentHandling = action;

        switch (action.type) {
            case "condition:action":
                break;
        }
        return this;
    }

    public createDialog(id: string, sentence: Sentence, afterClick?: () => void, scene?: Scene): LiveGameEventToken & {
        text: string;
    } {
        const texts = this.findElementByScene(this.getLastSceneIfNot(scene))?.texts;
        if (!texts) {
            throw this.sceneNotFound();
        }

        const words = sentence.evaluate(Script.getCtx({gameState: this}));
        this.game.getLiveGame().events.emit(LiveGame.EventTypes["event:character.prompt"], {
            character: sentence.config.character,
            sentence,
            text: Word.getText(words),
        });

        const action = this.createWaitableAction<TextElement, undefined>({
            character: sentence.config.character,
            sentence,
            id,
            words,
        }, () => {
            texts.splice(texts.indexOf(action as any), 1);
            if (afterClick) afterClick();
        });
        texts.push(action);

        this.stage.update();

        return {
            cancel: () => {
                const index = texts.indexOf(action as any);
                if (index === -1) return;
                texts.splice(index, 1);
            },
            text: Word.getText(words),
        };
    }

    public createMenu(menu: MenuData, afterChoose?: (choice: Chosen) => void, scene?: Scene): LiveGameEventToken & {
        prompt: null | string;
    } {
        if (!menu.choices.length) {
            throw new Error("Menu must have at least one choice");
        }
        const menus = this.findElementByScene(this.getLastSceneIfNot(scene))?.menus;
        if (!menus) {
            throw this.sceneNotFound();
        }

        const words = menu.prompt?.evaluate(Script.getCtx({gameState: this})) || null;
        const action = this.createWaitableAction<MenuElement, Chosen>({
            ...menu,
            words,
        }, (choice) => {
            menus.splice(menus.indexOf(action as any), 1);
            if (afterChoose) afterChoose(choice);
            this.game.getLiveGame().events.emit(LiveGame.EventTypes["event:menu.choose"], {
                sentence: choice.prompt,
                text: choice.evaluated,
            });
        });
        menus.push(action);

        return {
            cancel: () => {
                const index = menus.indexOf(action as any);
                if (index === -1) return;
                menus.splice(index, 1);
            },
            prompt: words ? Word.getText(words) : null,
        };
    }

    public createDisplayable(
        displayable: LogicAction.DisplayableElements,
        scene: Scene | null = null,
        layer: Layer | null = null
    ) {
        const targetScene = this.getLastSceneIfNot(scene);

        const targetElement = this.findElementByScene(targetScene);
        if (!targetElement) {
            throw this.sceneNotFound();
        }

        const targetLayer = targetElement.layers.get(layer || targetScene.config.defaultDisplayableLayer);
        if (!targetLayer) {
            throw this.layerNotFound();
        }
        targetLayer.push(displayable);
        return this;
    }

    public disposeDisplayable(
        displayable: LogicAction.DisplayableElements,
        scene: Scene | null = null,
        layer: Layer | null = null
    ) {
        const targetScene = this.getLastSceneIfNot(scene);
        const targetLayer = this.findElementByScene(targetScene)?.layers.get(layer || targetScene.config.defaultDisplayableLayer);
        if (!targetLayer) {
            throw this.layerNotFound();
        }

        const index = targetLayer.indexOf(displayable);
        if (index === -1) {
            throw new RuntimeGameError(`Displayables not found when disposing. (disposing: ${displayable.getId()})`);
        }
        targetLayer.splice(index, 1);
        return this;
    }

    public forceReset() {
        this.state.elements.forEach(({scene}) => {
            this.offSrcManager(scene.srcManager);
            this.removeScene(scene);
            scene.events.clear();
        });
        this.state.elements = [];
        this.state.srcManagers = [];
        this.state.videos = [];
        this.audioManager.reset();
        this.timelines.abortAll();
        this.gameHistory.reset();
        this.actionHistory.reset();

        this.logger.debug("GameState", "Force reset");
    }

    getHowl(): typeof Howler.Howl {
        return Howler.Howl;
    }

    public registerSrcManager(srcManager: SrcManager) {
        this.state.srcManagers.push(srcManager);
        return this;
    }

    public offSrcManager(srcManager: SrcManager) {
        this.state.srcManagers = this.state.srcManagers.filter(s => s !== srcManager);
        return this;
    }

    public getStorable(): Storable {
        return this.game.getLiveGame().getStorable();
    }

    public getSceneByName(name: string): Scene | null {
        return this.game.getLiveGame().story?.getScene(name) || null;
    }

    public getStory(): Story {
        if (!this.game.getLiveGame().story) {
            throw new RuntimeGameError("Story not loaded");
        }
        return this.game.getLiveGame().story!;
    }

    public setInterval(callback: () => void, delay: number): NodeJS.Timeout {
        return setInterval(callback, delay);
    }

    public clearInterval(interval: NodeJS.Timeout): void {
        clearInterval(interval);
    }

    public setTimeout(callback: () => void, delay: number): NodeJS.Timeout {
        return setTimeout(callback, delay);
    }

    public clearTimeout(timeout: NodeJS.Timeout): void {
        clearTimeout(timeout);
    }

    public forceAnimation(): Awaitable {
        const [awaitable, timeline] = Timeline.proxy(Awaitable.nothing);
        const elements: Displayable<any, any>[] = [];
        Array.from(this.exposedState.keys()).forEach((state: Values<ExposedKeys>) => {
            if (state instanceof Displayable) {
                elements.push(state);
            }
        });
        elements.forEach(element => {
            const state = this.getExposedStateForce<ExposedStateType.image | ExposedStateType.layer | ExposedStateType.text>(element);
            const task = state.applyTransform(Transform.immediate({}), () => {});
            timeline.attachChild(task);

            state.updateStyleSync();
        });
        this.timelines.attachTimeline(timeline);

        return awaitable;
    }

    /**
     * Mounts a new state to the game state manager
     * @param key - Unique identifier for the state
     * @param state - State object to be mounted
     * @returns Object containing unmount function
     */
    public mountState<T extends ExposedStateType>(key: ExposedKeys[T], state: ExposedState[T]): {
        unMount: () => void;
    } {
        if (this.exposedState.has(key)) {
            throw new RuntimeInternalError("State already mounted");
        }
        if (!key) {
            throw new RuntimeInternalError("Invalid state key");
        }

        this.exposedState.set(key, state);
        this.events.emit(GameState.EventTypes["event.state.onExpose"], key, state);
        return {
            unMount: () => {
                this.unMountState(key);
            }
        };
    }

    public unMountState(key: Values<ExposedKeys>): this {
        if (!this.exposedState.has(key)) {
            this.guard.warn(GuardWarningType.invalidExposedStateUnmounting, "State not found when unmounting");
        }
        this.exposedState.delete(key);
        return this;
    }

    public initVideo(video: Video): this {
        this.state.videos.push(video);
        return this;
    }

    public isStateMounted(key: Values<ExposedKeys>): boolean {
        return this.exposedState.has(key);
    }

    public getExposedState<T extends ExposedStateType>(key: ExposedKeys[T]): ExposedState[T] | null {
        return this.exposedState.get(key) as ExposedState[T] || null;
    }

    public getExposedStateForce<T extends ExposedStateType>(key: ExposedKeys[T]): ExposedState[T] {
        const state = this.getExposedState(key);
        if (!state) {
            throw new RuntimeGameError("State not found, key: " + key);
        }
        return state;
    }

    public getExposedStateAsync<T extends ExposedStateType>(key: ExposedKeys[T], onExpose: (state: ExposedState[T]) => void): LiveGameEventToken {
        const state = this.getExposedState(key);
        if (state) {
            const cancel = this.schedule(() => {
                onExpose(state);
            }, 0);
            return {
                cancel,
            };
        } else {
            const token = this.events.on(GameState.EventTypes["event.state.onExpose"], (k, s) => {
                if (k === key) {
                    onExpose(s as ExposedState[T]);
                    token.cancel();
                }
            });
            return token;
        }
    }

    /**
     * Dispose of the game state
     *
     * This is an irreversible action; once disposed of, the game state can't be used again.
     *
     * Don't call this method directly
     */
    dispose() {
        this.forceReset();
    }

    /**
     * Converts current game state to serializable data format
     * @returns PlayerStateData object containing all state information
     */
    toData(): PlayerStateData {
        return {
            scenes: this.state.elements.map(e => {
                return {
                    sceneId: e.scene.getId(),
                    elements: {
                        layers: Object.fromEntries(
                            Array.from(e.layers.entries())
                                .map(([layer, elements]) => [layer.getId(), elements.map(d => d.getId())])
                        )
                    }
                };
            }),
            audio: this.audioManager.toData(),
            videos: this.state.videos.map(v => [
                v.getId(),
                v.toData(),
            ]),
        };
    }

    loadData(data: PlayerStateData, elementMap: Map<string, LogicAction.GameElement>) {
        this.state.elements = [];

        const story = this.game.getLiveGame().story;
        if (!story) {
            throw new Error("No story loaded");
        }

        const {scenes, audio, videos} = data;
        scenes.forEach(({sceneId, elements}) => {
            this.logger.debug("Loading scene: " + sceneId);

            const scene = elementMap.get(sceneId) as Scene;
            if (!scene) {
                throw new RuntimeGameError("Scene not found, id: " + sceneId + "\nNarraLeaf cannot find the element with the id from the saved game");
            }

            const ele: PlayerStateElement = {
                scene,
                layers: this.constructLayerMap(elements.layers, elementMap),
                menus: [],
                texts: [],
            };

            this.state.elements.push(ele);
            this.registerSrcManager(scene.srcManager);
            this.getExposedStateAsync<ExposedStateType.scene>(scene, (exposed) => {
                SceneAction.initBackgroundMusic(scene, exposed);
            });
        });
        this.audioManager.fromData(audio, elementMap);
        this.state.videos = videos.map(([id, state]) => {
            const video = elementMap.get(id) as Video;
            if (!video) {
                throw new RuntimeGameError("Video not found, id: " + id + "\nNarraLeaf cannot find the element with the id from the saved game");
            }
            video.fromData(state);
            return video;
        });
    }

    public getLastSceneIfNot(scene: Scene | null | void) {
        const targetScene = scene || this.getLastScene();
        if (!targetScene || !this.sceneExists(targetScene)) {
            throw new RuntimeGameError("Scene not found, please call \"scene.activate()\" first.");
        }
        return targetScene;
    }

    public createElementSnapshot(element: PlayerStateElement): PlayerStateElementSnapshot {
        return {
            scene: element.scene,
            layers: new Map(Array.from(element.layers.entries()).map(([layer, elements]: [Layer, LogicAction.DisplayableElements[]]) => {
                return [layer, elements.map((element: LogicAction.DisplayableElements) => {
                    return [element, element.toData()];
                })];
            })),
        };
    }

    public fromElementSnapshot(snapshot: PlayerStateElementSnapshot): PlayerStateElement {
        return {
            scene: snapshot.scene,
            layers: new Map(Array.from(snapshot.layers.entries()).map(([layer, elements]) => {
                return [layer, elements.map(([element, data]: [LogicAction.DisplayableElements, any]) => {
                    element.fromData(data);
                    return element;
                })];
            })),
            texts: [],
            menus: [],
        };
    }

    private removeElements(scene: Scene): this {
        const index = this.state.elements.findIndex(s => s.scene === scene);
        if (index === -1) {
            this.logger.weakWarn("Scene not found when removing elements", scene.getId());
            return this;
        }

        this.resetLayers(this.state.elements[index].layers);
        this.state.elements.splice(index, 1);

        this.logger.debug("GameState", "Removing elements", scene.getId());
        return this;
    }

    private resetLayers(layers: Map<Layer, LogicAction.DisplayableElements[]>) {
        layers.forEach((elements) => {
            elements.forEach(element => {
                element.reset();
            });
        });
    }

    private createWaitableAction<A extends Record<any, any>, T = undefined>(action: A, after?: (arg0: T) => void) {
        const item: Clickable<A, T> = {
            action,
            onClick: ((arg0: T) => {
                if (after) after(arg0);
            }) as T extends undefined ? () => void : (arg0: T) => void
        };
        return item;
    }

    private sceneNotFound() {
        return new RuntimeGameError("Scene not found, target scene may not be activated. This is an internal error, please report this to the developer.");
    }

    private layerNotFound() {
        return new RuntimeGameError("Layer not found, target layer may not be activated. You may forget to add the layer to the scene config");
    }

    private constructLayerMap(layers: Record<string, string[]>, elementMap: Map<string, LogicAction.GameElement>): Map<Layer, LogicAction.DisplayableElements[]> {
        return new Map(
            Object.entries(layers).map(([layerName, displayables]) => {
                const layer = elementMap.get(layerName) as Layer | undefined;
                if (!layer) {
                    throw new RuntimeGameError("Layer not found, id: " + layerName + "\nNarraLeaf cannot find the element with the id from the saved game");
                }
                return [layer, displayables.map(d => {
                    if (!elementMap.has(d)) {
                        throw new RuntimeGameError("Displayable not found, id: " + d + "\nNarraLeaf cannot find the element with the id from the saved game" +
                            "\nThis may be caused by the damage of the saved game file or the change of the story file");
                    }
                    return elementMap.get(d) as LogicAction.DisplayableElements;
                })];
            })
        );
    }
}