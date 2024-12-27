import {BooleanValueKeyOf, EventDispatcher} from "@lib/util/data";

/**@internal */
type PreferenceEventToken = {
    cancel: () => void;
};

/**@internal */
type StringKeyof<T> = Extract<keyof T, string>;

export class Preference<T extends Record<string, string | boolean | number | null | undefined>> {
    static EventTypes = {
        "event:game.preference.change": "event:game.preference.change",
    } as const;

    public readonly events: EventDispatcher<{
        "event:game.preference.change": [StringKeyof<T>, any];
    }> = new EventDispatcher();

    constructor(private readonly settings: T) {
    }

    public setPreference<K extends StringKeyof<T>>(key: K, value: T[K]) {
        this.settings[key] = value;
        this.events.emit(Preference.EventTypes["event:game.preference.change"], key, value);
    }

    public getPreference<K extends StringKeyof<T>>(key: K): T[K] {
        return this.settings[key];
    }

    public getPreferences(): T {
        return this.settings;
    }

    public onPreferenceChange<U extends StringKeyof<T>>(key: U, listener: (value: T[U]) => void): PreferenceEventToken;
    public onPreferenceChange(listener: (key: StringKeyof<T>, value: T[StringKeyof<T>]) => void): PreferenceEventToken;
    public onPreferenceChange<U extends StringKeyof<T>>(arg0: U | ((key: StringKeyof<T>, value: T[StringKeyof<T>]) => void), listener?: (value: T[U]) => void): PreferenceEventToken {
        const event = this.events.on(Preference.EventTypes["event:game.preference.change"], (key, value) => {
            if (typeof arg0 === "string") {
                if (arg0 === key && listener) {
                    listener(value);
                }
            } else {
                arg0(key, value);
            }
        });
        return {
            cancel: () => this.events.off(Preference.EventTypes["event:game.preference.change"], event),
        };
    }

    /**
     * Import preferences
     *
     * Note: this will override the existing preferences and trigger the change event
     */
    public importPreferences(preferences: Partial<T>) {
        for (const key in preferences) {
            if (Object.prototype.hasOwnProperty.call(preferences, key)) {
                this.setPreference(key as StringKeyof<T>, preferences[key] as T[StringKeyof<T>]);
            }
        }
    }

    /**
     * Export preferences
     */
    public exportPreferences(): Partial<T> {
        const preferences: Partial<T> = {};
        for (const key in this.settings) {
            if (Object.prototype.hasOwnProperty.call(this.settings, key)) {
                preferences[key] = this.settings[key];
            }
        }
        return preferences;
    }

    public togglePreference<K extends BooleanValueKeyOf<T>>(key: K) {
        this.setPreference(key, !this.getPreference(key) as T[K]);
    }
}
