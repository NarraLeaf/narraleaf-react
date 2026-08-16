import { Game } from "@core/game";
import { useGame } from "@lib/game/nlcore/common/player";
import { onlyIf } from "@lib/util/data";
import { DialogProps } from "@player/elements/say/type";
import { Nametag, usePreference } from "@player/libElements";
import { useRatio } from "@player/provider/ratio";
import clsx from "clsx";
import React, { useEffect, useRef, useState } from "react";
import { useDialogContext } from "./context";
import { DialogOverlayContext } from "./dialogOverlay";
import { Texts } from "./Sentence";
import { DialogState } from "./UIDialog";
import { KeyBindingType } from "@lib/game/nlcore/game/types";
import { useKeyBinding } from "../../lib/keyMap";
import Avatar from "./Avatar";
import { motion, useIsPresent } from "motion/react";

const defaultDialogTextProps = {
    defaultColor: "#000",
    fontSize: 16,
    fontWeight: 400,
    fontWeightBold: 700,
    fontFamily: "sans-serif",
} as const;

function BaseDialog({
    children,
    initial,
    transition,
    ...props
}: DialogProps) {
    const game = useGame();
    const dialog = useDialogContext();
    const { ratio } = useRatio();
    const [showDialog] = usePreference(Game.Preferences.showDialog);
    const dialogRef = useRef<HTMLDivElement>(null);
    const [nextKeyBinding] = useKeyBinding(KeyBindingType.nextAction);
    const isPresent = useIsPresent();
    // State rather than a ref: the overlay element has to reach the context on the render after it
    // is attached, and a ref would leave every popup rendered on the first pass with nowhere to go.
    const [overlayNode, setOverlayNode] = useState<HTMLDivElement | null>(null);

    function onElementClick() {
        if (dialog.config.gameState.isAdvanceSuspended()) return;
        dialog.requestComplete();
    }

    useEffect(() => {
        if (!window) {
            console.warn("Failed to add event listener, window is not available\nat Say.tsx: onElementClick");
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore OS auto-repeat so holding the key advances only once per press
            if (e.repeat) return;
            // Something drawn over the line — a popup on an inline word — has the player's attention
            // and their keystrokes with it.
            if (dialog.config.gameState.isAdvanceSuspended()) return;
            if (game.keyMap.match(KeyBindingType.nextAction, e.key)) {
                dialog.requestComplete();
            }
        };
        window.addEventListener("keydown", handleKeyDown);

        const token = dialog.events.on(DialogState.Events.simulateClick, () => {
            if (dialogRef.current) {
                dialogRef.current.click();
            }
        });

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            token.cancel();
        };
    }, [dialog, nextKeyBinding]);

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
        <div data-element-type={"dialog"} className="absolute w-full h-full">
            <div
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
                ref={dialogRef}
            >
                <DialogOverlayContext value={overlayNode}>
                    <motion.div
                        {...props}
                        initial={dialog.config.suppressInitialAnimation ? false : initial}
                        transition={dialog.config.suppressInitialAnimation && isPresent ? { duration: 0 } : transition}
                    >
                        {children}
                    </motion.div>
                </DialogOverlayContext>
                {/*
                  * Where anything belonging to a line but too big for it goes — the definition popup
                  * of an inline word. Last child, so it paints over the text; inside the stage's
                  * scale, so it is drawn at the same size as the line it explains; transparent to
                  * clicks except where its contents actually are.
                  */}
                <div
                    data-element-type={"dialog-overlay"}
                    className="absolute inset-0 pointer-events-none"
                    ref={setOverlayNode}
                />
            </div>
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
            <div
                className="dialog-content"
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 16,
                    width: "100%",
                    height: "100%",
                }}
            >
                <Avatar />
                <div
                    className="dialog-text-content"
                    style={{
                        minWidth: 0,
                        flex: "1 1 auto",
                    }}
                >
                    <Nametag />
                    <Texts {...defaultDialogTextProps} />
                </div>
            </div>
        </Dialog>
    );
}

