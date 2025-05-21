import { FirstParam } from "@lib/util/data";
import { AnimatePresence } from "framer-motion";
import { JSX } from "react";

export type AnimatePresenceComponent =
    (arg0: FirstParam<typeof AnimatePresence>) => JSX.Element;
