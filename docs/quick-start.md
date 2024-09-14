# Quick Start

## Installation

```bash
npm install narraleaf-react
```

## Basic Concepts

NarraLeaf-React is a React framework for creating NarraLeaf stories.
It is based on OOP and provides a set of classes (called "elements") to help you build your story.

The biggest difference between NarraLeaf-React and other visual novel engines is that NarraLeaf-React is a front-end
framework.
It doesn't use any rendering libraries, and **it does not care about the UI**.
So you can customize the UI as you like.

NarraLeaf use elements to represent the game objects, such as characters, images, sounds, and scripts.  
The top-level element is the `Story`, which contains multiple `Scene`s.
Each `Scene` contains multiple elements, such as `Character`, `Image`, `Sound`, `Menu`, `Script`, `Condition`,
and `Control`.

Here is a table of the elements:

| Element   | Description                                                    |
|-----------|----------------------------------------------------------------|
| Story     | The top-level element that contains multiple scenes.           |
| Scene     | A scene that contains multiple **actions**.                    |
| Character | A character that can say something.                            |
| Image     | An image that can be shown on the screen.                      |
| Sound     | A sound that can be played.                                    |
| Menu      | A menu that contains multiple options.                         |
| Script    | A script that can be executed.                                 |
| Condition | A condition that can be used to control the flow of the story. |
| Control   | A control that can be used to control the flow of the story.   |

and this is a tree that shows the relationship between the elements:

```
Story
└── Scene
    ├── Character
    │   └── Sentence
    │       └── Word
    ├── Image
    ├── Sound
    ├── Menu
    ├── Script
    │   └── Lambda (deprecated)
    ├── Condition
    └── Control
Animation
├── Transform
└── Transition
```

Not to be confused, there are some difference between other engines and NarraLeaf:

- Image **only display the image**, character **only say the text**, they are separated.
- Scene represents "label" in Ren'Py or procedure in other engines. **It is not a scene in the traditional sense.** So
  you should use `Scene` to represent a procedure, not a scene.
- Transform and Transition can be used on both Image and Scene.

## Set up Player

To set up a player, you have to place the `GameProvider` to the parent component of the player.

Here is an example:

```tsx
import {GameProvider, Player} from "narraleaf-react";

export default function Parent() {
    return (
        <GameProvider>
            <Player/>
        </GameProvider>
    );
}
```

If you want to initialize the game manually, you can use the `useGame` hook:

```tsx
import {useGame} from "narraleaf-react";

export default function Child() {
    // this have to be called in a child component of the `GameProvider`
    const {game, setGame} = useGame();

    useEffect(() => {
        game.getLiveGame().newGame(); // create new game
    }, []);

    // or instantiate the game manually
    useEffect(() => {
        setGame(new Game({
            elements: {
                say: {
                    textSpeed: 100.
                }
            }
        }));
    }, []);

    return <Player/>;
}

```

If you don't want to use the hook, you can also use the `onReady` callback of the `Player` component:

```tsx
import {Game} from "narraleaf-react";

export default function Child() {
    const handleOnReady = (game: Game) => {
        game.getLiveGame().newGame();
    }

    return (
        <GameProvider>
            <Player onReady={handleOnReady}/>
        </GameProvider>
    );
}
```

## Write Your First Story

### Create a React project

First, create a new React project:

```bash
npx create-react-app my-narraleaf-story
cd my-narraleaf-story
npm install narraleaf-react
```

### Write a simple story

Let's write a simple story that displays an image and says something.

You need to create a `src/story.ts` file _(or somewhere else you like)_:

```ts
// src/story.ts

// First, import the necessary classes
import {Story, Scene, Character, Image} from "narraleaf-react";

// Create a new story
// The name of the story is human-readable and is used for debugging purposes
const story = new Story("My First NarraLeaf Story");

// Create a new scene
// The name of the scene should be unique and is used for debugging purposes
const scene1 = new Scene("scene1_hello_world");

// then let's create a "character" with image
const character1 = new Character("me");
const character1Image = new Image({
    src: "https://placehold.it/200x200",
});

// Add actions to the scene
scene1.action([
    // Show the image for 1 second
    character1Image.show({
        duration: 1000,
    }).toActions(),

    // Say something
    character1
        .say("Hello, world!")
        .say("This is my first NarraLeaf story.")
        .say("Start editing this file and enjoy the journey!")
        .toActions(),
]);

// Why we use "toActions()"?
// Because we can chain the actions together, and "toActions()" is used to end the chain.
// It is necessary to use "toActions()" at the end of each chain.
// Do not call "toActions()" at other places, it will confuse the framework.

// Add the scene to the story
story.entry(scene1);

export {story};
```

Then, you can use the `Player` component to play the story  
You need to edit the `src/App.tsx` file: _(or page.tsx, App.jsx, page.jsx, etc.)_

Replace the content with the following code:

```tsx
// src/App.tsx

import {GameProvider, Player} from "narraleaf-react";
import {story} from "./story";

export default function App() {
    return (
        <GameProvider>
            <Player
                story={story}
                width="100vw"
                height="100vh"
                onReady={(game: Game) => {
                    game.getLiveGame().newGame();
                }}
            />
        </GameProvider>
    );
}
```

### Run the story

Now you can run the story:

```bash
npm dev
```

and open your browser to `http://localhost:3000`.

Congratulations! You have written your first NarraLeaf story!

For other actions, you can check the [Examples](./examples) folder.  
You can use NarraLeaf-React to create more complex stories, such as adding sounds, menus, conditions, and animations.
That's so cool!

For customizing the UI, please check the [Customization](./customization.md) document.

