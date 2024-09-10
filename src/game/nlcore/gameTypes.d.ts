import {ClientGame} from "../game";
import {ContentNode, RawData} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ElementStateRaw} from "@core/elements/story";
import {PlayerStateData} from "@player/gameState";
import {StorableData} from "@core/save/type";


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
export type CalledActionResult<T extends keyof LogicAction.ActionContents = any> = {
    [K in keyof LogicAction.ActionContents]: {
        type: T extends undefined ? K : T;
        node: ContentNode<LogicAction.ActionContents[T extends undefined ? K : T]> | null;
    }
}[keyof LogicAction.ActionContents];



