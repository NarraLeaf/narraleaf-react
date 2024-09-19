import {ContentNode, RawData} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ElementStateRaw} from "@core/elements/story";
import {PlayerStateData} from "@player/gameState";
import {StorableData} from "@core/store/type";
import {MenuComponent, SayComponent} from "@player/elements/type";


export interface SavedGame {
    name: string;
    version: string;
    meta: {
        created: number;
        updated: number;
    };
    game: {
        store: { [key: string]: StorableData; };
        elementState: RawData<ElementStateRaw>[];
        nodeChildIdMap: Record<string, string>;
        stage: PlayerStateData;
        currentScene: number;
        currentAction: string | null;
    };
}

export type GameConfig = {
    version: string;
    player: {
        contentContainerId: string;
        /**
         * The aspect ratio of the game
         * Ex: 16/9, 4/3, 1/1
         */
        aspectRatio: number;
        /**
         * The minimum width and height of the player in pixels
         */
        minWidth: number;
        /**
         * The minimum width and height of the player in pixels
         */
        minHeight: number;
        width: number | string;
        height: number | string;
        /**
         * When player presses one of these keys, the game will skip the current action
         *
         * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
         */
        skipKey: string[];
        /**
         * The interval in milliseconds between each skip action.
         * ex: 100ms means the player can skip 10 actions per second.
         * higher value means faster skipping.
         */
        skipInterval: number;
    };
    elements: {
        say: {
            /**
             * When the player presses one of these keys, the game will show the next sentence
             *
             * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
             */
            nextKey: string[];
            /**
             * The speed of the text effect in milliseconds.
             * higher value means slower text effect.
             * default: 50
             */
            textInterval: number;
            use: SayComponent;
        },
        img: {
            /**
             * If true, the game will show a warning when loading takes longer than `elements.img.slowLoadThreshold`
             */
            slowLoadWarning: boolean;
            slowLoadThreshold: number;
        },
        menu: {
            use: MenuComponent;
        }
    },
    elementStyles: {
        say: {
            /**
             * Custom class for the say container
             * Ex: "rounded-md shadow-md" for rounded and shadowed container
             */
            container: string;
            nameText: string;
            textContainer: string;
            textSpan: string;
        },
        menu: {
            container: string;
            choiceButton: string;
            choiceButtonText: string;
        }
    };
    app: {
        /**
         * Log level for the logger
         */
        logger: {
            log: boolean;
            info: boolean;
            warn: boolean;
            error: boolean;
            debug: boolean;
            trace: boolean;
        }
    };
};
export type GameSettings = {
    volume: number;
};
export type CalledActionResult<T extends keyof LogicAction.ActionContents = any> = {
    [K in keyof LogicAction.ActionContents]: {
        type: T extends undefined ? K : T;
        node: ContentNode<LogicAction.ActionContents[T extends undefined ? K : T]> | null;
    }
}[keyof LogicAction.ActionContents];



