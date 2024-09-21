# Save Data

## Serialize Data

NarraLeaf Focus on playing the story, it doesn't have a built-in save system.

You can serialize the game data and save it to the local storage or a server.

```tsx
import {GameProviders, Player, Game} from "narraleaf-react";

export default function SaveData() {
    
    function handleOnReady({game}: {game: Game}) {
        const data = game.getLiveGame().serialize();
        console.log("Save data", data);
    }
    
    return (
        <GameProviders>
            <Player
                onReady={handleOnReady}
            />
        </GameProviders>
    );
}
```

## Deserialize Data

You can deserialize the game data and load it to the game.

```tsx
import {GameProviders, Player, Game} from "narraleaf-react";

export default function LoadData() {
    
    function handleOnReady({game}: {game: Game}) {
        const data = {
            // Load data from local storage or server
        };
        game.getLiveGame().deserialize(data);
    }
    
    return (
        <GameProviders>
            <Player
                onReady={handleOnReady}
            />
        </GameProviders>
    );
}
```



