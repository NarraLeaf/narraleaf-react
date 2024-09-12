![](./docs/nlr-logo-md.png)

# NarraLeaf-React

A React visual novel player framework

## What is NarraLeaf-React?

NarraLeaf-React is a lightweight front-end visual novel player.  
NL focuses on visual novel playing, so the user interface can be customized very easily.

It doesn't use any rendering libraries and can be used on any web platform (e.g. Electron)

## Get Started

### Install

```bash
npm install narraleaf-react
```

### Example

```tsx
"use client";

import { Character, Scene, Story, Image, Game, Player, GameProviders } from "narraleaf-react";

export default function App() {
    const story = new Story("My First NarraLeaf Story");

    const scene1 = new Scene("scene1");

    const character1 = new Character("character1");
    const image1 = new Image({
        src: "https://placehold.it/200x200",
    })

    scene1.action([
        // Show image1 for 1 second
        image1.show({
            duration: 1000,
        }).toActions(),

        // Say something
        character1
            .say("Hello, world!")
            .say("This is my first NarraLeaf story.")
            .say("Start editing this file and enjoy the journey!")
            .toActions(),
    ]);

    story.entry(scene1);

    function handleOnReady(game: Game) {
        game.getLiveGame().loadStory(story);
        game.getLiveGame().newGame();
        console.log("Game is ready!", game);
    }

    return (
        <GameProviders>
            <Player
                story={story}
                onReady={handleOnReady}
                width="100vw"
                height="100vh"
            />
        </GameProviders>
    );
}
```

Read more in [Quick Start](./docs/quick-start.md)

### Performance

Please enable image cache for a better performance.

for NextJS, add this to your `next.config.js`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
    async headers() {
        return [
            {
                source: '/YOUR_IMAGE_ENDPOINT/(.*)', // ex: /static/images/(.*)
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            }
        ]
    }
};

export default nextConfig;
```

## Documentation

in progress...

## License

> NarraLeaf-React is licensed under the MIT License.

## Contributing

We welcome all contributions.  
If you have any ideas, just open an issue or a pull request.


