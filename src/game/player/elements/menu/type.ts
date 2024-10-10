import type {Choice} from "@core/elements/menu";
import type {GameState} from "@player/gameState";
import {Sentence} from "@core/elements/character/sentence";

export interface MenuElementProps {
    prompt: Sentence;
    choices: Choice[];
    afterChoose: (choice: Choice) => void;
    state: GameState;
}
