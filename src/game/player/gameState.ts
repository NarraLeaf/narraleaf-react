import {CalledActionResult} from "@core/gameTypes";
import {EventDispatcher, Logger, moveElementInArray, sleep} from "@lib/util/data";
import {Choice, MenuData} from "@core/elements/menu";
import {Image, ImageEventTypes} from "@core/elements/displayable/image";
import {Scene} from "@core/elements/scene";
import {Sound} from "@core/elements/sound";
import * as Howler from "howler";
import {HowlOptions} from "howler";
import {Src, SrcManager} from "@core/action/srcManager";
import {LogicAction} from "@core/action/logicAction";
import {Storable} from "@core/store/storable";
import {Game} from "@core/game";
import {Clickable, MenuElement, TextElement} from "@player/gameState.type";
import {Sentence} from "@core/elements/character/sentence";
import {SceneAction} from "@core/action/actions/sceneAction";
import {Text, TextEventTypes} from "@core/elements/displayable/text";

type PlayerStateElement = {
    texts: Clickable<TextElement>[];
    menus: Clickable<MenuElement, Choice>[];
    displayable: LogicAction.DisplayableElements[];
};
export type PlayerState = {
    sounds: Sound[];
    srcManagers: SrcManager[];
    elements: { scene: Scene, ele: PlayerStateElement }[];
};
export type PlayerStateData = {
    scenes: {
        sceneId: string;
        elements: {
            displayable: string[];
        };
    }[]
};
export type PlayerAction = CalledActionResult;

interface StageUtils {
    update: () => void;
    forceUpdate: () => void;
    next: () => void;
    dispatch: (action: PlayerAction) => void;
}


type GameStateEvents = {
    "event:state.ready": [];
    "event:state.end": [];
    "event:state.player.skip": [];
    "event:state.preload.unmount": [];
    "event:state.preload.loaded": [];
    "event:state.player.flush": [];
};

export class GameState {
    static EventTypes: { [K in keyof GameStateEvents]: K } = {
        "event:state.ready": "event:state.ready",
        "event:state.end": "event:state.end",
        "event:state.player.skip": "event:state.player.skip",
        "event:state.preload.unmount": "event:state.preload.unmount",
        "event:state.preload.loaded": "event:state.preload.loaded",
        "event:state.player.flush": "event:state.player.flush",
    };
    state: PlayerState = {
        sounds: [],
        srcManagers: [],
        elements: [],
    };
    currentHandling: CalledActionResult | null = null;
    stage: StageUtils;
    game: Game;
    public readonly events: EventDispatcher<GameStateEvents>;
    public readonly logger: Logger;

    constructor(game: Game, stage: StageUtils) {
        this.stage = stage;
        this.game = game;
        this.events = new EventDispatcher();
        this.logger = new Logger(game, "NarraLeaf-React");
    }

    public findElementByScene(scene: Scene): { scene: Scene, ele: PlayerStateElement } | null {
        return this.state.elements.find(e => e.scene === scene) || null;
    }

    public findElementByDisplayable(displayable: LogicAction.DisplayableElements): {
        scene: Scene,
        ele: PlayerStateElement
    } | null {
        return this.state.elements.find(e => e.ele.displayable.includes(displayable)) || null;
    }

    public addScene(scene: Scene): this {
        if (this.sceneExists(scene)) return this;
        this.state.elements.push({
            scene,
            ele: this.getElementMap()
        });
        return this;
    }

    public popScene(): this {
        const scene = this.state.elements.pop();
        if (!scene) return this;
        this.removeElements(scene.scene);
        return this;
    }

    public removeScene(scene: Scene): this {
        this.removeElements(scene);
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

    public moveUpElement(scene: Scene, element: LogicAction.DisplayableElements): this {
        const targetElement = this.findElementByScene(scene);
        if (!targetElement) return this;

        targetElement.ele.displayable = moveElementInArray(
            targetElement.ele.displayable,
            element,
            Math.min(targetElement.ele.displayable.indexOf(element) + 1, targetElement.ele.displayable.length - 1)
        );
        return this;
    }

    public moveDownElement(scene: Scene, element: LogicAction.DisplayableElements): this {
        const targetElement = this.findElementByScene(scene);
        if (!targetElement) return this;

        targetElement.ele.displayable = moveElementInArray(
            targetElement.ele.displayable,
            element,
            Math.max(targetElement.ele.displayable.indexOf(element) - 1, 0)
        );
        return this;
    }

    public moveTopElement(scene: Scene, element: LogicAction.DisplayableElements): this {
        const targetElement = this.findElementByScene(scene);
        if (!targetElement) return this;

        targetElement.ele.displayable = moveElementInArray(
            targetElement.ele.displayable,
            element,
            targetElement.ele.displayable.length - 1
        );
        return this;
    }

    public moveBottomElement(scene: Scene, element: LogicAction.DisplayableElements): this {
        const targetElement = this.findElementByScene(scene);
        if (!targetElement) return this;

        targetElement.ele.displayable = moveElementInArray(
            targetElement.ele.displayable,
            element,
            0
        );
        return this;
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

    public createText(id: string, sentence: Sentence, afterClick?: () => void, scene?: Scene) {
        const texts = this.findElementByScene(this.getLastSceneIfNot(scene))?.ele.texts;
        if (!texts) {
            throw new Error("Scene not found");
        }

        const action = this.createWaitableAction<TextElement, undefined>({
            character: sentence.config.character,
            sentence,
            id
        }, () => {
            texts.splice(texts.indexOf(action as any), 1);
            if (afterClick) afterClick();
        });
        texts.push(action);
    }

    public createMenu(menu: MenuData, afterChoose?: (choice: Choice) => void, scene?: Scene) {
        if (!menu.choices.length) {
            throw new Error("Menu must have at least one choice");
        }
        const menus = this.findElementByScene(this.getLastSceneIfNot(scene))?.ele.menus;
        if (!menus) {
            throw new Error("Scene not found");
        }

        const action = this.createWaitableAction<MenuElement, Choice>(menu, (choice) => {
            menus.splice(menus.indexOf(action as any), 1);
            if (afterChoose) afterChoose(choice);
        });
        menus.push(action);
    }

    public createImage(image: Image, scene?: Scene) {
        const targetScene = this.getLastSceneIfNot(scene);
        const targetElement = this.findElementByScene(targetScene);
        if (!targetElement) return this;
        targetElement.ele.displayable.push(image);
        return this;
    }

    public createWearable(parent: Image, image: Image): Promise<any> {
        return parent.events.any(Image.EventTypes["event:wearable.create"], image);
    }

    public disposeImage(image: Image, scene?: Scene) {
        const targetScene = this.getLastSceneIfNot(scene);
        const images = this.findElementByScene(targetScene)?.ele.displayable;
        if (!images) {
            throw new Error("Scene not found");
        }

        const index = images.indexOf(image);
        if (index === -1) {
            throw new Error("Image not found");
        }
        images.splice(index, 1);
        return this;
    }

    public createDisplayable(displayable: LogicAction.DisplayableElements, scene?: Scene) {
        const targetScene = this.getLastSceneIfNot(scene);
        const targetElement = this.findElementByScene(targetScene);
        if (!targetElement) return this;
        targetElement.ele.displayable.push(displayable);
        return this;
    }

    public disposeDisplayable(displayable: LogicAction.DisplayableElements, scene?: Scene) {
        const targetScene = this.getLastSceneIfNot(scene);
        const displayables = this.findElementByScene(targetScene)?.ele.displayable;
        if (!displayables) {
            throw new Error("Scene not found");
        }

        const index = displayables.indexOf(displayable);
        if (index === -1) {
            throw new Error("Displayables not found");
        }
        displayables.splice(index, 1);
        return this;
    }

    public forceReset() {
        this.state.sounds.forEach(s => s.getPlaying()?.stop());
        this.state.elements.forEach(({scene}) => {
            this.offSrcManager(scene.srcManager);
            this.removeScene(scene);
            scene.events.clear();
        });
        this.state.elements = [];
        this.state.srcManagers = [];
    }

    initSound(sound: Sound, options?: Partial<HowlOptions>): Sound {
        if (!sound.getPlaying()) {
            sound.setPlaying(new (this.getHowl())(sound.getHowlOptions(options)));
        }
        return sound;
    }

    playSound(sound: Sound, onEnd?: () => void, options?: Partial<HowlOptions>): any {
        this.initSound(sound, options);

        const token = sound.getPlaying()!.play();
        const events = [
            sound.getPlaying()!.once("end", end.bind(this)),
            sound.getPlaying()!.once("stop", end.bind(this))
        ];

        this.state.sounds.push(sound);
        sound.state.token = token;

        function end(this: GameState) {
            if (onEnd) {
                onEnd();
            }
            events.forEach(e => e.off());
            this.state.sounds = this.state.sounds.filter(s => s !== sound);
            this.stage.next();
        }

        return token;
    }

    stopSound(sound: Sound): typeof sound {
        if (sound.state.playing?.playing(sound.getToken())) {
            sound.state.playing?.stop(sound.getToken());
        }
        sound
            .setPlaying(null)
            .setToken(null);
        return sound;
    }

    async transitionSound(prev: Sound | undefined | null, cur: Sound | undefined | null, duration: number | undefined | null): Promise<void> {
        if (prev) {
            if (duration) await this.fadeSound(prev, 0, duration);
            this.stopSound(prev);
        }

        if (cur) {
            const volume = cur.config.volume;
            this.playSound(cur, undefined, {
                volume: 0
            });

            if (duration) await this.fadeSound(cur, volume, duration);
            cur.getPlaying()!.volume(volume, cur.getToken());
        }
    }

    async fadeSound(sound: Sound, target: number, duration: number): Promise<void> {
        const originalVolume = sound.getPlaying()?.volume(sound.getToken()) as number;

        sound.getPlaying()?.fade(originalVolume, target, duration, sound.getToken());
        await sleep(duration);

        return void 0;
    }

    getHowl(): typeof Howler.Howl {
        return Howler.Howl;
    }

    animateImage<T extends keyof ImageEventTypes>(type: T, target: Image, args: ImageEventTypes[T], onEnd: () => void) {
        return this.anyEvent(type, target, onEnd, ...args);
    }

    animateText<T extends keyof TextEventTypes>(type: T, target: Text, args: TextEventTypes[T], onEnd: () => void) {
        return this.anyEvent(type, target, onEnd, ...args);
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

    /**
     * Dispose the game state
     *
     * This is an irreversible action, once disposed, the game state cannot be used again.
     *
     * Do not call this method directly
     */
    dispose() {
        this.forceReset();
    }

    toData(): PlayerStateData {
        return {
            scenes: this.state.elements.map(e => {
                return {
                    sceneId: e.scene.getId(),
                    elements: {
                        displayable: e.ele.displayable.map(d => d.getId())
                    }
                };
            })
        };
    }

    loadData(data: PlayerStateData, elementMap: Map<string, LogicAction.GameElement>) {
        this.state.elements = [];

        const story = this.game.getLiveGame().story;
        if (!story) {
            throw new Error("No story loaded");
        }

        const {scenes} = data;
        scenes.forEach(({sceneId, elements}) => {
            this.logger.debug("Loading scene: " + sceneId);

            const scene = elementMap.get(sceneId) as Scene;
            if (!scene) {
                throw new Error("Scene not found, id: " + sceneId + "\nNarraLeaf cannot find the element with the id from the saved game");
            }

            const displayable = elements.displayable.map(d => {
                if (!elementMap.has(d)) {
                    throw new Error("Displayable not found, id: " + d + "\nNarraLeaf cannot find the element with the id from the saved game" +
                        "\nThis may be caused by the damage of the saved game file or the change of the story file");
                }
                return elementMap.get(d) as LogicAction.DisplayableElements;
            });
            const element: { scene: Scene; ele: PlayerStateElement; } = {
                scene,
                ele: {
                    menus: [],
                    texts: [],
                    displayable,
                }
            };

            this.state.elements.push(element);
            this.registerSrcManager(scene.srcManager);
            SceneAction.registerEventListeners(scene, this);
        });
    }

    initScenes() {
        this.state.elements.forEach(({scene}) => {
            SceneAction.registerEventListeners(scene, this);
        });
    }

    public getLastSceneIfNot(scene: Scene | null | void) {
        const targetScene = scene || this.getLastScene();
        if (!targetScene || !this.sceneExists(targetScene)) {
            throw new Error("Scene not found, please call \"scene.activate()\" first.");
        }
        return targetScene;
    }

    getFuturePreloadSrc(): Src[] {
        const actions = this.game.getLiveGame().getAllPredictableActions(
            this.game.getLiveGame().getCurrentAction(),
            this.game.config.player.maxPreloadActions
        );
        const results: Src[] = [];
        for (const action of actions) {
            const src = SrcManager.getPreloadableSrc(action);
            if (src) {
                results.push(src);
            }
        }
        return results;
    }

    private getElementMap(): PlayerStateElement {
        return {
            texts: [],
            menus: [],
            displayable: [],
        };
    }

    private removeElements(scene: Scene): this {
        const index = this.state.elements.findIndex(s => s.scene === scene);
        if (index === -1) return this;
        this.state.elements.splice(index, 1);
        return this;
    }

    private anyEvent(type: any, target: any, onEnd: () => void, ...args: any[]) {
        (target.events as EventDispatcher<any>).any(
            type,
            ...args
        ).then(onEnd).then(() => {
            this.stage.next();
        });
        return void 0;
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
}