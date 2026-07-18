import Isolated from "@player/lib/isolated";
import {usePreference} from "@player/lib/preferences";
import {Stage} from "@player/lib/PageRouter/Stage";
import GameMenu from "@player/elements/menu/UIMenu/Menu";
import Item from "@player/elements/menu/UIMenu/Item";
import { useUIMenuContext } from "@player/elements/menu/UIMenu/context";
import Notifications from "@player/elements/notification/Notifications";
import Texts, { TextsPreview } from "@player/elements/say/Sentence";
import Nametag from "@player/elements/say/Nametag";
import Dialog from "@player/elements/say/Dialog";
import Avatar, { useAvatar } from "@player/elements/say/Avatar";
import { useDialog } from "@player/elements/say/useDialog";
import { useVoiceState } from "@player/elements/say/useVoiceState";
import { Page, PageInjectContext } from "@player/lib/PageRouter/Page";
import { Layout, LayoutRouterProvider } from "@player/lib/PageRouter/Layout";
import { RootPath } from "@player/lib/PageRouter/router";
import { FixedAspectRatioContainer } from "@player/lib/FixedAspectRatioContainer";
import { useKeyBinding } from "./lib/keyMap";
import { useLiveGame } from "./lib/useLiveGame";
import { NvlContainer } from "@player/elements/nvl/NvlContainer";
import { DefaultNvlContainer } from "@player/elements/nvl/DefaultNvlContainer";
import { NvlDialogList, DefaultNvlDialogItem } from "@player/elements/nvl/NvlDialogList";
import { NvlProvider, useNvl, useNvlDialogs, useIsNvlMode, useIsNvlVisible } from "@player/elements/nvl/NvlContext";

export type { DialogAvatarContext } from "@player/elements/say/Avatar";
export type {
    BaseTextsProps,
    EntryTextsProps,
    RawTextsProps,
    TextAppearanceProps,
    TextsPreviewInput,
    TextsPreviewLoop,
    TextsPreviewProps,
    TextsProps,
} from "@player/elements/say/Sentence";
export type { NametagProps } from "@player/elements/say/Nametag";
export type { ItemProps } from "@player/elements/menu/UIMenu/Item";
export type { ChoiceEvaluated } from "@player/elements/menu/type";

export {
    Isolated,
    usePreference,
    Stage,
    GameMenu,
    Item,
    useUIMenuContext,
    Notifications,
    Texts,
    TextsPreview,
    Nametag,
    Dialog,
    Avatar,
    useAvatar,
    useDialog,
    useVoiceState,
    Page,
    Layout,
    LayoutRouterProvider,
    PageInjectContext,
    RootPath,
    FixedAspectRatioContainer,
    useKeyBinding,
    useLiveGame,
    NvlContainer,
    DefaultNvlContainer,
    NvlDialogList,
    DefaultNvlDialogItem,
    NvlProvider,
    useNvl,
    useNvlDialogs,
    useIsNvlMode,
    useIsNvlVisible,
};
