import {Character} from "@core/elements/character";
import {Choice} from "@core/elements/menu";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Pausing} from "@core/elements/character/pause";

/**@internal */
export type Clickable<T, U = undefined> = {
    action: T;
    onClick: U extends undefined ? () => void : (arg0: U) => void;
};
/**@internal */
export type TextElement = {
    character: Character | null;
    sentence: Sentence;
    id: string;
    words: Word<Pausing | string>[];
};
/**@internal */
export type MenuElement = {
    prompt: Sentence | null;
    choices: Choice[];
    words: Word<Pausing | string>[] | null;
};