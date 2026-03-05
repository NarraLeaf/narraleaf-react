import React from "react";
import { NvlContainer } from "./NvlContainer";
import { NvlDialogList } from "./NvlDialogList";
import { INvlContainerProps } from "./type";

export function DefaultNvlContainer({ renderDialogItem }: INvlContainerProps) {
    return (
        <NvlContainer
            className="bg-black/80 text-white p-16"
        >
            <NvlDialogList renderDialogItem={renderDialogItem} />
        </NvlContainer>
    );
}

export default DefaultNvlContainer;
