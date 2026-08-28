/**
 * One advance of an NVL line, decided and carried out.
 *
 * NVL differs from ADV in that the page owns the line: `requestNvlAdvance` is not a query but the
 * move itself, and it settles a line that has finished revealing without the dialog hearing about
 * it. Only when it answers `typing` is there anything left for this dialog to do - and what to do
 * then is the same rule ADV follows, {@link resolveDialogAdvanceIntent}: an advance asks the line
 * to complete, and only the skip mode forces.
 *
 * The skip key used to force here on every emission, tap included, which walked it past the pauses
 * an author wrote. It is kept out of the hook so that a test can drive it against a real dialog
 * state without a React tree.
 *
 * Comments in English per project convention.
 */

import { resolveDialogAdvanceIntent } from "../say/dialogAdvanceIntent";

/** The page state, as this module needs it. */
export type NvlAdvancePage = {
    requestNvlAdvance(dialogId: string): "ignore" | "typing" | "advance";
};

/** The part of a dialog state an advance touches. Structural, as in `dialogAdvanceIntent`. */
export type NvlAdvanceTarget = {
    forceSkip(): void;
    requestComplete(): void;
};

export type NvlAdvanceInput = {
    dialogId: string;
    /** Whether this dialog is the one holding the line. */
    active: boolean;
    /** Whether this is the skip mode rather than one advance. */
    forced: boolean;
};

/**
 * What one advance of an NVL line ended up doing.
 *
 * - `ignore` - not this dialog's to answer.
 * - `pageHandled` - the page moved on its own; there was nothing left to reveal.
 * - `requestComplete` / `forceSkip` - what was asked of the line still revealing.
 */
export type NvlAdvanceResult = "ignore" | "pageHandled" | "requestComplete" | "forceSkip";

export function applyNvlAdvance(
    page: NvlAdvancePage,
    dialog: NvlAdvanceTarget,
    { dialogId, active, forced }: NvlAdvanceInput,
): NvlAdvanceResult {
    const intent = resolveDialogAdvanceIntent({ active, forced });
    if (intent === "ignore") {
        return "ignore";
    }
    // Unconditional, and before the branch below: this is the move, not a question about it.
    if (page.requestNvlAdvance(dialogId) !== "typing") {
        return "pageHandled";
    }
    if (intent === "forceSkip") {
        dialog.forceSkip();
        return "forceSkip";
    }
    dialog.requestComplete();
    return "requestComplete";
}
