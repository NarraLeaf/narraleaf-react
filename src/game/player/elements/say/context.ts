import { GameState } from "@lib/game/nlcore/common/game";
import { SayElementProps } from "./type";
import React from "react";
import { Sentence } from "@core/elements/character/sentence";
import { Character } from "@core/elements/character";
import { Word } from "@core/elements/character/word";
import { Pausing } from "@core/elements/character/pause";

interface SayContext extends SayElementProps {
}

export const SayContext = React.createContext<SayContext | null>(null);

export function useSayContext() {
    const context = React.useContext(SayContext);
    if (!context) {
        throw new Error("useSayContext must be used within a SayContext");
    }
    return context;
}

export interface SentenceContext {
    sentence: Sentence;
    gameState: GameState;
    finished: boolean;
    useTypeEffect: boolean;
    onCompleted?: () => void;
    count: number;
    words: Word<Pausing | string>[];
}

export const SentenceContext = React.createContext<SentenceContext | null>(null);

export function useSentenceContext() {
    const context = React.useContext(SentenceContext);
    if (!context) {
        throw new Error("useSentenceContext must be used within a SentenceContext");
    }
    return context;
}

