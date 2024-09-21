![](./docs/nlr-logo-banner.png)

# NarraLeaf-React

A React visual novel player framework

## What is NarraLeaf-React?

NarraLeaf-React is a lightweight front-end visual novel player.  
NL focuses on visual novel playing, so the user interface can be customized very easily.

It doesn't use any rendering libraries and can be used on any web platform (e.g. Electron)

## Why NarraLeaf-React?

- **Lightweight**: NarraLeaf-React is a front-end framework, and it doesn't use any rendering libraries.
- **Customizable**: You can customize the UI as you like, even replace the whole components.
- **Easy to use**: It is easy to use and has a simple API that is built for developers. Based on OOP principles.
- **Built for React**: It is built for React!
- **Cross-platform**: It can be used on any web platform (e.g. Electron)

## Get Started

### Install

```bash
npm install narraleaf-react
```

### Documentation

- [Quick Start](./docs/quick-start.md)
- [Customization](./docs/customization.md)

Read more in [🛠React.NarraLeaf.com](https://react.narraleaf.com)

### Example

```tsx
"use client";

import {Character, Scene, Story, Image, Player, GameProviders} from "narraleaf-react";

export default function App() {

    const character1 = new Character("character1");
    const image1 = new Image({
        src: "https://placehold.it/200x200",
    })

    const story = new Story("My First NarraLeaf Story").entry(
        new Scene("scene1").action([
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
        ])
    );

    function handleOnReady({game}) {
        game.getLiveGame().newGame();
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
Narraleaf-React tries to cache the images before showing them, but it is recommended to enable cache on your server.

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

## License

> NarraLeaf-React is licensed under the MIT License.

## Contributing

We welcome all contributions.  
If you have any ideas, just open an issue or a pull request.


