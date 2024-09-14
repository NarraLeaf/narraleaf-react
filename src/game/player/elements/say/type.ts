import {Sentence} from "@core/elements/text";

export interface SayElementProps {
    action: {
        sentence: Sentence;
    }
    /**
     * Callback function to be called when player triggers the next action
     */
    onClick?: () => void;
    useTypeEffect?: boolean;
    className?: string;
}

