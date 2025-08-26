# 轻量云打印

这是一个轻量级的云打印解决方案，专为Linux设计，允许用户通过 Web 界面上传文件并将其发送到连接到 Linux 服务器的 CUPS 打印机，而无需在客户端安装任何驱动程序。

## 特性

- **Web 界面上传**： 简洁的前端页面，支持文件上传
- **动态打印机列表**： 自动从 CUPS 读取并显示可用的打印机，并默认选择第一个
- **通用格式支持**：支持PDF、txt、图片格式，并兼容docx格式（不保证排版不变性）
- **打印预览**：在前端支持pdf预览（如果是docx则是后端转换过的pdf）
- **打印参数设置**：支持设置打印份数、页面范围、纸张大小、颜色设置、单双面（只支持手动，而且不通过cups，而是由程序自行控制单双面，需要用户确认手动翻页后再进行反面打印）
- **实时状态反馈**：提交打印后，前端会轮询并显示打印任务的状态
- **无客户端驱动**：客户端免驱动

## 技术栈

- **后端**：uv + Python（Flask）+ pycups
- **前端**：React + bun + typescript + shadcn
- **文件转换**：LibreOffice（仅用于 Word 文档）

## 前端界面

pc端双栏布局，左边预览，右侧菜单项，就和chrome的打印界面一样

## 部署要求

在部署此应用前，请确保您的 Linux 服务器满足以下条件：

1. **已安装并配置 CUPS**：打印机必须已在 CUPS 中成功安装和配置，并可以正常打印测试页。
2. **Python环境**
3. **LibreOffice**: 用于将 Word 文档转换为 PDF。
    - 在 Debian/Ubuntu 上安装: `sudo apt-get update && sudo apt-get install -y libreoffice`
4. **Python 开发头文件**: `pycups` 编译时需要。
    - 在 Debian/Ubuntu 上安装: `sudo apt-get install -y python3-dev build-essential`
5. **CUPS 开发库**: `pycups` 库需要 `libcups2-dev`。
    - 在 Debian/Ubuntu 上安装: `sudo apt-get install -y libcups2-dev`

## 工作流程

1.  **文件上传**: 用户在 Web 页面选择文件、打印机和份数。
2.  **后端接收**: Flask 后端接收文件并将其保存到 `uploads/` 临时目录。
3.  **格式转换**:
    - **仅在需要时转换**: 只有当文件是 `.doc` 或 `.docx` 时，系统才会调用 `libreoffice` 将其转换为 PDF。
    - **直接提交**: 对于所有其他支持的格式（PDF, JPG, PNG, TXT），文件将直接被提交给 CUPS。
4.  **提交打印**: 后端使用 `pycups` 库将文件提交到用户选择的 CUPS 打印机队列。
5.  **状态反馈**: 前端获取任务 ID 后，会定期向后端查询该任务的状态，并将结果（如 `processing`, `completed`, `error`）显示给用户。