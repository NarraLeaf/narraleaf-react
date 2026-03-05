import React from "react";
import { useNvlDialogs } from "./NvlContext";
import { NvlDialogListProps, NvlDialogItemProps } from "./type";
import clsx from "clsx";
import { useGame } from "@lib/game/player/provider/game-state";
import { toHex } from "@lib/util/data";
import { motion, AnimatePresence } from "motion/react";

export function NvlDialogList({ children, className, style }: NvlDialogListProps) {
    const dialogs = useNvlDialogs();

    return (
        <div
            data-element-type="nvl-dialog-list"
            className={clsx(
                "flex flex-col space-y-4 p-4",
                className
            )}
            style={style}
        >
            <AnimatePresence mode="popLayout">
                {dialogs.map((entry, index) => (
                    <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {children ? (
                            React.Children.map(children, child => {
                                if (React.isValidElement(child)) {
                                    return React.cloneElement(child as React.ReactElement<NvlDialogItemProps>, {
                                        entry,
                                        index,
                                    });
                                }
                                return child;
                            })
                        ) : (
                            <DefaultNvlDialogItem entry={entry} index={index} />
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export function DefaultNvlDialogItem({ entry, index, className, style }: NvlDialogItemProps) {
    const game = useGame();
    const characterName = entry.character?.state.name || null;
    const characterColor = toHex(entry.character?.config.color || game.config.defaultTextColor);

    return (
        <div
            data-element-type="nvl-dialog-item"
            data-dialog-index={index}
            className={clsx(
                "nvl-dialog-item",
                className
            )}
            style={style}
        >
            {characterName && (
                <span
                    className="nvl-character-name font-bold mr-2"
                    style={{ color: characterColor }}
                >
                    {characterName}:
                </span>
            )}
            <span className="nvl-dialog-text">
                {entry.text}
            </span>
        </div>
    );
}

export default NvlDialogList;
