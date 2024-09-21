import type {Sentence} from "@core/elements/text";
import type {Choice} from "@core/elements/menu";
import type {GameState} from "@player/gameState";

export interface MenuElementProps {
    prompt: Sentence;
    choices: Choice[];
    afterChoose: (choice: Choice) => void;
    state: GameState;
}
