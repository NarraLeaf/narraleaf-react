import {Character} from "@core/elements/character";
import {Choice} from "@core/elements/menu";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Pausing} from "@core/elements/character/pause";
import {TextEvent} from "@core/elements/character/textEvent";

export type Clickable<T, U = undefined> = {
    action: T;
    onClick: U extends undefined ? () => void : (arg0: U) => void;
};
export type TextElement = {
    character: Character | null;
    sentence: Sentence;
    id: string;
    words: Word<Pausing | string | TextEvent>[];
};
export type MenuElement = {
    prompt: Sentence | null;
    choices: Choice[];
    words: Word<Pausing | string | TextEvent>[] | null;
};