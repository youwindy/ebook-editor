# EPUB 编辑器

纯前端、零后端的 EPUB 电子书编辑器。所有解析、编辑与打包都在浏览器本地完成，文件不会上传到任何服务器。

## 功能

- 打开 `.epub`：点击「打开」或直接拖放到页面
- 解析 `META-INF/container.xml` / OPF，按 spine 生成章节列表
- 目录标题：支持 EPUB3 `nav` 与 EPUB2 `NCX`
- 编辑章节 XHTML 源码（Tab 键插入缩进）
- 实时预览：内联章节内的图片、样式表、字体等本地资源
- 书籍信息编辑：书名 / 作者 / 语言 / 标识符
- 查找替换：正则或纯文本，支持 `i` `m` `s` 标志、全部章节搜索、捕获组与命名组、替换一处 / 全部
- 保存：重新打包为新的 `.epub`（`mimetype` 以 STORE 存储，其余 DEFLATE 压缩）
- 移动端：抽屉式目录、源码 / 预览标签切换，支持系统分享导出
- 桌面端（≥900px）：源码与预览左右分栏
- 完全离线可用（JSZip 已内置本地）

## 在线使用（GitHub Pages）

1. 新建一个仓库，将本项目推送到 `main` 分支
2. 仓库 **Settings → Pages → Build and deployment**
   - Source 选择 **Deploy from a branch**
   - Branch 选择 **main**，目录选择 **/ (root)**，保存
3. 稍等片刻，访问 `https://<用户名>.github.io/<仓库名>/`

命令行示例：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -u origin main
```

> 本项目为纯静态站点，无需 `.nojekyll`（不含下划线开头的目录）。

## 本地运行

可直接双击 `index.html`，或用任意静态服务器：

```bash
# Node
npx serve .

# Python
python -m http.server 8080
```

## 目录结构

```
index.html          页面结构
css/style.css       全部样式（含桌面端适配）
js/utils.js         工具函数与常量
js/state.js         全局状态
js/epub.js          EPUB 解析 / 打包 / 保存
js/editor.js        章节编辑与预览
js/search.js        查找替换
js/app.js           入口与 UI 事件绑定
js/jszip.min.js     本地内置依赖
```

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

- 桌面端宽度 ≥900px：源码 + 预览分栏
- 移动端：抽屉目录 + 标签切换

## 已知限制

- CSS 中的 `@import` 不会递归内联，仅处理 `url()`
- `srcset`、`<source>`、行内 `style` 中的 `url()` 不会内联
- 全部章节文本常驻内存，超大 EPUB 占用较高
- 保存会生成一个新的 epub 文件，不会覆盖原文件
