import {ContentNode, RawData} from "@core/action/tree/actionTree";
import {LogicAction} from "@core/action/logicAction";
import {ElementStateRaw} from "@core/elements/story";
import {PlayerStateData} from "@player/gameState";
import {StorableData} from "@core/store/type";
import {MenuComponent, SayComponent} from "@player/elements/type";


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
    version: string;
    player: {
        contentContainerId: string;
        aspectRatio: number;
        minWidth: number;
        minHeight: number;
    };
    elements: {
        say: {
            /**
             * See [Key_Values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values)
             */
            skipKeys: string[];
            textSpeed: number;
            use: SayComponent;
        },
        img: {
            /**
             * If true, the game will show a warning when loading takes longer than `elements.img.slowLoadThreshold`
             */
            slowLoadWarning: boolean;
            slowLoadThreshold: number;
        },
        menu: {
            use: MenuComponent;
        }
    },
    elementStyles: {
        say: {
            /**
             * Custom class for the say container
             * Ex: "rounded-md shadow-md" for rounded and shadowed container
             */
            container: string;
            nameText: string;
            textContainer: string;
            textSpan: string;
        },
        menu: {
            container: string;
            choiceButton: string;
            choiceButtonText: string;
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



