# Meta Eval Dashboard 网页文件说明

这个目录是一个纯静态 dashboard，不依赖前端构建工具。浏览器通过本地静态服务或 GitHub Pages 打开 `index.html` 后，由 `app.js` 读取 `data/dashboard_data.json` 并渲染所有模块。

公开部署地址：

<https://oukou668.github.io/nhjkgyuf/>

## 目录结构

```text
meta-eval-dashboard/
  index.html                    # 页面结构和各模块 DOM
  styles.css                    # 页面样式、顶部导航、热力图布局、响应式规则
  app.js                        # 前端渲染逻辑、交互、图表、固定 run 选择
  build_data.py                 # 从远端/本地参数 CSV 生成 dashboard_data.json
  data/dashboard_data.json      # 前端实际读取的聚合数据
  assets/                       # 拟合可视化 PNG、复旦校徽等静态资源
  source_data/remote_bettercode # 从远端 bettercode 拷贝的参数、tag、rubric 数据
  .nojekyll                     # GitHub Pages 静态部署用，避免 Jekyll 处理
```

## 当前页面外观

- 页面标题为 **Meta Evaluation**。
- 顶部新增浅蓝色导航栏：
  - 左侧显示复旦校徽和 `Fudan University`
  - 右侧导航项为 `Latest`、`Research`、`About`、`Contact`
- 复旦校徽保存为本地资源：

```text
assets/fudan-logo.svg
```

- 顶部导航配色采用复旦蓝系：
  - 主色：`#0e419c`
  - 顶栏背景：`#edf4ff`

校徽 SVG 来自 Wikimedia Commons 的 `Fudan University Logo.svg`，该页面标注来源为复旦官网 logo 包。为了 GitHub Pages 加载稳定，网页使用本地 `assets/fudan-logo.svg`，不依赖外链。

## 主要模块

页面目前包含：

1. **能力时间线**
   - 使用模型 release date 和 `capability_sum`
   - 首次打开网站时，点位按发布时间渐次浮现。
   - 鼠标悬停显示完整模型名、家族、发布日期和 capability。
   - 切换家族时，非当前家族点位不会消失，而是保留为灰色背景点；只有当前家族点位响应 hover。
   - `All` 视图中，右上角保留 `Mythos`、`Opus 4.7`、`Opus 4.6`、`GPT-5.5` 标签；切到任意具体家族后，这些背景标签会隐藏。
   - `Yi-1.5-34B` 不显示常驻标签。
   - `Kimi-K2-Instruct...` 的常驻标签简化为 `Kimi-K2`。
   - 常驻标签会移除日期、纯数字版本尾巴和运行档位后缀；完整信息保留在 hover tooltip。
   - 时间线右侧留有标签空间，同时横向网格线和 x 轴会延伸到画布右边缘附近。

2. **原始拟合可视化**
   - 优先展示远端 `outputs/model_fit/train_<run_tag>.pdf` 转出的 PNG。
   - 下面保留预测拟合摘要和最大误差样本表格。

3. **热力图**
   - 默认展示 `Models × semantic tags`
   - 也可切换到 raw model capability 或 benchmark difficulty 维度热力图。

4. **能力值**
   - 使用 `models[].capability_sum / mean / l2 / estimated_capability`
   - 支持搜索、排序和选择模型查看语义 tag 条形图。

5. **Benchmark 难度**
   - 默认排序是 `Predicted difficulty`
   - 不是 raw difficulty sum。
   - 支持按 tag 筛选，并展示 benchmark 的语义 tag 条形图。

6. **标签解释**
   - 展示原版 rubric/tag 分布和激活 benchmark 列表。

## 训练设置

`dashboard_data.json.training_runs` 里仍保留多个 run：

```text
extend4705_buck_meansafe_bce_corrloss_wogamma_vd=30_R=0.1_btlw=12_fold_idx9
extend4697_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx5
extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3
```

但当前网页暂时固定使用 idx3：

```text
extend4689_buck_meansafe_bce_corrloss_wogamma_vd=20_R=0.1_btlw=12_fold_idx3
```

右上角的 run source、run 下拉框和 run config 文本已隐藏，用户暂时不能切换 run。固定 run 的逻辑在 `app.js` 里的 `FIXED_RUN_TAG`。

`extend4085` 已从 `build_data.py` 的候选发现逻辑里排除。

## 核心公式

### Benchmark Predicted Difficulty

对每个 benchmark \(b\)，先用当前 run 里所有模型预测通过率，再取平均：

\[
\mathrm{PredDifficulty}(b) = 1 - \frac{1}{|M|}\sum_m \hat y_{m,b}
\]

其中 `buck_meansafe_wogamma` 的预测通过率是：

\[
\Delta_{m,b,k} = c_{m,k} - d_{b,k}
\]

\[
p_{m,b,k} = \sigma(\Delta_{m,b,k})
\]

\[
\hat y_{m,b}
=
\left(
\sum_k w_{b,k} \cdot p_{m,b,k}^{R}
\right)^{1/R}
\]

这里：

- \(c_{m,k}\)：模型 capability
- \(d_{b,k}\)：benchmark difficulty
- \(w_{b,k}\)：benchmark mask 经 softmax 后的维度权重
- \(R=0.1\)

### Models × Semantic Tags 热力图

这个热力图已按 `benchlook.ipynb` 的口径复刻。

第一步，构造 masked difficulty：

\[
\mathrm{masked\_dfct}_{b,k}
=
\mathrm{softmax}(\mathrm{mask}_b)_k
\cdot
(d_{b,k} - \min_j d_{b,j})
\]

第二步，对每个 latent dim，把 benchmark 的 tag 按 `masked_dfct` 强度聚合成 **Dim × Tag** 矩阵：

\[
A_{k,t}
\]

这里 tag 权重使用 notebook 中的 `idf_weighted` 口径。

第三步，对 model capability 在每个 dim 上跨模型做 softmax：

\[
\bar C_{m,k}
=
\frac{\exp(C_{m,k})}{\sum_{m'} \exp(C_{m',k})}
\]

最后：

\[
\mathrm{ModelTag}_{m,t}
=
\sum_k \bar C_{m,k} A_{k,t}
\]

即：

\[
\mathrm{ModelTag}
=
\mathrm{softmax}_{models}(\mathrm{ModelDim})
\times
\mathrm{DimTag}
\]

注意：热力图的**行排序**现在不按 tag score 排，而是按：

\[
\mathrm{capability\_sum}(m)
\]

也就是总体 capability 越强越靠上。

## 数据来源

主要远端来源：

```text
/datacenter/lianghaiyuan/bench-eval/bettercode
/mnt/nas/lianghaiyuan/bench-eval
```

本地缓存位置：

```text
source_data/remote_bettercode/
```

拟合图来源：

```text
remote bettercode/outputs/model_fit/train_<run_tag>.pdf
```

这些 PDF 被转换为：

```text
assets/fit_<run_tag>.png
```

## 重新生成数据

在仓库根目录运行：

```bash
python3 meta-eval-dashboard/build_data.py
```

生成结果：

```text
meta-eval-dashboard/data/dashboard_data.json
```

前端读取路径在 `app.js` 末尾：

```js
fetch("./data/dashboard_data.json?v=...")
```

如果更新了 JSON 但浏览器仍显示旧数据，需要同步修改这个 cache key。

如果更新了前端 JS/CSS，也需要同步修改 `index.html` 中的静态资源 cache key，例如：

```html
<link rel="stylesheet" href="./styles.css?v=...">
<script src="./app.js?v=..."></script>
```

## 本地预览

```bash
cd /Users/heng/Downloads/Meta_Eval_Analysis
python3 -m http.server 8765
```

然后打开：

```text
http://127.0.0.1:8765/meta-eval-dashboard/index.html
```

不要直接用 `file://.../index.html` 打开，因为浏览器会限制 `fetch("./data/dashboard_data.json")`，导致 dashboard 数据加载失败。

如果浏览器缓存旧 JS/CSS，强制刷新：

```text
Cmd + Shift + R
```

## 公开部署

当前 public repo：

```text
git@github.com:oukou668/nhjkgyuf.git
```

公开地址：

```text
https://oukou668.github.io/nhjkgyuf/
```

发布方式是把 `meta-eval-dashboard/` 子目录拆成静态站根目录，推到 public repo 的 `main` 和 `gh-pages`。

常用同步命令：

```bash
SPLIT=$(git subtree split --prefix meta-eval-dashboard HEAD)
git push public-dashboard "$SPLIT":refs/heads/main
git push public-dashboard "$SPLIT":refs/heads/gh-pages
```

## 注意事项

- `data/dashboard_data.json` 是前端实际数据源，文件较大。
- `source_data/remote_bettercode/` 是为了可复现而保留的远端快照。
- `assets/fudan-logo.svg` 是顶部导航使用的本地校徽资源。
- `__pycache__/` 不应提交。
- 如果 GitHub Pages 显示旧页面，通常是缓存问题，需要更新 `index.html` 中 `app.js?v=...` 或 `app.js` 中 JSON 的 fetch cache key。
