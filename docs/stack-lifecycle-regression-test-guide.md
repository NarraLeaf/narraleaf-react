# Action 栈与生命周期问题：修复说明与测试编写指南

> **临时文档**：用于指导后续 agent 针对已修复问题编写**边缘用例**与**修复回归**测试。  
> 不替代正式用户文档。正式 API 以代码与 `CHANGELOG` 为准。

## 1. 背景与涉及文件

以下文件在本次修复中被改动（便于定向 grep / review）：

| 关注点 | 文件路径 |
|--------|----------|
| `control:any/all` 子栈所有权、`doAsync/allAsync` 后台栈执行 | [`src/game/nlcore/action/actions/controlAction.ts`](../src/game/nlcore/action/actions/controlAction.ts) |
| 菜单等待存档恢复语义 | [`src/game/nlcore/action/actions/menuAction.ts`](../src/game/nlcore/action/actions/menuAction.ts) |
| 栈执行、失败传播、`execute()` | [`src/game/nlcore/action/stackModel.ts`](../src/game/nlcore/action/stackModel.ts) |
| 存档恢复异步栈、后台栈封装 | [`src/game/nlcore/game/liveGame.ts`](../src/game/nlcore/game/liveGame.ts) |
| `Awaitable` 失败态、`any/all` 组合语义 | [`src/util/data.ts`](../src/util/data.ts) |
| Timeline 失败状态 | [`src/game/player/Tasks.ts`](../src/game/player/Tasks.ts) |
| 主循环等待失败时不再推进 | [`src/game/player/elements/Player.tsx`](../src/game/player/elements/Player.tsx) |
| BGM Undo `null` | [`src/game/nlcore/action/actions/sceneAction.ts`](../src/game/nlcore/action/actions/sceneAction.ts) |
| `forceReset` 多场景清理 | [`src/game/player/gameState.ts`](../src/game/player/gameState.ts) |

BGM 播放与静音语义仍以 exposed 为准：

- [`src/game/player/elements/scene/Scene.tsx`](../src/game/player/elements/scene/Scene.tsx)：`setBackgroundMusic(music: Sound \| null, fade)`

---

## 2. 问题 → 修复 → 测试关注点

### 2.1 `control:any/all` 读档重复执行

**问题**：子 `StackModel` 既挂在主栈 `wait.stackModels`（Link 序列化），又通过 `requestAsyncStackModel` 进入全局 `asyncStackModels` 单独序列化；读档后两份实例都会执行，副作用翻倍。

**修复**：`any/all` 的 wait 子栈改为 **`createStackModel`**，不进入 `asyncStackModels`。游离后台（如 `doAsync`、`allAsync`）仍用 `requestAsyncStackModel`，经 `executeAsyncStackModel` 执行并在 settled 后从 Set 删除。

**测试建议（边缘 / 回归）**：

1. **存档快照**：在 `any` 或 `all` 分支执行中途 serialize，`game.asyncStackModels` 不应包含与主栈 Link 中重复的同一逻辑分支栈（或至少分支栈不应再以「双重来源」同时出现在存档的两处结构中——具体断言取决于你如何构造最小 SavedGame fixture）。
2. **读档一次执行**：读档后统计某一分支内故意可观测的副作用次数（例如变量递增、`gameHistory` 条数、mock logger），应为 **1 次**，而非 2 次。
3. **`allAsync`**：多个后台栈并行；任一后台栈抛错时，应 **error 日志** 且该栈从 `asyncStackModels` 移除（可在测试中 spy logger + 读内部集合或通过 serialize 前后长度推断）。

---

### 2.2 菜单等待中选择前存档：菜单后续 child 重复

**问题**：原先用 `[child, awaitable]` 把菜单后续 child 先压栈；存档丢弃 pending `Awaitable` 但追加 `waitingAction`，读档重放菜单导致 **第二个 child**。

**修复**：`MenuAction` 仅返回 **pending `Awaitable`**；玩家选择后 resolve 的结果带 `wait.stackModels`，并把 **`node` 设为菜单后续 child**，选择分支由子栈承载。

**测试建议**：

1. **等待中选前存档**：栈顶为菜单 + unsettled awaitable 的快照；deserialize 后再次选择，后续主线动作（child）执行次数为 **1**。
2. **无选项边界**：`chosen.action[0]` 缺失时 `node` 为 `null` 的路径不崩溃（如有）。
3. **Undo / cancel**：与 `actionHistory`、`presentationSnapshot` 仍一致（若有集成测试能力）。

---

### 2.3 异步栈抛错：父流程挂死或未处理拒绝

**问题**：`StackModel.execute()` 内 `roll()` 异步循环 reject 时外层 `Awaitable<void>` 未 settle；`Awaitable.any/all` 也无失败传播，`Player` 侧 `onSettled` 会继续 `next()`。

**修复概要**：

- `Awaitable`：`fail` / `onFailed` / `isFailed`；`any/all` 遇失败 abort 其他并行项并 `fail` 聚合结果。
- `StackModel.execute()`：`roll().catch → awaitable.fail`；默认 `SkipController` 可向 `currentWaiting` 传播 abort。
- `Player`：等待项失败时 **记录 error**，失败路径 **不调用 `next()`**。

**测试建议**：

1. **主栈同步抛错**：某 action `executeAction` 直接 `throw`，下一帧不应再推进（或应进入你们统一的错误边界，若有）。
2. **主栈等待 `Awaitable` 失败**：注入一个会 `fail` 的 `Awaitable<CalledActionResult>`，`next()` 循环不应假装成功推进。
3. **`executeStackModelGroup`（any/all）**：一支分支 `fail`，聚合 awaitable 应为 failed；**不应**再触发成功的 `then(() => next())`。
4. **游离后台栈**：失败仅 **logger.error**，且栈从 `asyncStackModels` 删除（见 2.1）。

---

### 2.4 `scene:setBackgroundMusic` Undo：`prevMusic === null` 无法静音

**问题**：Undo 回调里 `if (prevMusic)` 跳过，`null` 无法走 exposed 停止逻辑。

**修复**：Undo 无条件 `exposed.setBackgroundMusic(prevMusic, 0)`；移除 action 层对 `this.callee.state.backgroundMusic` 的重复赋值，以 exposed + `Scene.tsx` 为准。

**测试建议**：

1. **从未设置 BGM → 设置 BGM → Undo**：当前播放停止，`scene.state.backgroundMusic === null`（或等价「无托管 BGM」状态，按你们 AudioManager 约定断言）。
2. **已有 BGM → 切换 → Undo**：恢复到切换前曲目（回归）。
3. **fade**：Undo 使用 fade `0` 的路径仍可断言调用次数或 spy。

---

### 2.5 `GameState.forceReset()`：`forEach` + `splice` 跳过场景

**问题**：遍历时 `removeScene` 修改同一数组，多 activity scene 时漏清理。

**修复**：`const activeElements = [...this.state.elements]` 再逐个 `removeScene`。

**测试建议**：

1. **构造 3 个 scene element**：每个挂 spy：`offSrcManager`、`events.clear`、`resetLayers`（若能暴露或通过副作用推断）。
2. 调用 `forceReset()` 后，**每个 scene** 的 teardown 路径均被触发，`elements` 最终为空。

---

## 3. 编写测试时的实用约束（给 agent）

1. **最小 Story / Stack fixture**：优先构造最小 `LogicAction` + `StackModelRawData` + `SavedGame` 片段，避免依赖完整 UI；必要时使用现有 vitest + mock `GameState` / `LiveGame`。
2. **异步**：`StackModel.execute()`、`deserialize` 后的 timeline 可能依赖 microtask；可用 `await Promise.resolve()` 或项目已有的 flush 辅助。
3. **内部 API**：`executeAsyncStackModel`、`asyncStackModels` 若 `@internal`，测试可放在 `src/**/__tests__` 或通过 package exports 允许的内部测试路径（按仓库惯例）。
4. **断言层级**：优先 **行为断言**（副作用次数、logger、序列化结构），避免绑定实现细节（例如具体 Set 引用）。

---

