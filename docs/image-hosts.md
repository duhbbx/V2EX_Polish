# 图床功能与 Fork 维护

此 Fork 基于 [coolpace/V2EX_Polish](https://github.com/coolpace/V2EX_Polish)，增加浏览器扩展的图床设置。新增实现主要放在独立模块中，保留上游历史，后续可以正常合并更新。

## 安装 Chrome 修改版

1. 从本仓库 [Releases](https://github.com/duhbbx/V2EX_Polish/releases) 下载 `v2ex-polish-imgbb-chrome.zip`，解压到固定目录。
2. 打开 `chrome://extensions/`，先停用应用商店安装的原版 V2EX Polish，避免两个版本重复上传或修改页面。
3. 打开右上角「开发者模式」，点击「加载已解压的扩展程序」，选择解压后直接包含 `manifest.json` 的文件夹。
4. 打开修改版的「扩展程序选项」→「图床设置」。上传栏也有「图床设置」快捷入口。
5. 默认选择 ImgBB。在 [ImgBB API 页面](https://api.imgbb.com/) 登录并取得你自己的 API Key，填入插件并点击「保存图床设置」。不需要登录 Imgur。
6. 刷新之前已打开的 V2EX 标签页，即可选择、粘贴或拖放图片。单张最大 10 MB，支持 PNG、JPG、GIF、WebP、BMP 和 TIFF。

API Key 只存于此设备的 `chrome.storage.local`，不会写入 Chrome 同步区、配置导出文件或 V2EX 记事本备份。换设备或重装修改版后需要重新填写。更换版本前可用原插件的备份功能保留其他配置，API Key 需要单独设置。

Imgur 作为可手动选择的原图床保留；上传失败时不会自动改用其他图床。错误会直接显示图床返回的原因，包括无效密钥、拒绝访问、服务异常和超时。

## 发帖时的图片显示

支持旧版 `/write` 和新版 `/new/<节点>`（例如 `/new/create`）。新版页面会在正文框下显示上传栏；将光标放在正文框内再粘贴截图。标题框内的粘贴不会触发图片上传。升级已解压的扩展后，需要在 `chrome://extensions/` 点击扩展的重新加载按钮，再刷新 V2EX 页面（先保存未提交的草稿）。

新主题请选择 **Markdown** 格式，插件会自动插入 `![](图片直链)`。V2EX 原生格式及评论区是否显示其他图床的图片，受 V2EX 自身规则影响；更换上传服务无法改变站点渲染规则。

修改版从扩展后台上传，新增主机权限仅为 `https://api.imgbb.com/*` 和 `https://api.imgur.com/*`。密钥通过 HTTPS 请求正文传给 ImgBB，不拼入请求 URL，不会通过网页上下文读取。本次图床切换针对 Chrome/Firefox 扩展；油猴脚本继续沿用上游的 Imgur 上传方式。

## 合并上游更新

本地目录已配置两个远程：

- `origin`：`https://github.com/duhbbx/V2EX_Polish.git`
- `upstream`：`https://github.com/coolpace/V2EX_Polish.git`

保存或提交本地工作后执行：

```sh
git switch main
git fetch upstream
git merge upstream/main
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck:extension
pnpm build:dist
git push origin main
```

GitHub 的「Sync fork」适合无冲突时使用。发生冲突时在本地合并，保留本 Fork 的图床设置、上传后台和密钥备份排除逻辑。不要使用会将本地修改重置掉的同步方式。

## 构建与验证

项目需要 Node.js 22+、pnpm 9.15.3 和 Bun。保持上游依赖锁文件不变：

```sh
pnpm install --frozen-lockfile
pnpm typecheck:extension
pnpm test
pnpm build:dist
pnpm pack:chrome
```

新增测试覆盖 ImgBB/Imgur 请求、超时与错误提示、消息来源验证，以及密钥不参与备份/恢复的行为。没有配置真实 API Key 时，测试使用模拟响应，不上传用户图片。
