import React, { createContext, useContext, useEffect, useState } from "react";
import { useGame } from "@lib/game/player/provider/game-state";
import { GameState, NvlDialogEntry, NvlState } from "@player/gameState";
import { NvlContextValue } from "./type";
import type { TransformDefinitions } from "@core/elements/transform/type";

const defaultNvlState: NvlState = {
    active: false,
    visible: false,
    sessionId: null,
    dialogs: [],
    options: null,
};

const NvlContext = createContext<NvlContextValue>({
    state: defaultNvlState,
    dialogs: [],
    isActive: false,
    isVisible: false,
    transitionOptions: null,
});

export function useNvl(): NvlContextValue {
    return useContext(NvlContext);
}

export function useNvlDialogs(): NvlDialogEntry[] {
    const { dialogs } = useNvl();
    return dialogs;
}

export function useIsNvlMode(): boolean {
    const { isActive } = useNvl();
    return isActive;
}

export function useIsNvlVisible(): boolean {
    const { isVisible } = useNvl();
    return isVisible;
}

export interface NvlProviderProps {
    children: React.ReactNode;
}

export function NvlProvider({ children }: NvlProviderProps) {
    const game = useGame();
    const gameState = game.getLiveGame().getGameState()!;
    const [state, setState] = useState<NvlState>(() => gameState.getNvlState());
    const [transitionOptions, setTransitionOptions] = useState<Partial<TransformDefinitions.CommonTransformProps> | null>(null);

    useEffect(() => {
        const enterToken = gameState.events.on(GameState.EventTypes["event:state.nvl.enter"], (sessionId, options) => {
            setState(gameState.getNvlState());
            setTransitionOptions(options?.showTransition || null);
        });

        const exitToken = gameState.events.on(GameState.EventTypes["event:state.nvl.exit"], () => {
            setState(gameState.getNvlState());
            setTransitionOptions(null);
        });

        const appendToken = gameState.events.on(GameState.EventTypes["event:state.nvl.dialogAppend"], () => {
            setState(gameState.getNvlState());
        });

        const visibilityToken = gameState.events.on(GameState.EventTypes["event:state.nvl.visibilityChange"], (visible, options) => {
            setState(gameState.getNvlState());
            setTransitionOptions(options || null);
        });

        return () => {
            enterToken.cancel();
            exitToken.cancel();
            appendToken.cancel();
            visibilityToken.cancel();
        };
    }, [gameState]);

    const contextValue: NvlContextValue = {
        state,
        dialogs: state.dialogs,
        isActive: state.active,
        isVisible: state.visible,
        transitionOptions,
    };

    return (
        <NvlContext.Provider value={contextValue}>
            {children}
        </NvlContext.Provider>
    );
}

export default NvlContext;
