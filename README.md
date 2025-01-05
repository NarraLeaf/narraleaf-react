![](docs/nlr-logo-banner.png)

# NarraLeaf-React

English | [简体中文](docs/README.zh-CN.md)

A React visual novel player framework

## What is NarraLeaf-React?

NarraLeaf-React is a lightweight front-end visual novel player.  
NL focuses on visual novel playing, so the user interface can be customized very easily.

It doesn't use any rendering libraries and can be used on any web platform (e.g. Electron)

## Why NarraLeaf-React?

- **Lightweight**: NarraLeaf-React is a front-end framework, and it doesn't use any rendering libraries.
- **Customizable**: You can customize the UI as you like, even replace the whole components.
- **Easy to use**: It is easy to use and has a simple API that is built for developers. Based on OOP principles.

### Scripting

NarraLeaf-React uses TypeScript for all scripting, so you don't have to learn a whole new language to use it.

It also has a highly abstracted and easy-to-use API, for example:

```typescript
import {Character, Menu, Scene, Word} from "narraleaf-react";
```

```typescript
const scene1 = new Scene("scene1_hello_world", {
    background: "/background/scene1_hello_world.jpg",
});

const johnSmith = new Character("John Smith");
const johnDoe = new Character("John Doe");

scene1.action([
    /**
     * John Smith: Hello, world!
     * John Smith: This is my first NarraLeaf story.
     * John Smith: Start editing src/story.js and enjoy the journey!
     */
    johnSmith
        .say("Hello, world!")
        .say("This is my first NarraLeaf story.")
        .say`Start editing ${Word.color("src/story.js", "#0000ff")} and enjoy the journey!`,

    /**
     * John Doe: Also, don't forget to check out the documentation!
     */
    johnDoe.say("Also, don't forget to check out the documentation!"),
    
    /**
     * Menu: Start the journey
     *   > Yes I will!
     *     - John Smith: Great! Let's start the journey!
     *     - John Smith: You can open issues on GitHub if you have any questions.
     *   > No, I'm going to check the documentation
     *     - John Smith: Sure! Take your time!
     */
    new Menu("Start the journey")
        .choose("Yes I will!", [
            johnSmith
                .say("Great! Let's start the journey!")
                .say("You can open issues on GitHub if you have any questions.")
        ])
        .choose("No, I'm going to check the documentation", [
            johnSmith.say("Sure! Take your time!")
        ])
]);
```

For more information, please visit [🛠React.NarraLeaf.com](https://react.narraleaf.com)

## Get Started

### Install

```bash
npm install narraleaf-react
```

### Documentation

Read more in [🛠React.NarraLeaf.com](https://react.narraleaf.com)

### Example

```bash
npx create-react-app nlr-app --template my-first-narraleaf-app
```

to start

```bash
npm start
```

## License

> NarraLeaf-React is licensed under the MPL-2.0 License.
>
> We updated the license to MPL-2.0 on 2024-9-24.

## Contributing

We welcome all contributions.  
If you have any ideas, just open an issue or a pull request.


