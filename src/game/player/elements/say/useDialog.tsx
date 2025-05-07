import { useDialogContext } from "./context";
import { Word } from "@lib/game/nlcore/common/elements";

/**
 * Represents the context of a dialog, containing information about its completion status
 * and the text content.
 */
export type DialogContext = {
    /** Whether the dialog has finished displaying */
    done: boolean;
    /** The text content of the dialog */
    text: string;
};

/**
 * A custom hook that provides access to the current dialog's state and content.
 * It retrieves the dialog information from the sentence context and processes
 * the words to generate the final text.
 * 
 * @returns {DialogContext} An object containing the dialog's completion status and text content
 */
export function useDialog() {
    const dialog = useDialogContext();
    const text = Word.getText(dialog.config.evaluatedWords);

    return {
        done: dialog.isEnded(),
        text,
    };
}

