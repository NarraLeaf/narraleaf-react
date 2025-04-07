import {DefaultDialog} from "@player/elements/say/Say";
import {DefaultMenu} from "@lib/game/player/elements/menu/PlayerMenu";
import { DefaultNotification } from "@player/elements/notification/PlayerNotification";
export const DefaultElements = {
    say: DefaultDialog,
    menu: DefaultMenu,
    notification: DefaultNotification,
} as const;

