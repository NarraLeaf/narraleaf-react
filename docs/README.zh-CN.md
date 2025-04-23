![](nlr-logo-banner.png)

# NarraLeaf-React

[English](../README.md) | 简体中文

一个基于React的视觉小说播放器框架

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
const scene1 = new Scene("场景1_你好_世界", {
    background: "/background/scene1_hello_world.jpg",
});

const johnSmith = new Character("约翰·史密斯");
const johnDoe = new Character("约翰·多");

scene1.action([
    /**
     * 约翰·史密斯: 你好世界！
     * 约翰·史密斯: 这是我的第一个 **NarraLeaf** 视觉小说
     * 约翰·史密斯: 开始编辑 src/story.js 并享受旅程！
     */
    johnSmith
        .say("你好世界！")
        .say`这是我的第一个 ${b("NarraLeaf")} 视觉小说`
        .say`开始编辑 ${c("src/story.js", "#00f")} 并享受旅程！`,

    /**
     * 约翰·多: 对了，别忘了查看文档！
     */
    johnDoe.say("对了，别忘了查看文档！"),

    /**
     * Menu: 开始旅程
     *   > 是的，我会！
     *     - 约翰·史密斯: 太好了！让我们开始旅程！
     *     - 约翰·史密斯: 如果您有任何问题，可以在GitHub上提出问题。
     *   > 不，我要查看文档
     *     - 约翰·史密斯: 当然！慢慢来！
     */
    Menu.promp("开始旅程")
        .choose("是的，我会！", [
            johnSmith
                .say("太好了！让我们开始旅程！")
                .say("如果您有任何问题，可以在GitHub上提出问题。")
        ])
        .choose("不，我要查看文档", [
            johnSmith.say("当然！慢慢来！")
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
        - [Displayable](https://react.narraleaf.com/documentation/core/elements/displayable)
        - [图层](https://react.narraleaf.com/documentation/core/elements/layer)
        - [服务](https://react.narraleaf.com/documentation/core/elements/service)
        - [视频](https://react.narraleaf.com/documentation/core/elements/video)
    - [动画](https://react.narraleaf.com/documentation/core/animation)
    - [游戏](https://react.narraleaf.com/documentation/core/game)
    - [插件](https://react.narraleaf.com/documentation/core/plugin)
    - [实用工具](https://react.narraleaf.com/documentation/core/utils)
- [播放器](https://react.narraleaf.com/documentation/player)
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


