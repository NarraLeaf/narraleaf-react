import type { NvlDialogEntry, NvlState } from "@player/gameState";
import type { TransformDefinitions } from "@core/elements/transform/type";
import React from "react";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface INvlContainerProps {}

export interface NvlContainerProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface NvlDialogListProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface NvlDialogItemProps {
    entry: NvlDialogEntry;
    index: number;
    className?: string;
    style?: React.CSSProperties;
}

export interface NvlContextValue {
    state: NvlState;
    dialogs: NvlDialogEntry[];
    isActive: boolean;
    isVisible: boolean;
    transitionOptions: Partial<TransformDefinitions.CommonTransformProps> | null;
}
