

/**
 * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
 * 
 * Case-insensitive
 */
export type WebKeyboardKey = string;
export enum KeyBindingType {
    /**
     * When the player presses one of these keys, the game will show the next sentence
     *
     * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
     * @default [" "]
     */
    skipAction = "skipAction",
    /**
     * When the player presses one of these keys, the game will skip the current action
     *
     * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
     * @default ["Control"]
     */
    nextAction = "nextAction"
}

