import { EventDispatcher } from "@lib/util/data";
import { KeyBindingType, WebKeyboardKey } from "./types";

export type KeyBindingValue = WebKeyboardKey[] | WebKeyboardKey | null;

export class KeyMap {
    public readonly events: EventDispatcher<{
        "event:keyMap.change": [KeyBindingType | string, KeyBindingValue];
    }> = new EventDispatcher();

    constructor(private keyMap: Record<KeyBindingType | string, KeyBindingValue> = {}) {}

    /**
     * Set a key binding (case-insensitive)
     * @param type - The type of key binding
     * @param value - The value of the key binding
     * 
     * @example
     * ```ts
     * // Set the skip action to the space key
     * game.keyMap.setKeyBinding(KeyBindingType.skipAction, " ");
     * 
     * // Press either Control or F3 to skip the action
     * game.keyMap.setKeyBinding(KeyBindingType.skipAction, ["Control", "F3"]);
     * 
     * // Remove the key binding
     * game.keyMap.setKeyBinding(KeyBindingType.skipAction, null);
     * ```
     */
    public setKeyBinding(type: KeyBindingType | string, value: KeyBindingValue) {
        this.keyMap[type] = value;
        this.events.emit("event:keyMap.change", type, value);
    }

    /**
     * Get a key binding
     * @param type - The type of key binding
     * @returns The value of the key binding
     * 
     * @example
     * ```ts
     * const skipKeyBinding = game.keyMap.getKeyBinding(KeyBindingType.skipAction);
     * // ["Control"]
     * ```
     */
    public getKeyBinding(type: KeyBindingType | string): KeyBindingValue {
        return this.keyMap[type] ?? null;
    }

    /**
     * Add a key binding (case-insensitive)
     * @param type - The type of key binding
     * @param value - The value of the key binding
     * 
     * @example
     * ```ts
     * game.keyMap.addKeyBinding(KeyBindingType.skipAction, "F3");
     * // Now you can press F3 to skip the action
     * 
     * // equivalent to
     * const currentKeyBinding = game.keyMap.getKeyBinding(KeyBindingType.skipAction);
     * game.keyMap.setKeyBinding(
     *  KeyBindingType.skipAction,
     *  [
     *      ...(Array.isArray(currentKeyBinding) ? currentKeyBinding : 
     *          currentKeyBinding !== null ? [currentKeyBinding] : []),
     *      "F3"
     *  ]
     * );
     * ```
     */
    public addKeyBinding(type: KeyBindingType | string, value: KeyBindingValue) {
        if (value === null) {
            return;
        }

        const oldValue = this.getKeyBinding(type) ?? [];
        const toArray = (value: Exclude<KeyBindingValue, null>) => Array.isArray(value) ? value : [value];

        if (Array.isArray(oldValue)) {
            this.setKeyBinding(type, [...oldValue, ...toArray(value)]);
        } else {
            this.setKeyBinding(type, [oldValue, ...toArray(value)]);
        }
    }

    public getKeyBindings(): Record<KeyBindingType | string, KeyBindingValue> {
        return this.keyMap;
    }

    public onKeyBindingChange(type: KeyBindingType | string, listener: (value: KeyBindingValue) => void) {
        return this.events.on("event:keyMap.change", (t, value) => {
            if (t === type) {
                listener(value);
            }
        });
    }

    public importKeyBindings(keyBindings: Record<KeyBindingType | string, KeyBindingValue>) {
        for (const type in keyBindings) {
            if (Object.prototype.hasOwnProperty.call(keyBindings, type)) {
                this.setKeyBinding(type, keyBindings[type]);
            }
        }
    }

    public exportKeyBindings(): Record<KeyBindingType | string, KeyBindingValue> {
        return this.keyMap;
    }

    /**
     * Check if a key matches a key binding (case-insensitive)
     * @param type - The type of key binding
     * @param key - The key to check
     * @returns True if the key matches the key binding, false otherwise
     * 
     * @example
     * ```ts
     * // if the skip action is set to [" ", "F3"]
     * game.keyMap.match(KeyBindingType.skipAction, " "); // true
     * game.keyMap.match(KeyBindingType.skipAction, "F3"); // true
     * game.keyMap.match(KeyBindingType.skipAction, "A"); // false
     * ```
     */
    public match(type: KeyBindingType | string, key: WebKeyboardKey) {
        const value = this.getKeyBinding(type);
        if (value === null) {
            return false;
        }
        if (Array.isArray(value)) {
            return value.includes(key) || value.some(v => v.toLowerCase() === key.toLowerCase());
        }
        return value === key || value.toLowerCase() === key.toLowerCase();
    }
}
