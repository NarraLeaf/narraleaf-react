import {ClientGame} from "../game";
import {ContentNode, RawData} from "./save/actionTree";
import {StorableData} from "./save/storable";
import {LogicAction} from "@lib/game/game/logicAction";
import {ElementStateRaw} from "@lib/game/game/elements/story";
import {PlayerStateData} from "@lib/ui/components/player/gameState";


export interface SavedGame {
    name: string;
    version: string;
    meta: {
        created: number;
        updated: number;
    };
    game: {
        store: { [key: string]: StorableData; };
        elementState: RawData<ElementStateRaw>[];
        nodeChildIdMap: Record<string, string>;
        stage: PlayerStateData;
        currentScene: number;
        currentAction: string | null;
    };
}

export type GameConfig = {
    clientGame: ClientGame;
    app: {
        info: {
            version: string;
        },
        player: {
            contentContainerId: string;
        }
    }
};
export type GameSettings = {
    volume: number;
};
export type CalledActionResult<T extends keyof LogicAction.ActionContents = undefined> = {
    [K in keyof LogicAction.ActionContents]: {
        type: T extends undefined ? K : T;
        node: ContentNode<LogicAction.ActionContents[T extends undefined ? K : T]>;
    }
}[keyof LogicAction.ActionContents];



