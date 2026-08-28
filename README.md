# 快乐背单词

基于 SM2 间隔重复算法的单词学习应用，支持云同步与纯本地两种模式。

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS 3 + Zustand 5
Supabase（可选云同步）+ Dexie / IndexedDB（本地存储）
pdfjs-dist + mammoth（文件解析）+ Web Speech API（语音）

## 功能概览

- 导入：PDF / Word / TXT 批量导入，智能解析音标与释义，类别树管理
- 卡片：搜索 / 多重筛选（状态·评分·星标·类别）/ 排序 / 星标 / 多选删除 / 遗忘曲线
- 复习：SM2 五档评分，沉浸式阅读模式（自动翻卡+发音+键盘），复习计划与定时提醒
- 测验：选择题（经典/硬核）/ 拼写 / 词性转换 / 错题重默，倒计时、断点续传、评级语音播报
- 错题：当前/历史双视图，按类别分组，原题型重默
- 统计：掌握进度、复习趋势（周/月/年柱状图）、遗忘分析（按评分分类+分页）
- 每日目标与打卡、随机一词、暗色模式、响应式布局

## 快速开始

### 前置要求

- Node.js ≥ 18
- （可选）Supabase 项目

### 安装

```bash
npm install
```

### 环境变量（必填）

本应用所有数据存储在 Supabase，不支持纯本地模式。复制 `.env.example` 为 `.env.local` 并填入 Supabase 信息：

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Supabase 建表

启用云同步后，在 Supabase 控制台 → SQL Editor 中一次性执行 `supabase/schema.sql`。该脚本创建所有业务表（含 RLS 行级安全）、索引与万能密码登录函数。

### 开发

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 预览构建产物

```bash
npm run preview
```

### 代码检查

```bash
npm run lint      # oxlint
npx tsc -b        # 类型检查
```

## 部署

Netlify：构建命令 `npm run build`，发布目录 `dist`。在控制台 → Settings → Environment variables 中配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`。

## 目录结构

```
src/
  components/    UI 组件
  store/        Zustand 状态（useStore / useAuth / dailyGoalStore / studyPlanStore）
  lib/          数据层（repo）、SM2 算法、TTS、解析器、类别树
  db.ts         Dexie 本地数据库（9 个 schema 版本）
  types.ts      类型定义
supabase/
  schema.sql    Supabase 建表脚本（表 + RLS + 索引 + 函数）
```
