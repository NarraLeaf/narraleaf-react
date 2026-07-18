import {DefaultDialog} from "@lib/game/player/elements/say/Dialog";
import {DefaultMenu} from "@lib/game/player/elements/menu/PlayerMenu";
import { DefaultNotification } from "@player/elements/notification/PlayerNotification";
import { DefaultNvlContainer } from "@player/elements/nvl/DefaultNvlContainer";
export const DefaultElements = {
    say: DefaultDialog,
    menu: DefaultMenu,
    notification: DefaultNotification,
    nvlDialog: DefaultNvlContainer,
} as const;

