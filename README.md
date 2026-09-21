# 电子书编辑器（ebook-editor）

纯前端、零后端的电子书编辑器，支持 **EPUB** 与 **TXT**，并可在两者之间互转。所有解析、编辑与打包都在浏览器本地完成，文件不会上传到任何服务器。

## 功能

### 通用

- 打开文件：点击「打开」或直接拖放到页面（支持 `.epub` / `.txt`）
- 查找替换：正则或纯文本，支持 `i` `m` `s` 标志、全部章节搜索、捕获组与命名组、替换一处 / 全部
- 实时预览：EPUB 内联章节内的图片、样式表、字体等本地资源；TXT 按纯文本或 HTML 渲染
- 移动端：底部导航栏（目录 / 源码 / 预览）+ 侧滑抽屉目录，支持系统分享导出
- 桌面端（≥900px）：源码与预览左右分栏
- PWA：可「添加到主屏幕」，以独立窗口运行并离线使用
- 完全离线可用（JSZip 已内置本地）

### EPUB

- 解析 `META-INF/container.xml` / OPF，按 spine 生成章节列表
- 目录标题：支持 EPUB3 `nav` 与 EPUB2 `NCX`
- 编辑章节 XHTML 源码（Tab 键插入缩进）
- 书籍信息编辑：书名 / 作者 / 语言 / 标识符
- 保存：重新打包为新的 `.epub`（`mimetype` 以 STORE 存储，其余 DEFLATE 压缩）
- **导出为 TXT**：提取各章纯文本，加章节标题分隔

### TXT

- 读取编码：自动识别 / UTF-8 / GBK
- 按正则拆章：默认匹配「第 X 章 / 卷 / 回 / 节」等标题行，标题从正文剔除并作为章节名
- 拆章面板：可修改正则、flags、编码并「重新拆章」
- 保存为 `.txt`（UTF-8 无 BOM）
- **导出为 EPUB**：按空行分段生成 XHTML，自动生成 OPF / nav / NCX，打包为 `.epub`

## 在线使用（GitHub Pages）

1. 将本项目推送到 GitHub 仓库的 `main` 分支
2. 仓库 **Settings → Pages → Build and deployment**
   - Source 选择 **Deploy from a branch**
   - Branch 选择 **main**，目录选择 **/ (root)**，保存
   - （仓库已含 `.github/workflows/static.yml`，也可用 **GitHub Actions** 方式部署）
3. 稍等片刻，访问 `https://<用户名>.github.io/ebook-editor/`

> 本项目为纯静态站点，无需 `.nojekyll`（不含下划线开头的目录）。

## 本地运行

可直接双击 `index.html`，或用任意静态服务器：

```bash
# Node
npx serve .

# Python
python -m http.server 8080
```

> 建议用静态服务器访问：Service Worker（离线/安装）需要 `http(s)://`，`file://` 下不会注册，但应用本身仍可正常使用。

## 目录结构

```
index.html              页面结构（含底部导航、模式显隐）
manifest.webmanifest    PWA 清单
sw.js                   Service Worker（离线缓存）
icons/                  应用图标（SVG）
css/style.css           全部样式（响应式 + 视觉精修）
js/utils.js             工具函数与常量
js/state.js             全局状态与通用文档访问
js/epub.js              EPUB 解析 / 打包 / 保存
js/txt.js               TXT 读取 / 拆章 / 保存
js/convert.js           TXT <-> EPUB 互转
js/editor.js            章节编辑与预览
js/search.js            查找替换
js/app.js               入口、UI 事件、底部导航、PWA 注册
js/jszip.min.js         本地内置依赖
```

## 使用说明

### TXT 拆章

1. 打开 `.txt` 文件后，顶部出现「TXT 拆章」面板
2. 默认正则为 `^\s*第[0-9零一二三四五六七八九十百千两]+[章卷回节].*$`（flags `m`）
3. 按需修改正则或编码，点击「重新拆章」
4. 在「书籍信息」中填写书名 / 作者，点击「导出为 EPUB」

### EPUB 转 TXT

打开 `.epub` 后，展开「书籍信息」，点击「导出为 TXT」。

## 移动端与 PWA

- 宽度 <900px 时使用**底部导航栏**：「目录」打开侧滑抽屉，「源码 / 预览」切换面板。
- 通过 `manifest.webmanifest` + `sw.js`（Service Worker）支持**安装到主屏**与**离线缓存**。
- Service Worker 仅在 `https://` 或 `localhost` 下生效；直接双击 `index.html`（`file://`）时不会注册。

## 依赖与许可

- [JSZip](https://stuk.github.io/jszip/) v3.10.1，**双许可：MIT 或 GPLv3**
  - 已内置在 `js/jszip.min.js`，文件头部保留了版权与许可声明，可随项目一起上传和分发
  - 本项目采用 MIT 许可，请一并保留 JSZip 的 MIT 声明（已包含在该文件头部）

## 许可

本项目基于 [MIT License](LICENSE) 发布。

## 隐私

所有操作均在浏览器本地进行，不联网、不上传任何文件。

## 浏览器兼容

现代版 Chrome / Edge / Firefox / Safari。

- 桌面端宽度 ≥900px：侧栏目录 + 源码 / 预览分栏
- 移动端：底部导航栏 + 侧滑抽屉目录

## 已知限制

- CSS 中的 `@import` 不会递归内联，仅处理 `url()`
- `srcset`、`<source>`、行内 `style` 中的 `url()` 不会内联
- TXT 导出编码固定为 UTF-8（无 BOM），不支持导出 GBK
- 全部章节文本常驻内存，超大文件占用较高
- 保存 / 导出会生成新文件，不会覆盖原文件
