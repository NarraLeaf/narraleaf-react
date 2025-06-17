import { FirstParam } from "@lib/util/data";
import { JSX } from "react";
import { AnimatePresence as OriginalAnimatePresence } from "motion/react";

export type AnimatePresenceComponent =
    (arg0: FirstParam<typeof OriginalAnimatePresence>) => JSX.Element;

export const AnimatePresence = OriginalAnimatePresence as AnimatePresenceComponent;
