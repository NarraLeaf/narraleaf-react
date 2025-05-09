import { useEffect } from "react";
import { useDialogContext } from "./context";
import { Word } from "@lib/game/nlcore/common/elements";
import { DialogState } from "./UIDialog";
import { useFlush } from "../../lib/flush";

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
 */
export function useDialog(): DialogContext {
    const dialog = useDialogContext();
    const [flush] = useFlush(dialog.deps);
    const text = Word.getText(dialog.config.evaluatedWords);

    useEffect(() => {
        return dialog.events.on(DialogState.Events.onFlush, () => {
            flush();
        }).cancel;
    }, [dialog]);

    return {
        done: dialog.isEnded(),
        text,
    };
}

