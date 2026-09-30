import { PlayerStateElement } from "@player/gameState";
import { DialogAction } from "../say/type";

/**
 * How long a dialog box is kept on screen after the line in it has been settled.
 *
 * A line is usually replaced by the next one within the same tick, and the grace is what lets that
 * happen in the same box rather than as an exit followed by an entrance. It is a hold for a line
 * that is *finished*; see {@link resolveDialogPresentation} for why a line that is still waiting can
 * never be held this way.
 */
export const DIRECT_DIALOG_REPLACEMENT_GRACE_MS = 120;

/**
 * The presence bookkeeping one scene's dialog layer carries between renders.
 *
 * `slotKeys` maps a slot - the index a line has in the scene's `texts` - to the React key of the
 * box showing it, so a line replaced in place keeps its box. `exitingKeys` are the keys
 * `AnimatePresence` is still animating out; a slot that is handed one of those has to be given a
 * fresh key instead, or the new line would be mounted into a box that is on its way off screen.
 */
export type DialogPresenceState = {
    slotKeys: Map<number, string>;
    exitingKeys: Set<string>;
    menuPromptIds: WeakMap<PlayerStateElement["menus"][number], string>;
    nextKey: number;
};

export type DialogRenderItem = {
    action: DialogAction;
    onFinished?: (skiped?: boolean) => void;
    useTypeEffect: boolean;
    presenceKey: string;
    slot: number;
    /**
     * Whether this box is showing a line that is still waiting for the player.
     *
     * An inactive box ignores clicks, the advance key and auto-forward: it is a picture of a line
     * that is already over. Only a retained item is ever inactive.
     */
    active: boolean;
};

/** One line (or one menu prompt) the scene wants a box for, before a box has been assigned. */
export type DialogSource = {
    action: DialogAction;
    onFinished?: (skiped?: boolean) => void;
    useTypeEffect: boolean;
    slot: number;
};

export type DialogPresentationInput = {
    /**
     * Every line the scene is still waiting on, in slot order - or, when it is waiting on none, the
     * prompt of a menu it is showing. Empty means the scene has nothing of its own to say.
     */
    sources: DialogSource[];
    /** How many menus the scene is showing. A menu is interactive whether or not it has a prompt. */
    menuCount: number;
    /** Mutated: the slot/key bookkeeping this layer carries between renders. */
    presence: DialogPresenceState;
    /** The snapshot currently being held on screen, if the grace is running. */
    retained: DialogRenderItem[] | null;
    /** The items the last render with something to say produced. */
    lastActive: DialogRenderItem[];
    sceneId: string;
};

export type DialogPresentation = {
    /** What to render, in order. */
    items: DialogRenderItem[];
    /** The snapshot to keep holding, or null to stop holding one. */
    retained: DialogRenderItem[] | null;
    /** The snapshot to remember as the last live one. */
    lastActive: DialogRenderItem[];
    /** Whether the retention grace should be counting after this render. */
    retaining: boolean;
    /**
     * Whether this scene's dialog layer should take pointer events.
     *
     * A scene's dialog layer covers the whole stage, and every scene on the stage has one -
     * including a caller parked behind a returnable jump, which has nothing to show at all. The
     * layers are stacked in the order the scenes are held, so a parked caller's empty layer is
     * drawn over the box of the scene the story is actually in. A layer with nothing live in it
     * that still took pointer events therefore swallowed every click aimed at the line underneath:
     * the box's own click handler, an inline word's, anything a line had drawn over itself.
     */
    interactive: boolean;
};

/**
 * Decide what one scene's dialog layer renders this frame.
 *
 * Deterministic given its input; it starts no timers and touches no React. `presence` is the one
 * thing it writes to, because slot/key assignment is bookkeeping that has to survive the render
 * that made it.
 *
 * Two rules the layer is built on:
 *
 * - **A line that is still waiting is always live.** Retention describes a line that is over and is
 *   being held on screen for a moment; a line whose click callback has not been called yet is not
 *   that, whatever came and went over its box in the meantime. So a snapshot is only ever taken
 *   when the scene has nothing left to say, and any snapshot in hand is dropped the moment it has
 *   something again.
 * - **A layer only takes the pointer when it has something to take it for.** See
 *   {@link DialogPresentation.interactive}.
 */
export function resolveDialogPresentation(
    {
        sources,
        menuCount,
        presence,
        retained,
        lastActive,
        sceneId,
    }: DialogPresentationInput
): DialogPresentation {
    if (sources.length === 0) {
        // Nothing to say. Hold the last thing said for the grace, so a line replaced in place does
        // not flicker; every item in that snapshot is a settled line, because a line still waiting
        // would be in `sources`.
        const held = retained ?? (lastActive.length > 0
            ? lastActive.map((item) => ({ ...item, active: false }))
            : null);

        return {
            items: held ?? [],
            retained: held,
            lastActive,
            retaining: held !== null,
            interactive: menuCount > 0,
        };
    }

    const activeSlots = new Set(sources.map(({ slot }) => slot));

    for (const [slot, key] of Array.from(presence.slotKeys)) {
        if (activeSlots.has(slot)) continue;
        presence.exitingKeys.add(key);
        presence.slotKeys.delete(slot);
    }

    const items = sources.map(({ slot, ...source }) => {
        let presenceKey = presence.slotKeys.get(slot);
        if (!presenceKey || presence.exitingKeys.has(presenceKey)) {
            presenceKey = `say-${sceneId}-${presence.nextKey++}`;
            presence.slotKeys.set(slot, presenceKey);
        }
        return {
            ...source,
            presenceKey,
            slot,
            active: true,
        };
    });

    return {
        items,
        retained: null,
        lastActive: items,
        retaining: false,
        interactive: true,
    };
}
