import React from "react";
import { NvlContainer } from "./NvlContainer";
import { NvlDialogList } from "./NvlDialogList";
import { INvlContainerProps } from "./type";

export function DefaultNvlContainer(_props: INvlContainerProps) {
    return (
        <NvlContainer
            className="bg-black/80 text-white"
        >
            <NvlDialogList />
        </NvlContainer>
    );
}

export default DefaultNvlContainer;
