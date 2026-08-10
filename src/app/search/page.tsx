/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any,@typescript-eslint/no-non-null-assertion,no-empty */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { startTransition, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';

import SearchResultFilter, { SearchFilterCategory } from '@/components/SearchResultFilter';
import SearchSuggestions from '@/components/SearchSuggestions';
import VideoCard, { VideoCardHandle } from '@/components/VideoCard';
import VirtualSearchGrid, { VirtualSearchGridRef } from '@/components/VirtualSearchGrid';
import NetDiskSearchResults from '@/components/NetDiskSearchResults';
import YouTubeVideoCard from '@/components/YouTubeVideoCard';
import DirectYouTubePlayer from '@/components/DirectYouTubePlayer';
import TMDBFilterPanel, { TMDBFilterState } from '@/components/TMDBFilterPanel';
import AcgSearch from '@/components/AcgSearch';

function SearchPageClient() {
  // 根据 type_name 推断内容类型的辅助函数
  const inferTypeFromName = (typeName?: string, episodeCount?: number): string => {
    if (!typeName) {
      // 如果没有 type_name，使用集数判断（向后兼容）
      return episodeCount && episodeCount > 1 ? 'tv' : 'movie';
    }
    const lowerType = typeName.toLowerCase();
    if (lowerType.includes('综艺') || lowerType.includes('variety')) return 'variety';
    if (lowerType.includes('电影') || lowerType.includes('movie')) return 'movie';
    if (lowerType.includes('电视剧') || lowerType.includes('剧集') || lowerType.includes('tv') || lowerType.includes('series')) return 'tv';
    if (lowerType.includes('动漫') || lowerType.includes('动画') || lowerType.includes('anime')) return 'anime';
    if (lowerType.includes('纪录片') || lowerType.includes('documentary')) return 'documentary';
    // 默认根据集数判断
    return episodeCount && episodeCount > 1 ? 'tv' : 'movie';
  };

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);
  // VirtualSearchGrid ref for scroll control
  const virtualGridRef = useRef<VirtualSearchGridRef>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQueryRef = useRef<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [totalSources, setTotalSources] = useState(0);
  const [completedSources, setCompletedSources] = useState(0);
  const pendingResultsRef = useRef<SearchResult[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const [useFluidSearch, setUseFluidSearch] = useState(true);
  // 虚拟化开关状态
  const [useVirtualization, setUseVirtualization] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useVirtualization');
      return saved !== null ? JSON.parse(saved) : true; // 默认启用
    }
    return true;
  });

  // 移除多余UI模块后的搜索类别，默认保持为 'video' 影视搜索
  const [searchType, setSearchType] = useState<'video' | 'netdisk' | 'youtube' | 'tmdb-actor'>('video');
  const [netdiskResourceType, setNetdiskResourceType] = useState<'netdisk' | 'acg'>('netdisk'); 
  const [netdiskResults, setNetdiskResults] = useState<{ [key: string]: any[] } | null>(null);
  const [netdiskLoading, setNetdiskLoading] = useState(false);
  const [netdiskError, setNetdiskError] = useState<string | null>(null);
  const [netdiskTotal, setNetdiskTotal] = useState(0);

  // ACG动漫磁力搜索相关状态
  const [acgTriggerSearch, setAcgTriggerSearch] = useState<boolean>();
  const [acgError, setAcgError] = useState<string | null>(null);
  
  // YouTube搜索相关状态
  const [youtubeResults, setYoutubeResults] = useState<any[] | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeWarning, setYoutubeWarning] = useState<string | null>(null);
  const [youtubeContentType, setYoutubeContentType] = useState<'all' | 'music' | 'movie' | 'educational' | 'gaming' | 'sports' | 'news'>('all');
  const [youtubeSortOrder, setYoutubeSortOrder] = useState<'relevance' | 'date' | 'rating' | 'viewCount' | 'title'>('relevance');
  const [youtubeMode, setYoutubeMode] = useState<'search' | 'direct'>('search'); 

  // TMDB演员搜索相关状态
  const [tmdbActorResults, setTmdbActorResults] = useState<any[] | null>(null);
  const [tmdbActorLoading, setTmdbActorLoading] = useState(false);
  const [tmdbActorError, setTmdbActorError] = useState<string | null>(null);
  const [tmdbActorType, setTmdbActorType] = useState<'movie' | 'tv'>('movie');

  // TMDB筛选状态
  const [tmdbFilterState, setTmdbFilterState] = useState<TMDBFilterState>({
    startYear: undefined,
    endYear: undefined,
    minRating: undefined,
    maxRating: undefined,
    minPopularity: undefined,
    maxPopularity: undefined,
    minVoteCount: undefined,
    minEpisodeCount: undefined,
    genreIds: [],
    languages: [],
    onlyRated: false,
    sortBy: 'popularity',
    sortOrder: 'desc',
    limit: undefined 
  });

  // TMDB筛选面板显示状态
  const [tmdbFilterVisible, setTmdbFilterVisible] = useState(false);
  // 聚合卡片 refs 与聚合统计缓存
  const groupRefs = useRef<Map<string, React.RefObject<VideoCardHandle>>>(new Map());
  const groupStatsRef = useRef<Map<string, { douban_id?: number; episodes?: number; source_names: string[] }>>(new Map());

  const getGroupRef = (key: string) => {
    let ref = groupRefs.current.get(key);
    if (!ref) {
      ref = React.createRef<VideoCardHandle>();
      groupRefs.current.set(key, ref);
    }
    return ref;
  };

  const computeGroupStats = (group: SearchResult[]) => {
    const episodes = (() => {
      const countMap = new Map<number, number>();
      group.forEach((g) => {
        const len = g.episodes?.length || 0;
        if (len > 0) countMap.set(len, (countMap.get(len) || 0) + 1);
      });
      let max = 0;
      let res = 0;
      countMap.forEach((v, k) => {
        if (v > max) { max = v; res = k; }
      });
      return res;
    })();
    const source_names = Array.from(new Set(group.map((g) => g.source_name).filter(Boolean))) as string[];

    const douban_id = (() => {
      const countMap = new Map<number, number>();
      group.forEach((g) => {
        if (g.douban_id && g.douban_id > 0) {
          countMap.set(g.douban_id, (countMap.get(g.douban_id) || 0) + 1);
        }
      });
      let max = 0;
      let res: number | undefined;
      countMap.forEach((v, k) => {
        if (v > max) { max = v; res = k; }
      });
      return res;
    })();

    return { episodes, source_names, douban_id };
  };
  // 过滤器：非聚合与聚合
  const [filterAll, setFilterAll] = useState<{ source: string; title: string; year: string; yearOrder: 'none' | 'asc' | 'desc' }>({
    source: 'all',
    title: 'all',
    year: 'all',
    yearOrder: 'none',
  });
  const [filterAgg, setFilterAgg] = useState<{ source: string; title: string; year: string; yearOrder: 'none' | 'asc' | 'desc' }>({
    source: 'all',
    title: 'all',
    year: 'all',
    yearOrder: 'none',
  });

  // 获取默认聚合设置：只读取用户本地设置，默认为 true
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true; // 默认启用聚合
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });

  // 保存虚拟化设置
  const toggleVirtualization = () => {
    const newValue = !useVirtualization;
    setUseVirtualization(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('useVirtualization', JSON.stringify(newValue));
    }
  };

  // 在“无排序”场景用于每个源批次的预排序：完全匹配标题优先，其次年份倒序，未知年份最后
  const sortBatchForNoOrder = (items: SearchResult[]) => {
    const q = currentQueryRef.current.trim();
    return items.slice().sort((a, b) => {
      const aExact = (a.title || '').trim() === q;
      const bExact = (b.title || '').trim() === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aNum = Number.parseInt(a.year as any, 10);
      const bNum = Number.parseInt(b.year as any, 10);
      const aValid = !Number.isNaN(aNum);
      const bValid = !Number.isNaN(bNum);
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      if (aValid && bValid) return bNum - aNum; // 年份倒序
      return 0;
    });
  };

  // 简化的年份排序：unknown/空值始终在最后
  const compareYear = (aYear: string, bYear: string, order: 'none' | 'asc' | 'desc') => {
    if (order === 'none') return 0;
    const aIsEmpty = !aYear || aYear === 'unknown';
    const bIsEmpty = !bYear || bYear === 'unknown';

    if (aIsEmpty && bIsEmpty) return 0;
    if (aIsEmpty) return 1; 
    if (bIsEmpty) return -1; 

    const aNum = parseInt(aYear, 10);
    const bNum = parseInt(bYear, 10);

    return order === 'asc' ? aNum - bNum : bNum - aNum;
  };

  // 聚合后的结果（按标题和年份分组）
  const aggregatedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    const keyOrder: string[] = []; 

    searchResults.forEach((item) => {
      const key = `${item.title.replaceAll(' ', '')}-${item.year || 'unknown'
        }-${item.episodes.length === 1 ? 'movie' : 'tv'}`;
      const arr = map.get(key) || [];

      if (arr.length === 0) {
        keyOrder.push(key);
      }
      arr.push(item);
      map.set(key, arr);
    });

    return keyOrder.map(key => [key, map.get(key)!] as [string, SearchResult[]]);
  }, [searchResults]);

  useEffect(() => {
    aggregatedResults.forEach(([mapKey, group]) => {
      const stats = computeGroupStats(group);
      const prev = groupStatsRef.current.get(mapKey);
      if (!prev) {
        groupStatsRef.current.set(mapKey, stats);
        return;
      }
      const ref = groupRefs.current.get(mapKey);
      if (ref && ref.current) {
        if (prev.episodes !== stats.episodes) {
          ref.current.setEpisodes(stats.episodes);
        }
        const prevNames = (prev.source_names || []).join('|');
        const nextNames = (stats.source_names || []).join('|');
        if (prevNames !== nextNames) {
          ref.current.setSourceNames(stats.source_names);
        }
        if (prev.douban_id !== stats.douban_id) {
          ref.current.setDoubanId(stats.douban_id);
        }
        groupStatsRef.current.set(mapKey, stats);
      }
    });
  }, [aggregatedResults]);

  // 构建筛选选项
  const filterOptions = useMemo(() => {
    const sourcesSet = new Map<string, string>();
    const titlesSet = new Set<string>();
    const yearsSet = new Set<string>();

    searchResults.forEach((item) => {
      if (item.source && item.source_name) {
        sourcesSet.set(item.source, item.source_name);
      }
      if (item.title) titlesSet.add(item.title);
      if (item.year) yearsSet.add(item.year);
    });

    const sourceOptions: { label: string; value: string }[] = [
      { label: '全部来源', value: 'all' },
      ...Array.from(sourcesSet.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ label, value })),
    ];

    const titleOptions: { label: string; value: string }[] = [
      { label: '全部标题', value: 'all' },
      ...Array.from(titlesSet.values())
        .sort((a, b) => a.localeCompare(b))
        .map((t) => ({ label: t, value: t })),
    ];

    const years = Array.from(yearsSet.values());
    const knownYears = years.filter((y) => y !== 'unknown').sort((a, b) => parseInt(b) - parseInt(a));
    const hasUnknown = years.includes('unknown');
    const yearOptions: { label: string; value: string }[] = [
      { label: '全部年份', value: 'all' },
      ...knownYears.map((y) => ({ label: y, value: y })),
      ...(hasUnknown ? [{ label: '未知', value: 'unknown' }] : []),
    ];

    const categoriesAll: SearchFilterCategory[] = [
      { key: 'source', label: '来源', options: sourceOptions },
      { key: 'title', label: '标题', options: titleOptions },
      { key: 'year', label: '年份', options: yearOptions },
    ];

    const categoriesAgg: SearchFilterCategory[] = [
      { key: 'source', label: '来源', options: sourceOptions },
      { key: 'title', label: '标题', options: titleOptions },
      { key: 'year', label: '年份', options: yearOptions },
    ];

    return { categoriesAll, categoriesAgg };
  }, [searchResults]);

  // 非聚合：应用筛选与排序
  const filteredAllResults = useMemo(() => {
    const { source, title, year, yearOrder } = filterAll;
    const filtered = searchResults.filter((item) => {
      if (source !== 'all' && item.source !== source) return false;
      if (title !== 'all' && item.title !== title) return false;
      if (year !== 'all' && item.year !== year) return false;
      return true;
    });

    if (yearOrder === 'none') {
      return filtered;
    }

    return filtered.sort((a, b) => {
      const yearComp = compareYear(a.year, b.year, yearOrder);
      if (yearComp !== 0) return yearComp;

      const aExactMatch = a.title === searchQuery.trim();
      const bExactMatch = b.title === searchQuery.trim();
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      return yearOrder === 'asc' ?
        a.title.localeCompare(b.title) :
        b.title.localeCompare(a.title);
    });
  }, [searchResults, filterAll, searchQuery]);

  // 聚合：应用筛选与排序
  const filteredAggResults = useMemo(() => {
    const { source, title, year, yearOrder } = filterAgg as any;
    const filtered = aggregatedResults.filter(([_, group]) => {
      const gTitle = group[0]?.title ?? '';
      const gYear = group[0]?.year ?? 'unknown';
      const hasSource = source === 'all' ? true : group.some((item) => item.source === source);
      if (!hasSource) return false;
      if (title !== 'all' && gTitle !== title) return false;
      if (year !== 'all' && gYear !== year) return false;
      return true;
    });

    if (yearOrder === 'none') {
      return filtered;
    }

    return filtered.sort((a, b) => {
      const aYear = a[1][0].year;
      const bYear = b[1][0].year;
      const yearComp = compareYear(aYear, bYear, yearOrder);
      if (yearComp !== 0) return yearComp;

      const aExactMatch = a[1][0].title === searchQuery.trim();
      const bExactMatch = b[1][0].title === searchQuery.trim();
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      const aTitle = a[1][0].title;
      const bTitle = b[1][0].title;
      return yearOrder === 'asc' ?
        aTitle.localeCompare(bTitle) :
        bTitle.localeCompare(aTitle);
    });
  }, [aggregatedResults, filterAgg, searchQuery]);

  useEffect(() => {
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();
    getSearchHistory().then(setSearchHistory);

    const initialQuery = searchParams.get('q');
    if (initialQuery) {
      setSearchQuery(initialQuery);
      setShowResults(true);
      if (searchType === 'netdisk') {
        handleNetDiskSearch(initialQuery);
      }
    }

    if (typeof window !== 'undefined') {
      const savedFluidSearch = localStorage.getItem('fluidSearch');
      const defaultFluidSearch =
        (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;
      if (savedFluidSearch !== null) {
        setUseFluidSearch(JSON.parse(savedFluidSearch));
      } else if (defaultFluidSearch !== undefined) {
        setUseFluidSearch(defaultFluidSearch);
      }
    }

    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    const getScrollTop = () => {
      return document.body.scrollTop || document.documentElement.scrollTop || window.scrollY || 0;
    };

    let isRunning = false;
    const checkScrollPosition = () => {
      if (!isRunning) return;

      const scrollTop = getScrollTop();
      const shouldShow = scrollTop > 300;
      setShowBackToTop(shouldShow);

      requestAnimationFrame(checkScrollPosition);
    };

    isRunning = true;
    checkScrollPosition();

    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.body.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      unsubscribe();
      isRunning = false; 
      window.removeEventListener('scroll', handleScroll);
      document.body.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if ((searchType === 'netdisk' || searchType === 'youtube' || searchType === 'tmdb-actor') && showResults) {
      const currentQuery = searchQuery.trim() || searchParams.get('q');
      if (currentQuery) {
        if (searchType === 'netdisk' && netdiskResourceType === 'netdisk' && !netdiskLoading && !netdiskResults && !netdiskError) {
          handleNetDiskSearch(currentQuery);
        } else if (searchType === 'netdisk' && netdiskResourceType === 'acg') {
          setAcgTriggerSearch(prev => !prev);
        } else if (searchType === 'youtube' && !youtubeLoading && !youtubeResults && !youtubeError) {
          handleYouTubeSearch(currentQuery);
        } else if (searchType === 'tmdb-actor' && !tmdbActorLoading && !tmdbActorResults && !tmdbActorError) {
          handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
        }
      }
    }
  }, [searchType, netdiskResourceType, showResults, searchQuery, searchParams, netdiskLoading, netdiskResults, netdiskError, youtubeLoading, youtubeResults, youtubeError, tmdbActorLoading, tmdbActorResults, tmdbActorError]);

  useEffect(() => {
    const query = searchParams.get('q') || '';
    currentQueryRef.current = query.trim();

    if (query) {
      setSearchQuery(query);
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch { }
        eventSourceRef.current = null;
      }
      setSearchResults([]);
      setTotalSources(0);
      setCompletedSources(0);
      pendingResultsRef.current = [];
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      setIsLoading(true);
      setShowResults(true);

      const trimmed = query.trim();

      let currentFluidSearch = useFluidSearch;
      if (typeof window !== 'undefined') {
        const savedFluidSearch = localStorage.getItem('fluidSearch');
        if (savedFluidSearch !== null) {
          currentFluidSearch = JSON.parse(savedFluidSearch);
        } else {
          const defaultFluidSearch = (window as any).RUNTIME_CONFIG?.FLUID_SEARCH !== false;
          currentFluidSearch = defaultFluidSearch;
        }
      }

      if (currentFluidSearch !== useFluidSearch) {
        setUseFluidSearch(currentFluidSearch);
      }

      if (currentFluidSearch) {
        const es = new EventSource(`/api/search/ws?q=${encodeURIComponent(trimmed)}`);
        eventSourceRef.current = es;

        es.onmessage = (event) => {
          if (!event.data) return;
          try {
            const payload = JSON.parse(event.data);
            if (currentQueryRef.current !== trimmed) return;
            switch (payload.type) {
              case 'start':
                setTotalSources(payload.totalSources || 0);
                setCompletedSources(0);
                break;
              case 'source_result': {
                setCompletedSources((prev) => prev + 1);
                if (Array.isArray(payload.results) && payload.results.length > 0) {
                  const activeYearOrder = (viewMode === 'agg' ? (filterAgg.yearOrder) : (filterAll.yearOrder));
                  const incoming: SearchResult[] =
                    activeYearOrder === 'none'
                      ? sortBatchForNoOrder(payload.results as SearchResult[])
                      : (payload.results as SearchResult[]);
                  pendingResultsRef.current.push(...incoming);
                  if (!flushTimerRef.current) {
                    flushTimerRef.current = window.setTimeout(() => {
                      const toAppend = pendingResultsRef.current;
                      pendingResultsRef.current = [];
                      startTransition(() => {
                        setSearchResults((prev) => prev.concat(toAppend));
                      });
                      flushTimerRef.current = null;
                    }, 80);
                  }
                }
                break;
              }
              case 'source_error':
                setCompletedSources((prev) => prev + 1);
                break;
              case 'complete':
                setCompletedSources(payload.completedSources || totalSources);
                if (pendingResultsRef.current.length > 0) {
                  const toAppend = pendingResultsRef.current;
                  pendingResultsRef.current = [];
                  if (flushTimerRef.current) {
                    clearTimeout(flushTimerRef.current);
                    flushTimerRef.current = null;
                  }
                  startTransition(() => {
                    setSearchResults((prev) => prev.concat(toAppend));
                  });
                }
                setIsLoading(false);
                try { es.close(); } catch { }
                if (eventSourceRef.current === es) {
                  eventSourceRef.current = null;
                }
                break;
            }
          } catch { }
        };

        es.onerror = () => {
          setIsLoading(false);
          if (pendingResultsRef.current.length > 0) {
            const toAppend = pendingResultsRef.current;
            pendingResultsRef.current = [];
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current);
              flushTimerRef.current = null;
            }
            startTransition(() => {
              setSearchResults((prev) => prev.concat(toAppend));
            });
          }
          try { es.close(); } catch { }
          if (eventSourceRef.current === es) {
            eventSourceRef.current = null;
          }
        };
      } else {
        fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
          .then(response => response.json())
          .then(data => {
            if (currentQueryRef.current !== trimmed) return;

            if (data.results && Array.isArray(data.results)) {
              const activeYearOrder = (viewMode === 'agg' ? (filterAgg.yearOrder) : (filterAll.yearOrder));
              const results: SearchResult[] =
                activeYearOrder === 'none'
                  ? sortBatchForNoOrder(data.results as SearchResult[])
                  : (data.results as SearchResult[]);

              setSearchResults(results);
              setTotalSources(1);
              setCompletedSources(1);
            }
            setIsLoading(false);
          })
          .catch(() => {
            setIsLoading(false);
          });
      }
      setShowSuggestions(false);

      addSearchHistory(query);
    } else {
      setShowResults(false);
      setShowSuggestions(false);
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch { }
        eventSourceRef.current = null;
      }
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingResultsRef.current = [];
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (!value.trim()) {
      setShowResults(false);
    }
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setShowSuggestions(true);
  };

  const handleYouTubeSearch = async (query: string, contentType = youtubeContentType, sortOrder = youtubeSortOrder) => {
    if (!query.trim()) return;

    setYoutubeLoading(true);
    setYoutubeError(null);
    setYoutubeWarning(null);
    setYoutubeResults(null);

    try {
      let searchUrl = `/api/youtube/search?q=${encodeURIComponent(query.trim())}`;
      if (contentType && contentType !== 'all') {
        searchUrl += `&contentType=${contentType}`;
      }
      if (sortOrder && sortOrder !== 'relevance') {
        searchUrl += `&order=${sortOrder}`;
      }
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (response.ok && data.success) {
        setYoutubeResults(data.videos || []);
        if (data.warning) {
          setYoutubeWarning(data.warning);
        }
      } else {
        setYoutubeError(data.error || 'YouTube搜索失败');
      }
    } catch (error: any) {
      console.error('YouTube搜索请求失败:', error);
      let errorMessage = 'YouTube搜索请求失败，请稍后重试';
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      setYoutubeError(errorMessage);
    } finally {
      setYoutubeLoading(false);
    }
  };

  const handleNetDiskSearch = async (query: string) => {
    if (!query.trim()) return;

    setNetdiskLoading(true);
    setNetdiskError(null);
    setNetdiskResults(null);
    setNetdiskTotal(0);

    try {
      const response = await fetch(`/api/netdisk/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setNetdiskResults(data.data.merged_by_type || {});
        setNetdiskTotal(data.data.total || 0);
      } else {
        setNetdiskError(data.error || '网盘搜索失败');
      }
    } catch (error: any) {
      console.error('网盘搜索请求失败:', error);
      setNetdiskError('网盘搜索请求失败，请稍后重试');
    } finally {
      setNetdiskLoading(false);
    }
  };

  const handleTmdbActorSearch = async (query: string, type = tmdbActorType, filterState = tmdbFilterState) => {
    if (!query.trim()) return;

    console.log(`🚀 [前端TMDB] 开始搜索: ${query}, type=${type}`);

    setTmdbActorLoading(true);
    setTmdbActorError(null);
    setTmdbActorResults(null);

    try {
      const params = new URLSearchParams({
        actor: query.trim(),
        type: type
      });

      if (filterState.limit && filterState.limit > 0) {
        params.append('limit', filterState.limit.toString());
      }

      if (filterState.startYear) params.append('startYear', filterState.startYear.toString());
      if (filterState.endYear) params.append('endYear', filterState.endYear.toString());
      if (filterState.minRating) params.append('minRating', filterState.minRating.toString());
      if (filterState.maxRating) params.append('maxRating', filterState.maxRating.toString());
      if (filterState.minPopularity) params.append('minPopularity', filterState.minPopularity.toString());
      if (filterState.maxPopularity) params.append('maxPopularity', filterState.maxPopularity.toString());
      if (filterState.minVoteCount) params.append('minVoteCount', filterState.minVoteCount.toString());
      if (filterState.minEpisodeCount) params.append('minEpisodeCount', filterState.minEpisodeCount.toString());
      if (filterState.genreIds && filterState.genreIds.length > 0) params.append('genreIds', filterState.genreIds.join(','));
      if (filterState.languages && filterState.languages.length > 0) params.append('languages', filterState.languages.join(','));
      if (filterState.onlyRated) params.append('onlyRated', 'true');
      if (filterState.sortBy) params.append('sortBy', filterState.sortBy);
      if (filterState.sortOrder) params.append('sortOrder', filterState.sortOrder);

      const response = await fetch(`/api/tmdb/actor?${params.toString()}`);
      const data = await response.json();

      if (response.ok && data.code === 200) {
        setTmdbActorResults(data.list || []);
      } else {
        setTmdbActorError(data.error || data.message || '搜索演员失败');
      }
    } catch (error: any) {
      console.error('TMDB演员搜索请求失败:', error);
      setTmdbActorError('搜索演员失败，请稍后重试');
    } finally {
      setTmdbActorLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setShowSuggestions(false);
    setShowResults(true);

    if (searchType === 'netdisk') {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      if (netdiskResourceType === 'netdisk') {
        handleNetDiskSearch(trimmed);
      } else {
        setAcgTriggerSearch(prev => !prev);
      }
    } else if (searchType === 'youtube') {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleYouTubeSearch(trimmed);
    } else if (searchType === 'tmdb-actor') {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      handleTmdbActorSearch(trimmed, tmdbActorType, tmdbFilterState);
    } else {
      setIsLoading(true);
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    setIsLoading(true);
    setShowResults(true);
    router.push(`/search?q=${encodeURIComponent(suggestion)}`);
  };

  const scrollToTop = () => {
    try {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      document.documentElement.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });

      if (virtualGridRef.current) {
        virtualGridRef.current.scrollToTop();
      }
    } catch (error) {
      window.scrollTo(0, 0);
    }
  };

  return (
    <main className="min-h-screen bg-[#131722] text-white selection:bg-[#DC143C] selection:text-white">
      <div className="pt-6 md:pt-10 pb-20 w-full">
        <div className='overflow-visible mb-10'>
          
          {/* 搜索框区域 - 暗黑胶囊版 (与主页一致) */}
          <div className='mb-8'>
            <form onSubmit={handleSearch} className="w-full max-w-2xl px-2 sm:px-0 relative mx-auto z-50">
              <div className="group flex items-center h-14 bg-[#1a1a1a] border border-[#333] hover:border-[#555] focus-within:border-[#DC143C] focus-within:shadow-[0_0_20px_rgba(220,20,60,0.15)] rounded-full transition-all duration-300 pl-1.5 pr-1.5 shadow-xl relative z-20">
                
                {/* 首页标识图标 */}
                <Link href="/" className="h-11 px-3 sm:px-5 flex items-center justify-center bg-transparent text-gray-400 hover:text-white hover:bg-white/10 rounded-full font-medium transition-all duration-200 shrink-0" aria-label="返回首页" title="返回首页">
                  <svg className="w-5 h-5 sm:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                  </svg>
                  <span className="hidden sm:inline text-sm">首页</span>
                </Link>
                
                {/* 分割线 */}
                <div className="h-6 w-px bg-[#333] mx-1 sm:mx-2 transition-colors group-focus-within:bg-[#555]"></div>

                {/* 输入框 */}
                <input 
                  id="searchInput"
                  type="text" 
                  name="search"
                  value={searchQuery}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  className="flex-1 bg-transparent text-white px-2 sm:px-4 py-2 focus:outline-none placeholder-gray-600 text-base min-w-0" 
                  placeholder="搜索你想看的剧名..." 
                  autoComplete="off"
                  aria-label="视频搜索框" 
                />
                
                {/* 一键清空按钮 */}
                {searchQuery.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setShowResults(false);
                      setShowSuggestions(true);
                      document.getElementById('searchInput')?.focus();
                    }}
                    className="px-3 flex items-center justify-center text-gray-500 hover:text-[#DC143C] transition-colors shrink-0"
                    aria-label="清空搜索框"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </button>
                )}
                
                {/* 搜索提交按钮 */}
                <button type="submit" 
                  className="h-11 px-5 sm:px-8 flex items-center justify-center bg-[#DC143C] hover:bg-[#b81030] text-white rounded-full font-medium transition-all duration-200 shadow-[0_0_10px_rgba(220,20,60,0.3)] hover:shadow-[0_0_15px_rgba(220,20,60,0.5)] transform hover:scale-[1.02] active:scale-95 shrink-0" 
                  aria-label="搜索按钮">
                  <svg className="w-4 h-4 mr-1.5 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                  <span>搜索</span>
                </button>
              </div>

              {/* 搜索建议 */}
              <SearchSuggestions
                query={searchQuery}
                isVisible={showSuggestions}
                onSelect={handleSuggestionSelect}
                onClose={() => setShowSuggestions(false)}
                onEnterKey={() => {
                  const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
                  if (!trimmed) return;
                  setSearchQuery(trimmed);
                  setIsLoading(true);
                  setShowResults(true);
                  setShowSuggestions(false);
                  router.push(`/search?q=${encodeURIComponent(trimmed)}`);
                }}
              />
            </form>
          </div>

          {/* 搜索结果或搜索历史 */}
          <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
            {showResults ? (
              <section className='mb-12'>
                {searchType === 'netdisk' ? (
                  /* 网盘搜索结果 */
                  <>
                    <div className='mb-4'>
                      <h2 className='text-xl font-bold text-gray-100'>
                        资源搜索
                        {netdiskLoading && netdiskResourceType === 'netdisk' && (
                          <span className='ml-2 inline-block align-middle'>
                            <span className='inline-block h-3 w-3 border-2 border-[#333] border-t-green-500 rounded-full animate-spin'></span>
                          </span>
                        )}
                      </h2>

                      {/* 资源类型切换器 */}
                      <div className='mt-3 flex items-center gap-2'>
                        <span className='text-sm text-gray-400'>资源类型：</span>
                        <div className='flex gap-2'>
                          <button
                            onClick={() => {
                              setNetdiskResourceType('netdisk');
                              setAcgError(null);
                              const currentQuery = searchQuery.trim() || searchParams?.get('q');
                              if (currentQuery) {
                                handleNetDiskSearch(currentQuery);
                              }
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                              netdiskResourceType === 'netdisk'
                                ? 'bg-[#DC143C] text-white border-[#DC143C] shadow-md'
                                : 'bg-[#1a1a1a] text-gray-300 border-[#333] hover:bg-[#222]'
                            }`}
                          >
                            💾 网盘资源
                          </button>
                          <button
                            onClick={() => {
                              setNetdiskResourceType('acg');
                              setNetdiskResults(null);
                              setNetdiskError(null);
                              const currentQuery = searchQuery.trim() || searchParams?.get('q');
                              if (currentQuery) {
                                setAcgTriggerSearch(prev => !prev);
                              }
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${
                              netdiskResourceType === 'acg'
                                ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                                : 'bg-[#1a1a1a] text-gray-300 border-[#333] hover:bg-[#222]'
                            }`}
                          >
                            🎌 动漫磁力
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 根据资源类型显示不同的搜索结果 */}
                    {netdiskResourceType === 'netdisk' ? (
                      <NetDiskSearchResults
                        results={netdiskResults}
                        loading={netdiskLoading}
                        error={netdiskError}
                        total={netdiskTotal}
                      />
                    ) : (
                      <AcgSearch
                        keyword={searchQuery.trim() || searchParams?.get('q') || ''}
                        triggerSearch={acgTriggerSearch}
                        onError={(error) => setAcgError(error)}
                      />
                    )}
                  </>
                ) : searchType === 'tmdb-actor' ? (
                  /* TMDB演员搜索结果 */
                  <>
                    <div className='mb-4'>
                      <h2 className='text-xl font-bold text-gray-100'>
                        TMDB演员搜索结果
                        {tmdbActorLoading && (
                          <span className='ml-2 inline-block align-middle'>
                            <span className='inline-block h-3 w-3 border-2 border-[#333] border-t-blue-500 rounded-full animate-spin'></span>
                          </span>
                        )}
                      </h2>

                      {/* 电影/电视剧类型选择器 */}
                      <div className='mt-3 flex items-center gap-2'>
                        <span className='text-sm text-gray-400'>类型：</span>
                        <div className='flex gap-2'>
                          {[
                            { key: 'movie', label: '电影' },
                            { key: 'tv', label: '电视剧' }
                          ].map((type) => (
                            <button
                              key={type.key}
                              onClick={() => {
                                setTmdbActorType(type.key as 'movie' | 'tv');
                                const currentQuery = searchQuery.trim() || searchParams?.get('q');
                                if (currentQuery) {
                                  handleTmdbActorSearch(currentQuery, type.key as 'movie' | 'tv', tmdbFilterState);
                                }
                              }}
                              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                                tmdbActorType === type.key
                                  ? 'bg-[#DC143C] text-white border-[#DC143C]'
                                  : 'bg-[#1a1a1a] text-gray-300 border-[#333] hover:bg-[#222]'
                              }`}
                              disabled={tmdbActorLoading}
                            >
                              {type.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* TMDB筛选面板 */}
                      <div className='mt-4'>
                        <TMDBFilterPanel
                          contentType={tmdbActorType}
                          filters={tmdbFilterState}
                          onFiltersChange={(newFilterState) => {
                            setTmdbFilterState(newFilterState);
                            const currentQuery = searchQuery.trim() || searchParams?.get('q');
                            if (currentQuery) {
                              handleTmdbActorSearch(currentQuery, tmdbActorType, newFilterState);
                            }
                          }}
                          isVisible={tmdbFilterVisible}
                          onToggleVisible={() => setTmdbFilterVisible(!tmdbFilterVisible)}
                          resultCount={tmdbActorResults?.length || 0}
                        />
                      </div>
                    </div>

                    {tmdbActorError ? (
                      <div className='text-center py-8'>
                        <div className='text-[#DC143C] mb-2'>{tmdbActorError}</div>
                        <button
                          onClick={() => {
                            const currentQuery = searchQuery.trim() || searchParams?.get('q');
                            if (currentQuery) {
                              handleTmdbActorSearch(currentQuery, tmdbActorType, tmdbFilterState);
                            }
                          }}
                          className='px-4 py-2 bg-red-900/20 hover:bg-red-800/30 text-[#DC143C] rounded-lg transition-colors'
                        >
                          重试
                        </button>
                      </div>
                    ) : tmdbActorResults && tmdbActorResults.length > 0 ? (
                      <div className='grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                        {tmdbActorResults.map((item, index) => (
                          <div key={item.id || index} className='w-full'>
                            <VideoCard
                              title={item.title}
                              poster={item.poster}
                              year={item.year}
                              rate={item.rate}
                              from='douban'
                              type={tmdbActorType}
                            />
                          </div>
                        ))}
                      </div>
                    ) : !tmdbActorLoading ? (
                      <div className='text-center text-gray-500 py-8'>
                        未找到相关演员作品
                      </div>
                    ) : null}
                  </>
                ) : searchType === 'youtube' ? (
                  /* YouTube搜索结果 */
                  <>
                    <div className='mb-4'>
                      <h2 className='text-xl font-bold text-gray-100'>
                        YouTube视频
                        {youtubeLoading && youtubeMode === 'search' && (
                          <span className='ml-2 inline-block align-middle'>
                            <span className='inline-block h-3 w-3 border-2 border-[#333] border-t-[#DC143C] rounded-full animate-spin'></span>
                          </span>
                        )}
                      </h2>
                      
                      {/* YouTube模式切换 */}
                      <div className='mt-3 flex items-center gap-2'>
                        <div className='inline-flex items-center bg-[#1a1a1a] rounded-lg p-1 space-x-1 border border-[#333]'>
                          <button
                            type='button'
                            onClick={() => {
                              setYoutubeMode('search');
                              setYoutubeError(null);
                              setYoutubeWarning(null);
                            }}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              youtubeMode === 'search'
                                ? 'bg-[#333] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            🔍 搜索视频
                          </button>
                          <button
                            type='button'
                            onClick={() => {
                              setYoutubeMode('direct');
                              setYoutubeResults(null);
                              setYoutubeError(null);
                              setYoutubeWarning(null);
                            }}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              youtubeMode === 'direct'
                                ? 'bg-[#333] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            🔗 直接播放
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* YouTube内容区域 */}
                    {youtubeMode === 'direct' ? (
                      /* 直接播放模式 */
                      <div className='space-y-4'>
                        <div className='bg-[#1a1a1a] border border-[#333] rounded-lg p-4'>
                          <div className='flex items-center text-blue-400 mb-2'>
                            <svg className='w-5 h-5 mr-2' fill='currentColor' viewBox='0 0 20 20'>
                              <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
                            </svg>
                            <span className='font-medium'>💡 直接播放YouTube视频</span>
                          </div>
                          <p className='text-gray-400 text-sm'>
                            粘贴任意YouTube链接，无需搜索即可直接播放视频。支持所有常见的YouTube链接格式。
                          </p>
                        </div>
                        <DirectYouTubePlayer />
                      </div>
                    ) : (
                      /* 搜索模式 */
                      <>
                        {/* 内容类型选择器 */}
                        <div className='mt-3 flex flex-wrap gap-2'>
                          {[
                            { key: 'all', label: '全部' },
                            { key: 'music', label: '音乐' },
                            { key: 'movie', label: '电影' },
                            { key: 'educational', label: '教育' },
                            { key: 'gaming', label: '游戏' },
                            { key: 'sports', label: '体育' },
                            { key: 'news', label: '新闻' }
                          ].map((type) => (
                            <button
                              key={type.key}
                              onClick={() => {
                                setYoutubeContentType(type.key as any);
                                const currentQuery = searchQuery.trim() || searchParams?.get('q');
                                if (currentQuery) {
                                  handleYouTubeSearch(currentQuery, type.key as any, youtubeSortOrder);
                                }
                              }}
                              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                                youtubeContentType === type.key
                                  ? 'bg-[#DC143C] text-white border-[#DC143C]'
                                  : 'bg-[#1a1a1a] text-gray-300 border-[#333] hover:bg-[#222]'
                              }`}
                              disabled={youtubeLoading}
                            >
                              {type.label}
                            </button>
                          ))}
                        </div>
                        
                        {/* 排序选择器 */}
                        <div className='mt-3 flex items-center gap-3'>
                          <span className='text-sm text-gray-400'>排序：</span>
                          <div className='flex flex-wrap gap-2'>
                            {[
                              { key: 'relevance', label: '相关性' },
                              { key: 'date', label: '最新发布', icon: '🕒' },
                              { key: 'viewCount', label: '观看次数', icon: '👀' },
                              { key: 'rating', label: '评分', icon: '⭐' },
                              { key: 'title', label: '标题', icon: '🔤' }
                            ].map((sort) => (
                              <button
                                key={sort.key}
                                onClick={() => {
                                  setYoutubeSortOrder(sort.key as any);
                                  const currentQuery = searchQuery.trim() || searchParams?.get('q');
                                  if (currentQuery) {
                                    handleYouTubeSearch(currentQuery, youtubeContentType, sort.key as any);
                                  }
                                }}
                                className={`px-2 py-1 text-xs rounded border transition-colors flex items-center gap-1 ${
                                  youtubeSortOrder === sort.key
                                    ? 'bg-[#DC143C] text-white border-[#DC143C]'
                                    : 'bg-[#1a1a1a] text-gray-400 border-[#333] hover:bg-[#222]'
                                }`}
                                disabled={youtubeLoading}
                              >
                                {sort.icon && <span>{sort.icon}</span>}
                                <span>{sort.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {/* 警告信息显示 */}
                        {youtubeWarning && (
                          <div className='mb-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg'>
                            <div className='flex items-center text-yellow-500'>
                              <svg className='w-4 h-4 mr-2' fill='currentColor' viewBox='0 0 20 20'>
                                <path fillRule='evenodd' d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z' clipRule='evenodd' />
                              </svg>
                              <span className='text-sm'>{youtubeWarning}</span>
                            </div>
                          </div>
                        )}
                        
                        {youtubeError ? (
                          <div className='text-center py-8'>
                            <div className='text-[#DC143C] mb-2'>{youtubeError}</div>
                            <button
                              onClick={() => {
                                const currentQuery = searchQuery.trim() || searchParams?.get('q');
                                if (currentQuery) {
                                  handleYouTubeSearch(currentQuery, youtubeContentType, youtubeSortOrder);
                                }
                              }}
                              className='px-4 py-2 bg-red-900/20 hover:bg-red-800/30 text-[#DC143C] rounded-lg transition-colors'
                            >
                              重试
                            </button>
                          </div>
                        ) : youtubeResults && youtubeResults.length > 0 ? (
                          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                            {youtubeResults.map((video, index) => (
                              <YouTubeVideoCard key={video.videoId || index} video={video} />
                            ))}
                          </div>
                        ) : !youtubeLoading ? (
                          <div className='text-center text-gray-500 py-8'>
                            未找到相关YouTube视频
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : (
                  /* 原有的影视搜索结果 */
                  <>
                    {/* 标题 */}
                    <div className='mb-4'>
                      <h2 className='text-xl font-bold text-gray-100'>
                        搜索结果
                        {totalSources > 0 && useFluidSearch && (
                          <span className='ml-2 text-sm font-normal text-gray-400'>
                            {completedSources}/{totalSources}
                          </span>
                        )}
                        {isLoading && useFluidSearch && (
                          <span className='ml-2 inline-block align-middle'>
                            <span className='inline-block h-3 w-3 border-2 border-[#333] border-t-green-500 rounded-full animate-spin'></span>
                          </span>
                        )}
                      </h2>
                    </div>
                {/* 筛选器 + 开关控件 */}
                <div className='mb-8 space-y-4'>
                  {/* 筛选器 */}
                  <div className='flex-1 min-w-0'>
                    {viewMode === 'agg' ? (
                      <SearchResultFilter
                        categories={filterOptions.categoriesAgg}
                        values={filterAgg}
                        onChange={(v) => setFilterAgg(v as any)}
                      />
                    ) : (
                      <SearchResultFilter
                        categories={filterOptions.categoriesAll}
                        values={filterAll}
                        onChange={(v) => setFilterAll(v as any)}
                      />
                    )}
                  </div>
                  
                  {/* 开关控件行 */}
                  <div className='flex items-center justify-end gap-6'>
                    {/* 虚拟化开关 */}
                    <label className='flex items-center gap-3 cursor-pointer select-none shrink-0 group'>
                      <span className='text-xs sm:text-sm font-medium text-gray-400 group-hover:text-blue-400 transition-colors'>
                        ⚡ 虚拟滑动
                      </span>
                      <div className='relative'>
                        <input
                          type='checkbox'
                          className='sr-only peer'
                          checked={useVirtualization}
                          onChange={toggleVirtualization}
                        />
                        <div className='w-11 h-6 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full peer-checked:from-blue-500 peer-checked:to-purple-600 transition-all duration-300 shadow-inner'></div>
                        <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 peer-checked:translate-x-5 shadow-lg peer-checked:shadow-blue-500/50 peer-checked:scale-105'></div>
                        {/* 开关内图标 */}
                        <div className='absolute top-1.5 left-1.5 w-3 h-3 flex items-center justify-center pointer-events-none transition-all duration-300 peer-checked:translate-x-5'>
                          <span className='text-[10px] peer-checked:text-white text-gray-500'>
                            {useVirtualization ? '✨' : '○'}
                          </span>
                        </div>
                      </div>
                    </label>

                    {/* 聚合开关 */}
                    <label className='flex items-center gap-3 cursor-pointer select-none shrink-0 group'>
                      <span className='text-xs sm:text-sm font-medium text-gray-400 group-hover:text-emerald-400 transition-colors'>
                        🔄 聚合
                      </span>
                      <div className='relative'>
                        <input
                          type='checkbox'
                          className='sr-only peer'
                          checked={viewMode === 'agg'}
                          onChange={() => setViewMode(viewMode === 'agg' ? 'all' : 'agg')}
                        />
                        <div className='w-11 h-6 bg-gradient-to-r from-gray-600 to-gray-700 rounded-full peer-checked:from-emerald-500 peer-checked:to-green-600 transition-all duration-300 shadow-inner'></div>
                        <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 peer-checked:translate-x-5 shadow-lg peer-checked:shadow-emerald-500/50 peer-checked:scale-105'></div>
                        {/* 开关内图标 */}
                        <div className='absolute top-1.5 left-1.5 w-3 h-3 flex items-center justify-center pointer-events-none transition-all duration-300 peer-checked:translate-x-5'>
                          <span className='text-[10px] peer-checked:text-white text-gray-500'>
                            {viewMode === 'agg' ? '🔗' : '○'}
                          </span>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
                {/* 条件渲染：虚拟化 vs 传统网格 */}
                {useVirtualization ? (
                  <VirtualSearchGrid
                    ref={virtualGridRef}
                    allResults={searchResults}
                    filteredResults={filteredAllResults}
                    aggregatedResults={aggregatedResults}
                    filteredAggResults={filteredAggResults}
                    viewMode={viewMode}
                    searchQuery={searchQuery}
                    isLoading={isLoading}
                    groupRefs={groupRefs}
                    groupStatsRef={groupStatsRef}
                    getGroupRef={getGroupRef}
                    computeGroupStats={computeGroupStats}
                  />
                ) : (
                  // 传统网格渲染（保持原有逻辑）
                  searchResults.length === 0 ? (
                    isLoading ? (
                      <div className='flex justify-center items-center h-40'>
                        <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
                      </div>
                    ) : (
                      <div className='text-center text-gray-500 py-8'>
                        未找到相关结果
                      </div>
                    )
                  ) : (
                    <div
                      key={`search-results-${viewMode}`}
                      className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
                    >
                      {viewMode === 'agg'
                        ? filteredAggResults.map(([mapKey, group]) => {
                          const title = group[0]?.title || '';
                          const poster = group[0]?.poster || '';
                          const year = group[0]?.year || 'unknown';
                          const { episodes, source_names, douban_id } = computeGroupStats(group);
                          const type = episodes === 1 ? 'movie' : 'tv';

                          // 如果该聚合第一次出现，写入初始统计
                          if (!groupStatsRef.current.has(mapKey)) {
                            groupStatsRef.current.set(mapKey, { episodes, source_names, douban_id });
                          }

                          return (
                            <div key={`agg-${mapKey}`} className='w-full'>
                              <VideoCard
                                ref={getGroupRef(mapKey)}
                                from='search'
                                isAggregate={true}
                                title={title}
                                poster={poster}
                                year={year}
                                episodes={episodes}
                                source_names={source_names}
                                douban_id={douban_id}
                                query={
                                  searchQuery.trim() !== title
                                    ? searchQuery.trim()
                                    : ''
                                }
                                type={type}
                              />
                            </div>
                          );
                        })
                        : filteredAllResults.map((item) => (
                          <div
                            key={`all-${item.source}-${item.id}`}
                            className='w-full'
                          >
                            <VideoCard
                              id={item.id}
                              title={item.title}
                              poster={item.poster}
                              episodes={item.episodes.length}
                              source={item.source}
                              source_name={item.source_name}
                              douban_id={item.douban_id}
                              query={
                                searchQuery.trim() !== item.title
                                  ? searchQuery.trim()
                                  : ''
                              }
                              year={item.year}
                              from='search'
                              type={inferTypeFromName(item.type_name, item.episodes.length)}
                            />
                          </div>
                        ))}
                    </div>
                  )
                )}
                  </>
                )}
              </section>
            ) : (
              /* 搜索历史或YouTube无搜索状态 */
              <>
                {/* 搜索历史 - 优先显示 */}
                {searchHistory.length > 0 && (
                  <section className='mb-12'>
                    <h2 className='mb-4 text-xl font-bold text-gray-100 text-left'>
                      搜索历史
                      {searchHistory.length > 0 && (
                        <button
                          onClick={() => {
                            clearSearchHistory(); 
                          }}
                          className='ml-3 text-sm text-gray-400 hover:text-[#DC143C] transition-colors'
                        >
                          清空
                        </button>
                      )}
                    </h2>
                    <div className='flex flex-wrap gap-2'>
                      {searchHistory.map((item) => (
                        <div key={item} className='relative group'>
                          <button
                            onClick={() => {
                              setSearchQuery(item);
                              router.push(
                                `/search?q=${encodeURIComponent(item.trim())}`
                              );
                            }}
                            className='px-4 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#555] rounded-full text-sm text-gray-300 transition-colors duration-200'
                          >
                            {item}
                          </button>
                          {/* 删除按钮 */}
                          <button
                            aria-label='删除搜索历史'
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              deleteSearchHistory(item); 
                            }}
                            className='absolute -top-1 -right-1 w-4 h-4 opacity-0 group-hover:opacity-100 bg-gray-600 hover:bg-[#DC143C] text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                          >
                            <X className='w-3 h-3' />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* YouTube特殊模式显示 - 在搜索历史之后 */}
                {searchType === 'youtube' && (
                  <section className='mb-12'>
                    <div className='mb-4'>
                      <h2 className='text-xl font-bold text-gray-100'>
                        YouTube视频
                      </h2>
                      
                      {/* YouTube模式切换 */}
                      <div className='mt-3 flex items-center gap-2'>
                        <div className='inline-flex items-center bg-[#1a1a1a] rounded-lg p-1 space-x-1 border border-[#333]'>
                          <button
                            type='button'
                            onClick={() => {
                              setYoutubeMode('search');
                              setYoutubeError(null);
                              setYoutubeWarning(null);
                            }}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              youtubeMode === 'search'
                                ? 'bg-[#333] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            🔍 搜索视频
                          </button>
                          <button
                            type='button'
                            onClick={() => {
                              setYoutubeMode('direct');
                              setYoutubeResults(null);
                              setYoutubeError(null);
                              setYoutubeWarning(null);
                            }}
                            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                              youtubeMode === 'direct'
                                ? 'bg-[#333] text-white shadow-sm'
                                : 'text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            🔗 直接播放
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* YouTube内容区域 */}
                    {youtubeMode === 'direct' ? (
                      /* 直接播放模式 */
                      <div className='space-y-4'>
                        <div className='bg-[#1a1a1a] border border-[#333] rounded-lg p-4'>
                          <div className='flex items-center text-blue-400 mb-2'>
                            <svg className='w-5 h-5 mr-2' fill='currentColor' viewBox='0 0 20 20'>
                              <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z' clipRule='evenodd' />
                            </svg>
                            <span className='font-medium'>💡 直接播放YouTube视频</span>
                          </div>
                          <p className='text-gray-400 text-sm'>
                            粘贴任意YouTube链接，无需搜索即可直接播放视频。支持所有常见的YouTube链接格式。
                          </p>
                        </div>
                        <DirectYouTubePlayer />
                      </div>
                    ) : (
                      /* 搜索模式提示 */
                      <div className='text-center text-gray-500 py-8'>
                        <div className='mb-4'>
                          <svg className='w-16 h-16 mx-auto text-gray-600' fill='currentColor' viewBox='0 0 20 20'>
                            <path fillRule='evenodd' d='M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z' clipRule='evenodd' />
                          </svg>
                        </div>
                        <p className='text-lg mb-2'>在上方搜索框输入关键词</p>
                        <p className='text-sm'>开始搜索YouTube视频</p>
                      </div>
                    )}
                  </section>
                )}

              </>
            )}
          </div>
        </div>
      </div>

      {/* 返回顶部悬浮按钮 */}
      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 right-6 md:bottom-6 z-50 w-12 h-12 bg-gray-800 hover:bg-[#DC143C] border border-[#333] text-white rounded-full shadow-lg hover:shadow-[0_0_15px_rgba(220,20,60,0.5)] transition-all duration-300 flex items-center justify-center ${showBackToTop
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6' />
      </button>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
