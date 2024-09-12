import {Sentence} from "@core/elements/text";
import {Choice} from "@core/elements/menu";

export interface MenuElementProps {
    prompt: Sentence;
    choices: Choice[];
    afterChoose: (choice: Choice) => void;
}
