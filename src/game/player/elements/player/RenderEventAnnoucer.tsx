import { useRef } from "react";
import { useEffect } from "react";
import { GameState } from "../../gameState";

export function RenderEventAnnoucer({ gameState }: { gameState: GameState }) {
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(() => {
            setTimeout(() => {
                gameState.events.emit(GameState.EventTypes["event:state.onRender"]);
            }, 0);
        });

        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [gameState.deps]);

    return null;
}
