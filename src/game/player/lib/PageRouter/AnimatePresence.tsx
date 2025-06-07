import { FirstParam } from "@lib/util/data";
import { AnimatePresence } from "motion/react";
import { JSX } from "react";

export type AnimatePresenceComponent =
    (arg0: FirstParam<typeof AnimatePresence>) => JSX.Element;
