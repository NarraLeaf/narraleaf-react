import type {Character} from "@core/elements/character";
import type {GameState} from "@player/gameState";
import {Sentence} from "@core/elements/character/sentence";
import {Word} from "@core/elements/character/word";
import {Pausing} from "@core/elements/character/pause";
import React from "react";

export interface SayElementProps {
    action: {
        sentence: Sentence;
        character: Character | null;
        words: Word<Pausing | string>[];
    }
    /**
     * Callback function to be called when the player triggers the next action
     */
    onClick?: (skiped?: boolean) => void;
    useTypeEffect?: boolean;
    gameState: GameState;
}

export interface IDialogProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export interface IDialogElementProps extends React.HTMLAttributes<HTMLDivElement> {
    children?: never;
}

