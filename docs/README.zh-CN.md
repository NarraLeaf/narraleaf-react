<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
  <img alt="NarraLeaf Logo" src="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
</picture>

<h1 align="center">NarraLeaf-React</h1>

<h4 align="center">一个基于 React 的视觉小说播放器框架</h3>

<p align="center"><a href="../README.md">English</a> | 简体中文</p>


## 什么是 NarraLeaf-React?

NarraLeaf-React 是一个轻量级的前端视觉小说播放器。  
它专注于视觉小说播放，因此用户界面可以非常容易地定制。

它不使用任何渲染库，可以在任何web平台上使用（例如Electron）

## 为什么是 NarraLeaf-React?

- **轻量级**: NarraLeaf-React 是一个前端框架，不使用任何渲染库。
- **可定制**: 您可以根据需要自定义UI，甚至替换整个组件。
- **易于使用**: 它易于使用，具有为开发人员构建的简单API。基于面向对象的原则。

### 脚本

NarraLeaf-React 使用 TypeScript 进行所有脚本编写，因此您无需学习全新的语言来使用它。

它还具有高度抽象和易于使用的API，例如：

```typescript
import {Character, Menu, Scene, Word, c, b} from "narraleaf-react";
```

```typescript
const scene1 = new Scene("场景1: 你好，世界", {
  background: "/link/to/background.jpg",
});

const jS = new Character("John Smith");
const jD = new Character("John Doe");

scene1.action([
  jS`你好，世界！`,
  jS`这是我的第一个 ${b("NarraLeaf")} 故事。`,
  jS`开始编辑 ${c("src/story.js", "#00f")} 并享受旅程！`,

  jD`别忘了检查 ${c("文档", "#00f")}!`,

  "顺便说一句，文档在 https://react.narraleaf.com/documentation",
  "你也可以访问网站获取更多信息。",

  Menu.prompt("开始旅程")

    .choose("是的，我愿意！", [
      jS`太好了！让我们开始旅程！`,
      jS`如果你有任何问题，可以在 GitHub 上提出问题。`
    ])

    .choose("不，我要检查文档", [
      jS`好的，请慢慢来！`
    ])
]);
```

有关更多信息，请访问 [🛠React.NarraLeaf.com](https://react.narraleaf.com)

## 立即开始

### 安装

```bash
npm install narraleaf-react
```

### 文档

- [介绍](https://react.narraleaf.com/documentation/introduction)
- [快速开始](https://react.narraleaf.com/documentation/quick-start)
- [安装](https://react.narraleaf.com/documentation/installation)
- [基础](https://react.narraleaf.com/documentation/basic)
    - [创建场景](https://react.narraleaf.com/documentation/basic/create-scene)
    - [添加动作](https://react.narraleaf.com/documentation/basic/add-actions)
    - [显示对话](https://react.narraleaf.com/documentation/basic/show-dialog)
    - [显示图片](https://react.narraleaf.com/documentation/basic/show-image)
    - [播放故事](https://react.narraleaf.com/documentation/basic/play-story)
    - [作出选择](https://react.narraleaf.com/documentation/basic/make-choices)
    - [声音](https://react.narraleaf.com/documentation/basic/sound)
    - [储存数据](https://react.narraleaf.com/documentation/basic/store-data)
    - [条件](https://react.narraleaf.com/documentation/basic/conditional)
    - [配音](https://react.narraleaf.com/documentation/basic/voice)
    - [管理偏好](https://react.narraleaf.com/documentation/basic/manage-preferences)
- [解决方案](https://react.narraleaf.com/documentation/solutions)
    - [自定义字体](https://react.narraleaf.com/documentation/solutions/font)
    - [从Ren'Py迁移](https://react.narraleaf.com/documentation/solutions/from-renpy)
- [核心](https://react.narraleaf.com/documentation/core)
    - [元素](https://react.narraleaf.com/documentation/core/elements)
        - [场景](https://react.narraleaf.com/documentation/core/elements/scene)
        - [角色](https://react.narraleaf.com/documentation/core/elements/character)
            - [句子](https://react.narraleaf.com/documentation/core/elements/character/sentence)
            - [单词](https://react.narraleaf.com/documentation/core/elements/character/word)
            - [停顿](https://react.narraleaf.com/documentation/core/elements/character/pause)
        - [图片](https://react.narraleaf.com/documentation/core/elements/image)
        - [声音](https://react.narraleaf.com/documentation/core/elements/sound)
        - [选项](https://react.narraleaf.com/documentation/core/elements/menu)
        - [脚本](https://react.narraleaf.com/documentation/core/elements/script)
        - [条件](https://react.narraleaf.com/documentation/core/elements/condition)
        - [控制](https://react.narraleaf.com/documentation/core/elements/control)
        - [文本](https://react.narraleaf.com/documentation/core/elements/text)
        - [持久化](https://react.narraleaf.com/documentation/core/elements/persistent)
        - [故事](https://react.narraleaf.com/documentation/core/elements/story)
        - [可视化组件](https://react.narraleaf.com/documentation/core/elements/displayable)
        - [图层](https://react.narraleaf.com/documentation/core/elements/layer)
        - [服务](https://react.narraleaf.com/documentation/core/elements/service)
        - [视频](https://react.narraleaf.com/documentation/core/elements/video)
    - [动画](https://react.narraleaf.com/documentation/core/animation)
    - [游戏](https://react.narraleaf.com/documentation/core/game)
    - [插件](https://react.narraleaf.com/documentation/core/plugin)
    - [实用工具](https://react.narraleaf.com/documentation/core/utils)
- [播放器](https://react.narraleaf.com/documentation/player)
    - [Player](https://react.narraleaf.com/documentation/player/player)
    - [GameProviders](https://react.narraleaf.com/documentation/player/game-providers)
    - 钩子
    - [布局路由](https://react.narraleaf.com/documentation/player/page-router)
    - [对话框](https://react.narraleaf.com/documentation/player/dialog)
    - [通知](https://react.narraleaf.com/documentation/player/notification)
    - [选项框](https://react.narraleaf.com/documentation/player/menu)
- 关于
    - [许可](https://react.narraleaf.com/documentation/info/license)
    - [不兼容的更改](https://react.narraleaf.com/documentation/info/incompatible-changes)

阅读更多在之中 [🛠React.NarraLeaf.com](https://react.narraleaf.com)

## 许可

> NarraLeaf-React 在 MPL-2.0 许可下发布。
>
> 我们在2024年9月24日更新了许可证

## 贡献

我们欢迎所有贡献。  
如果您有任何想法，请提出问题或拉取请求。


