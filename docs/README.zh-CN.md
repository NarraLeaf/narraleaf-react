<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-transparent.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
  <img alt="NarraLeaf Logo" src="https://raw.githubusercontent.com/NarraLeaf/.github/refs/heads/master/doc/banner-md-light.png">
</picture>

<h1 align="center">NarraLeaf-React</h1>

<h4 align="center">一个基于 React 的视觉小说播放器框架</h4>

<p align="center"><a href="../README.md">English</a> | 简体中文</p>


## 什么是 NarraLeaf-React?

NarraLeaf-React 是一个轻量级的前端视觉小说播放器。  
它专注于视觉小说播放，因此用户界面可以非常容易地定制。

它不使用任何渲染库，可以在任何 Web 平台上使用（例如 Electron）。

## 为什么是 NarraLeaf-React?

- **轻量级**: NarraLeaf-React 是一个前端框架，不使用任何渲染库。
- **可定制**: 您可以根据需要自定义 UI，甚至替换整个组件。
- **易于使用**: 它易于使用，具有为开发人员构建的简单 API。基于面向对象的原则。

### 脚本

NarraLeaf-React 使用 TypeScript 进行所有脚本编写，因此您无需学习全新的语言来使用它。

它还具有高度抽象和易于使用的API，例如：

```typescript
import {Character, Menu, Scene, c, b} from "narraleaf-react";
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

  "顺便说一句，文档在 https://www.narraleaf.com/zh/docs/narraleaf-react",
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

有关更多信息，请访问 [NarraLeaf-React 文档](https://www.narraleaf.com/zh/docs/narraleaf-react)。

## 立即开始

### 安装

```bash
npm install narraleaf-react
```

### 文档

- [介绍](https://www.narraleaf.com/zh/docs/narraleaf-react)
- [快速开始](https://www.narraleaf.com/zh/docs/narraleaf-react/quick-start)
- [安装](https://www.narraleaf.com/zh/docs/narraleaf-react/installation)
- [基础](https://www.narraleaf.com/zh/docs/narraleaf-react/basic)
  - [创建场景](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/create-scene)
  - [添加动作](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/add-actions)
  - [显示对话](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/show-dialog)
  - [显示图片](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/show-image)
  - [播放故事](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/play-story)
  - [作出选择](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/make-choices)
  - [声音](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/sound)
  - [储存数据](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/store-data)
  - [条件](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/conditional)
  - [配音](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/voice)
  - [管理偏好](https://www.narraleaf.com/zh/docs/narraleaf-react/basic/manage-preferences)
- [解决方案](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions)
  - [自定义字体](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/font)
  - [从 Ren'Py 迁移](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/from-renpy)
  - [快捷菜单](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/quick-menu)
  - [对话框头像](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/dialog-avatar)
  - [自定义对话框](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/custom-dialog)
  - [自定义 NVL 对话框](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/custom-nvl-dialog)
  - [自定义选项框](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/custom-menu)
  - [覆盖式设置页](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/page-overlay-settings)
  - [使用 localStorage 实现存档系统](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/save-system-localstorage)
  - [自定义通知](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/custom-notification)
  - [使用 localStorage 实现画廊服务](https://www.narraleaf.com/zh/docs/narraleaf-react/solutions/gallery-service-localstorage)
- [核心](https://www.narraleaf.com/zh/docs/narraleaf-react/core)
  - [元素](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements)
    - [场景](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/scene)
    - [角色](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/character)
      - [句子](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/character/sentence)
      - [单词](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/character/word)
      - [停顿](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/character/pause)
    - [图片](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/image)
    - [声音](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/sound)
    - [选项](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/menu)
    - [脚本](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/script)
    - [条件](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/condition)
    - [控制](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/control)
    - [文本](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/text)
    - [持久化](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/persistent)
    - [故事](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/story)
    - [可显示元素](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/displayable)
    - [图层](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/layer)
    - [服务](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/service)
    - [视频](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/video)
    - [内置 Gallery](https://www.narraleaf.com/zh/docs/narraleaf-react/core/elements/built-in/gallery)
  - [动画](https://www.narraleaf.com/zh/docs/narraleaf-react/core/animation)
    - [Transform](https://www.narraleaf.com/zh/docs/narraleaf-react/core/animation/transform)
    - [Transition](https://www.narraleaf.com/zh/docs/narraleaf-react/core/animation/transition)
  - [游戏](https://www.narraleaf.com/zh/docs/narraleaf-react/core/game)
    - [LiveGame](https://www.narraleaf.com/zh/docs/narraleaf-react/core/game/live-game)
    - [Storable](https://www.narraleaf.com/zh/docs/narraleaf-react/core/game/storable)
    - [Preference](https://www.narraleaf.com/zh/docs/narraleaf-react/core/game/preference/preference)
    - [Key Map](https://www.narraleaf.com/zh/docs/narraleaf-react/core/game/key-map)
    - [Hooks](https://www.narraleaf.com/zh/docs/narraleaf-react/core/game/hooks)
  - [插件](https://www.narraleaf.com/zh/docs/narraleaf-react/core/plugin)
  - [实用工具](https://www.narraleaf.com/zh/docs/narraleaf-react/core/utils)
- [播放器](https://www.narraleaf.com/zh/docs/narraleaf-react/player)
  - [Player](https://www.narraleaf.com/zh/docs/narraleaf-react/player/player)
  - [FixedAspectRatioContainer](https://www.narraleaf.com/zh/docs/narraleaf-react/player/fixed-aspect-ratio-container)
  - [GameProviders](https://www.narraleaf.com/zh/docs/narraleaf-react/player/game-providers)
  - [Hooks](https://www.narraleaf.com/zh/docs/narraleaf-react/player/hooks)
  - [布局路由](https://www.narraleaf.com/zh/docs/narraleaf-react/player/page-router)
  - [对话框](https://www.narraleaf.com/zh/docs/narraleaf-react/player/dialog)
  - [通知](https://www.narraleaf.com/zh/docs/narraleaf-react/player/notification)
  - [选项框](https://www.narraleaf.com/zh/docs/narraleaf-react/player/menu)
  - [NvlContainer](https://www.narraleaf.com/zh/docs/narraleaf-react/player/nvl-container)
- 关于
  - [许可](https://www.narraleaf.com/zh/docs/narraleaf-react/info/license)
  - [不兼容的更改](https://www.narraleaf.com/zh/docs/narraleaf-react/info/incompatible-changes)

阅读更多内容：[NarraLeaf-React 文档](https://www.narraleaf.com/zh/docs/narraleaf-react)。

## 许可

> NarraLeaf-React 在 MPL-2.0 许可下发布。
>
> 我们在 2024 年 9 月 24 日更新了许可证。

## 贡献

我们欢迎所有贡献。  
如果您有任何想法，请提出问题或拉取请求。

