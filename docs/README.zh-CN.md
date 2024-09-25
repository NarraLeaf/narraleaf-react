![](./nlr-logo-banner.png)

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

## 立即开始

### 安装

```bash
npm install narraleaf-react
```

### 文档

阅读更多 [🛠React.NarraLeaf.com](https://react.narraleaf.com)

### 例子

```bash
npx create-react-app my-first-narraleaf-app --template my-first-narraleaf-app
```

然后开始

```bash
npm start
```

### 性能

请启用图像缓存以获得更好的性能。  
Narraleaf-React 尝试在显示图像之前缓存它们，但建议在服务器上启用缓存。

如果您使用NextJS，请将以下内容添加到您的 `next.config.js`:

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

## 许可

> NarraLeaf-React 在 GPL 许可下发布。
> 
> 我们在2024年9月24日更新了许可证。

## 贡献

我们欢迎所有贡献。  
如果您有任何想法，请提出问题或拉取请求。


