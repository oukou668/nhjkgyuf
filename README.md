# Meta Evaluation Dashboard

AI 能力时间线、能力热力图与模型 / benchmark 分数矩阵。

## 打开网站

**本地访问网址：[http://127.0.0.1:8765/](http://127.0.0.1:8765/)**

这个地址需要先在自己的电脑上启动服务；它不是公开网站，其他人不能通过它访问你的电脑。当前仓库为私有，未配置可验证的 GitHub Pages 在线地址。

在仓库下载或克隆后的目录中打开终端，运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

保持终端运行，再点击上方网址。分数矩阵可直接打开：
[http://127.0.0.1:8765/scores.html](http://127.0.0.1:8765/scores.html)。

如果使用现有的本地分析项目，则运行：

```sh
cd /Users/heng/Downloads/Meta_Eval_Analysis-main/meta-eval-dashboard
python3 -m http.server 8765 --bind 127.0.0.1
```

也可以双击 `index.html` 打开主页，但建议使用上述本地服务，确保题目示例等需要加载 JSON 的功能正常。

## 数据

默认使用 v7 K=5 数据，模型按原始五维能力平均值排名，benchmark 默认显示 Difficulty b。
详见 [数据与排名说明](V7_DATA.md)。本仓库保存可运行的网页快照，不包含完整训练数据与训练环境。
