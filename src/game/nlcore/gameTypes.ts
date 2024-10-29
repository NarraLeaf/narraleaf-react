import {ContentNode, RawData} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ElementStateRaw} from "@core/elements/story";
import {PlayerStateData} from "@player/gameState";
import {StorableData} from "@core/store/type";
import {MenuComponent, SayComponent} from "@player/elements/type";
import React from "react";


export interface SavedGame {
    name: string;
    meta: {
        created: number;
        updated: number;
    };
    game: {
        store: { [key: string]: StorableData; };
        elementStates: RawData<ElementStateRaw>[];
        stage: PlayerStateData;
        currentAction: string | null;
    };
}

export type GameConfig = {
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
        /**
         * Base width of the player in pixels, Image scale will be calculated based on this value
         */
        width: number;
        /**
         * Base height of the player in pixels, Image scale will be calculated based on this value
         */
        height: number;
        /**
         * When player presses one of these keys, the game will skip the current action
         *
         * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
         */
        skipKey: React.KeyboardEvent["key"][];
        /**
         * The interval in milliseconds between each skip action.
         * ex: 100ms means the player can skip 10 actions per second.
         * higher value means faster skipping.
         */
        skipInterval: number;
        /**
         * The interval in milliseconds between each ratio update.
         */
        ratioUpdateInterval: number;
    };
    elements: {
        say: {
            /**
             * When the player presses one of these keys, the game will show the next sentence
             *
             * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
             */
            nextKey: React.KeyboardEvent["key"][];
            /**
             * The speed of the text effect in milliseconds.
             * higher value means slower text effect.
             * default: 50
             */
            textInterval: number;
            use: SayComponent;
            /**
             * If true, the game will scale the dialog to fit the screen
             *
             * Text will look smaller when this is enabled
             */
            useAspectScale: boolean;
        },
        img: {
            /**
             * If true, the game will show a warning when loading takes longer than `elements.img.slowLoadThreshold`
             */
            slowLoadWarning: boolean;
            slowLoadThreshold: number;
            allowSkipTransform: boolean;
            allowSkipTransition: boolean;
        },
        menu: {
            use: MenuComponent;
        },
        background: {
            allowSkipTransform: boolean;
            allowSkipTransition: boolean;
        },
        text: {
            allowSkipTransform: boolean;
            allowSkipTransition: boolean;
            /**
             * Base width of the dialog in pixels
             */
            width: number;
            /**
             * Base height of the dialog in pixels
             */
            height: number;
        }
    },
    elementStyles: {
        say: {
            /**
             * Custom class for the say container
             * Ex: "rounded-md shadow-md" for rounded and shadowed container
             */
            contentContainerClassName: string;
            containerClassName: string;
            nameTextClassName: string;
            textContainerClassName: string;
            textSpanClassName: string;
            /**
             * The default font family for the text
             * Ex: "Arial, sans-serif"
             *
             * See [Font family](https://developer.mozilla.org/en-US/docs/Web/CSS/font-family)
             */
            fontFamily?: React.CSSProperties["fontFamily"];
            /**
             * Font size for the text
             *
             * See [Font size](https://developer.mozilla.org/en-US/docs/Web/CSS/font-size)
             */
            fontSize?: React.CSSProperties["fontSize"];
            rubyClassName: string;
        },
        menu: {
            containerClassName: string;
            choiceButtonClassName: string;
            choiceButtonTextClassName: string;
        }
    };
    app: {
        debug: boolean;
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
        },
        inspector: boolean;
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



