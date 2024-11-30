import React from "react";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {Text as GameText} from "@core/elements/displayable/text";
import {default as StageText} from "@player/elements/displayable/Text";
import {Image as GameImage} from "@core/elements/displayable/image";
import {default as StageImage} from "@player/elements/image/Image";


export default function Displayables(
    {state, displayable}: Readonly<{
        state: GameState;
        displayable: LogicAction.DisplayableElements[];
    }>) {
    return (<>
        {displayable.map((displayable) => {
            if (displayable instanceof GameText) {
                return <StageText state={state} text={displayable} key={"text-" + displayable.getId()}/>;
            } else if (displayable instanceof GameImage) {
                return <StageImage state={state} image={displayable} key={"image-" + displayable.getId()}/>;
            }
            throw new Error("Unsupported displayable type: " + (displayable?.["constructor"]?.["name"] || displayable));
        })}
    </>);
}
