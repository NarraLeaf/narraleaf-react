# NarraLeaf React 遮罩与视觉效果能力研究

本文档整理 NarraLeaf React 引入遮罩、裁切、滤镜、混合、视频覆盖特效与遮罩转场时的功能范围、最终效果、底层 API 拆分和分阶段落地建议。

目标不是把“一个遮罩效果”作为一个独立任务来实现，而是先建立统一底层能力，再让圆形显现、擦除、眨眼、暗角、视频特效、水墨扩散等效果都复用同一套 API，避免项目后续出现多套互不兼容的遮罩系统。

## 设计目标

1. **统一入口**：Displayable、Layer、Scene 级效果应尽量复用同一套 visual effect / transform API。
2. **低侵入**：优先复用现有 `Transform`、`TransformState`、`Displayable.transform()`、Layer 渲染与 transition 管线。
3. **可序列化**：遮罩状态需要参与存档、恢复、跳转与重放，不应只存在于 React 临时状态中。
4. **资源可预加载**：图片蒙版、噪声图、图案纹理、视频 overlay 应进入资源管理，减少闪烁和加载时序问题。
5. **预设只是语法糖**：圆形显现、眨眼、暗角等 preset 不应直接操作 DOM，而应生成底层 effect/transform。
6. **视频能力后置**：真正 video alpha mask 和 canvas mask 风险较高，应在静态 mask、clip、filter、blend 稳定后再做。

## 功能总览

遮罩相关能力可以分为以下几类：

| 分类 | 功能 | 最终效果 | 建议优先级 |
| --- | --- | --- | --- |
| 基础遮罩 | 图片 Alpha 蒙版 | 用 PNG/SVG/WebP 等资源决定画面哪些区域显示 | 高 |
| 基础遮罩 | 几何裁切 clip-path | 圆形、矩形、多边形、菱形等形状裁切 | 高 |
| 基础遮罩 | 圆形显现/关闭 | 画面从圆点展开或收缩到黑屏 | 高 |
| 基础遮罩 | 方向性擦除 | 新画面从某方向覆盖旧画面 | 高 |
| 屏幕效果 | 暗角/聚焦遮罩 | 四周变暗，中心或指定区域突出 | 高 |
| 屏幕效果 | 眨眼/闭眼 | 上下黑幕合拢再打开，模拟闭眼/醒来 | 高 |
| 样式效果 | CSS filter | 模糊、灰度、亮度、对比度、老照片等 | 高 |
| 样式效果 | mix-blend-mode | 火焰、光斑、魔法阵、故障叠加 | 中高 |
| 动态效果 | 视频 overlay | 用视频叠加实现雨、火、噪声、故障等屏幕效果 | 中高 |
| 动态效果 | 动态噪声遮罩 | 画面以颗粒、雪花、故障形式显隐 | 中 |
| 动态效果 | 墨迹/水彩扩散 | 水墨或液体形状扩散揭示新画面 | 中 |
| 转场效果 | MaskTransition | 用遮罩控制场景或背景切换 | 中高 |
| 高级效果 | Video alpha mask / canvas mask | 使用视频亮度/alpha 作为真实动态遮罩 | 后置 |

## 推荐的底层 API 分层

这些效果不应各自实现一套系统，而应收敛到以下底层 API。

### 1. VisualEffect Transform 字段

第一阶段应把可表达视觉效果的字段纳入 transform 类型，例如：

```ts
type VisualEffectTransformProps = {
  maskImage?: string;
  maskSize?: string;
  maskPosition?: string;
  maskRepeat?: string;
  maskMode?: string;
  clipPath?: string;
  filter?: string;
  backdropFilter?: string;
  mixBlendMode?: string;
};
```

这些字段应优先平铺进现有 transform props，而不是新增独立 action 系统。这样它们可以自然复用现有链式 action、动画、状态保存、skip 和 Layer 能力。

### 2. 统一 DOM Style Resolver

需要一个统一解析位置，把 transform 中的视觉效果字段转换成 React DOM style：

- `maskImage` -> `maskImage` 与 `WebkitMaskImage`
- `maskSize` -> `maskSize` 与 `WebkitMaskSize`
- `maskPosition` -> `maskPosition` 与 `WebkitMaskPosition`
- `maskRepeat` -> `maskRepeat` 与 `WebkitMaskRepeat`
- `clipPath` -> `clipPath`
- `filter` -> `filter`
- `backdropFilter` -> `backdropFilter` 与 `WebkitBackdropFilter`
- `mixBlendMode` -> `mixBlendMode`

重点是不要在 Image、Text、Layer、Video 中分别实现多套样式解析逻辑。

### 3. Displayable 链式 API

在 `Displayable` 基类上提供统一入口：

```ts
displayable.effect({
  maskImage: "url(mask.png)",
  maskSize: "cover",
  clipPath: "circle(50% at 50% 50%)",
  filter: "blur(4px)",
  mixBlendMode: "screen",
});
```

并提供便捷 API：

```ts
displayable.mask(maskSrc);
displayable.clearMask();
displayable.clip("circle(50% at 50% 50%)");
displayable.filter("blur(4px)");
displayable.blend("screen");
displayable.backdrop("blur(8px)");
```

这些方法内部应统一转为 `Transform`，不建议为遮罩新增一套 action types。

### 4. Effect Resource / Preload

遮罩经常依赖资源：

- mask 图片
- 水墨扩散图
- 噪声图
- 破碎玻璃图
- 魔法阵图
- overlay 视频

图片类资源应注册到现有 `srcManager` 和 preload 管线中。否则首次显示可能闪烁，也不利于存档恢复和资源分析。

第一版可先支持 image mask preload，视频 overlay resource 在 OverlayEffect 阶段再接入。

### 5. Effect Scope API

效果作用域建议分为：

1. **Displayable 级**：单个角色、图片、文本。
2. **Layer 级**：背景层、角色层、UI 层整体效果。
3. **Scene / Fullscreen 级**：眨眼、暗角、聚光灯、全屏噪声。

全屏效果不建议直接在 Player 根节点里增加大量特殊分支。更稳的方式是引入一个专用 effect layer，本质仍然是 Layer，并复用 Displayable 的 effect API。

示例：

```ts
scene.effectLayer().filter("blur(4px)");
scene.effectLayer().mask(vignetteMask);
```

### 6. Preset API

Preset 只应作为语法糖：

```ts
circleReveal(layer, { duration: 800 });
blink(scene.effectLayer(), { closeDuration: 300, hold: 200, openDuration: 400 });
wipe(backgroundLayer, { direction: "left", duration: 600 });
```

Preset 内部应生成底层 transform/effect，而不是直接操作 DOM。

### 7. OverlayEffect API

视频、噪声、火焰、雨水、扫描线、故障等覆盖特效应使用独立 OverlayEffect，不要污染现有剧情 Video 语义。

OverlayEffect 默认特征：

- 不阻塞剧情推进
- `pointer-events: none`
- 支持 `opacity`
- 支持 `mixBlendMode`
- 支持 `filter`
- 支持 `loop`
- 支持 `muted`
- 可挂到 effect layer 或屏幕 effect 区域

示例：

```ts
scene.addOverlayEffect(new OverlayEffect({
  src: noiseVideo,
  type: "video",
  opacity: 0.4,
  blendMode: "screen",
  loop: true,
}));
```

### 8. MaskTransition API

遮罩转场应在基础 mask/clip/effect 稳定后实现。它应扩展现有 transition 体系，而不是另起调度系统。

第一版可从背景图转场开始：

```ts
scene.setBackground(nextBg, maskTransition({
  mask: inkMask,
  duration: 1200,
}));
```

后续再扩展到 Layer 或全屏 Scene 转场。

### 9. Dynamic MaskSource / Canvas Mask

真正视频 alpha mask 和 canvas mask 放到最后。

建议支持多种 render mode：

```ts
renderMode: "css" | "overlay" | "canvas";
```

- `css`：静态图片 mask / CSS gradient / clip-path。
- `overlay`：视频叠加 + blend mode + opacity。
- `canvas`：hidden video + canvas 抽帧生成真实动态 alpha mask。

默认应使用稳定的 `css` 或 `overlay`，`canvas` 作为高级能力和性能敏感能力。

## 分阶段落地建议

### Phase 1：VisualEffect Transform 基础字段

目标：让引擎能表达 mask、clip、filter、blend。

产物：

- transform 类型字段
- transform state 支持
- 序列化支持

不做：

- 不做 preset
- 不做视频
- 不做场景转场

### Phase 2：DOM Style Resolver

目标：让 transform 字段真正作用到 DOM。

产物：

- 统一样式映射
- Image/Text/Layer 复用
- WebKit mask/backdrop 兼容属性

不做：

- 不在每个组件里分别写一套遮罩解析

### Phase 3：Displayable Effect API

目标：给用户统一链式 API。

产物：

- `effect()`
- `mask()`
- `clearMask()`
- `clip()`
- `filter()`
- `clearFilter()`
- `blend()`
- `backdrop()`

不做：

- 不新增遮罩 ActionTypes

### Phase 4：Effect Resource / Preload

目标：让 mask 图片、纹理、噪声等资源进入 preload。

产物：

- 图片 mask resource 注册
- preload 管线接入
- 未预加载 warning

不做：

- 不立即实现复杂视频资源系统

### Phase 5：Effect Layer / Scope API

目标：支持 Layer、Scene、Fullscreen 作用域。

产物：

- scene effect layer
- layer-level effect
- fullscreen effect 统一入口

不做：

- 不在 Player 里为每种全屏遮罩写特殊分支

### Phase 6：Preset API

目标：把底层能力包装成常见演出。

第一批 preset：

- `circleReveal`
- `circleClose`
- `wipe`
- `vignette`
- `blink`
- `spotlight`

不做：

- 不让 preset 绕过底层 API

### Phase 7：OverlayEffect

目标：承接视频特效和屏幕覆盖效果。

产物：

- video overlay
- noise overlay
- fire overlay
- blend/filter/opacity 支持

不做：

- 不做真正视频 alpha mask
- 不复用剧情 Video 的阻塞语义

### Phase 8：MaskTransition

目标：支持场景、背景、Layer 遮罩转场。

产物：

- mask transition
- dissolve transition
- wipe transition

不做：

- 不另起一套调度系统

### Phase 9：Dynamic MaskSource / Canvas Mask

目标：实现高级动态遮罩。

产物：

- video alpha mask
- canvas mask
- procedural noise
- 性能降级策略

不做：

- 不影响前面稳定 API

## 功能效果详细说明

### 图片 Alpha 蒙版

用一张黑白或透明图片作为遮罩，决定另一个画面元素哪些区域显示、哪些区域隐藏。

最终效果：角色、背景或 CG 不再以矩形显示，而是只出现在羽毛、水墨、破碎玻璃、魔法阵、相框等图案中。

适合场景：梦境回忆、局部 CG 展示、镜子/窗户视角、墨迹显现、破碎画面。

### 几何裁切 Clip Path

用圆形、椭圆、多边形、矩形、菱形等形状裁切元素。

最终效果：画面从圆点展开，角色出现在菱形窗口中，UI 面板拥有斜切角，背景只显示在特定形状中。

适合场景：章节转场、科幻 UI、头像框、圆形显现、对角线擦除。

### 圆形显现 / 圆形关闭

经典 iris transition。画面从小圆点向外展开，或从全屏收缩成圆点。

最终效果：模拟主角睁眼、闭眼、昏迷醒来、镜头聚焦某个物品。

适合场景：章节结束、梦境开始/结束、侦探聚焦线索、电影化转场。

### 方向性擦除

新画面从左、右、上、下或对角方向覆盖旧画面。

最终效果：画面像幕布、扫描线或百叶窗一样打开。

适合场景：地点移动、普通场景切换、章节切换、UI 面板展开。

### 暗角 / 聚焦遮罩

在屏幕四周添加黑色或彩色渐变，让注意力集中到中心或指定区域。

最终效果：画面边缘变暗，中心保持明亮；或只有一个聚光区域可见。

适合场景：濒死、恐怖、回忆、魔法污染、镜头聚焦、手电筒搜索。

### 眨眼 / 闭眼遮罩

上下黑幕向中间闭合，再重新打开。

最终效果：模拟第一人称闭眼、醒来、昏倒、眼前一黑。

适合场景：主角醒来、昏迷、死亡、梦境切换、亲密场景闭眼。

### CSS Filter

对元素或 Layer 应用模糊、灰度、亮度、对比度、怀旧、饱和度等滤镜。

最终效果：背景模糊、回忆褪色、恐怖场景变暗、受伤时红屏或低清晰度。

适合场景：梦境、眩晕、老照片、时间停止、灵异场景、镜头失焦。

### Mix Blend Mode

让图片、颜色层或视频以 multiply、screen、overlay、difference 等方式与下层画面混合。

最终效果：火焰视频叠加在画面上、魔法阵发光、噪声造成故障感、光斑照亮场景。

适合场景：魔法、火焰、屏幕故障、旧电影颗粒、幽灵显现。

### 视频 Overlay

用视频作为非阻塞覆盖层，而不是剧情视频。

最终效果：雨水、火焰、噪声、扫描线、魔法阵、故障纹理等动态效果叠加在画面上。

适合场景：恐怖、科幻、魔法、战斗、梦境、监控录像。

### 动态噪声遮罩

用噪声图片、噪声视频或程序噪声让画面颗粒化显现或消失。

最终效果：角色像电子信号一样出现，场景由雪花噪声逐渐稳定，画面随机溶解。

适合场景：AI 故障、记忆损坏、监控录像、电子幽灵、恐怖演出。

### 墨迹 / 水彩扩散

用墨迹、水彩、液体扩散形状控制画面显隐。

最终效果：一滴墨从屏幕中央扩散，新场景随墨迹出现；角色像水彩被冲散一样消失。

适合场景：古风、文学、梦境、回忆、角色死亡、信件内容浮现。

### 设备视角遮罩

模拟望远镜、狙击镜、摄像机、门缝、猫眼、夜视仪等观察方式。

最终效果：屏幕大部分变黑，只保留圆形、矩形或门缝形可视区域，并可叠加准星或扫描线。

适合场景：侦探观察、潜入、监控、科幻 UI、恐怖窥视。

### 文字遮罩

让图片、渐变或视频只显示在文字内部。

最终效果：章节标题文字内部播放火焰、星空或噪声，文字外部透明。

适合场景：章节标题、角色名登场、OP/ED 字幕、魔法咒文、系统警告。

### 屏幕破碎遮罩

用破碎玻璃或裂纹图案控制画面显隐。

最终效果：屏幕出现裂纹，画面碎裂，碎片之间露出黑色或下一场景。

适合场景：精神崩溃、战斗冲击、现实破裂、恐怖跳变。

### 书页 / 翻页遮罩

模拟书页翻动、纸张掀开、相册翻页。

最终效果：当前场景像纸张一样被翻过去，下一张 CG 出现在下面。

适合场景：回忆相册、章节切换、日记系统、童话绘本、档案浏览。

## 推荐 MVP

如果只做第一版，建议选择以下能力：

1. Displayable / Layer 支持 CSS mask。
2. Displayable / Layer 支持 clip-path。
3. Displayable / Layer 支持 filter。
4. Displayable / Layer 支持 mix-blend-mode。
5. mask 图片进入 preload。
6. 提供 scene effect layer。
7. 内置 `circleReveal`、`circleClose`、`wipe`、`vignette`、`blink` 五个 preset。

这套 MVP 可以覆盖大部分常见视觉小说遮罩演出：角色局部显隐、背景圆形展开、场景横向擦除、黑边聚焦、眨眼转场、回忆暗角、故障滤镜、图片蒙版和图案化 CG 展示。

## 最终建议

遮罩不应作为一个孤立模块实现，而应作为 NarraLeaf React 视觉效果系统的一部分。

推荐从 `Transform` 和 `Displayable` 的底层视觉样式能力开始，让 Image、Text、Layer、Scene effect layer 都使用同一套字段和链式 API。随后再添加资源预加载、预设、OverlayEffect、MaskTransition 和高级动态 MaskSource。

这样可以保证后续每个 agent 或每个阶段的代码都沿着同一套 API 演进，避免出现多个互相割裂的遮罩系统。
