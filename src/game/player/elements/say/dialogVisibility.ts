/**
 * How a dialog box that has been put away is hidden.
 *
 * Hiding the box is how a player looks at the picture behind it; it is not the box going away. The
 * box keeps its line, its typing task, its animations and - the part this file exists for - its
 * place in hit testing, because whatever a game has drawn inside the box is still a thing the player
 * can be reaching for. The engine's own UI has nothing in there, but a host that renders its own
 * dialog into this box does, and that content is the only route it has to the pointer.
 *
 * Comments in English per project convention.
 */

export type DialogVisibility = {
    /** The class the box carries while in this state, or an empty string for none. */
    className: string;
    /** Whether the box should be hidden from assistive technology. */
    ariaHidden: boolean;
};

/**
 * Decide how a box in the given `showDialog` state is presented.
 *
 * **Not `visibility: hidden`, and not `display: none`.** Both take the whole subtree out of hit
 * testing, which is a different statement from "do not draw this": with either of them the box is
 * not merely invisible, it is unreachable, and so is everything a host has rendered inside it. The
 * box used to be hidden that way while also asking for `pointer-events: auto` on the same element -
 * two instructions that cannot both be followed, and the one that lost is the one that was meant.
 * What it cost: a panel inside the box could not be scrolled, tapped or dismissed while the box was
 * away, and nothing said why, because the elements were all still there and all still styled to
 * receive the pointer.
 *
 * Transparency says only "do not draw this", which is what hiding the box means. It costs a stacking
 * context, which this element already has wherever the stage is scaled to fit, and it leaves the box
 * in the accessibility tree - so a hidden box is marked `aria-hidden` here rather than relying on a
 * side effect of how it is drawn.
 *
 * **No `pointer-events` of its own, in either state.** Whether a box is reachable at all is its
 * layer's to say, not the box's: a scene parked behind a returnable jump keeps a layer that covers
 * the stage with nothing in it, and that layer turns the pointer off for everything inside it. A box
 * asserting `pointer-events: auto` would overrule that and go back to swallowing the clicks meant
 * for the scene in front of it. The old hidden state did assert it, which was harmless only because
 * it was paired with a rule that removed the box from hit testing anyway.
 */
export function resolveDialogVisibility(shown: boolean): DialogVisibility {
    if (shown) {
        return { className: "", ariaHidden: false };
    }
    return { className: "opacity-0", ariaHidden: true };
}
