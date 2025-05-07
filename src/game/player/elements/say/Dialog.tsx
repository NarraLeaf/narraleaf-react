import { GameState } from "@core/common/game";
import { Game } from "@core/game";
import { useGame } from "@lib/game/nlcore/common/player";
import { onlyIf } from "@lib/util/data";
import { DialogProps } from "@player/elements/say/type";
import Inspect from "@player/lib/Inspect";
import { Nametag, usePreference } from "@player/libElements";
import { useRatio } from "@player/provider/ratio";
import clsx from "clsx";
import React, { useEffect } from "react";
import { useDialogContext } from "./context";
import { Texts } from "./Sentence";

function BaseDialog({
    children,
    ...props
}: DialogProps) {
    const game = useGame();
    const gameState = game.getLiveGame().getGameState()!;
    const dialog = useDialogContext();
    const { ratio } = useRatio();
    const [showDialog] = usePreference(Game.Preferences.showDialog);

    function onElementClick() {
        dialog.requestComplete();
    }

    useEffect(() => {
        if (!window) {
            console.warn("Failed to add event listener, window is not available\nat Say.tsx: onElementClick");
            return;
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            if (game.config.nextKey.includes(e.key)) {
                dialog.requestComplete();
            }
        };

        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [dialog]);

    useEffect(() => {
        return gameState.events.on(GameState.EventTypes["event:state.player.skip"], () => {
            gameState.logger.log("NarraLeaf-React: Say", "Skipped");
            dialog.forceSkip();
        }).cancel;
    }, [dialog]);

    useEffect(() => {
        const event = game.preference.onPreferenceChange(Game.Preferences.autoForward, (autoForward) => {
            if (autoForward && dialog.isEnded()) {
                dialog.tryScheduleAutoForward();
            } else {
                dialog.cancelAutoForward();
            }
        });
        return () => {
            event.cancel();
        };
    }, [dialog]);

    return (
        <div data-element-type={"dialog"} className="w-full h-full">
            <Inspect.Div
                tag={"say.aspectScaleContainer"}
                color={"blue"}
                border={"dashed"}
                className={clsx(
                    "absolute bottom-0 w-full h-full",
                    !showDialog && "invisible pointer-events-auto"
                )}
                onClick={onElementClick}
                style={{
                    ...onlyIf<React.CSSProperties>(game.config.useAspectScale, {
                        maxWidth: game.config.dialogWidth,
                        maxHeight: game.config.dialogHeight,
                        transform: `scale(${ratio.state.scale})`,
                        transformOrigin: "bottom left",
                        width: game.config.width,
                        height: game.config.height,
                    }),
                }}
            >
                <div {...props}>
                    {children}
                </div>
            </Inspect.Div>
        </div>
    );
}

export function RawDialog(props: DialogProps) {
    return <BaseDialog {...props} />;
}

/**
 * Context-based wrapper component
 * Provides integration with the say context
 */
export function Dialog({ children, ...props }: DialogProps) {
    const context = useDialogContext();

    if (!context.config.action.sentence || !context.config.action.words) {
        return null;
    }

    return (
        <BaseDialog {...props}>
            {children}
        </BaseDialog>
    );
}

// Export Dialog as default for backward compatibility
export default Dialog;

/**
 * Default dialog component with Texts as children
 */
export function DefaultDialog() {
    return (
        <Dialog>
            <Nametag />
            <Texts />
        </Dialog>
    );
}

