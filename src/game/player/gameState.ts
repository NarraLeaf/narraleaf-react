import {CalledActionResult} from "@core/gameTypes";
import {EventDispatcher} from "@lib/util/data";
import {Character, Sentence} from "@core/elements/text";
import {Choice, MenuData} from "@core/elements/menu";
import {Image, ImageEventTypes} from "@core/elements/image";
import {Scene} from "@core/elements/scene";
import {Sound} from "@core/elements/sound";
import * as Howler from "howler";
import {SrcManager} from "@core/elements/srcManager";
import {LogicAction} from "@core/action/logicAction";
import {Storable} from "@core/store/storable";
import {Game} from "@core/game";

type Clickable<T, U = undefined> = {
    action: T;
    onClick: U extends undefined ? () => void : (arg0: U) => void;
};

type TextElement = {
    character: Character | null;
    sentence: Sentence;
    id: string;
};

type MenuElement = {
    prompt: Sentence;
    choices: Choice[];
};

type PlayerStateElement = {
    texts: Clickable<TextElement>[];
    menus: Clickable<MenuElement, Choice>[];
    images: Image[];
};
export type PlayerState = {
    sounds: Sound[];
    srcManagers: SrcManager[];
    elements: { scene: Scene, ele: PlayerStateElement }[];
};
export type PlayerStateData = {
    elements: {
        scene: string;
        ele: {
            images: string[];
        };
    }[]
};
export type PlayerAction = CalledActionResult;

interface StageUtils {
    forceUpdate: () => void;
    next: () => void;
    dispatch: (action: PlayerAction) => void;
}


type GameStateEvents = {
    "event:state.ready": [];
};

export class GameState {
    static EventTypes: { [K in keyof GameStateEvents]: K } = {
        "event:state.ready": "event:state.ready"
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

    constructor(game: Game, stage: StageUtils) {
        this.stage = stage;
        this.game = game;
        this.events = new EventDispatcher();
    }

    public findElementByScene(scene: Scene): { scene: Scene, ele: PlayerStateElement } | null {
        return this.state.elements.find(e => e.scene === scene) || null;
    }

    public findElementByImage(image: Image): { scene: Scene, ele: PlayerStateElement } | null {
        return this.state.elements.find(e => e.ele.images.includes(image)) || null;
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

    handle(action: PlayerAction): this {
        if (this.currentHandling === action) return this;
        this.currentHandling = action;

        switch (action.type) {
            case "condition:action":
                break;
        }
        console.log("[handle]", action); // @debug
        return this;
    }

    public createText(id: string, sentence: Sentence, afterClick?: () => void, scene?: Scene) {
        const texts = this.findElementByScene(this._getLastSceneIfNot(scene))?.ele.texts;
        if (!texts) {
            throw new Error("Scene not found");
        }

        const action = this.createWaitableAction<TextElement, undefined>({
            character: sentence.character,
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
        const menus = this.findElementByScene(this._getLastSceneIfNot(scene))?.ele.menus;
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
        const targetScene = this._getLastSceneIfNot(scene);
        const targetElement = this.findElementByScene(targetScene);
        if (!targetElement) return this;
        targetElement.ele.images.push(image);
        return this;
    }

    public disposeImage(image: Image, scene?: Scene) {
        const targetScene = this._getLastSceneIfNot(scene);
        const images = this.findElementByScene(targetScene)?.ele.images;
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

    playSound(howl: Howler.Howl, onEnd?: () => void): any {
        const token = howl.play();
        const events = [
            howl.once("end", end.bind(this)),
            howl.once("stop", end.bind(this))
        ];

        function end(this: GameState) {
            if (onEnd) {
                onEnd();
            }
            events.forEach(e => e.off());
            this.stage.next();
        }

        return token;
    }

    getHowl(): typeof Howler.Howl {
        return Howler.Howl;
    }

    animateImage<T extends keyof ImageEventTypes>(type: T, target: Image, args: ImageEventTypes[T], onEnd: () => void) {
        return this.anyEvent(type, target, onEnd, ...args);
    }

    public registerSrcManager(srcManager: SrcManager) {
        this.state.srcManagers.push(srcManager);
        return this;
    }

    public offSrcManager(srcManager: SrcManager) {
        this.state.srcManagers = this.state.srcManagers.filter(s => s !== srcManager);
        return this
    }

    public getStorable(): Storable {
        return this.game.getLiveGame().getStorable();
    }

    toData(): PlayerStateData {
        return {
            elements: this.state.elements.map(e => {
                return {
                    scene: e.scene.id,
                    ele: {
                        images: e.ele.images.map(i => i.id)
                    }
                }
            })
        };
    }

    loadData(data: PlayerStateData, actions: LogicAction.Actions[]) {
        this.state.elements = [];

        const story = this.game.getLiveGame().story;
        if (!story) {
            throw new Error("No story loaded");
        }

        const allElements = story.getAllElements(actions);
        const {elements} = data;
        elements.forEach(e => {
            const [
                scene,
                ...images
            ] = (story.findElementsByIds([e.scene, ...e.ele.images], allElements) as [Scene, ...Image[]]);
            const element: { scene: Scene, ele: PlayerStateElement } = {
                scene: scene,
                ele: {
                    images: images,
                    menus: [],
                    texts: []
                }
            };
            this.state.elements.push(element);
            this.state.srcManagers.push(element.scene.srcManager);
        });
    }

    private getElementMap() {
        return {
            texts: [],
            menus: [],
            images: []
        };
    }

    private removeElements(scene: Scene): this {
        const index = this.state.elements.findIndex(s => s.scene === scene);
        if (index === -1) return this;
        this.state.elements.splice(index, 1);
        return this;
    }

    private _getLastSceneIfNot(scene: Scene | null | void) {
        const targetScene = scene || this.getLastScene();
        if (!targetScene || !this.sceneExists(targetScene)) {
            throw new Error("Scene not found, please call \"scene.activate()\" first.");
        }
        return targetScene;
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