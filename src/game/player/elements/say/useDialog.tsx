import { useSentenceContext } from "./context";
import { Word } from "@lib/game/nlcore/common/elements";

export type DialogContext = {
    done: boolean;
    text: string;
};

export function useDialog() {
    const {finished, words} = useSentenceContext();
    const text = Word.getText(words);

    return {
        done: finished,
        text,
    };
}

