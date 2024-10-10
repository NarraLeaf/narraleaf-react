import type {Character} from "@core/elements/character";
import type {GameState} from "@player/gameState";
import {Sentence} from "@core/elements/character/sentence";

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

