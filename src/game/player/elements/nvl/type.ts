import type { GameState, NvlDialogEntry, NvlState } from "@player/gameState";
import type { TransformDefinitions } from "@core/elements/transform/type";
import type { Word } from "@core/elements/character/word";
import type { Pausing } from "@core/elements/character/pause";
import React from "react";

export type NvlDialogProxy = {
    entry: NvlDialogEntry;
    index: number;
    isActive: boolean;
    gameState: GameState;
    words: Word<Pausing | string>[];
    useTypeEffect: boolean;
};

export interface INvlContainerProps {
    dialogs?: NvlDialogProxy[];
    renderDialogItem?: NvlDialogItemRenderer;
}

export interface NvlContainerProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface NvlDialogListProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    renderDialogItem?: NvlDialogItemRenderer;
}

export interface NvlDialogItemProps {
    entry: NvlDialogEntry;
    index: number;
    className?: string;
    style?: React.CSSProperties;
}

export interface NvlDialogItemRenderProps {
    entry: NvlDialogEntry;
    index: number;
    isActive: boolean;
    nametag: React.ReactNode;
    texts: React.ReactNode;
}

export type NvlDialogItemRenderer = (props: NvlDialogItemRenderProps) => React.ReactNode;

export interface NvlContextValue {
    state: NvlState;
    dialogs: NvlDialogEntry[];
    isActive: boolean;
    isVisible: boolean;
    transitionOptions: Partial<TransformDefinitions.CommonTransformProps> | null;
}
