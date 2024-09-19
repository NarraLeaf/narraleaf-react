import type {Character, Sentence} from "@core/elements/text";
import type {GameState} from "@player/gameState";

export interface SayElementProps {
    action: {
        sentence: Sentence;
        character: Character | null;
    }
    /**
     * Callback function to be called when player triggers the next action
     */
    onClick?: () => void;
    useTypeEffect?: boolean;
    className?: string;
    state: GameState;
}

