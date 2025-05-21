import { LogicAction } from "@core/action/logicAction";
import { ContentNode, RawData } from "@core/action/tree/actionTree";
import { StorableData } from "@core/elements/persistent/type";
import { ElementStateRaw } from "@core/elements/story";
import { StringKeyOf } from "@lib/util/data";
import { PlayerStateData } from "@player/gameState";
import { GuardConfig } from "@player/guard";
import React from "react";
import { MenuComponent, NotificationComponent, SayComponent } from "./common/player";
import { Color } from "./types";


export interface SavedGame {
    name: string;
    meta: {
        created: number;
        updated: number;
        id: string;
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
    /**
     * The id of the container element for the game
     * @default "__narraleaf_content"
     */
    contentContainerId: string;
    /**
     * The aspect ratio of the game
     * Ex: 16/9, 4/3, 1/1
     * @default 16/9
     */
    aspectRatio: number;
    /**
     * The minimum width and height of the player in pixels
     * @default 800
     */
    minWidth: number;
    /**
     * The minimum width and height of the player in pixels
     * @default 450
     */
    minHeight: number;
    /**
     * Base width of the player in pixels, Image scale will be calculated based on this value
     *
     * For 16/9, the recommended value is 1920
     * @default 1920
     */
    width: number;
    /**
     * Base height of the player in pixels, Image scale will be calculated based on this value
     *
     * For 16/9, the recommended value is 1080
     * @default 1080
     */
    height: number;
    /**
     * When the player presses one of these keys, the game will skip the current action
     *
     * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
     * @default ["Control"]
     */
    skipKey: React.KeyboardEvent["key"][];
    /**
     * The interval in milliseconds between each skip action.
     * ex: 100 ms means the player can skip 10 actions per second.
     * higher value means faster skipping.
     * @default 100
     */
    skipInterval: number;
    /**
     * If true, the game will listen to the window events instead of the player element
     * 
     * Using this will allow the game to listen to the keyboard events even when the player is not focused  
     * Resulting in a better user experience on skipping actions
     * @default false
     */
    useWindowListener: boolean;
    /**
     * The debounced interval in milliseconds for updating the aspect ratio
     *
     * Set to 0 to update the ratio immediately on every resize event.
     * @default 50
     */
    ratioUpdateInterval: number;
    /**
     * The game will preload the image with this delay between each preload task
     *
     * A single preload task may contain {@link GameConfig.preloadConcurrency} images
     * @default 100
     */
    preloadDelay: number;
    /**
     * Maximum number of images to preload at the same time
     * @default 5
     */
    preloadConcurrency: number;
    /**
     * Wait for the images to load before showing the game
     * @default true
     */
    waitForPreload: boolean;
    /**
     * Preload all possible images in the scene
     *
     * Enabling this may have a performance impact but is better for the user experience
     * @default true
     */
    preloadAllImages: boolean;
    /**
     * Force the game to clear the cache when the scene changes
     * @default false
     */
    forceClearCache: boolean;
    /**
     * The number of actions will be predicted and preloaded
     * @default 10
     */
    maxPreloadActions: number;
    /**
     * Src of the cursor image, if null, the game will show the default cursor
     * @default null
     */
    cursor: string | null;
    /**
     * Cursor width in pixels
     * @default 30
     */
    cursorWidth: number;
    /**
     * Cursor height in pixels
     * @default 30
     */
    cursorHeight: number;
    /**
     * Show overflowed content on player components
     * @default false
     */
    showOverflow: boolean;
    /**
     * Max history size for the page router
     * @default 10
     */
    maxRouterHistory: number;
    /**
     * Quality of the screenshot, between 0 and 1
     * @default 1
     */
    screenshotQuality: number;
    /**
     * When the player presses one of these keys, the game will show the next sentence
     *
     * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
     * @default [" "]
     */
    nextKey: React.KeyboardEvent["key"][];
    /**
     * If true, the game will scale the dialog to fit the screen
     *
     * Text will look smaller when this is enabled
     * @default true
     */
    useAspectScale: boolean;
    /**
     * The delay in milliseconds before the game automatically shows the next sentence
     *
     * Only works when the player preference "autoForward" is enabled
     * @default 3000
     */
    autoForwardDelay: number;
    /**
     * The default pause duration in milliseconds when auto-forward is enabled
     * 
     * When auto-forward is enabled, any Pause without a custom duration will use this value
     * @default 1000
     */
    autoForwardDefaultPause: number;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the image transform
     * @default true
     */
    allowSkipImageTransform: boolean;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the image transition
     * @default true
     */
    allowSkipImageTransition: boolean;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the background transform
     * @default true
     */
    allowSkipBackgroundTransform: boolean;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the background transition
     * @default false
     */
    allowSkipBackgroundTransition: boolean;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the text transform
     * @default true
     */
    allowSkipTextTransform: boolean;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the text transition
     * @default true
     */
    allowSkipTextTransition: boolean;
    /**
     * Base width of the dialog in pixels
     *
     * For 16/9, the recommended value is 1920
     * @default 1920
     */
    dialogWidth: number;
    /**
     * Base height of the dialog in pixels
     *
     * For 16/9, the recommended value is 1080 * 0.2 (20% of the screen height)
     * @default 1080 * 0.2
     */
    dialogHeight: number;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the text transform
     * @default true
     */
    allowSkipLayersTransform: boolean;
    /**
     * If true, when you press [GameConfig.player.skipKey], the game will skip the video transform
     *
     * This will only skip the "play" action
     *
     * @default false
     */
    allowSkipVideo: boolean;
    /**
     * The default text color for the dialog
     * @default "#000"
     */
    defaultTextColor: Color;
    /**
     * The default text color for the character nametag
     * @default "#000"
     */
    defaultNametagColor: Color;
    /**
     * The component to use for the notification
     * @default DefaultNotification
     */
    notification: NotificationComponent;
    /**
     * The component to use for the menu
     * @default DefaultMenu
     */
    menu: MenuComponent;
    /**
     * The component to use for the say
     * @default DefaultSay
     */
    dialog: SayComponent;
    /**
     * The function to call when an error occurs
     * @default () => {}
     */
    onError: (error: Error) => void;
    app: {
        debug: boolean;
        /**
         * Log level for the logger
         * Set to true to enable all logs
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
        /**
         * The config of {@link GameStateGuard}
         */
        guard: GuardConfig;
    };
    /**
     * Default font size for the game
     * @default "16px"
     */
    fontSize: React.CSSProperties["fontSize"];
    /**
     * Default font weight for the game
     * @default 400
     */
    fontWeight: number;
    /**
     * Default font weight for the game
     * @default 700
     */
    fontWeightBold: number;
    /**
     * Default font family for the game
     * @default "sans-serif"
     */
    fontFamily: React.CSSProperties["fontFamily"];
    /**
     * Override the default stage
     * @default null
     */
    stage: React.ReactNode | null;
    /**
     * The default color for the menu choices
     * @default "#000"
     */
    defaultMenuChoiceColor: Color;
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



