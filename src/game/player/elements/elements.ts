import {default as StageSay} from "@player/elements/say/Say";
import {DefaultMenu} from "@lib/game/player/elements/menu/PlayerMenu";

export const DefaultElements = {
    say: StageSay,
    menu: DefaultMenu,
} as const;

