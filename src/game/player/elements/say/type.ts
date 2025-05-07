import type {Character} from "@core/elements/character";
import type {GameState} from "@player/gameState";
import {Sentence} from "@core/elements/character/sentence";
import { Word } from "@core/elements/character/word";
import { Pausing } from "@core/elements/character/pause";
import React from "react";

export interface SayElementProps {
    action: {
        sentence: Sentence | null;
        character: Character | null;
        words: Word<Pausing | string>[] | null;
    }
    /**
     * @deprecated
     * Callback function to be called when the player triggers the next action
     */
    onClick?: (skiped?: boolean) => void;
    onFinished?: (skiped?: boolean) => void;
    useTypeEffect?: boolean;
    gameState: GameState;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IDialogProps {};

export type DialogProps = {
    children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;
export type DialogElementProps = {
    children?: never;
} & React.HTMLAttributes<HTMLDivElement>;

export interface IDialogElementProps extends React.HTMLAttributes<HTMLDivElement> {
    children?: never;
}

export enum DialogStateType {
    Pending = "pending",
    Paused = "paused",
    Ended = "ended",
}

export interface DialogContext {
    gameState: GameState;
    action: {
        sentence: Sentence | null;
        character: Character | null;
        words: Word<Pausing | string>[] | null;
    };
    state: DialogStateType;
}

export type DialogAction = {
    sentence: Sentence | null;
    character: Character | null;
    words: Word<Pausing | string>[] | null;
}

