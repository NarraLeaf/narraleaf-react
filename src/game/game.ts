import {deepMerge} from "@lib/util/data";
import {Game} from "@core/game";

export type ClientGameConfig = {};
export type ClientRequirement = {
    game: Game;
};
export type ClientGamePreference = {
    afm: boolean;
};
type ClientGamePreferenceHelper = {
    setPreference: <K extends keyof ClientGamePreference>(key: keyof ClientGamePreference, value: ClientGamePreference[K]) => void;
    getPreference: <K extends keyof ClientGamePreference>(key: keyof ClientGamePreference) => ClientGamePreference[K];
}

class BaseGame {
}

export class ClientGame extends BaseGame {
    static defaultConfig: ClientGameConfig = {};
    static defaultPreference: ClientGamePreference = {
        afm: false,
    };
    config: ClientGameConfig;
    preference: ClientGamePreference & ClientGamePreferenceHelper;
    game: Game;
    private _requirement: ClientRequirement;

    constructor(config: ClientGameConfig = {}, requirement: ClientRequirement) {
        super();
        this._requirement = requirement;
        this.config = deepMerge<ClientGameConfig>(ClientGame.defaultConfig, config);
        this.preference = {
            ...deepMerge<ClientGamePreference>(ClientGame.defaultPreference, {}),
            setPreference: (key, value) => {
                this.preference[key] = value;
            },
            getPreference: (key) => {
                return this.preference[key];
            },
        };
        this.game = requirement.game;
    }
}

