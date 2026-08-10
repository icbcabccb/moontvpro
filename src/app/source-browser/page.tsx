/* eslint-disable @next/next/no-img-element */

'use client';

import { ExternalLink, Layers, Server, Tv, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ClientCache } from '@/lib/client-cache';
import type { DoubanItem, SearchResult as GlobalSearchResult } from '@/lib/types';

type Source = { key: string; name: string; api: string };
type Category = { type_id: string | number; type_name: string };
type Item = {
  id: string;
  title: string;
  poster: string;
  year: string;
  type_name?: string;
  remarks?: string;
};

export default function SourceBrowserPage() {
  const router = useRouter();

  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [activeSourceKey, setActiveSourceKey] = useState('');
  const activeSource = useMemo(
    () => sources.find((s) => s.key === activeSourceKey),
    [sources, activeSourceKey]
  );

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | number>('');

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const hasMore = page < pageCount;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const lastFetchAtRef = useRef(0);
  const autoFillInProgressRef = useRef(false);

  // 搜索与排序
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'category' | 'search'>('category');
  const [sortBy, setSortBy] = useState<
    'default' | 'title-asc' | 'title-desc' | 'year-asc' | 'year-desc'
  >('default');
  const [debounceId, setDebounceId] = useState<NodeJS.Timeout | null>(null);

  // 二级筛选（地区 / 年份 / 关键词）
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterYear, setFilterYear] = useState<string>('');
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  // 详情预览
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<GlobalSearchResult | null>(null);
  const [previewItem, setPreviewItem] = useState<Item | null>(null);
  const [previewDouban, setPreviewDouban] = useState<DoubanItem | null>(null);
  const [previewDoubanLoading, setPreviewDoubanLoading] = useState(false);
  const [previewDoubanId, setPreviewDoubanId] = useState<number | null>(null);
  type BangumiTag = { name: string };
  type BangumiInfoboxValue = string | { v: string } | Array<string | { v: string }>;
  type BangumiInfoboxEntry = { key: string; value: BangumiInfoboxValue };
  type BangumiSubject = {
    name?: string;
    name_cn?: string;
    date?: string;
    rating?: { score?: number };
    tags?: BangumiTag[];
    infobox?: BangumiInfoboxEntry[];
    summary?: string;
  };
  const [previewBangumi, setPreviewBangumi] = useState<BangumiSubject | null>(null);
  const [previewBangumiLoading, setPreviewBangumiLoading] = useState(false);
  const [previewSearchPick, setPreviewSearchPick] = useState<GlobalSearchResult | null>(null);

  const fetchSources = useCallback(async () => {
    setLoadingSources(true);
    setSourceError(null);
    try {
      const res = await fetch('/api/source-browser/sites', {
        cache: 'no-store',
      });
      if (res.status === 401) {
        throw new Error('登录状态已失效，请重新登录');
      }
      if (res.status === 403) {
        throw new Error('当前账号暂无可用资源站点');
      }
      if (!res.ok) throw new Error('获取源失败');
      const data = await res.json();
      const list: Source[] = data.sources || [];
      setSources(list);
      if (list.length > 0) {
        setActiveSourceKey(list[0].key);
      }
    } catch (e: unknown) {
      setSourceError(e instanceof Error ? e.message : '获取源失败');
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const fetchCategories = useCallback(async (sourceKey: string) => {
    if (!sourceKey) return;
    setLoadingCategories(true);
    setCategoryError(null);
    try {
      const res = await fetch(
        `/api/source-browser/categories?source=${encodeURIComponent(sourceKey)}`
      );
      if (!res.ok) throw new Error('获取分类失败');
      const data = await res.json();
      const list: Category[] = data.categories || [];
      setCategories(list);
      if (list.length > 0) {
        setActiveCategory(list[0].type_id);
      } else {
        setActiveCategory('');
      }
    } catch (e: unknown) {
      setCategoryError(e instanceof Error ? e.message : '获取分类失败');
      setCategories([]);
      setActiveCategory('');
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const fetchItems = useCallback(
    async (
      sourceKey: string,
      typeId: string | number,
      p = 1,
      append = false
    ) => {
      if (!sourceKey || !typeId) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        const res = await fetch(
          `/api/source-browser/list?source=${encodeURIComponent(
            sourceKey
          )}&type_id=${encodeURIComponent(String(typeId))}&page=${p}`
        );
        if (!res.ok) throw new Error('获取列表失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
        // 更新可选年份
        const years = Array.from(
          new Set(list.map((i) => (i.year || '').trim()).filter(Boolean))
        );
        years.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
        setAvailableYears(years);
      } catch (e: unknown) {
        setItemsError(e instanceof Error ? e.message : '获取列表失败');
        if (!append) setItems([]);
        setPage(1);
        setPageCount(1);
        setAvailableYears([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoadingItems(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  useEffect(() => {
    if (activeSourceKey) fetchCategories(activeSourceKey);
  }, [activeSourceKey, fetchCategories]);

  useEffect(() => {
    if (activeSourceKey && activeCategory && mode === 'category') {
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchItems(activeSourceKey, activeCategory, 1, false);
    }
  }, [activeSourceKey, activeCategory, mode, fetchItems]);

  const fetchSearch = useCallback(
    async (sourceKey: string, q: string, p = 1, append = false) => {
      if (!sourceKey || !q) return;
      if (append) setLoadingMore(true);
      else setLoadingItems(true);
      setItemsError(null);
      try {
        const res = await fetch(
          `/api/source-browser/search?source=${encodeURIComponent(
            sourceKey
          )}&q=${encodeURIComponent(q)}&page=${p}`
        );
        if (!res.ok) throw new Error('搜索失败');
        const data = (await res.json()) as {
          items?: Item[];
          meta?: { page?: number; pagecount?: number };
        };
        const list: Item[] = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(data.meta?.page || p));
        setPageCount(Number(data.meta?.pagecount || 1));
        const years = Array.from(
          new Set(list.map((i) => (i.year || '').trim()).filter(Boolean))
        );
        years.sort((a, b) => (parseInt(b) || 0) - (parseInt(a) || 0));
        setAvailableYears(years);
      } catch (e: unknown) {
        setItemsError(e instanceof Error ? e.message : '搜索失败');
        if (!append) setItems([]);
        setPage(1);
        setPageCount(1);
        setAvailableYears([]);
      } finally {
        if (append) setLoadingMore(false);
        else setLoadingItems(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeSourceKey && mode === 'search' && query.trim()) {
      setItems([]);
      setPage(1);
      setPageCount(1);
      fetchSearch(activeSourceKey, query.trim(), 1, false);
    }
  }, [activeSourceKey, mode, query, fetchSearch]);

  // IntersectionObserver 处理自动翻页
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          const now = Date.now();
          const intervalOk = now - lastFetchAtRef.current > 700; 
          if (
            !loadingItems &&
            !loadingMore &&
            hasMore &&
            activeSourceKey &&
            intervalOk
          ) {
            lastFetchAtRef.current = now;
            const next = page + 1;
            if (mode === 'search' && query.trim()) {
              fetchSearch(activeSourceKey, query.trim(), next, true);
            } else if (mode === 'category' && activeCategory) {
              fetchItems(activeSourceKey, activeCategory, next, true);
            }
          }
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    loadingItems,
    loadingMore,
    hasMore,
    page,
    mode,
    activeSourceKey,
    activeCategory,
    query,
    fetchItems,
    fetchSearch,
  ]);

  // 首屏填充
  useEffect(() => {
    const tryAutoFill = async () => {
      if (autoFillInProgressRef.current) return;
      if (!loadMoreRef.current) return;
      if (loadingItems || loadingMore || !hasMore) return;
      const sentinel = loadMoreRef.current.getBoundingClientRect();
      const inViewport = sentinel.top <= window.innerHeight + 100;
      if (!inViewport) return;

      autoFillInProgressRef.current = true;
      try {
        let iterations = 0;
        while (iterations < 5) {
          if (!hasMore) break;
          const now = Date.now();
          if (now - lastFetchAtRef.current <= 400) break; 
          lastFetchAtRef.current = now;
          const next = page + iterations + 1;
          if (mode === 'search' && query.trim()) {
            await fetchSearch(activeSourceKey, query.trim(), next, true);
          } else if (mode === 'category' && activeCategory) {
            await fetchItems(activeSourceKey, activeCategory, next, true);
          } else {
            break;
          }
          iterations++;

          if (!loadMoreRef.current) break;
          const rect = loadMoreRef.current.getBoundingClientRect();
          if (rect.top > window.innerHeight + 100) break;
        }
      } finally {
        autoFillInProgressRef.current = false;
      }
    };

    const id = setTimeout(tryAutoFill, 50);
    return () => clearTimeout(id);
  }, [
    items,
    page,
    pageCount,
    hasMore,
    loadingItems,
    loadingMore,
    mode,
    activeSourceKey,
    activeCategory,
    query,
    fetchItems,
    fetchSearch,
  ]);

  const filteredAndSorted = useMemo(() => {
    let arr = [...items];
    if (filterKeyword.trim()) {
      const kw = filterKeyword.trim().toLowerCase();
      arr = arr.filter(
        (i) =>
          (i.title || '').toLowerCase().includes(kw) ||
          (i.remarks || '').toLowerCase().includes(kw)
      );
    }
    if (filterYear) {
      arr = arr.filter((i) => (i.year || '').trim() === filterYear);
    }
    switch (sortBy) {
      case 'title-asc':
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      case 'title-desc':
        return arr.sort((a, b) => b.title.localeCompare(a.title));
      case 'year-asc':
        return arr.sort(
          (a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0)
        );
      case 'year-desc':
        return arr.sort(
          (a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0)
        );
      default:
        return arr; 
    }
  }, [items, sortBy, filterKeyword, filterYear]);

  const fetchDoubanDetails = async (doubanId: number) => {
    try {
      setPreviewDoubanLoading(true);
      setPreviewDouban(null);
      const keyRaw = `douban-details-id=${doubanId}`;
      const cached = (await ClientCache.get(keyRaw)) as DoubanItem | null;
      if (cached) {
        setPreviewDouban(cached);
        return;
      }

      const fallback = await fetch(
        `/api/douban/details?id=${encodeURIComponent(String(doubanId))}`
      );
      if (fallback.ok) {
        const dbData = (await fallback.json()) as
          | { code: number; message: string; data?: DoubanItem }
          | DoubanItem;
        const normalized = (dbData as { data?: DoubanItem }).data || (dbData as DoubanItem);
        setPreviewDouban(normalized);
        try {
          await ClientCache.set(keyRaw, normalized, 14400);
        } catch (err) {
          void err;
        }
      } else {
        setPreviewDouban(null);
      }
    } catch (e) {
      // ignore
    } finally {
      setPreviewDoubanLoading(false);
    }
  };

  const isBangumiId = (id: number): boolean =>
    id > 0 && id.toString().length === 6;

  const fetchBangumiDetails = async (bangumiId: number) => {
    try {
      setPreviewBangumiLoading(true);
      setPreviewBangumi(null);
      const res = await fetch(`/api/proxy/bangumi?path=v0/subjects/${bangumiId}`);
      if (res.ok) {
        const data = (await res.json()) as {
          name?: string;
          name_cn?: string;
          date?: string;
          rating?: { score?: number };
          tags?: { name: string }[];
          infobox?: { key: string; value: BangumiInfoboxValue }[];
          summary?: string;
        };
        setPreviewBangumi(data);
      }
    } catch (e) {
      // ignore
    } finally {
      setPreviewBangumiLoading(false);
    }
  };

  const openPreview = async (item: Item) => {
    setPreviewItem(item);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewData(null);
    setPreviewDouban(null);
    setPreviewDoubanId(null);
    setPreviewBangumi(null);
    setPreviewSearchPick(null);
    try {
      const res = await fetch(
        `/api/detail?source=${encodeURIComponent(
          activeSourceKey
        )}&id=${encodeURIComponent(item.id)}`
      );
      if (!res.ok) throw new Error('获取详情失败');
      const data = (await res.json()) as GlobalSearchResult;
      setPreviewData(data);
      
      let dId: number | null = data?.douban_id ? Number(data.douban_id) : null;
      if (!dId) {
        const normalize = (s: string) =>
          (s || '').replace(/\s+/g, '').toLowerCase();
        const variants = Array.from(
          new Set([item.title, (item.title || '').replace(/\s+/g, '')])
        ).filter(Boolean) as string[];

        for (const v of variants) {
          try {
            const res = await fetch(
              `/api/search/one?resourceId=${encodeURIComponent(
                activeSourceKey
              )}&q=${encodeURIComponent(v)}`
            );
            if (!res.ok) continue;
            const payload = (await res.json()) as {
              results?: GlobalSearchResult[];
            };
            const list: GlobalSearchResult[] = payload.results || [];
            const tNorm = normalize(item.title);
            const matchStrict = list.find(
              (r) =>
                normalize(r.title) === tNorm &&
                (!item.year ||
                  (r.year &&
                    String(r.year).toLowerCase() ===
                      String(item.year).toLowerCase())) &&
                r.douban_id
            );
            const matchTitleOnly = list.find(
              (r) => normalize(r.title) === tNorm && r.douban_id
            );
            const pick = matchStrict || matchTitleOnly || null;
            if (pick && pick.douban_id) {
              dId = Number(pick.douban_id);
              setPreviewSearchPick(pick);
              break;
            }
          } catch {
            // ignore
          }
        }
      }
      if (dId && dId > 0) {
        setPreviewDoubanId(dId);
        if (isBangumiId(dId)) {
          await fetchBangumiDetails(dId);
        } else {
          await fetchDoubanDetails(dId);
        }
      }
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : '获取详情失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const goPlay = (item: Item) => {
    const params = new URLSearchParams();
    params.set('source', activeSourceKey);
    params.set('id', item.id);
    const mergedTitle = (previewData?.title || item.title || '').toString();
    const mergedYear = (previewData?.year || item.year || '').toString();
    if (mergedTitle) params.set('title', mergedTitle);
    if (mergedYear) params.set('year', mergedYear);
    if (previewDoubanId) params.set('douban_id', String(previewDoubanId));
    params.set('prefer', 'true');
    router.push(`/play?${params.toString()}`);
  };

  return (
    <main className="min-h-screen bg-[#131722] text-white flex flex-col selection:bg-[#DC143C] selection:text-white">
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 pt-6 md:pt-10 pb-20 space-y-6">
        
        {/* 返回首页导航 */}
        <div className="mb-2">
          <Link href="/" className="inline-flex items-center text-gray-400 hover:text-[#DC143C] transition-colors">
            <ArrowLeft className="w-5 h-5 mr-1" />
            返回首页
          </Link>
        </div>

        {/* Header - 暗黑版 */}
        <div className='relative'>
          <div className='absolute inset-0 bg-[#DC143C]/5 rounded-2xl blur-3xl'></div>
          <div className='relative flex items-center gap-4 bg-[#1a1a1a] rounded-2xl p-6 border border-[#333] shadow-xl'>
            <div className='relative w-16 h-16 rounded-2xl bg-[#DC143C] flex items-center justify-center shadow-lg group hover:scale-110 transition-transform duration-300'>
              <div className='absolute inset-0 bg-[#DC143C] rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity'></div>
              <Layers className='relative w-8 h-8 text-white drop-shadow-lg' />
            </div>
            <div className='flex-1'>
              <h1 className='text-3xl md:text-4xl font-bold text-gray-100'>
                源&分类
              </h1>
              <p className='text-sm text-gray-400 mt-1'>
                按源站与分类浏览内容，探索海量影视资源。
              </p>
            </div>
            {sources.length > 0 && (
              <div className='hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#222] border border-[#333]'>
                <Server className='w-4 h-4 text-[#DC143C]' />
                <span className='text-sm font-medium text-gray-300'>
                  {sources.length} 个源可用
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sources - 暗黑版 */}
        <div className='bg-[#1a1a1a] rounded-2xl shadow-lg border border-[#333] backdrop-blur-sm'>
          <div className='px-5 py-4 border-b border-[#333] flex items-center justify-between'>
            <div className='flex items-center gap-2.5 font-semibold text-gray-100'>
              <div className='w-8 h-8 rounded-lg bg-[#222] flex items-center justify-center'>
                <Server className='w-4 h-4 text-gray-400' />
              </div>
              <span>选择来源站</span>
            </div>
            {!loadingSources && sources.length > 0 && (
              <span className='text-xs px-2.5 py-1 rounded-full bg-[#222] text-gray-300 font-medium border border-[#333]'>
                {sources.length} 个
              </span>
            )}
          </div>
          <div className='p-5'>
            {loadingSources ? (
              <div className='flex items-center gap-2 text-sm text-gray-500'>
                <div className='w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin'></div>
                加载中...
              </div>
            ) : sourceError ? (
              <div className='flex items-center gap-2 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800'>
                <span className='text-sm text-red-400'>{sourceError}</span>
              </div>
            ) : sources.length === 0 ? (
              <div className='text-center py-8'>
                <div className='w-16 h-16 mx-auto mb-3 rounded-full bg-[#222] flex items-center justify-center'>
                  <Server className='w-8 h-8 text-gray-500' />
                </div>
                <p className='text-sm text-gray-500'>暂无可用来源</p>
              </div>
            ) : (
              <div className='flex flex-wrap gap-2.5'>
                {sources.map((s, index) => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSourceKey(s.key)}
                    className={`group relative px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all duration-300 transform hover:scale-105 ${
                      activeSourceKey === s.key
                        ? 'bg-[#DC143C] text-white border-[#DC143C] shadow-lg shadow-[#DC143C]/30'
                        : 'border-[#333] text-gray-400 hover:bg-[#222] hover:text-gray-200 hover:border-[#555]'
                    }`}
                    style={{
                      animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`,
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Query & Sort */}
        {activeSource && (
          <div className='bg-[#1a1a1a] rounded-xl shadow border border-[#333]'>
            <div className='px-4 py-3 border-b border-[#333] space-y-3'>
              {/* 第一行：搜索框 + 清除按钮 + 模式显示 */}
              <div className='flex items-center gap-2'>
                <input
                  value={query}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuery(val);
                    if (debounceId) clearTimeout(debounceId);
                    const id = setTimeout(() => {
                      setMode(val.trim() ? 'search' : 'category');
                      if (val.trim()) {
                        fetchSearch(activeSourceKey, val.trim(), 1);
                      } else if (activeCategory) {
                        fetchItems(activeSourceKey, activeCategory, 1);
                      }
                    }, 500);
                    setDebounceId(id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setMode(query.trim() ? 'search' : 'category');
                    }
                  }}
                  placeholder='输入关键词并回车进行搜索；清空回车恢复分类'
                  className='flex-1 px-3 py-2 rounded-md border border-[#333] bg-[#131722] text-white text-sm focus:outline-none focus:border-[#DC143C]'
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery('');
                      setMode('category');
                      if (activeCategory)
                        fetchItems(activeSourceKey, activeCategory, 1);
                    }}
                    className='px-3 py-2 text-xs border border-[#333] rounded-md whitespace-nowrap text-gray-400 hover:bg-[#222] hover:text-white'
                    title='清除'
                  >
                    清除
                  </button>
                )}
                <div className='hidden sm:block text-xs text-gray-500 whitespace-nowrap'>
                  {mode === 'search' ? '搜索' : '分类'}
                </div>
              </div>

              {/* 第二行：筛选控件（移动端优化布局） */}
              <div className='grid grid-cols-2 sm:flex sm:flex-wrap gap-2'>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        | 'default'
                        | 'title-asc'
                        | 'title-desc'
                        | 'year-asc'
                        | 'year-desc'
                    )
                  }
                  className='sm:flex-1 sm:min-w-[120px] px-2 sm:px-3 py-2 rounded-md border border-[#333] bg-[#131722] text-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#DC143C]'
                  title='排序'
                >
                  <option value='default'>默认排序</option>
                  <option value='title-asc'>标题 A→Z</option>
                  <option value='title-desc'>标题 Z→A</option>
                  <option value='year-asc'>年份↑</option>
                  <option value='year-desc'>年份↓</option>
                </select>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className='sm:flex-1 sm:min-w-[100px] px-2 sm:px-3 py-2 rounded-md border border-[#333] bg-[#131722] text-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#DC143C]'
                  title='年份'
                >
                  <option value=''>全部年份</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <input
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  placeholder='地区/关键词'
                  className='col-span-2 sm:flex-1 sm:min-w-[140px] px-2 sm:px-3 py-2 rounded-md border border-[#333] bg-[#131722] text-gray-300 text-xs sm:text-sm focus:outline-none focus:border-[#DC143C]'
                />
              </div>
            </div>
          </div>
        )}

        {/* Categories and Items */}
        {activeSource && (
          <div className='bg-[#1a1a1a] rounded-2xl shadow-lg border border-[#333] backdrop-blur-sm'>
            <div className='px-5 py-4 border-b border-[#333] flex items-center justify-between'>
              <div className='flex items-center gap-2.5 font-semibold text-gray-100'>
                <div className='w-8 h-8 rounded-lg bg-[#222] flex items-center justify-center'>
                  <Tv className='w-4 h-4 text-blue-400' />
                </div>
                <span>{activeSource.name} 分类</span>
              </div>
              {categories.length > 0 && (
                <span className='text-xs px-2.5 py-1 rounded-full bg-[#222] border border-[#333] text-gray-300 font-medium'>
                  {categories.length} 个分类
                </span>
              )}
            </div>
            <div className='p-5 space-y-5'>
              {mode === 'category' && (
                <div className='flex flex-wrap gap-2.5'>
                  {loadingCategories ? (
                    <div className='flex items-center gap-2 text-sm text-gray-500'>
                      <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                      加载分类...
                    </div>
                  ) : categoryError ? (
                    <div className='flex items-center gap-2 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800 text-sm text-red-400'>
                      {categoryError}
                    </div>
                  ) : categories.length === 0 ? (
                    <div className='text-center w-full py-6'>
                      <div className='w-16 h-16 mx-auto mb-3 rounded-full bg-[#222] flex items-center justify-center'>
                        <Tv className='w-8 h-8 text-gray-500' />
                      </div>
                      <p className='text-sm text-gray-500'>暂无分类</p>
                    </div>
                  ) : (
                    categories.map((c, index) => (
                      <button
                        key={String(c.type_id)}
                        onClick={() => setActiveCategory(c.type_id)}
                        className={`group relative px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all duration-300 transform hover:scale-105 ${
                          activeCategory === c.type_id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30'
                            : 'border-[#333] text-gray-400 hover:bg-[#222] hover:text-gray-200'
                        }`}
                        style={{
                          animation: `fadeInUp 0.3s ease-out ${index * 0.03}s both`,
                        }}
                      >
                        {c.type_name}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div>
                {loadingItems ? (
                  <div className='flex items-center gap-2 text-sm text-gray-500'>
                    <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
                    加载内容...
                  </div>
                ) : itemsError ? (
                  <div className='flex items-center gap-2 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800 text-sm text-red-400'>
                    {itemsError}
                  </div>
                ) : items.length === 0 ? (
                  <div className='text-center py-12'>
                    <div className='w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#222] flex items-center justify-center'>
                      <Tv className='w-10 h-10 text-gray-500' />
                    </div>
                    <p className='text-sm text-gray-500'>暂无内容</p>
                  </div>
                ) : (
                  <>
                    <div className='grid gap-3 grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
                      {filteredAndSorted.map((item, index) => (
                        <div
                          key={item.id}
                          className='group relative rounded-xl overflow-hidden border border-[#333] hover:border-[#DC143C] transition-all duration-300 bg-[#131722] cursor-pointer hover:shadow-[0_0_15px_rgba(220,20,60,0.3)] hover:-translate-y-1'
                          onClick={() => openPreview(item)}
                          role='button'
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') openPreview(item);
                          }}
                          style={{
                            animation: `fadeInUp 0.4s ease-out ${index * 0.02}s both`,
                          }}
                        >
                          <div className='aspect-[2/3] bg-[#222] overflow-hidden relative'>
                            {item.poster ? (
                              <img
                                src={item.poster}
                                alt={item.title}
                                className='w-full h-full object-cover group-hover:scale-110 transition-transform duration-500'
                                loading='lazy'
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center text-gray-500 text-xs sm:text-sm'>
                                <div className='text-center'>
                                  <Tv className='w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-1 sm:mb-2 opacity-50' />
                                  <div className='text-[10px] sm:text-sm'>无封面</div>
                                </div>
                              </div>
                            )}
                            {/* 渐变遮罩 */}
                            <div className='absolute inset-0 bg-linear-to-t from-[#131722] via-transparent to-transparent opacity-80'></div>

                            {/* 年份标签 */}
                            {item.year && (
                              <div className='absolute top-1 right-1 sm:top-2 sm:right-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg bg-black/70 backdrop-blur-sm text-white text-[10px] sm:text-xs font-medium border border-white/10'>
                                {item.year}
                              </div>
                            )}

                            {/* 分类标签 */}
                            {item.type_name && (
                              <div className='absolute bottom-1 left-1 sm:bottom-2 sm:left-2 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-md sm:rounded-lg bg-[#DC143C]/90 backdrop-blur-sm text-white text-[10px] sm:text-xs font-medium'>
                                {item.type_name}
                              </div>
                            )}
                          </div>

                          <div className='p-1.5 sm:p-3 space-y-1 sm:space-y-1.5 relative z-20'>
                            <div className='font-medium text-xs sm:text-sm text-gray-100 line-clamp-2 group-hover:text-[#DC143C] transition-colors leading-snug min-h-[2rem] sm:min-h-[2.5rem]'>
                              {item.title}
                            </div>
                            {item.remarks && (
                              <div className='text-[10px] sm:text-xs text-gray-500 line-clamp-1'>
                                {item.remarks}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Infinite loader sentinel */}
                    <div
                      ref={loadMoreRef}
                      className='mt-4 flex items-center justify-center py-4'
                    >
                      {loadingMore ? (
                        <div className='text-sm text-gray-500'>加载更多...</div>
                      ) : hasMore ? (
                        <div className='text-xs text-gray-600'>
                          下拉加载更多
                        </div>
                      ) : (
                        <div className='text-xs text-gray-600'>没有更多了</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 预览弹层 */}
        {previewOpen && (
          <div
            className='fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm px-3 py-6 sm:p-4 pb-20 md:pb-4 animate-fadeIn'
            role='dialog'
            aria-modal='true'
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className='w-full max-w-5xl bg-[#131722] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] md:max-h-[90vh] border border-[#333] animate-scaleIn'
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className='relative flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#333] bg-[#1a1a1a] shrink-0'>
                <div className='flex items-center gap-3 flex-1 min-w-0'>
                  <div className='w-10 h-10 rounded-xl bg-[#DC143C] flex items-center justify-center shadow-lg'>
                    <Tv className='w-5 h-5 text-white' />
                  </div>
                  <div className='font-bold text-lg sm:text-xl text-white truncate'>
                    {previewItem?.title || '详情预览'}
                  </div>
                </div>
                <button
                  className='ml-3 shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-[#333] transition-colors'
                  onClick={() => setPreviewOpen(false)}
                  title='关闭'
                >
                  <X className='w-5 h-5' />
                </button>
              </div>
              
              {/* 内容区 */}
              <div className='p-5 sm:p-6 overflow-auto flex-1'>
                {previewLoading ? (
                  <div className='flex flex-col items-center justify-center py-12'>
                    <div className='w-12 h-12 border-4 border-[#DC143C] border-t-transparent rounded-full animate-spin mb-4'></div>
                    <div className='text-sm text-gray-500'>加载详情...</div>
                  </div>
                ) : previewError ? (
                  <div className='flex items-center gap-3 px-4 py-3 rounded-xl bg-red-900/20 border border-red-800 text-sm text-red-400'>
                    <X className='w-5 h-5 shrink-0' />
                    {previewError}
                  </div>
                ) : !previewData ? (
                  <div className='text-center py-12'>
                    <div className='w-20 h-20 mx-auto mb-4 rounded-2xl bg-[#222] flex items-center justify-center'>
                      <Tv className='w-10 h-10 text-gray-500' />
                    </div>
                    <div className='text-sm text-gray-500'>暂无详情</div>
                  </div>
                ) : (
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 md:gap-6'>
                    {/* 左侧封面 - 移动端紧凑显示 */}
                    <div className='md:col-span-1'>
                      <div className='md:sticky md:top-0'>
                        {previewItem?.poster ? (
                          <div className='relative rounded-xl md:rounded-2xl overflow-hidden border border-[#333] group max-w-[200px] mx-auto md:max-w-none'>
                            <img
                              src={previewItem.poster}
                              alt={previewItem.title}
                              className='w-full group-hover:scale-105 transition-transform duration-300'
                            />
                            <div className='absolute inset-0 bg-linear-to-t from-[#131722] to-transparent opacity-0 group-hover:opacity-60 transition-opacity'></div>
                          </div>
                        ) : (
                          <div className='w-full max-w-[200px] mx-auto md:max-w-none aspect-[2/3] bg-[#222] rounded-xl md:rounded-2xl flex items-center justify-center border border-[#333]'>
                            <div className='text-center text-gray-500'>
                              <Tv className='w-12 h-12 md:w-16 md:h-16 mx-auto mb-2 opacity-50' />
                              <div className='text-xs md:text-sm'>暂无封面</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className='md:col-span-2 space-y-2'>
                      <div className='flex items-center gap-2 sm:gap-3 flex-wrap'>
                        <div className='text-base sm:text-lg font-semibold text-white'>
                          {previewData.title || previewItem?.title}
                        </div>
                        {/* 评分徽章 */}
                        {(() => {
                          const d = previewDouban;
                          if (d?.rate) {
                            return (
                              <span className='px-2 py-0.5 rounded-md text-xs bg-green-900/30 text-green-400 border border-green-800/50'>
                                豆瓣 {d.rate}
                              </span>
                            );
                          }
                          if (previewBangumi?.rating?.score) {
                            return (
                              <span className='px-2 py-0.5 rounded-md text-xs bg-purple-900/30 text-purple-400 border border-purple-800/50'>
                                Bangumi {previewBangumi.rating.score}
                              </span>
                            );
                          }
                          return null;
                        })()}
                        {/* 外链按钮 */}
                        {(() => {
                          const d = previewDouban;
                          if (d?.id) {
                            return (
                              <a
                                href={`https://movie.douban.com/subject/${d.id}/`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:underline'
                                title='打开豆瓣页面'
                              >
                                <ExternalLink className='w-3.5 h-3.5' /> 豆瓣
                              </a>
                            );
                          }
                          if (previewBangumi && previewDoubanId) {
                            return (
                              <a
                                href={`https://bgm.tv/subject/${previewDoubanId}`}
                                target='_blank'
                                rel='noopener noreferrer'
                                className='inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 hover:underline'
                                title='打开 Bangumi 页面'
                              >
                                <ExternalLink className='w-3.5 h-3.5' /> Bangumi
                              </a>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className='text-xs sm:text-sm text-gray-400'>
                        年份：{previewData.year || previewItem?.year || '—'}
                      </div>
                      <div className='text-xs sm:text-sm text-gray-400'>
                        来源：{activeSource?.name}
                      </div>
                      <div className='flex flex-wrap gap-2 text-xs'>
                        {previewItem?.type_name && (
                          <span className='px-2 py-0.5 rounded-full bg-[#222] text-gray-300 border border-[#333]'>
                            {previewItem.type_name}
                          </span>
                        )}
                        {previewData?.class && (
                          <span className='px-2 py-0.5 rounded-full bg-[#222] text-gray-300 border border-[#333]'>
                            {previewData.class}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const desc =
                          (previewData?.desc && previewData.desc.trim()) ||
                          (previewSearchPick?.desc &&
                            String(previewSearchPick.desc).trim()) ||
                          (previewItem?.remarks && previewItem.remarks.trim());
                        return desc ? (
                          <div className='mt-1 border border-[#333] rounded-md p-2 sm:p-3 bg-[#1a1a1a] text-xs sm:text-sm text-gray-400 max-h-32 sm:max-h-40 overflow-auto whitespace-pre-line'>
                            {desc}
                          </div>
                        ) : null;
                      })()}
                      
                      {/* Douban/Bangumi 扩展信息 */}
                      <div className='pt-2 space-y-2'>
                        {/* Douban */}
                        {previewDoubanLoading && !previewBangumiLoading && (
                          <div className='text-sm text-gray-500'>
                            加载豆瓣信息...
                          </div>
                        )}
                        {previewDouban &&
                          (() => {
                            const d = previewDouban;
                            return (
                              <div className='text-sm text-gray-300 space-y-1'>
                                <div className='font-semibold text-gray-100'>豆瓣信息</div>
                                {d.title && (
                                  <div className="text-gray-400">
                                    标题：<span className="text-gray-300">{d.title}</span>
                                    {d.rate ? <span>（评分 {d.rate}）</span> : null}
                                  </div>
                                )}
                                {d.directors && d.directors.length > 0 && (
                                  <div className="text-gray-400">导演：<span className="text-gray-300">{d.directors.join('、')}</span></div>
                                )}
                                {d.screenwriters &&
                                  d.screenwriters.length > 0 && (
                                    <div className="text-gray-400">
                                      编剧：<span className="text-gray-300">{d.screenwriters.join('、')}</span>
                                    </div>
                                  )}
                                {d.cast && d.cast.length > 0 && (
                                  <div className="text-gray-400">
                                    主演：<span className="text-gray-300">{d.cast.slice(0, 8).join('、')}</span>
                                    {d.cast.length > 8 ? '…' : ''}
                                  </div>
                                )}
                                <div className='flex flex-wrap gap-2 text-xs pt-1'>
                                  {d.genres &&
                                    d.genres.map((g: string) => (
                                      <span key={g} className='px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-gray-300'>
                                        {g}
                                      </span>
                                    ))}
                                  {d.countries &&
                                    d.countries.map((c: string) => (
                                      <span key={c} className='px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-gray-300'>
                                        {c}
                                      </span>
                                    ))}
                                  {d.languages &&
                                    d.languages.map((l: string) => (
                                      <span key={l} className='px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-gray-300'>
                                        {l}
                                      </span>
                                    ))}
                                </div>
                                {d.first_aired && (
                                  <div className="text-gray-400 pt-1">首播/上映：<span className="text-gray-300">{d.first_aired}</span></div>
                                )}
                                {(d.episodes ||
                                  d.episode_length ||
                                  d.movie_duration) && (
                                  <div className='text-xs text-gray-500 pt-1'>
                                    {d.episodes ? `集数：${d.episodes} ` : ''}
                                    {d.episode_length
                                      ? `单集：${d.episode_length} 分钟 `
                                      : ''}
                                    {d.movie_duration
                                      ? `片长：${d.movie_duration} 分钟`
                                      : ''}
                                  </div>
                                )}
                                {d.plot_summary && (
                                  <div className='text-xs text-gray-500 leading-relaxed mt-2 p-2 bg-[#1a1a1a] rounded-md border border-[#333]'>
                                    {d.plot_summary}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                        {/* Bangumi */}
                        {previewBangumiLoading && (
                          <div className='text-sm text-gray-500'>
                            加载 Bangumi 信息...
                          </div>
                        )}
                        {previewBangumi && (
                          <div className='text-sm text-gray-300 space-y-1'>
                            <div className='font-semibold text-gray-100'>Bangumi 信息</div>
                            <div className="text-gray-400">
                              标题：<span className="text-gray-300">{previewBangumi.name_cn || previewBangumi.name}</span>
                              {previewBangumi.rating?.score ? (
                                <span>
                                  （评分 {previewBangumi.rating.score}）
                                </span>
                              ) : null}
                            </div>
                            {previewBangumi.date && (
                              <div className="text-gray-400">首播：<span className="text-gray-300">{previewBangumi.date}</span></div>
                            )}
                            {Array.isArray(previewBangumi.tags) &&
                              previewBangumi.tags.length > 0 && (
                                <div className='flex flex-wrap gap-2 text-xs pt-1'>
                                  {previewBangumi.tags
                                    .slice(0, 10)
                                    .map((t) => (
                                      <span key={t.name} className='px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-gray-300'>
                                        {t.name}
                                      </span>
                                    ))}
                                </div>
                              )}
                            {Array.isArray(previewBangumi.infobox) &&
                              previewBangumi.infobox.length > 0 && (
                                <div className='text-xs space-y-0.5 pt-1'>
                                  {previewBangumi.infobox
                                    .slice(0, 10)
                                    .map((info, idx: number) => (
                                      <div key={idx} className="text-gray-400">
                                        {info.key}：<span className="text-gray-300">
                                        {Array.isArray(info.value)
                                          ? info.value
                                              .map((v) =>
                                                typeof v === 'string' ? v : v.v
                                              )
                                              .join('、')
                                          : typeof info.value === 'string'
                                          ? info.value
                                          : info.value.v}
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            {previewBangumi.summary && (
                              <div className='text-xs text-gray-500 leading-relaxed mt-2 p-2 bg-[#1a1a1a] rounded-md border border-[#333]'>
                                {previewBangumi.summary}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* 底部操作栏 */}
              <div className='px-5 sm:px-6 py-4 border-t border-[#333] bg-[#1a1a1a] flex items-center justify-between gap-3 shrink-0'>
                <div className='text-xs sm:text-sm text-gray-500'>
                  {previewData?.class && (
                    <span className='inline-flex items-center gap-1.5'>
                      <span className='w-1.5 h-1.5 rounded-full bg-[#DC143C]'></span>
                      {previewData.class}
                    </span>
                  )}
                </div>
                <div className='flex items-center gap-2 sm:gap-3'>
                  <button
                    onClick={() => setPreviewOpen(false)}
                    className='px-3 sm:px-4 py-2 rounded-xl border border-[#333] text-gray-400 hover:text-white hover:bg-[#222] text-sm font-medium transition-colors'
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      if (previewItem) goPlay(previewItem);
                    }}
                    className='group relative inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl bg-[#DC143C] hover:bg-red-700 text-white text-sm font-semibold shadow-lg shadow-[#DC143C]/30 hover:shadow-xl hover:shadow-[#DC143C]/40 transition-all duration-300'
                  >
                    <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 20 20'>
                      <path d='M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z' />
                    </svg>
                    立即播放
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部 Footer */}
      <footer className="w-full py-6 bg-[#0a0a0a] border-t border-[#1f2937] shrink-0">
        <div className="max-w-[2560px] mx-auto px-4 sm:px-6 md:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <div className="flex items-center justify-center md:justify-start">
                <img src="/logo.png" alt="红月搜索 Logo" className="w-10 h-10 mr-2 object-contain" />
                <span className="text-[#00ccff] font-bold text-lg">红月搜索</span>
              </div>
              <p className="text-[#6b7280] text-sm mt-2 text-center md:text-left">
                © {new Date().getFullYear()} 红月搜索-剧名搜索、在线视频神器。
              </p>
            </div>
            
            <div className="text-center md:text-right">
              <div className="flex flex-wrap justify-center md:justify-end gap-x-5 gap-y-2">
                <Link href="/about" className="text-[#9ca3af] hover:text-white text-sm transition-colors">关于红月</Link>
                <Link href="/privacy" className="text-[#9ca3af] hover:text-white text-sm transition-colors">隐私政策</Link>
                <a href="https://200805.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">网盘系统</a>
                <a href="https://400823.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">镜向站</a>
                <a href="https://timis.dpdns.org" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">API中转服务</a>
                <a href="https://ctv.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">RedMoon-CTV</a>
                <a href="https://vtv.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">RedMoon-VTV</a>
                <a href="https://sync.400821.xyz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] hover:text-[#93c5fd] text-sm transition-colors">RedMoon-VTVII</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
