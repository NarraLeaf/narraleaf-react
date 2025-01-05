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
import {Character, Menu, Scene, Word} from "narraleaf-react";
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
     * 约翰·史密斯: 这是我的第一个NarraLeaf视觉小说
     * 约翰·史密斯: 开始编辑 src/story.js 并享受旅程！
     */
    johnSmith
        .say("你好世界！")
        .say("这是我的第一个NarraLeaf视觉小说")
        .say`开始编辑 ${Word.color("src/story.js", "#0000ff")} 并享受旅程！`,

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
    new Menu("开始旅程")
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

阅读更多 [🛠React.NarraLeaf.com](https://react.narraleaf.com)

### 例子

```bash
npx create-react-app nlr-app --template my-first-narraleaf-app
```

然后开始

```bash
npm start
```

## 许可

> NarraLeaf-React 在 MPL-2.0 许可下发布。
>
> 我们在2024年9月24日更新了许可证

## 贡献

我们欢迎所有贡献。  
如果您有任何想法，请提出问题或拉取请求。


