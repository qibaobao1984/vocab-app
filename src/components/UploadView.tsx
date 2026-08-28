import { useCallback, useEffect, useRef, useState } from 'react'
import { repoCategories, repoWordCount } from '../lib/repo'
import { useStore } from '../store/useStore'
import { CategorySelect } from './CategorySelect'
import { Page } from './Page'
import type { Category } from '../types'

export function UploadView() {
  const loading = useStore((s) => s.loading)
  const error = useStore((s) => s.error)
  const lastParseResult = useStore((s) => s.lastParseResult)
  const importFile = useStore((s) => s.importFile)
  const createCategory = useStore((s) => s.createCategory)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const refreshKey = useStore((s) => s.refreshKey)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [totalWords, setTotalWords] = useState(0)
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const [batchResults, setBatchResults] = useState<{ name: string; count: number }[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCat, setSelectedCat] = useState<string>('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState<string>('none')
  const [creatingNew, setCreatingNew] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  const loadCategories = useCallback(async () => {
    const cats = await repoCategories()
    setCategories(cats)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([repoWordCount(), loadCategories()]).then(([count]) => {
      if (!active) return
      setTotalWords(count)
      setPageLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey, loadCategories])

  const resolveCategoryId = useCallback(async (fallbackName?: string): Promise<number | null> => {
    if (creatingNew) {
      let name = newCatName.trim()
      if (!name && fallbackName) name = fallbackName
      if (!name) {
        throw new Error('请输入新类别名称')
      }
      const parentId = newCatParent === 'none' ? null : Number(newCatParent)
      return await createCategory(name, parentId)
    }
    if (!selectedCat) {
      if (!fallbackName) {
        throw new Error('请先选择或新建一个类别')
      }
      return await createCategory(fallbackName, null)
    }
    return Number(selectedCat)
  }, [creatingNew, newCatName, newCatParent, selectedCat, createCategory])

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setImportedCount(null)
      setBatchResults([])
      const fileArr = Array.from(files)
      try {
        let total = 0
        const results: { name: string; count: number }[] = []
        for (const file of fileArr) {
          const fileName = file.name.replace(/\.[^/.]+$/, '')
          const id = await resolveCategoryId(fileName)
          if (id === null) continue
          const count = await importFile(file, id)
          total += count
          results.push({ name: fileName, count })
        }
        setImportedCount(total)
        setBatchResults(results)
        const wordTotal = await repoWordCount()
        setTotalWords(wordTotal)
        await loadCategories()
        if (creatingNew) {
          setCreatingNew(false)
          setNewCatName('')
          setNewCatParent('none')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '导入失败'
        if (msg !== '导入失败') {
          useStore.setState({ error: msg })
        }
      }
    },
    [importFile, resolveCategoryId, loadCategories, creatingNew],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const createCategoryOnly = useCallback(async () => {
    const name = newCatName.trim()
    if (!name) {
      useStore.setState({ error: '请输入新类别名称' })
      return
    }
    try {
      const parentId = newCatParent === 'none' ? null : Number(newCatParent)
      const id = await createCategory(name, parentId)
      await loadCategories()
      setSelectedCat(String(id))
      setCreatingNew(false)
      setNewCatName('')
      setNewCatParent('none')
      useStore.setState({ error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '创建失败'
      useStore.setState({ error: msg })
    }
  }, [newCatName, newCatParent, createCategory, loadCategories])

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Page className="max-w-2xl">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-100 dark:bg-brand-900/40 mb-4">
          <svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.9 5 5 0 019.65-1.7A3.5 3.5 0 0118 16M9 13l3-3 3 3M12 10v9" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">导入单词</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">
          上传 Excel、PDF、Word(.docx) 或 TXT 文件，自动解析单词与释义
        </p>
      </div>

      <div className="card p-4 mb-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">词库类别</label>
        {creatingNew ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createCategoryOnly()
                }}
                placeholder="留空+多文件=各文件名作类别名"
                autoFocus
                className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button onClick={() => setCreatingNew(false)} className="btn-ghost text-xs">取消</button>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">父类别(可选，留空为顶级)</label>
              <CategorySelect
                categories={categories}
                value={newCatParent}
                onChange={setNewCatParent}
                firstOption={{ value: 'none', label: '无（顶级类别）' }}
                className="w-full"
              />
            </div>
            <button onClick={createCategoryOnly} className="btn-secondary w-full text-xs">
              仅创建类别（不导入单词）
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <CategorySelect
              categories={categories}
              value={selectedCat}
              onChange={setSelectedCat}
              firstOption={{ value: '', label: '— 请选择类别 —' }}
              className="flex-1"
            />
            <button onClick={() => setCreatingNew(true)} className="btn-secondary text-xs whitespace-nowrap">
              + 新建类别
            </button>
          </div>
        )}
        {categories.length === 0 && !creatingNew && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            还没有类别，点击「新建类别」创建一个吧
          </p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          支持多文件批量导入。新建类别时名字留空，每个文件会以文件名自动建类别
        </p>
        <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 p-3 space-y-1">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">格式要求</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400"><b className="text-gray-600 dark:text-gray-300">TXT</b>：每行一个单词，单词和释义之间用破折号、Tab 或多空格分隔</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400"><b className="text-gray-600 dark:text-gray-300">PDF</b>：同 TXT 格式，系统自动提取文字（扫描版不支持）</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400"><b className="text-gray-600 dark:text-gray-300">Word</b>：同 TXT 格式，系统自动提取纯文本</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400"><b className="text-gray-600 dark:text-gray-300">Excel</b>：A列单词、B列释义、C列音标、D列例句，有表头自动跳过</p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-[1.01]'
            : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.pdf,.docx,.doc,.txt"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">正在解析文件...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 0a2 2 0 002 2h10a2 2 0 002-2V7l-5-5H6a2 2 0 00-2 2v12z" />
            </svg>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              点击或拖拽文件到此处（可多选）
            </p>
            <p className="text-xs text-gray-400">支持 Excel / PDF / Word / TXT</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-300 animate-slide-up">
          {error}
        </div>
      )}

      {importedCount !== null && (
        <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300 animate-slide-up">
          成功导入 {importedCount} 个新单词!
        </div>
      )}

      {batchResults.length > 1 && (
        <div className="mt-2 card p-3 animate-slide-up">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">批量导入明细</p>
          <div className="space-y-1">
            {batchResults.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-300">{r.name}</span>
                <span className="text-green-600 dark:text-green-400 font-medium">+{r.count} 词</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastParseResult && (
        <div className="mt-4 card p-4 animate-slide-up">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            解析结果:识别到 <b>{lastParseResult.words.length}</b> 个单词(共 {lastParseResult.totalLines} 行)
          </p>
          {lastParseResult.words.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {lastParseResult.words.slice(0, 60).map((w, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {w.text}
                </span>
              ))}
              {lastParseResult.words.length > 60 && (
                <span className="text-xs px-2 py-0.5 text-gray-400">...</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          词库共 <b className="text-brand-600">{totalWords}</b> 词
        </span>
        {totalWords > 0 && (
          <button onClick={() => setActiveTab('cards')} className="text-brand-600 hover:text-brand-700 font-medium">
            开始学习 →
          </button>
        )}
      </div>
    </Page>
  )
}
