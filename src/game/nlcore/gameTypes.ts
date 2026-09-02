import { LogicAction } from "@core/action/logicAction";
import { ContentNode, RawData } from "@core/action/tree/actionTree";
import { SerializedNamespaceData } from "@core/elements/persistent/type";
import { ElementStateRaw } from "@core/elements/story";
import { StringKeyOf } from "@lib/util/data";
import { PlayerStateData } from "@player/gameState";
import { GuardConfig } from "@player/guard";
import React from "react";
import { StackModel, StackModelRawData } from "./action/stackModel";
import type { GameElementHistory } from "./action/gameHistory";
import { MenuComponent, NotificationComponent, NvlDialogComponent, SayComponent } from "./common/player";
import { LiveGameEventToken } from "./types";
import type { AudioBusDeclaration } from "./game/audioBus";

/**
 * Current save format version.
 *
 * - v1 (undefined on the save): core resume state only, no backlog history.
 * - v2: adds `game.history`, a full backlog where every entry carries a self-contained
 *   restore snapshot, so loading a save keeps the backlog and any past line can be restored.
 * - v3: `elementStates` lists only the elements whose state differs from what the script wrote.
 *   Restoring resets every element first, so an absent element means "as authored" rather than
 *   "unchanged". Older engines read a v3 save without resetting, and would leave elements holding
 *   whatever the running session put in them; newer engines read v1/v2 saves unchanged, since a
 *   list of every element is just a list that happens to name them all.
 */
export const SAVE_FORMAT_VERSION = 3;

export interface SavedGameMetaData {
    /**
     * The timestamp of when the game was created
     */
    created: number;
    /**
     * The timestamp of when the game was last updated
     */
    updated: number;
    /**
     * The id of the game, unique to each saved game
     */
    id: string;
    /**
     * The last sentence that was spoken
     */
    lastSentence: string | null;
    /**
     * The last speaker that spoke
     */
    lastSpeaker: string | null;
    /**
     * The hash of the story is used to check whether the stories are compatible.
     */
    storyHash: string;
    /**
     * The save format version (see {@link SAVE_FORMAT_VERSION}).
     *
     * Absent on legacy (v1) saves written before backlog history existed.
     */
    version?: number;
}

/**
 * The core, resumable game state — everything needed to restore the game to a point,
 * **without** the backlog history.
 *
 * This is the unit captured per backlog entry (see {@link SerializedGameHistory}); it is
 * deliberately history-free so that per-entry snapshots do not nest the whole backlog inside
 * themselves (which would make saves grow exponentially).
 */
export interface SerializedGameState {
    store: { [key: string]: SerializedNamespaceData; };
    elementStates: RawData<ElementStateRaw>[];
    stage: PlayerStateData;
    services: { [key: string]: unknown; };
    stackModel: StackModelRawData;
    asyncStackModels: StackModelRawData[];
}

/**
 * A single persisted backlog line: the rendered say/menu content, a stable action anchor, and a
 * self-contained snapshot that restores the game to exactly this line.
 */
export interface SerializedGameHistory {
    /**
     * The entry's backlog token, kept so that it survives a load.
     *
     * A token is how a backlog UI names a line — it is what {@link LiveGame.restoreToHistory} takes.
     * Rebuilding the backlog with fresh tokens would invalidate every token a caller was holding the
     * moment a save is loaded or a line restored, so restoring to the same line twice would fail.
     * Absent on saves written before this was persisted; those entries are given fresh tokens.
     */
    token?: string;
    /**
     * Stable action id anchor (`action.getId()`). Used to re-bind the entry to the live story on
     * load; entries whose action no longer exists (script changed) are dropped from the backlog.
     */
    actionId: string | null;
    element: GameElementHistory;
    isPending?: boolean;
    /**
     * Core game state captured when this line was reached. Restoring it returns the game to this
     * exact line. `null` when a snapshot could not be captured (the line stays visible but is not
     * restorable).
     */
    snapshot: SerializedGameState | null;
}

export interface SavedGame {
    name: string;
    meta: SavedGameMetaData;
    game: SerializedGameState & {
        /**
         * Full backlog with per-entry restore snapshots (save format v2+).
         *
         * Absent on legacy saves; a missing/empty history simply means loading starts with an
         * empty backlog, exactly as before this feature existed.
         */
        history?: SerializedGameHistory[];
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
     * If true, the game will listen to the window events instead of the player element
     * 
     * Using this will allow the game to listen to the keyboard events even when the player is not focused  
     * Resulting in a better user experience on skipping actions
     * @default true
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
     * How much of a scene has to be warm before the game is shown.
     *
     * `"firstFrame"` waits for the scene's opening background and nothing else, then keeps fetching
     * the rest behind the game. `"scene"` waits for every image the scene registers anywhere in it,
     * which is what this always did.
     *
     * The two differ by an order of magnitude on a real project: a chapter's registered set is
     * every pose of every character it shows and every background it cuts to, while its first frame
     * is one picture. Choose `"scene"` when a game would rather open late than risk an image
     * arriving after the frame that wanted it.
     *
     * @default "firstFrame"
     */
    preloadGate: "firstFrame" | "scene";
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
     * The audio bus tree, declared by the host at boot.
     *
     * A bus is a gain node every sound routed to it passes through, and buses nest: a clip on
     * `alice` under `voice` is attenuated by `alice`, then by `voice`, then by the master volume.
     * That is what lets a player turn one character down without touching the rest of the cast.
     *
     * A bus's `volume` here is **the author's mix position**, not the player's slider. The player's
     * control is a separate number that starts at 1 and multiplies on top of this one — see
     * {@link import("@core/game").Game.audioBuses} — so a mix declared here survives boot and
     * survives a player who has never touched a slider.
     *
     * `bgm`, `sound` and `voice` are always present whether or not they appear here, so leaving
     * this empty is exactly the behaviour every game had before buses existed. Naming one of them
     * here moves it or changes its volume; nothing can remove it.
     *
     * Declaration order does not matter — a bus may name a parent declared after it. What is
     * rejected, loudly and at boot, is an unknown parent, a duplicate id, a cycle of any length,
     * or a chain nested deeper than
     * {@link import("@core/game/audioBus").MaxAudioBusDepth}.
     *
     * **Read once, when the audio subsystem starts.** Re-parenting a live bus would mean removing
     * a channel, which stops every sound in its subtree, so a `configure()` after the player has
     * mounted does not re-shape the graph. Volumes, on the other hand, are live at all times —
     * see {@link import("@core/game").Game.audioBuses}.
     *
     * @default []
     * @example
     * ```ts
     * new Game({
     *     audioBuses: [
     *         {id: "ambience", parentId: "bgm", volume: 0.6},
     *         {id: "cast", parentId: "voice"},
     *         {id: "alice", parentId: "cast"},
     *     ],
     * });
     * // Sound.voice({src: "alice-01.mp3", type: "alice"})
     * ```
     */
    audioBuses: AudioBusDeclaration[];
    /**
     * Which clips are streamed through an `<audio>` element instead of being decoded into memory.
     *
     * Decoded audio is float32 PCM, so its size has nothing to do with the size of the file it came
     * from: a five-minute 44.1 kHz stereo track occupies about 106 MB decoded however small the mp3
     * was. Background music is the worst case of that — long, and resident for as long as the scene
     * lasts — while a short effect wants to be decoded so that it can start on the frame it is
     * asked to and overlap with itself.
     *
     * - `"loops"` — a clip is streamed when {@link import("@core/elements/sound").ISoundUserConfig.streaming} says so, **or** when
     *   it loops the whole file (`loop` with no `endTime`). A whole-file loop is background music
     *   by construction, and repeating a whole file is the one thing an `<audio>` element does
     *   exactly. A loop that marks an out point is asking for a sample-accurate loop *region*,
     *   which only a decoded buffer has, so it keeps decoding.
     * - `"declared"` — only clips whose `streaming` is set are streamed; everything else is decoded.
     *   Choose this when a game would rather spend the memory than let its music loop through an
     *   element: `<audio>` repeats the file rather than the samples, and on some browsers and
     *   formats the loop point is audible.
     *
     * A `data:` or `blob:` source is already in memory and is always decoded, whichever this says.
     *
     * @default "loops"
     */
    audioStreaming: "loops" | "declared";
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
     * If true, the game will scale the dialog to fit the screen
     *
     * Text will look smaller when this is enabled
     * @default true
     */
    useAspectScale: boolean;
    /**
     * The delay in milliseconds before the game automatically shows the next sentence
     *
     * Counted from the end of the line: the text has finished typing AND the line's voice, if any,
     * has finished playing. A voiced line therefore waits out its clip and then this delay.
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
     * If true, when you press [GameConfig.player.skipKey], the game will skip the transition
     * played between scenes by {@link Scene.jumpTo}
     * @default true
     */
    allowSkipSceneTransition: boolean;
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
     * If true, the animation will propagate to the children
     * 
     * This behavior is controlled by [motion](https://motion.dev): `When true, exit animations will be propagated to nested AnimatePresence components.`
     * @default true
     */
    animationPropagate: boolean;
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
     * The component to use for NVL mode dialog
     * @default DefaultNvlContainer
     */
    nvlDialog: NvlDialogComponent;
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
     * Turn off text scaling for the whole game.
     *
     * Dialogue text is kept inside its box by being set down as it is typed. Turning this on
     * leaves every line at the size it was written at, and a line longer than its box overflows it.
     * @default false
     */
    disableTextScaling: boolean;
    /**
     * Override the default stage
     * @default null
     */
    stage: React.ReactNode | null;
    /**
     * The maximum number of times a stack model can loop
     * @default 1000
     */
    maxStackModelLoop: number;
    /**
     * The maximum number of actions to store in the action history
     * @default 100
     */
    maxActionHistory: number;
    /**
     * How many scenes a chain of returnable jumps may keep suspended at once.
     *
     * A returnable jump keeps the scene it left mounted, so a chain of them holds every scene in
     * the chain on the stage together with its layers and sprites. This is the ceiling on that
     * chain; the story throws when a call would cross it.
     *
     * It is not a recursion guard - recursion is impossible either way, because a scene that is
     * already on the call stack cannot be called again.
     * @default 8
     */
    maxSceneCallDepth: number;
};
export type GameSettings = {
    volume: number;
};
export type StackModelWaiting = {
    type: "any" | "all";
    stackModels: StackModel[];
};
export type CalledActionResult<T extends keyof LogicAction.ActionContents = any> = {
    [K in StringKeyOf<LogicAction.ActionContents>]: {
        type: T extends undefined ? K : T;
        node: ContentNode<LogicAction.ActionContents[T extends undefined ? K : T]> | null;
        wait?: StackModelWaiting | null;
    }
}[StringKeyOf<LogicAction.ActionContents>];

export interface NotificationToken extends LiveGameEventToken {
    promise: Promise<void>;
}
export type GamePreference = {
    /**
     * How long a newly typed character takes to fade in, in milliseconds. `0` turns it off.
     *
     * Dialogue text is normally typed at full strength, one character appearing after another.
     * With a duration here each character arrives faded and comes up over that time while the
     * typewriter carries on, so the few newest characters of a line are always part-way in and
     * the line has a soft edge rather than a hard one.
     *
     * The player's, like the typing speed it is read against: someone who finds the softness
     * distracting turns it down, and a settings screen can offer it beside `cps`. The fade never
     * outlasts the gap between two characters by more than a little, so raising the typing speed
     * shortens it and raising it a long way leaves none worth seeing. It applies only to text
     * actually being typed - a line revealed at once, skipped, or drawn again from a save is not
     * faded in - and a player whose system asks for reduced motion never sees it.
     * @default 0
     */
    textRevealDuration: number;
    /**
     * If true, the game will automatically forward to the next sentence when the player has finished the current sentence
     * @default false
     */
    autoForward: boolean;
    /**
     * If true, the game will allow the player to skip the dialog
     * @default true
     */
    skip: boolean;
    /**
     * If true, the game will show the dialog
     * @default true
     */
    showDialog: boolean;
    /**
     * The multiplier of the dialog speed
     *
     * Dialog speed will apply to:
     * - The text speed
     * - The auto-forward delay
     * @default 1.0
     */
    gameSpeed: number;
    /**
     * The speed of the text effects in characters per second.
     * @default 10
     */
    cps: number;
    /**
     * The volume of the voice
     * @default 1
     */
    voiceVolume: number;
    /**
     * Fade duration in milliseconds when ending voice in fade mode
     * @default 0
     */
    voiceFadeDuration: number;
    /**
     * How to end voice playback at the end of a sentence
     * @default "stop"
     */
    voiceEndMode: "fade" | "stop" | "none";
    /**
     * The volume of the background music
     * @default 1
     */
    bgmVolume: number;
    /**
     * The volume of the sound effects
     * @default 1
     */
    soundVolume: number;
    /**
     * The volume of the global audio
     * @default 1
     */
    globalVolume: number;
    /**
     * The delay in milliseconds before the game starts skipping actions
     *
     * This is used to prevent the game from skipping actions too quickly when the player presses the skip key.
     *
     * Set to 0 to skip actions immediately when the player presses the skip key.
     * @default 0
     */
    skipDelay: number;
    /**
     * The interval in milliseconds between each skip action.
     * ex: 100 ms means the player can skip 10 actions per second.
     * higher value means slower skipping.
     * @default 100
     */
    skipInterval: number;
};

