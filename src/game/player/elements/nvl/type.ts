import type { NvlDialogEntry, NvlState } from "@player/gameState";
import type { TransformDefinitions } from "@core/elements/transform/type";
import React from "react";

export interface INvlContainerProps {
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
