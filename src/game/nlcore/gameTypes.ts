import {ContentNode, RawData} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ElementStateRaw} from "@core/elements/story";
import {PlayerStateData} from "@player/gameState";
import {StorableData} from "@core/elements/persistent/type";
import {MenuComponent, SayComponent} from "@player/elements/type";
import React from "react";
import {StringKeyOf} from "@lib/util/data";


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
        services: { [key: string]: unknown; };
    };
}

export type GameConfig = {
    player: {
        /**
         * The id of the container element for the game
         */
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
         *
         * For 16/9, the recommended value is 1920
         */
        width: number;
        /**
         * Base height of the player in pixels, Image scale will be calculated based on this value
         *
         * For 16/9, the recommended value is 1080
         */
        height: number;
        /**
         * When the player presses one of these keys, the game will skip the current action
         *
         * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
         */
        skipKey: React.KeyboardEvent["key"][];
        /**
         * The interval in milliseconds between each skip action.
         * ex: 100 ms means the player can skip 10 actions per second.
         * higher value means faster skipping.
         */
        skipInterval: number;
        /**
         * The interval in milliseconds between each ratio update.
         */
        ratioUpdateInterval: number;
        /**
         * The game will preload the image with this delay in milliseconds
         */
        preloadDelay: number;
        /**
         * Maximum number of images to preload at the same time
         */
        preloadConcurrency: number;
        /**
         * Wait for the images to load before showing the game
         */
        waitForPreload: boolean;
        /**
         * Preload all possible images in the scene
         *
         * Enabling this may have a performance impact but is better for the user experience
         */
        preloadAllImages: boolean;
        /**
         * Force the game to clear the cache when the scene changes
         */
        forceClearCache: boolean;
        /**
         * The number of actions will be predicted and preloaded
         */
        maxPreloadActions: number;
        /**
         * Src of the cursor image, if null, the game will show the default cursor
         */
        cursor: string | null;
        /**
         * Cursor width in pixels
         */
        cursorWidth: number;
        /**
         * Cursor height in pixels
         */
        cursorHeight: number;
        /**
         * Show overflowed content
         */
        showOverflow: boolean;
        /**
         * Max history size for the page router
         */
        maxRouterHistory: number;
    };
    elements: {
        /**
         * For all `Character` elements
         */
        say: {
            /**
             * When the player presses one of these keys, the game will show the next sentence
             *
             * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
             */
            nextKey: React.KeyboardEvent["key"][];
            /**
             * The speed of the text effects in milliseconds.
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
            /**
             * The delay in milliseconds before the game automatically shows the next sentence
             */
            autoForwardDelay: number;
        },
        /**
         * For all `Image` elements
         */
        img: {
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the image transform
             */
            allowSkipTransform: boolean;
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the image transition
             */
            allowSkipTransition: boolean;
        },
        /**
         * For all `Menu` elements
         */
        menu: {
            use: MenuComponent;
        },
        /**
         * For all `Scene.background` elements
         */
        background: {
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the background transform
             */
            allowSkipTransform: boolean;
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the background transition
             */
            allowSkipTransition: boolean;
        },
        text: {
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the text transform
             */
            allowSkipTransform: boolean;
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the text transition
             */
            allowSkipTransition: boolean;
            /**
             * Base width of the dialog in pixels
             *
             * For 16/9, the recommended value is 1920
             */
            width: number;
            /**
             * Base height of the dialog in pixels
             *
             * For 16/9, the recommended value is 1080 * 0.2
             */
            height: number;
        },
        layers: {
            /**
             * If true, when you press [GameConfig.player.skipKey], the game will skip the text transform
             */
            allowSkipTransform: boolean;
        },
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
            verbose: boolean;
        } | boolean;
        /**
         * If true, the game will show the inspector when you hover over the element
         */
        inspector: boolean;
    };
};
export type GameSettings = {
    volume: number;
};
export type CalledActionResult<T extends keyof LogicAction.ActionContents = any> = {
    [K in StringKeyOf<LogicAction.ActionContents>]: {
        type: T extends undefined ? K : T;
        node: ContentNode<LogicAction.ActionContents[T extends undefined ? K : T]> | null;
    }
}[StringKeyOf<LogicAction.ActionContents>];



