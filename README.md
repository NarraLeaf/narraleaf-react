![](./docs/nlr-logo-banner.png)

# NarraLeaf-React

English | [简体中文](./docs/README.zh-CN.md)

A React visual novel player framework

## What is NarraLeaf-React?

NarraLeaf-React is a lightweight front-end visual novel player.  
NL focuses on visual novel playing, so the user interface can be customized very easily.

It doesn't use any rendering libraries and can be used on any web platform (e.g. Electron)

## Why NarraLeaf-React?

- **Lightweight**: NarraLeaf-React is a front-end framework, and it doesn't use any rendering libraries.
- **Customizable**: You can customize the UI as you like, even replace the whole components.
- **Easy to use**: It is easy to use and has a simple API that is built for developers. Based on OOP principles.

## Get Started

### Install

```bash
npm install narraleaf-react
```

### Documentation

Read more in [🛠React.NarraLeaf.com](https://react.narraleaf.com)

### Example

```bash
npx create-react-app my-first-narraleaf-app --template my-first-narraleaf-app
```

to start

```bash
npm start
```

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

> NarraLeaf-React is licensed under the GPL License.
> 
> We updated the license to GPL on 2024-9-24. 

## Contributing

We welcome all contributions.  
If you have any ideas, just open an issue or a pull request.


