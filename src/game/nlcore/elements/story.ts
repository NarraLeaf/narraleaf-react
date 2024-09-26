import {Constructable} from "../action/constructable";
import {Game} from "../game";
import {deepMerge} from "@lib/util/data";
import {SceneAction} from "@core/action/actions";
import {Scene} from "@core/elements/scene";
import {StaticChecker} from "@core/common/Utils";

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type StoryConfig = {};
export type ElementStateRaw = Record<string, any>;
export type NodeChildIdMap = Map<string, string>;

export class Story extends Constructable<
    SceneAction<"scene:action">
> {
    static defaultConfig: StoryConfig = {};
    readonly id: string;
    readonly name: string;
    readonly config: StoryConfig;
    entryScene: Scene | null = null;

    constructor(name: string, config: StoryConfig = {}) {
        super();
        this.id = Game.getIdManager().getStringId();
        this.name = name;
        this.config = deepMerge<StoryConfig>(Story.defaultConfig, config);
    }

    /**
     * Set the entry scene of the story
     * @example
     * ```typescript
     * const story = new Story("story");
     * const scene = new Scene("scene");
     * story.entry(scene); // The story will start from this scene
     * ```
     */
    public entry(scene: Scene): this {
        this.entryScene = scene;
        scene.registerSrc();
        scene.assignId();

        this.runStaticCheck(scene);
        return this;
    }

    private runStaticCheck(scene: Scene) {
        return new StaticChecker(scene).run();
    }
}

