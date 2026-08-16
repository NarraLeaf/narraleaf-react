import { randId } from "@lib/util/data";
import type { SerializedGameHistory, SerializedGameState } from "../gameTypes";
import { Action } from "./action";
import { ActionHistory, ActionHistoryManager } from "./actionHistory";

type GameHistoryAction = {
    token: string;
    action: Action;
    isPending?: boolean;
};

export type GameElementHistory =
    | {
        type: "say";
        text: string;
        /** Resolved clip URL of the line's voice, if any. */
        voice: string | null;
        /**
         * The line's `Sentence.config.voiceId` - the key its take is filed under, not a URL.
         *
         * A backlog UI that wants a replay button needs an id it can hand back to the host, because
         * the host addresses audio by id (asset, voice unit) and a resolved URL is not one of those.
         * Absent on entries recorded before this field existed, and on a line voiced through the
         * inline `config.voice` rather than the scene's voice map.
         */
        voiceId?: string | number | null;
        character: string | null;
    }
    | {
        type: "menu";
        text: string | null;
        selected: string | null;
    };

export type GameHistory = GameHistoryAction & {
    element: GameElementHistory;
    /**
     * Self-contained core state captured when this line was reached, used to restore the game
     * back to this backlog line (see {@link LiveGame.restoreToHistory}). Optional because a
     * capture can fail, and legacy in-memory entries created before a snapshot was taken.
     */
    snapshot?: SerializedGameState | null;
};

export class GameHistoryManager {
    /**
     * Every line this playthrough has reached, in order — including the ones ahead of the play head
     * after a rewind. What separates the two is {@link GameHistoryManager.cursor}.
     */
    private history: GameHistory[] = [];
    /**
     * Index of the line the game is on. Everything up to and including it is the backlog; everything
     * after it is a future the player has already read once and can step forward into again.
     * `-1` when nothing has been reached yet.
     */
    private cursor: number = -1;
    /**
     * Set when the play head is moved by a rewind, cleared by the first line pushed afterwards.
     *
     * A line's snapshot is taken as the line is reached, so resuming from it re-runs it: the first
     * push after a rewind is the current line again, not the next one. Without knowing that, a
     * retrace looks like the story diverging and the lines ahead are thrown away.
     */
    private resumingAtCursor: boolean = false;
    private actionHistoryMgr: ActionHistoryManager;

    constructor(actionHistoryMgr: ActionHistoryManager) {
        this.actionHistoryMgr = actionHistoryMgr;

        // Only the cap, deliberately: an entry dropped because the stack grew too long is gone for
        // good and its line can no longer be stepped back to, so the backlog should stop offering
        // it. Undoing is the opposite — it moves the play head over lines that stay exactly where
        // they are, because they are the future the player steps forward into again.
        this.actionHistoryMgr.onHistoryLimit((removed) => {
            this.crossFilter(removed);
        });
    }

    /**
     * Record the line the game has just reached.
     *
     * After a rewind the play head sits behind lines that were already read, and what happens to
     * them depends on whether play is retracing its steps or leaving them behind. Reaching the same
     * action again is a retrace — the lines ahead are kept, so a player who stepped back three lines
     * and read forward again can still step forward through the rest. Reaching a different action
     * means the story went somewhere else (the other side of a choice, most often), and a future
     * that no longer follows from the present is dropped.
     *
     * There are two shapes of retrace, because a line's snapshot is taken as it is *reached*, before
     * it runs. So resuming from a restored line re-runs that very line — the first entry pushed
     * after a rewind is the current one coming round again — and only the ones after it arrive as
     * the line ahead.
     *
     * A retraced line keeps the token it had. A caller holding one is holding a reference to a line
     * of the story, and reading past it a second time should not quietly break that reference.
     */
    push(entry: GameHistory): this {
        const current = this.history[this.cursor];
        if (this.resumingAtCursor && current && current.action === entry.action) {
            this.history[this.cursor] = { ...entry, token: current.token };
            this.resumingAtCursor = false;
            return this;
        }
        this.resumingAtCursor = false;

        const next = this.history[this.cursor + 1];
        if (next && next.action === entry.action) {
            this.history[this.cursor + 1] = { ...entry, token: next.token };
        } else {
            this.history.length = this.cursor + 1;
            this.history.push(entry);
        }
        this.cursor++;
        return this;
    }

    /**
     * The backlog: everything read up to and including the current line.
     *
     * Lines ahead of the play head after a rewind are deliberately not here — a backlog showing the
     * future would be reporting what has not happened yet. Ask {@link GameHistoryManager.getFuture}
     * for those.
     */
    getHistory(): GameHistory[] {
        return this.history.slice(0, this.cursor + 1);
    }

    /**
     * The lines ahead of the play head — read once, rewound past, and steppable into again.
     */
    getFuture(): GameHistory[] {
        return this.history.slice(this.cursor + 1);
    }

    /**@internal */
    getCursor(): number {
        return this.cursor;
    }

    /**@internal */
    getAt(index: number): GameHistory | null {
        return this.history[index] ?? null;
    }

    /**@internal */
    indexOfToken(token: string): number {
        return this.history.findIndex(h => h.token === token);
    }

    /**
     * Move the play head to an entry that is already recorded. The caller is responsible for putting
     * the game itself into that line's state — see {@link LiveGame.restoreToHistory}.
     * @internal
     */
    setCursor(index: number): this {
        this.cursor = Math.max(-1, Math.min(index, this.history.length - 1));
        this.resumingAtCursor = true;
        return this;
    }

    canUndo(): boolean {
        return this.cursor > 0;
    }

    canRedo(): boolean {
        return this.cursor < this.history.length - 1;
    }

    /** Searches the whole timeline, so a line ahead of the play head can be named too. */
    getByToken(token: string): GameHistory | null {
        return this.history.find(h => h.token === token) ?? null;
    }

    /**
     * Serialize the backlog for persistence.
     *
     * Only up to the play head: a save written after rewinding is a save of that moment, and the
     * lines the player had read beyond it are not part of it. Loading such a save therefore opens
     * with nothing to step forward into, which is what saving in the past means.
     */
    serialize(): SerializedGameHistory[] {
        return this.history.slice(0, this.cursor + 1).map(h => GameHistoryManager.toSerialized(h));
    }

    /**
     * The whole timeline, future included — for moving the play head within this session rather than
     * for writing a save, which is what {@link GameHistoryManager.serialize} is for.
     * @internal
     */
    serializeAll(): SerializedGameHistory[] {
        return this.history.map(h => GameHistoryManager.toSerialized(h));
    }

    /**
     * Rebuild the backlog from persisted entries.
     *
     * Each entry is re-bound to a live {@link Action} through `actionMap`; entries whose action no
     * longer exists (the script changed since the save) are dropped rather than throwing, so a
     * still-loadable save degrades to a shorter backlog instead of failing.
     */
    load(entries: SerializedGameHistory[], actionMap: ReadonlyMap<string, Action>): void {
        this.history = [];
        for (const entry of entries) {
            const action = entry.actionId != null ? actionMap.get(entry.actionId) : undefined;
            if (!action) {
                continue;
            }
            this.history.push({
                // The token a caller may still be holding, not a new one: loading a save or
                // restoring a line rebuilds this list, and a fresh token there would quietly
                // invalidate every reference a backlog UI had. Saves written before tokens were
                // persisted carry none, and those entries do get a new one.
                token: entry.token ?? randId(6),
                action,
                element: entry.element,
                isPending: entry.isPending,
                snapshot: entry.snapshot,
            });
        }
        // A loaded save opens on its last line: everything it carries has been read, and it carries
        // nothing beyond the moment it was written.
        this.cursor = this.history.length - 1;
    }

    reset() {
        this.history = [];
        this.cursor = -1;
        this.resumingAtCursor = false;
    }

    private static toSerialized(h: GameHistory): SerializedGameHistory {
        return {
            token: h.token,
            actionId: h.action.getId(),
            element: h.element,
            isPending: h.isPending,
            snapshot: h.snapshot ?? null,
        };
    }

    updateByToken(id: string, handler: (result: GameHistory | null) => void) {
        const result = this.history.find(h => h.token === id);
        handler(result || null);
    }

    resolvePending(id: string) {
        const result = this.history.find((h: GameHistory) => h.token === id);
        if (result) {
            result.isPending = false;
        }
    }
    
    private crossFilter(affected: ActionHistory[]) {
        const affectedSet = new Set(affected.map(a => a.id));
        // Dropping entries moves everything after them along, so the play head has to move with
        // them: the action history's cap trims from the front, and a cursor left where it was would
        // silently come to rest on a different line.
        const removedBeforeCursor = this.history
            .slice(0, this.cursor + 1)
            .filter(h => affectedSet.has(h.token)).length;
        this.history = this.history.filter(h => !affectedSet.has(h.token));
        this.cursor = Math.max(-1, Math.min(this.cursor - removedBeforeCursor, this.history.length - 1));
    }
}
