import React from "react";
import { DialogState } from "./UIDialog";

type DialogContext = DialogState;

export const DialogContext = React.createContext<DialogContext | null>(null);

export function useDialogContext() {
    const context = React.useContext(DialogContext);
    if (!context) {
        throw new Error("useDialogContext must be used within a DialogContext");
    }
    return context;
}