import React from "react";
import {Scene as GameScene} from "@core/elements/scene";
import {GameState} from "@player/gameState";
import Image from "@player/elements/image/Image";

/**@internal */
export default function BackgroundTransition({scene, state}: {
    scene: GameScene,
    state: GameState
}) {
    return (
        <div>
            <Image image={scene.state.backgroundImage} state={state} />
        </div>
    );
}

