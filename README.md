<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
  <img alt="NarraLeaf Logo" src="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
</picture>

<h1 align="center">NarraLeaf-React</h1>

<h4 align="center">A React visual novel player framework</h4>

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

  "By the way, the documentation is available on https://www.narraleaf.com/docs/narraleaf-react",
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

For more information, please visit the [NarraLeaf-React documentation](https://www.narraleaf.com/docs/narraleaf-react).

## Get Started

### Install

```bash
npm install narraleaf-react
```

### Documentation

- [Introduction](https://www.narraleaf.com/docs/narraleaf-react)
- [Quick Start](https://www.narraleaf.com/docs/narraleaf-react/quick-start)
- [Installation](https://www.narraleaf.com/docs/narraleaf-react/installation)
- [Basic](https://www.narraleaf.com/docs/narraleaf-react/basic)
  - [Create a Scene](https://www.narraleaf.com/docs/narraleaf-react/basic/create-scene)
  - [Add Actions](https://www.narraleaf.com/docs/narraleaf-react/basic/add-actions)
  - [Show Dialog](https://www.narraleaf.com/docs/narraleaf-react/basic/show-dialog)
  - [Show Image](https://www.narraleaf.com/docs/narraleaf-react/basic/show-image)
  - [Play Story](https://www.narraleaf.com/docs/narraleaf-react/basic/play-story)
  - [Make Choices](https://www.narraleaf.com/docs/narraleaf-react/basic/make-choices)
  - [Play Sound](https://www.narraleaf.com/docs/narraleaf-react/basic/sound)
  - [Store Data](https://www.narraleaf.com/docs/narraleaf-react/basic/store-data)
  - [Conditional](https://www.narraleaf.com/docs/narraleaf-react/basic/conditional)
  - [Voice](https://www.narraleaf.com/docs/narraleaf-react/basic/voice)
  - [Manage Preferences](https://www.narraleaf.com/docs/narraleaf-react/basic/manage-preferences)
- [Solutions](https://www.narraleaf.com/docs/narraleaf-react/solutions)
  - [Customizing the Font](https://www.narraleaf.com/docs/narraleaf-react/solutions/font)
  - [Migration from Ren'Py](https://www.narraleaf.com/docs/narraleaf-react/solutions/from-renpy)
  - [Quick Menu](https://www.narraleaf.com/docs/narraleaf-react/solutions/quick-menu)
  - [Dialog Avatar](https://www.narraleaf.com/docs/narraleaf-react/solutions/dialog-avatar)
  - [Custom Dialog](https://www.narraleaf.com/docs/narraleaf-react/solutions/custom-dialog)
  - [Custom NVL Dialog](https://www.narraleaf.com/docs/narraleaf-react/solutions/custom-nvl-dialog)
  - [Custom Menu](https://www.narraleaf.com/docs/narraleaf-react/solutions/custom-menu)
  - [Page Overlay Settings](https://www.narraleaf.com/docs/narraleaf-react/solutions/page-overlay-settings)
  - [Save System with localStorage](https://www.narraleaf.com/docs/narraleaf-react/solutions/save-system-localstorage)
  - [Custom Notification](https://www.narraleaf.com/docs/narraleaf-react/solutions/custom-notification)
  - [Gallery Service with localStorage](https://www.narraleaf.com/docs/narraleaf-react/solutions/gallery-service-localstorage)
- [Core](https://www.narraleaf.com/docs/narraleaf-react/core)
  - [Elements](https://www.narraleaf.com/docs/narraleaf-react/core/elements)
    - [Scene](https://www.narraleaf.com/docs/narraleaf-react/core/elements/scene)
    - [Character](https://www.narraleaf.com/docs/narraleaf-react/core/elements/character)
      - [Sentence](https://www.narraleaf.com/docs/narraleaf-react/core/elements/character/sentence)
      - [Word](https://www.narraleaf.com/docs/narraleaf-react/core/elements/character/word)
      - [Pause](https://www.narraleaf.com/docs/narraleaf-react/core/elements/character/pause)
    - [Image](https://www.narraleaf.com/docs/narraleaf-react/core/elements/image)
    - [Sound](https://www.narraleaf.com/docs/narraleaf-react/core/elements/sound)
    - [Menu](https://www.narraleaf.com/docs/narraleaf-react/core/elements/menu)
    - [Script](https://www.narraleaf.com/docs/narraleaf-react/core/elements/script)
    - [Condition](https://www.narraleaf.com/docs/narraleaf-react/core/elements/condition)
    - [Control](https://www.narraleaf.com/docs/narraleaf-react/core/elements/control)
    - [Text](https://www.narraleaf.com/docs/narraleaf-react/core/elements/text)
    - [Persistent](https://www.narraleaf.com/docs/narraleaf-react/core/elements/persistent)
    - [Story](https://www.narraleaf.com/docs/narraleaf-react/core/elements/story)
    - [Displayable](https://www.narraleaf.com/docs/narraleaf-react/core/elements/displayable)
    - [Layer](https://www.narraleaf.com/docs/narraleaf-react/core/elements/layer)
    - [Service](https://www.narraleaf.com/docs/narraleaf-react/core/elements/service)
    - [Video](https://www.narraleaf.com/docs/narraleaf-react/core/elements/video)
    - [Built-in Gallery](https://www.narraleaf.com/docs/narraleaf-react/core/elements/built-in/gallery)
  - [Animation](https://www.narraleaf.com/docs/narraleaf-react/core/animation)
    - [Transform](https://www.narraleaf.com/docs/narraleaf-react/core/animation/transform)
    - [Transitions](https://www.narraleaf.com/docs/narraleaf-react/core/animation/transition)
  - [Game](https://www.narraleaf.com/docs/narraleaf-react/core/game)
    - [LiveGame](https://www.narraleaf.com/docs/narraleaf-react/core/game/live-game)
    - [Storable](https://www.narraleaf.com/docs/narraleaf-react/core/game/storable)
    - [Preference](https://www.narraleaf.com/docs/narraleaf-react/core/game/preference/preference)
    - [Key Map](https://www.narraleaf.com/docs/narraleaf-react/core/game/key-map)
    - [Hooks](https://www.narraleaf.com/docs/narraleaf-react/core/game/hooks)
  - [Plugin](https://www.narraleaf.com/docs/narraleaf-react/core/plugin)
  - [Utils](https://www.narraleaf.com/docs/narraleaf-react/core/utils)
- [Player](https://www.narraleaf.com/docs/narraleaf-react/player)
  - [Player](https://www.narraleaf.com/docs/narraleaf-react/player/player)
  - [FixedAspectRatioContainer](https://www.narraleaf.com/docs/narraleaf-react/player/fixed-aspect-ratio-container)
  - [GameProviders](https://www.narraleaf.com/docs/narraleaf-react/player/game-providers)
  - [Hooks](https://www.narraleaf.com/docs/narraleaf-react/player/hooks)
  - [LayoutRouter](https://www.narraleaf.com/docs/narraleaf-react/player/page-router)
  - [Dialog](https://www.narraleaf.com/docs/narraleaf-react/player/dialog)
  - [Notification](https://www.narraleaf.com/docs/narraleaf-react/player/notification)
  - [Menu](https://www.narraleaf.com/docs/narraleaf-react/player/menu)
  - [NvlContainer](https://www.narraleaf.com/docs/narraleaf-react/player/nvl-container)
- About
  - [License](https://www.narraleaf.com/docs/narraleaf-react/info/license)
  - [Incompatible Changes](https://www.narraleaf.com/docs/narraleaf-react/info/incompatible-changes)

Read more in the [NarraLeaf-React documentation](https://www.narraleaf.com/docs/narraleaf-react).

## License

> NarraLeaf-React is licensed under the MPL-2.0 License.
>
> We updated the license to MPL-2.0 on 2024-9-24.

## Contributing

We welcome all contributions.  
If you have any ideas, just open an issue or a pull request.

