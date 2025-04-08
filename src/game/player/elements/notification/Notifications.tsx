import React from "react";
import {AnimatePresence} from "motion/react";
import { NotificationsProps } from "./type";
export default function Notifications({children, ...props}: NotificationsProps) {
    const AnimatePresence_ = AnimatePresence as any;

    return (
        <>
            <div {...props}>
                <AnimatePresence_>
                    {children}
                </AnimatePresence_>
            </div>
        </>
    );
}

