import React from "react";
import {GameState} from "@player/gameState";
import {LogicAction} from "@core/action/logicAction";
import {Text as GameText} from "@core/elements/text";
import {default as StageText} from "@player/elements/displayable/Text";


export default function Displayables(
    {state, displayable}: Readonly<{
        state: GameState;
        displayable: LogicAction.Displayable[];
    }>) {
    return (<>
        {displayable.map((displayable) => {
            if (displayable instanceof GameText) {
                return <StageText state={state} text={displayable} key={"text-" + displayable.getId()}/>;
            }
            throw new Error("Unsupported displayable type: " + (displayable?.["constructor"]?.["name"] || displayable));
        })}
    </>);
}
