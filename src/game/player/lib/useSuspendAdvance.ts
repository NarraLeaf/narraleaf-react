import { useEffect } from "react";
import { useGame } from "../provider/game-state";

/**
 * Hold the line while something of yours is open.
 *
 * A popup drawn over a line — a definition of an inline word, a term the player is reading — has to
 * stop the line advancing underneath it, or the space bar that should dismiss the popup skips to
 * the next line instead. Pass `true` while it is open and the stage click, the advance key and the
 * skip key all stop reaching the dialog; the hold is released on `false`, and on unmount, so a
 * popup that disappears can never leave the game stuck.
 *
 * Several holds may be out at once; the line resumes when the last one is released.
 *
 * @param active - Whether to hold the line right now.
 * @example
 * ```tsx
 * function GlossaryTerm({children, revealed, data}: WordRenderProps<{entry: string}>) {
 *     const [open, setOpen] = useState(false);
 *     useSuspendAdvance(open);
 *     return <span onClick={() => revealed && setOpen(v => !v)}>{children}</span>;
 * }
 * ```
 */
export function useSuspendAdvance(active: boolean): void {
    const game = useGame();

    useEffect(() => {
        if (!active) {
            return;
        }
        const gameState = game.getLiveGame().getGameState();
        if (!gameState) {
            return;
        }
        return gameState.suspendAdvance();
    }, [active, game]);
}
