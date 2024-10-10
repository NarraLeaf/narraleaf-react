import {Color, color} from "@core/types";
import {deepMerge} from "@lib/util/data";

export type WordConfig = {} & Color;

export class Word {
    static defaultConfig: Partial<WordConfig> = {};
    static defaultColor: color = "#000";

    static isWord(obj: any): obj is Word {
        return obj instanceof Word;
    }

    /**@internal */
    readonly text: string;
    /**@internal */
    readonly config: Partial<WordConfig>;

    constructor(text: string, config: Partial<WordConfig> = {}) {
        this.text = text;
        this.config = deepMerge<Partial<WordConfig>>(Word.defaultConfig, config);
    }
}