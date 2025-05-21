<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
  <img alt="NarraLeaf Logo" src="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
</picture>

<h1 align="center">NarraLeaf-React</h1>

<h4 align="center">A React visual novel player framework</h3>

<p align="center">English | <a href="docs/README.zh-CN.md">简体中文</a></p>


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
import {Character, Menu, Scene, c, b} from "narraleaf-react";
```

```typescript
const scene1 = new Scene("Scene1: Hello World", {
  background: "/link/to/background.jpg",
});

const jS = new Character("John Smith");
const jD = new Character("John Doe");

scene1.action([
  jS`Hello, world!`,
  jS`This is my first ${b("NarraLeaf")} story.`,
  jS`Start editing ${c("src/story.js", "#00f")} and enjoy the journey!`,

  jD`Also, don't forget to check out the ${c("documentation", "#00f")}!`,

  "By the way, the documentation is available on https://react.narraleaf.com/documentation",
  "You can also visit the website for demo and more information.",

  Menu.prompt("Start the journey")

    .choose("Yes I will!", [
      jS`Great! Let's start the journey!`,
      jS`You can open issues on GitHub if you have any questions.`
    ])

    .choose("No, I'm going to check the documentation", [
      jS`Sure! Take your time!`
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

- [Introduction](https://react.narraleaf.com/documentation/introduction)
- [Quick Start](https://react.narraleaf.com/documentation/quick-start)
- [Installation](https://react.narraleaf.com/documentation/installation)
- [Basic](https://react.narraleaf.com/documentation/basic)
  - [Create a Scene](https://react.narraleaf.com/documentation/basic/create-scene)
  - [Add Actions](https://react.narraleaf.com/documentation/basic/add-actions)
  - [Show Dialog](https://react.narraleaf.com/documentation/basic/show-dialog)
  - [Show Image](https://react.narraleaf.com/documentation/basic/show-image)
  - [Play Story](https://react.narraleaf.com/documentation/basic/play-story)
  - [Make Choices](https://react.narraleaf.com/documentation/basic/make-choices)
  - [Play Sound](https://react.narraleaf.com/documentation/basic/sound)
  - [Store Data](https://react.narraleaf.com/documentation/basic/store-data)
  - [Conditional](https://react.narraleaf.com/documentation/basic/conditional)
  - [Voice](https://react.narraleaf.com/documentation/basic/voice)
  - [Manage Preferences](https://react.narraleaf.com/documentation/basic/manage-preferences)
- [Solutions](https://react.narraleaf.com/documentation/solutions)
  - [Customizing the font](https://react.narraleaf.com/documentation/solutions/font)
  - [Migration from Ren'Py](https://react.narraleaf.com/documentation/solutions/from-renpy)
- [Core](https://react.narraleaf.com/documentation/core)
  - [Elements](https://react.narraleaf.com/documentation/core/elements)
    - [Scene](https://react.narraleaf.com/documentation/core/elements/scene)
    - [Character](https://react.narraleaf.com/documentation/core/elements/character)
      - [Sentence](https://react.narraleaf.com/documentation/core/elements/character/sentence)
      - [Word](https://react.narraleaf.com/documentation/core/elements/character/word)
      - [Pause](https://react.narraleaf.com/documentation/core/elements/character/pause)
    - [Image](https://react.narraleaf.com/documentation/core/elements/image)
    - [Sound](https://react.narraleaf.com/documentation/core/elements/sound)
    - [Menu](https://react.narraleaf.com/documentation/core/elements/menu)
    - [Script](https://react.narraleaf.com/documentation/core/elements/script)
    - [Condition](https://react.narraleaf.com/documentation/core/elements/condition)
    - [Control](https://react.narraleaf.com/documentation/core/elements/control)
    - [Text](https://react.narraleaf.com/documentation/core/elements/text)
    - [Persistent](https://react.narraleaf.com/documentation/core/elements/persistent)
    - [Story](https://react.narraleaf.com/documentation/core/elements/story)
    - [Displayable](https://react.narraleaf.com/documentation/core/elements/displayable)
    - [Layer](https://react.narraleaf.com/documentation/core/elements/layer)
    - [Service](https://react.narraleaf.com/documentation/core/elements/service)
    - [Video](https://react.narraleaf.com/documentation/core/elements/video)
  - [Animation](https://react.narraleaf.com/documentation/core/animation)
  - [Game](https://react.narraleaf.com/documentation/core/game)
  - [Plugin](https://react.narraleaf.com/documentation/core/plugin)
  - [Utils](https://react.narraleaf.com/documentation/core/utils)
- [Player](https://react.narraleaf.com/documentation/player)
  - [Player](https://react.narraleaf.com/documentation/player/player)
  - [GameProviders](https://react.narraleaf.com/documentation/player/game-providers)
  - Hooks
    - [useGame](https://react.narraleaf.com/documentation/player/hooks/useGame)
    - [usePreferences](https://react.narraleaf.com/documentation/player/hooks/usePreferences)
    - [useRouter](https://react.narraleaf.com/documentation/player/hooks/useRouter)
    - [useDialog](https://react.narraleaf.com/documentation/player/hooks/useDialog)
  - [Page Router](https://react.narraleaf.com/documentation/player/page-router)
  - [Dialog](https://react.narraleaf.com/documentation/player/dialog)
  - [Notification](https://react.narraleaf.com/documentation/player/notification)
  - [Menu](https://react.narraleaf.com/documentation/player/menu)
- About
  - [License](https://react.narraleaf.com/documentation/info/license)
  - [Incompatible Changes](https://react.narraleaf.com/documentation/info/incompatible-changes)

Read more in [🛠React.NarraLeaf.com](https://react.narraleaf.com)

## License

> NarraLeaf-React is licensed under the MPL-2.0 License.
>
> We updated the license to MPL-2.0 on 2024-9-24.

## Contributing

We welcome all contributions.  
If you have any ideas, just open an issue or a pull request.


