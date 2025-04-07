import React from "react";
import { AnimatePresence } from "motion/dist/react";
import { NotificationsProps } from "./type";

export default function Notifications({children, ...props}: NotificationsProps) {
    return (
        <>
            <div {...props}>
                <AnimatePresence>
                    {children}
                </AnimatePresence>
            </div>
        </>
    );
}

