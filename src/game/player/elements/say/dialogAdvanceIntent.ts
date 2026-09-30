/**
 * What one request to get on with the line actually asks the box to do.
 *
 * Three different things reach a dialog box meaning "carry on", and they do not mean the same thing:
 * a click on the box, a click on the stage, and the skip key. They used to arrive along two paths
 * with different manners - the box's own click asked the sentence to complete, everything else told
 * it to force-skip - and the difference was invisible until a line had a `Pause` in it, because
 * force-skipping is the only one of the two that walks straight past pauses.
 *
 * The rule below is the one worth pinning, and pinning it needs no React: a single advance is a
 * single advance whoever asked for it, and only the skip *mode* is allowed to blow through the
 * pauses an author wrote.
 *
 * Comments in English per project convention.
 */

/**
 * The three things an advance request can mean.
 *
 * - `requestComplete` - one advance: reveal to the next pause, or settle a line already revealed.
 * - `forceSkip` - the skip mode: reveal the whole line, pauses included, and settle it.
 * - `ignore` - this box does not hold the line, so the request is not its to answer.
 */
export type DialogAdvanceIntent = "ignore" | "requestComplete" | "forceSkip";

export type DialogAdvanceInput = {
    /** Whether this box holds the line right now. An inactive box ignores advances on purpose. */
    active: boolean;
    /**
     * Whether this is the skip *mode* rather than one advance.
     *
     * True for the skip key's repeats while it is held down, for `LiveGame.skipDialog`, and for the
     * fast-forward pump. False for a click - on the box or on the stage - and for the first press of
     * the skip key, which is a tap and asks for one line like any other advance.
     */
    forced: boolean;
};

/**
 * Decide what one advance request means.
 *
 * **A single advance never forces.** Forcing is what the skip mode does, and its whole point is to
 * ignore what the author asked for - including a `Pause`, which exists precisely to hold the line
 * until the player answers it. A click that forced would reveal the rest of the line in one go and
 * silently spend the pause with it, which is the same text loss as advancing past a line nobody
 * read, only harder to notice: the words are all on screen, they were simply never revealed at the
 * speed they were written to be.
 *
 * That a click on the box and a click on the stage should behave identically is not a nicety - the
 * box covers part of the stage and nothing tells a player which half of a dialogue they hit.
 *
 * The first press of the skip key is a tap, and a tap is an advance. Only its repeats - which
 * arrive only while the key is still down - are the mode.
 */
export function resolveDialogAdvanceIntent({
    active,
    forced,
}: DialogAdvanceInput): DialogAdvanceIntent {
    if (!active) {
        return "ignore";
    }
    return forced ? "forceSkip" : "requestComplete";
}

/**
 * The part of a dialog state an advance touches.
 *
 * Structural on purpose: this module is reached from a test that drives a real `DialogState`, and
 * importing the class here to name it would tie a decision with no dependencies to the component
 * file that has all of them.
 */
export type DialogAdvanceTarget = {
    setIdle(idle: boolean): void;
    forceSkip(): void;
    requestComplete(): void;
};

/**
 * Decide what the request means and carry it out.
 *
 * Kept here with the decision rather than in the component so that the two cannot drift: a test can
 * drive a real dialog state through the real dispatch, which is the only way the rule above is worth
 * anything. Returns what it decided, for callers that want to log or assert it.
 *
 * The forced branch marks the line idle *before* it skips: the skip reveals the whole line, so the
 * line is fully revealed by the time anything can ask, and the same tick settles it.
 */
export function applyDialogAdvance(
    target: DialogAdvanceTarget,
    input: DialogAdvanceInput,
): DialogAdvanceIntent {
    const intent = resolveDialogAdvanceIntent(input);
    if (intent === "forceSkip") {
        target.setIdle(true);
        target.forceSkip();
    } else if (intent === "requestComplete") {
        target.requestComplete();
    }
    return intent;
}
