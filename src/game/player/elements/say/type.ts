import {Sentence} from "@core/elements/text";

export interface SayElementProps {
    action: {
        sentence: Sentence;
    }
    onClick?: () => void;
    useTypeEffect?: boolean;
    className?: string;
}

