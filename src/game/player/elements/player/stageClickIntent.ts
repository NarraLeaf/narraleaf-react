/**
 * What a click that landed on the stage is asking for.
 *
 * The stage announcer decides *whether* a click belongs to the stage at all - it is over the player,
 * it is not inside a menu, a notification, a page or a word that takes its own clicks. This decides
 * what the ones that survive that walk actually mean, and it is kept apart from the walk because the
 * walk is DOM and this is not: the rules below are the ones worth pinning, and pinning them needs no
 * document.
 *
 * Comments in English per project convention.
 */

/**
 * The three things a click on the stage can mean.
 *
 * - `advance` - settle the line, the ordinary case.
 * - `restoreDialog` - bring the dialog box back, because it has been put away.
 * - `ignore` - the click reached nothing that wants it.
 */
export type StageClickIntent = "advance" | "restoreDialog" | "ignore";

export type StageClickInput = {
    /**
     * Whether the announcer's DOM walk decided this click belongs to the stage rather than to
     * something drawn on it.
     */
    onStage: boolean;
    /**
     * The `showDialog` preference: `false` means the player has put the box away to look at the
     * picture behind it.
     */
    dialogShown: boolean;
    /** Whether anything is currently holding the line - see `GameState.suspendAdvance`. */
    advanceSuspended: boolean;
};

/**
 * Decide what one click on the stage means.
 *
 * Two rules, in the order they are asked:
 *
 * - **A click with the box put away brings it back; it does not spend a line.** The box is the thing
 *   a click on the stage acts on, so with the box gone there is nothing on screen the click could
 *   have been aimed at - and the line it would have settled is one the player never saw. Every
 *   visual novel treats the next click after a hide as the one that undoes the hide, which is also
 *   the only reading that cannot lose text.
 * - **That outranks a hold on the line.** A suspension is a hold on *advancing*, taken by something
 *   drawn over a line that wants the player's attention first - a definition popup on an inline
 *   word. Everything that takes one is drawn inside the box, so while the box is away the hold is
 *   invisible; leaving it in charge would mean a player who put the box away had no way to bring it
 *   back and no way to reach the thing holding the line either. Restoring the box does not settle
 *   the line, so it takes nothing away from whatever holds it: the hold is still there, and still
 *   in charge, the moment the box is back.
 */
export function resolveStageClickIntent({
    onStage,
    dialogShown,
    advanceSuspended,
}: StageClickInput): StageClickIntent {
    if (!onStage) {
        return "ignore";
    }
    if (!dialogShown) {
        return "restoreDialog";
    }
    if (advanceSuspended) {
        return "ignore";
    }
    return "advance";
}
