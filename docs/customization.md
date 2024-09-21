# Customization

## Custom Elements Styles

There are two ways you can customize your elements styles:

### Add classes to the elements

You can add classes to the elements to customize the styles.

```tsx
"use client";

import {Game, GameProviders, Player} from "narraleaf-react";
import {useState} from "react";

export default function App() {
    const [game] = useState<Game>(new Game({
        elementStyles: {
            say: {
                // make sure you have tailwindcss installed to use these classes
                container: "rounded-lg shadow-md p-4 bg-white",
                textSpan: "text-lg text-black font-bold",

                // or use your own class
                // container: "my-say-container",
                // textSpan: "my-say-text",
            },
            menu: {
                // make sure you have tailwindcss installed to use these classes
                // for customizing the menu element
                choiceButton: "bg-[url(/static/images/choice.png)] bg-no-repeat bg-cover"
            }
        }
    }));

    return (
        <GameProviders game={game}>
            <Player />
        </GameProviders>
    );
}
```

### Use your own components (advanced)

You can use your own components to render the elements.  
You can copy the default components from the [source code](/src/game/player/elements) and modify them.

For example, you can create a custom `say` component using [Say.tsx](/src/game/player/elements/say/Say.tsx)

```tsx
"use client";

import {Game, GameProviders, MenuElementProps, Isolated, Say} from "narraleaf-react";
import {useState} from "react";

function myMenuComponent(
    {
        prompt,
        choices,
        afterChoose,
    }: Readonly<MenuElementProps>) {

    const {game} = useGame();

    function choose(choice: Choice) {
        afterChoose(choice);
    }

    return (
        <>
            {/* menu prompt */}
            <Isolated className={"absolute"}>
                <div className="absolute w-full h-full">
                    {prompt && <Say action={{sentence: prompt}} useTypeEffect={false} className="z-10"/>}
                </div>
            </Isolated>

            {/* menu choices */}
            <Isolated className={"absolute"}>
                <div className="absolute flex flex-col items-center justify-center w-full h-full">
                    {/*  read more in examples  */}
                </div>
            </Isolated>
        </>
    );
}

export default function App() {
    function handlePlayerReady({game}) {
        game.useComponent<"menu">(Game.ComponentTypes.say, myMenuComponent);
    }

    return (
        <GameProviders>
            <Player onReady={handlePlayerReady} />
        </GameProviders>
    );
}
```

