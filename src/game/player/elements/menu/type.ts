import type {Choice} from "@core/elements/menu";
import type {GameState} from "@player/gameState";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Pausing} from "@core/elements/character/pause";
import {Chosen} from "@player/type";

export interface MenuElementProps {
    prompt: Sentence;
    choices: Choice[];
    afterChoose: (choice: Chosen) => void;
    state: GameState;
    words: Word<Pausing | string>[];
}
