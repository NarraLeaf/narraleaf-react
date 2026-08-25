import { ConditionAction } from "@core/action/actions/conditionAction";
import { ControlAction } from "@core/action/actions/controlAction";
import { SceneAction } from "@core/action/actions/sceneAction";
import { CharacterActionTypes, ControlActionTypes, SceneActionTypes } from "@core/action/actionTypes";
import { LogicAction } from "@core/action/logicAction";
import { ContentNode, RawData } from "@core/action/tree/actionTree";
import { RuntimeGameError, RuntimeInternalError } from "@core/common/Utils";
import { Character } from "@core/elements/character";
import { Sentence } from "@core/elements/character/sentence";
import { Namespace, Storable } from "@core/elements/persistent/storable";
import { StorableType } from "@core/elements/persistent/type";
import { Scene } from "@core/elements/scene";
import { Displayable } from "@core/elements/displayable/displayable";
import { ElementStateRaw, Story } from "@core/elements/story";
import { Game } from "@core/game";
import { Sound } from "@core/elements/sound";
import { SoundToken } from "@narraleaf/sound";
import type { CalledActionResult, NotificationToken, SavedGame, SerializedGameState } from "@core/gameTypes";
import { SAVE_FORMAT_VERSION } from "@core/gameTypes";
import { LiveGameEventHandler, LiveGameEventToken } from "@core/types";
import { Awaitable, EventDispatcher, generateId, MultiLock } from "@lib/util/data";
import { GameState } from "@player/gameState";
import { Options } from "html-to-image/lib/types";
import { ActionExecutionInjection, ExecutedActionResult } from "../action/action";
import { GameHistory } from "../action/gameHistory";
import { StackModel, StackModelRawData, StackSnapshot } from "../action/stackModel";

export type LiveGameEvent = {
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
    "event:action.current": [{
        /**
         * The id of the action that just began executing (as assigned by the story compiler),
         * or null for an action with no id. Fires for every executed action, including those
         * inside parallel/async branches — subscribers that only care about top-level lines
         * should filter by their own id set.
         */
        actionId: string | null,
        /**
         * The action's type (e.g. `"character:say"`).
         */
        actionType: string | null,
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
        "event:action.current": "event:action.current",
    } as const;
    /**
     * How many saves apart the debug-only dirty-mark audit runs. Small enough that a mistake is
     * found within a scene or two of play, large enough that the full walk it does is not on the
     * per-line path.
     * @internal
     */
    static ElementAuditInterval = 50;

    public game: Game;
    public events: EventDispatcher<LiveGameEvent> = new EventDispatcher();
    public story: Story | null = null;
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
    /**
     * Saves remaining before the next dirty-mark audit; see {@link LiveGame.auditElementDirtyMarks}.
     * @internal
     */
    private elementAuditCountdown: number = 0;
    /**@internal */
    lastDialog: {
        sentence: string;
        speaker: string | null;
    } | null = null;
    /**@internal */
    private readonly _storable: Storable;
    /**@internal */
    private mapCache: [actionMap: Map<string, LogicAction.Actions>, elementMap: Map<string, LogicAction.GameElement>] | null = null;
    /**@internal the id of the most recently executed action (drives the Studio play head) */
    private _currentActionId: string | null = null;

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

        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        if (!this.currentSavedGame || !this.stackModel) {
            throw new Error("Failed when trying to serialize the game: The game has not started");
        }

        return {
            name: this.currentSavedGame.name,
            meta: {
                version: SAVE_FORMAT_VERSION,
                created: this.currentSavedGame.meta.created,
                updated: Date.now(),
                id: this.currentSavedGame.meta.id,
                lastSentence: this.lastDialog?.sentence || null,
                lastSpeaker: this.lastDialog?.speaker || null,
                storyHash: story.hash(),
            },
            game: {
                ...this.serializeGameState(),
                history: this.gameState.gameHistory.serialize(),
            },
        } satisfies SavedGame;
    }

    /**
     * Serialize the core, resumable game state (store, elements, stage, execution stacks)
     * **without** the backlog history.
     *
     * This is the shared unit used both by {@link serialize} and by the per-backlog-entry
     * snapshots that power {@link restoreToHistory}; keeping it history-free is what prevents
     * per-entry snapshots from nesting the whole backlog inside themselves.
     *
     * @internal
     */
    public serializeGameState(): SerializedGameState {
        this.assertGameState();
        const gameState = this.gameState;

        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        const store = this._storable.toData();
        const stage = gameState.toData();
        const elementStates: RawData<ElementStateRaw>[] = story.getAllElementStates();
        this.auditElementDirtyMarks(story);
        const stackModel: StackModelRawData = this.stackModel.serialize();
        const asyncStackModels: StackModelRawData[] = Array.from(this.asyncStackModels).map(stack => stack.serialize());

        return {
            store,
            stage,
            elementStates,
            stackModel,
            asyncStackModels,
            services: story.serializeServices(),
        };
    }

    /**
     * Periodically check, in debug builds, that nothing has written to an element without marking it
     * dirty.
     *
     * A save only carries the elements the dirty flag points at, and the flag is set from a single
     * place - the action dispatch in {@link LiveGame.executeAction}. Anything that writes element
     * state from outside that path (a host reaching in through `DevTools`, a future code path that
     * bypasses the dispatch) would leave the element unmarked and quietly out of the save, with no
     * error and a state that looks plausible on load.
     *
     * So every {@link LiveGame.ElementAuditInterval} saves, debug builds do the full walk the flag
     * exists to avoid and compare every element against its authored state. Anything found drifted
     * but unmarked is reported *and* marked, so the mistake costs one snapshot rather than the rest
     * of the playthrough. Release builds never run it.
     * @internal
     */
    private auditElementDirtyMarks(story: Story): void {
        if (!this.game.config.app.debug) {
            return;
        }
        if (this.elementAuditCountdown-- > 0) {
            return;
        }
        this.elementAuditCountdown = LiveGame.ElementAuditInterval;

        const unmarked = story.findUnmarkedElements();
        if (!unmarked.length) {
            return;
        }

        unmarked.forEach(element => element.markDirty());
        this.gameState?.logger.warn(
            "LiveGame.auditElementDirtyMarks",
            `${unmarked.length} element(s) had state that no longer matches the script but were never `
            + "marked dirty, so the save just written left them out. They have been marked, so the next "
            + "save will carry them - but something is writing element state outside the action "
            + `dispatch: ${unmarked.map(element => element.getId()).join(", ")}`
        );
    }

    /**
     * Best-effort capture of the core game state for a backlog entry.
     *
     * Never throws: a line that cannot be snapshotted just becomes non-restorable rather than
     * breaking playback. Called on every say/menu as the backlog grows.
     *
     * @internal
     */
    public captureGameState(): SerializedGameState | null {
        try {
            return this.serializeGameState();
        } catch (e) {
            this.gameState?.logger.warn("LiveGame.captureGameState", e);
            return null;
        }
    }

    /**
     * Load a saved game
     *
     * Note: even if you change just a single line of script, the saved game might not be compatible with the new version
     *
     * After calling this method, the current game state will be lost, and the stage will trigger force reset
     */
    public deserialize(savedGame: SavedGame) {
        // This check is to prevent invalid usage
        if (!savedGame) {
            throw new Error("No saved game provided when trying to deserialize game state");
        }

        this.assertGameState();
        const gameState = this.gameState;

        const story = this.story;
        if (!story) {
            throw new Error("No story loaded");
        }

        this.game.hooks.trigger("beforeRestore", []);

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
        // Re-register the authored namespaces before applying the save: a save only carries
        // the keys that existed when it was written, so loading into freshly defaulted
        // namespaces is what lets a key added since then keep its default (and lets
        // `reset()` still mean the author's defaults rather than the save's contents).
        this.initNamespaces();
        this._storable.load(store);

        // Everything goes back to the state the script wrote before the save is applied. A save
        // carries only the elements that differ from that state (see `Story.getAllElementStates`),
        // so an element the save does not name is not "leave it as it is" - it is "as the author
        // wrote it", and without this pass it would keep whatever the session running right now had
        // put in it. It also matters for saves that predate an element: they name fewer elements
        // than the story now has, and the ones they cannot speak for still have to be restored.
        elementMaps.forEach(element => element.reset());

        // restore elements
        elementStates.forEach(({ id, data }) => {
            gameState.logger.debug("restore element", id);

            const element = elementMaps.get(id);
            if (!element) {
                throw new Error("Element not found, id: " + id + "\nNarraLeaf cannot find the element with the id from the saved game");
            }
            element.fromData(data as any);
            // Restored state is by definition not the authored state, so the next save has to carry
            // this element even if no action touches it again.
            element.markDirty();
        });

        // A looping transform is stored as the id of the action that started it, because a Transform
        // itself cannot be serialized - its easing may be a function. The transform is authored data
        // hanging off that action, so the story still holds it; this is where the ids become objects
        // again, using the same map the stack model is restored from just below. An element whose
        // anchor no longer resolves quietly loses its loop and keeps its pose.
        elementMaps.forEach(element => {
            if (element instanceof Displayable) {
                element._rebindLoop(actionMaps);
            }
        });

        // restore game state
        this.currentSavedGame = savedGame;
        gameState.loadData(stage, elementMaps);

        // restore stack model
        this.stackModel.deserialize(stackModel, actionMaps);
        asyncStackModels.forEach(stack => {
            const stackModel = StackModel.createStackModel(this, stack, actionMaps);
            this.asyncStackModels.add(stackModel);
            gameState.timelines.attachTimeline(this.executeAsyncStackModel(stackModel));
        });

        // restore services
        story.deserializeServices(services);

        // restore backlog history (save format v2+; legacy saves carry none). Entries are re-bound
        // to live actions and dropped if their action no longer exists in the current story.
        gameState.gameHistory.load(savedGame.game.history ?? [], actionMaps);

        this.game.hooks.trigger("afterRestore", []);

        gameState.events.once(GameState.EventTypes["event:state.onRender"], () => {
            gameState.schedule(() => {
                gameState.rollLock.unlock();
                gameState.stage.next();
            }, 0);
        });
        gameState.stage.forceUpdate();
    }

    /**
     * The backlog: every line read up to and including the one the game is on.
     *
     * After stepping back, the lines beyond the play head are not here — they are a future the
     * player can step into again with {@link redo}, and a backlog listing them would be showing what
     * has not happened yet. {@link getFuture} returns those.
     *
     * Each entry carries a `token`, which is how {@link restoreToHistory} names a line. A token
     * keeps naming its line across saves and rewinds.
     */
    public getHistory(): GameHistory[] {
        this.assertGameState();
        return this.gameState.gameHistory.getHistory();
    }

    /**
     * The lines ahead of the play head: read once, stepped back past, and reachable again.
     *
     * Empty during ordinary play, and empty right after loading a save — a save written in the past
     * carries no future, because saving after stepping back saves that moment and not the lines that
     * had been read beyond it.
     */
    public getFuture(): GameHistory[] {
        this.assertGameState();
        return this.gameState.gameHistory.getFuture();
    }

    /** Whether there is a line before this one to step back to. */
    public canUndo(): boolean {
        this.assertGameState();
        return this.gameState.gameHistory.canUndo();
    }

    /** Whether a line stepped back past is waiting ahead. */
    public canRedo(): boolean {
        this.assertGameState();
        return this.gameState.gameHistory.canRedo();
    }

    /**
     * Step back one line.
     *
     * Backward and forward are one mechanism: each line recorded a self-contained snapshot of the
     * game when it was reached, and moving in either direction restores the snapshot of the line
     * being moved to. That is what lets this work after loading a save, which the undo stack of
     * live closures it replaced could not — those closures cannot be written to a file, so before
     * this, loading a save left the player with a backlog they could not step back into.
     *
     * The line stepped back from is not discarded; see {@link redo}.
     *
     * @returns `true` if the game moved, `false` if this is already the first line or that line
     *          carries no snapshot.
     */
    public undo(): boolean {
        this.assertGameState();

        const history = this.gameState.gameHistory;
        if (!history.canUndo()) {
            this.gameState.logger.warn("LiveGame.undo", "No line to step back to");
            return false;
        }
        return this.restoreToIndex(history.getCursor() - 1, "LiveGame.undo");
    }

    /**
     * Step forward one line, into a line stepped back past.
     *
     * Only reaches lines the player has already read: this replays the recorded future rather than
     * running the story on. Reading forward normally after stepping back keeps that future while the
     * story retraces the same lines, and drops it the moment the story goes somewhere else — a
     * different branch of a choice has a different future, and the old one no longer follows.
     *
     * @returns `true` if the game moved, `false` if there is nothing ahead or it carries no
     *          snapshot.
     */
    public redo(): boolean {
        this.assertGameState();

        const history = this.gameState.gameHistory;
        if (!history.canRedo()) {
            this.gameState.logger.warn("LiveGame.redo", "No line to step forward to");
            return false;
        }
        return this.restoreToIndex(history.getCursor() + 1, "LiveGame.redo");
    }

    /**
     * Move the game to a recorded line, named by its token.
     *
     * The same mechanism as {@link undo} and {@link redo}, and it reaches in either direction: a
     * token from {@link getHistory} steps back, one from {@link getFuture} steps forward.
     *
     * @param token - the token of the line to move to
     * @returns `true` if the line was restored, `false` if the token is unknown or the line carries
     *          no snapshot.
     */
    public restoreToHistory(token: string): boolean {
        this.assertGameState();

        const index = this.gameState.gameHistory.indexOfToken(token);
        if (index < 0) {
            this.gameState.logger.warn("LiveGame.restoreToHistory", "No history entry for token", token);
            return false;
        }
        return this.restoreToIndex(index, "LiveGame.restoreToHistory");
    }

    /**
     * Put the game into the state one recorded line describes, and move the play head to it.
     *
     * The timeline itself is untouched — the whole of it, future included, is handed back to
     * `deserialize` and the play head is then placed on the target. That is what makes stepping back
     * reversible: nothing is thrown away by moving.
     * @internal
     */
    private restoreToIndex(index: number, caller: string): boolean {
        this.assertGameState();

        const history = this.gameState.gameHistory;
        const entry = history.getAt(index);
        if (!entry) {
            this.gameState.logger.warn(caller, "No history entry at", index);
            return false;
        }

        // Stepping back to a line this session actually played is done in place, by running the undo
        // each action registered as it ran. Restoring a snapshot would reach the same state, but it
        // goes through the whole load path — which resets the audio manager and remounts the stage,
        // so the music would restart and every running timeline would be cut on a step the player
        // experiences as going back one line. The snapshot is the fallback for the lines that stack
        // no longer holds: everything after a save has been loaded, and everything older than its
        // cap.
        if (index < history.getCursor() && this.gameState.actionHistory.has(entry.token)) {
            // The play head moves first. Unwinding re-runs the line it lands on, and that run
            // records itself straight away — with the head still at the line being left, that record
            // reads as a new line arriving and the future is dropped on the spot.
            const previous = history.getCursor();
            history.setCursor(index);

            if (this.undoInPlace(entry, caller)) {
                this.auditRestoredLine(entry, caller);
                return true;
            }
            history.setCursor(previous);
        }

        if (!entry.snapshot) {
            this.gameState.logger.warn(caller, "History entry has no restore snapshot", entry.token);
            return false;
        }

        const token = entry.token;
        // `deserialize` is reused wholesale: a synthesized save whose core is this line's snapshot
        // and whose history is the entire timeline, so resuming here is the same path as loading a
        // save. It rebuilds the timeline and leaves the play head at the end, so the head is placed
        // afterwards - by token, because an entry whose action the story no longer has is dropped on
        // the way through and would shift every index after it.
        const synthetic: SavedGame = {
            name: this.currentSavedGame?.name ?? "",
            meta: this.currentSavedGame?.meta ?? this.getNewSavedGame().meta,
            game: {
                ...entry.snapshot,
                history: history.serializeAll(),
            },
        };
        this.deserialize(synthetic);
        this.gameState.gameHistory.setCursor(this.gameState.gameHistory.indexOfToken(token));

        // A line arrived at by moving the play head is a line the player has already read, so in NVL
        // mode it should appear rather than type itself out again. The undo this replaced did the
        // same for the same reason.
        if (entry.action.type === CharacterActionTypes.say && this.gameState.isNvlMode()) {
            this.gameState.suppressNextNvlTyping();
        }
        return true;
    }

    /**
     * Step the game back to a line by unwinding the undo each action registered as it ran, leaving
     * everything the stage is doing alone.
     *
     * A backlog entry's token is the id of the action-history entry pushed for the same line, so a
     * line is reachable this way exactly when that stack still holds it. Unwinding through it leaves
     * the game where that line was about to run — which is the state the line's snapshot describes,
     * reached without rebuilding anything.
     *
     * @returns `false` when the stack cannot reach that line, so the caller falls back to the
     *          snapshot.
     * @internal
     */
    private undoInPlace(entry: GameHistory, caller: string): boolean {
        this.assertGameState();

        const actionHistory = this.gameState.actionHistory;
        if (!actionHistory.has(entry.token)) {
            return false;
        }

        const lock = this.gameLock.register().lock();
        this.stackModel.abortStackTop();

        const undone = actionHistory.undoUntil(entry.token);
        if (!undone) {
            this.gameLock.off(lock.unlock());
            return false;
        }

        const [actionMaps] = this.constructMaps();
        const { rootStackSnapshot, stackModel } = undone;

        if (undone.action.type === CharacterActionTypes.say && this.gameState.isNvlMode()) {
            this.gameState.suppressNextNvlTyping();
        }

        this.stackModel.deserialize(rootStackSnapshot, actionMaps);
        if (stackModel === this.stackModel) {
            this.stackModel.push(StackModel.fromAction(undone.action as LogicAction.Actions));
        }

        this.gameLock.off(lock.unlock());
        this.gameState.logger.debug(caller, "Stepped back in place to", entry.token);

        this.gameState.stage.forceUpdate();
        this.gameState.stage.next();
        this.gameState.schedule(() => {
            if (this.gameState) this.gameState.forceAnimation();
        }, 0);
        return true;
    }

    /**
     * Check, in debug builds, that stepping back in place left the game where that line's snapshot
     * says it should be.
     *
     * There are two ways to reach a line now and they have to agree, or the same call would mean
     * different things depending on how far back the player went and whether they had loaded a save.
     * Unwinding relies on every action having registered an undo that truly reverses it; a snapshot
     * relies on nothing. So the snapshot is the reference, and this reports where the two part
     * company rather than leaving it to be discovered as a wrong-looking stage.
     * @internal
     */
    private auditRestoredLine(entry: GameHistory, caller: string): void {
        if (!this.game.config.app.debug || !entry.snapshot) {
            return;
        }

        const expected = JSON.stringify([...entry.snapshot.elementStates].sort((a, b) => a.id.localeCompare(b.id)));
        const actual = JSON.stringify([...this.serializeGameState().elementStates].sort((a, b) => a.id.localeCompare(b.id)));
        if (expected !== actual) {
            this.gameState?.logger.warn(
                caller,
                "Stepping back in place did not reproduce the state this line's snapshot describes, so an "
                + "action's undo does not fully reverse it. Restoring the snapshot would have been correct; "
                + `this path was not.\nexpected: ${expected}\nactual: ${actual}`
            );
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
     * Play a sound immediately and return the SoundToken.
     *
     * The clip starts at the volume its {@link Sound} was configured with — `Sound.voice({src, volume:
     * 0.4})` starts at 0.4, not at full volume. There is no fade: the token's volume is already
     * settled when this resolves and no ramp is left running, so a `setVolume` or a fade driven on
     * the returned token afterwards wins outright.
     *
     * A source given as a string or `URL` becomes a default `Sound`, which is full volume — pass a
     * `Sound` to say otherwise.
     */
    public playSound(sound: Sound | string | URL): Promise<SoundToken> {
        this.assertGameState();
        const resolved = sound instanceof URL ? sound.toString() : sound;
        const target = typeof resolved === "string" ? new Sound({ src: resolved }) : resolved;
        return this.gameState.audioManager.playSoundToken(target);
    }

    /**
     * Skip the current dialog
     */
    public skipDialog() {
        this.assertGameState();

        this.gameState.events.emit(GameState.EventTypes["event:state.player.skip"], true);
    }

    /**
     * How long a single suspended step is given to settle before the fast-forward gives up on it
     * and returns `{ reason: "stalled" }`. Overridable per call via `options.stepTimeout`.
     * @internal
     */
    private static readonly FastForwardStepTimeout = 10_000;
    /**
     * How often the skip request is re-broadcast while waiting for a suspended step to settle.
     * Roughly one animation frame: the components that honour a skip only exist once the renderer
     * has committed the line, so the request has to outlive a render.
     * @internal
     */
    private static readonly FastForwardSkipInterval = 16;

    /**
     * Fast-forward playback to the next menu (or the end of the story).
     *
     * Every line in between is executed for real, so the backlog and its restore snapshots
     * accumulate exactly as in normal play — only faster and silent. Audio is muted for the
     * duration, and timed pauses (`Control.sleep`, auto-forward) resolve at once. It stops as soon
     * as a menu is waiting for a choice, so the choice itself is always left to the player.
     *
     * Skipping a line is a *request* to the renderer, not a synchronous state change: it is
     * re-issued until the line settles. A line that never responds (an unskippable in-flight
     * media/transition step) ends the run with `"stalled"` rather than hanging — this method always
     * settles.
     *
     * Because history accumulates the whole way, {@link getHistory} and
     * {@link restoreToHistory} cover the fast-forwarded span just like normal play.
     *
     * ```typescript
     * // Jump ahead to the next decision point.
     * await game.getLiveGame().fastForward();
     * ```
     *
     * @param options.until - `"menu"` (default) stops at the next menu; `"end"` runs until the
     *                         story finishes; `{ actionId }` runs until that action surfaces as
     *                         the next thing to execute and stops **just before** running it
     *                         (so the play head is positioned at that line). A menu that blocks
     *                         the path, the stack draining, or the step cap all stop early — the
     *                         result then reports `reachedTarget: false` so the caller can tell an
     *                         unreachable / already-passed id from a successful jump.
     * @param options.maxSteps - safety bound on the number of advance steps (defaults to the
     *                           `maxStackModelLoop` config).
     * @param options.stepTimeout - how long (ms) a single line is given to settle before the run
     *                              reports `"stalled"`. Defaults to 10000. Raise it if the story
     *                              fast-forwards through long unskippable media.
     * @returns why it stopped: `"action"` (reached `until.actionId`), `"menu"`, `"end"` (the stack
     *          drained), `"maxSteps"`, or `"stalled"` (a line refused to settle). When an
     *          `actionId` target was requested, `reachedTarget` is also set (`true` only for reason
     *          `"action"`).
     *
     * Note: only the root execution stack is scanned for the target — an id buried inside an
     * in-flight parallel (`Control.all`/`any`) or async branch is not a stop point.
     */
    public async fastForward(options: {
        until?: "menu" | "end" | { actionId: string };
        maxSteps?: number;
        stepTimeout?: number;
    } = {}): Promise<{ reason: "menu" | "end" | "maxSteps" | "action" | "stalled"; reachedTarget?: boolean }> {
        this.assertGameState();
        const gameState = this.gameState;
        const until = options.until ?? "menu";
        const targetId = typeof until === "object" ? until.actionId : null;
        // A menu we cannot pass without a choice ends both an explicit "menu" run and any
        // action-id jump (the target is unreachable until the player decides).
        const stopAtMenu = until === "menu" || targetId !== null;
        const maxSteps = options.maxSteps ?? gameState.game.config.maxStackModelLoop;
        const stepTimeout = options.stepTimeout ?? LiveGame.FastForwardStepTimeout;
        // reachedTarget is only meaningful for an action-id jump; omit it otherwise so the
        // existing `{ reason }` shape is preserved for "menu"/"end" callers.
        const missedTarget = targetId !== null ? { reachedTarget: false } : {};

        const previousVolume = gameState.audioManager.getGlobalVolume();
        gameState.audioManager.setGlobalVolume(0);
        gameState.setFastForwarding(true);

        try {
            let steps = 0;
            while (steps++ < maxSteps) {
                // Stop conditions are checked before advancing further. peekExecutingActionId (not
                // peekTopActionId) is used so the target only matches when it is genuinely the next
                // thing to run — never while it is still buried under an in-progress step (e.g. the
                // continuation of a do-block whose first child is still awaiting).
                if (targetId !== null && this.stackModel.peekExecutingActionId() === targetId) {
                    return { reason: "action", reachedTarget: true };
                }
                if (stopAtMenu && gameState.hasActiveMenu()) {
                    return { reason: "menu", ...missedTarget };
                }
                if (this.stackModel.isEmpty()) {
                    return { reason: "end", ...missedTarget };
                }

                const awaitable = this.stackModel.getWaitingAwaitable();
                if (awaitable) {
                    // Suspended on a say / waitForClick: force-skip it and wait for the step to
                    // settle before the next skip, so the line's history entry and its snapshot
                    // are captured against a stable stack rather than a mid-mutation one.
                    const settled = await LiveGame.settleSuspendedStep(gameState, awaitable, stepTimeout);
                    if (!settled) {
                        return { reason: "stalled", ...missedTarget };
                    }
                } else {
                    // Not suspended (a run of synchronous actions, or a just-settled step not yet
                    // re-driven): pump the drain and yield a microtask.
                    gameState.stage.next();
                    await Promise.resolve();
                }
            }
            return { reason: "maxSteps", ...missedTarget };
        } finally {
            gameState.setFastForwarding(false);
            gameState.audioManager.setGlobalVolume(previousVolume);
        }
    }

    /**
     * Drive one suspended step (a say, a `waitForClick`, an in-flight transition) to its settle.
     *
     * `event:state.player.skip` is a fire-and-forget broadcast, and the things that honour it —
     * the mounted dialog, the mounted displayable — only exist once the renderer has *committed*
     * the line. The fast-forward loop resumes on a microtask, well before that commit, so a single
     * emit for a line the renderer has not painted yet reaches no listener at all and is dropped:
     * nothing settles the step, and the loop parks on it forever. Re-issuing the request on a
     * frame-ish interval makes the skip survive the render it has to outlive, and the deadline
     * guarantees this returns even for a step that genuinely cannot be skipped.
     *
     * @returns `true` if the step settled, `false` if it outlived `timeout`.
     * @internal
     */
    private static settleSuspendedStep(
        gameState: GameState,
        awaitable: Pick<Awaitable<CalledActionResult>, "onSettled">,
        timeout: number,
    ): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            let done = false;
            let timer: ReturnType<typeof setTimeout> | null = null;
            // The stand-in awaitables used by the seam tests return nothing from onSettled, so the
            // token is optional all the way down.
            let token: { cancel?: () => void } | void = undefined;

            const finish = (settled: boolean) => {
                if (done) {
                    return;
                }
                done = true;
                if (timer !== null) {
                    clearTimeout(timer);
                    timer = null;
                }
                token?.cancel?.();
                resolve(settled);
            };

            // An already-settled awaitable calls back synchronously — hence `token` being declared
            // (and left undefined) before this line rather than after.
            token = awaitable.onSettled(() => finish(true));
            if (done) {
                token?.cancel?.();
                return;
            }

            const deadline = Date.now() + timeout;
            const pump = () => {
                if (done) {
                    return;
                }
                gameState.events.emit(GameState.EventTypes["event:state.player.skip"], true);
                if (done) {
                    // Settled synchronously: the common case, and it costs no extra frame.
                    return;
                }
                if (Date.now() >= deadline) {
                    finish(false);
                    return;
                }
                timer = setTimeout(pump, LiveGame.FastForwardSkipInterval);
            };
            pump();
        });
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
     * **Experimental.** Subscribe to the current-action-id stream: fires each time an action
     * begins executing, carrying its id and type. Intended for an external play head (e.g. the
     * Studio timeline) to follow along. Fires for branch/async actions too — filter by your own
     * id set if you only track top-level lines.
     *
     * @returns a token; call `token.cancel()` to unsubscribe.
     */
    public onCurrentActionChange(fc: LiveGameEventHandler<LiveGameEvent["event:action.current"]>): LiveGameEventToken {
        return this.events.on(LiveGame.EventTypes["event:action.current"], fc);
    }

    /**
     * **Experimental.** The id of the most recently executed action, or null before the first
     * action runs. A pull-based companion to {@link onCurrentActionChange}.
     */
    public getCurrentActionId(): string | null {
        return this._currentActionId;
    }

    /**
     * **Experimental, read-only.** A top-first snapshot of the current execution stacks for a
     * call-stack / debug view: the root stack plus any in-flight async stacks (`Control.doAsync`
     * / `Control.allAsync`). The shape is a convenience projection, not a stability contract — do
     * not serialize it (use {@link serialize} for saves). Returns empty frames before the game
     * starts.
     */
    public getStackSnapshot(): { root: StackSnapshot; async: StackSnapshot[] } {
        if (!this.stackModel) {
            return { root: { frames: [] }, async: [] };
        }
        return {
            root: this.stackModel.snapshot(),
            async: Array.from(this.asyncStackModels).map(stack => stack.snapshot()),
        };
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
            promise: new Promise((resolve) => {
                token = this.game.router.onceExitComplete(() => {
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

    public waitForPageMount(): {
        promise: Promise<void>;
        cancel: VoidFunction;
    } {
        let token: LiveGameEventToken | null = null;
        return {
            promise: new Promise((resolve) => {
                token = this.game.router.oncePageMount(() => {
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
            // A scene's background music reaches a save - `AudioManager` records every clip it is
            // playing - without ever being an action's callee, so a table built from callees alone
            // cannot answer for it and the music does not come back. See `Scene.getOwnedSounds`.
            for (const sound of Scene.getOwnedSounds(action)) {
                const soundId = sound.getId();
                if (soundId) {
                    elementMaps.set(soundId, sound);
                }
            }
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
            gameState.logger.weakWarn("Game Actions", "Action stack is empty");
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
    executeAsyncStackModel(stack: StackModel): Awaitable<void> {
        this.assertGameState();

        const awaitable = stack.execute();
        awaitable.onFailed(error => {
            this.gameState.logger.error("Async StackModel", error);
        });
        awaitable.onSettled(() => {
            this.asyncStackModels.delete(stack);
        });

        return awaitable;
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

        // Publish the current play head before running the action. Studio reverse-maps the id to a
        // block via its actionIdBindings; the event fires for every action, branch actions included.
        // This is the per-action hot path, so the payload is only built when someone is listening.
        this._currentActionId = action.getId();
        if (this.events.hasListeners(LiveGame.EventTypes["event:action.current"])) {
            this.events.emit(LiveGame.EventTypes["event:action.current"], {
                actionId: action.getId(),
                actionType: action.type,
            });
        }

        // The one place every action the engine runs passes through, and therefore the one place
        // that can mark an element as worth serialising without each handler having to remember to.
        // It marks on dispatch rather than on a write, so it over-marks - an action that only reads
        // marks its element too - and that is the safe direction: what decides whether an element
        // reaches a save is the comparison against its authored state, so an unnecessary mark costs
        // one comparison, while a missing one would drop state silently.
        // Optional: every action the engine builds has a callee, but this is the per-action hot path
        // of a shipped engine and a missing mark degrades into a warning from the audit below,
        // whereas a throw here would take the game down.
        action.callee?.markDirty();

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
            // An empty Control.do([]) body leaves `current` null here; fall through to the queued
            // continuation instead of dereferencing null.
            if (current?.action) actions.push(current.action);
            current = current?.getChild() || null;
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
                storyHash: this.story?.hash() || "",
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
                stackModel: { items: [] },
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