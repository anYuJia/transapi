'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  getAPIKeyUsageStats,
  getAPIKeyDetail,
  deleteAPIKey,
  updateAPIKeyType,
  type APIKeyUsageStats,
  type PluginAPIKey,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  IconArrowLeft,
  IconTrash,
  IconSettings,
  IconCopy,
  IconTrendingUp,
  IconClock,
  IconActivity,
  IconDatabase,
  IconEye,
  IconEyeOff,
  IconChartBar,
} from '@tabler/icons-react';
import { MorphingSquare } from '@/components/ui/morphing-square';
import { cn } from '@/lib/utils';
import Toaster, { ToasterRef } from '@/components/ui/toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps } from 'recharts';

// 获取 Tooltip 样式（根据主题）
const getTooltipWrapperStyle = () => {
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
  return {
    backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
    borderRadius: '8px',
    padding: 0,
    border: `1px solid ${isDark ? '#404040' : '#e5e5e5'}`,
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  };
};

// 自定义 Tooltip 组件
const CustomTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
  if (!active || !payload || !payload.length) return null;

  // 检测当前主题
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div
      style={{
        padding: '12px',
        color: isDark ? '#ffffff' : '#000000',
      }}
    >
      <p style={{ marginBottom: '4px', fontWeight: 500, fontSize: '14px' }}>{label}</p>
      {payload.map((entry: any, index: number) => {
        const value = parseFloat(entry.value);
        if (value === 0 || isNaN(value)) return null;
        return (
          <p key={index} style={{ color: entry.color, margin: '2px 0', fontSize: '14px' }}>
            {entry.name}: ${value.toFixed(4)}
          </p>
        );
      })}
    </div>
  );
};

// 简单的 Tooltip 组件（用于调用次数分布）
const SimpleTooltip = ({ active, payload, label }: TooltipProps<any, any>) => {
  if (!active || !payload || !payload.length) return null;

  // 检测当前主题
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div
      style={{
        padding: '12px',
        color: isDark ? '#ffffff' : '#000000',
      }}
    >
      <p style={{ marginBottom: '4px', fontWeight: 500, fontSize: '14px' }}>{label}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} style={{ color: entry.color, margin: '2px 0', fontSize: '14px' }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
};

const CONFIG_TYPES = [
  { value: 'antigravity', label: 'Antigravity', color: 'bg-purple-500' },
  { value: 'kiro', label: 'Kiro', color: 'bg-blue-500' },
  { value: 'qwen', label: 'Qwen', color: 'bg-green-500' },
  { value: 'codex', label: 'Codex', color: 'bg-orange-500' },
  { value: 'gemini-cli', label: 'Gemini CLI', color: 'bg-red-500' },
  { value: 'zai-tts', label: 'ZAI TTS', color: 'bg-pink-500' },
  { value: 'zai-image', label: 'ZAI Image', color: 'bg-indigo-500' },
] as const;

export default function APIKeyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toasterRef = useRef<ToasterRef>(null);
  const keyId = parseInt(params.id as string);

  const [apiKey, setApiKey] = useState<PluginAPIKey | null>(null);
  const [usageStats, setUsageStats] = useState<APIKeyUsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingType, setIsUpdatingType] = useState(false);
  const [showFullKey, setShowFullKey] = useState(false);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('24h');

  useEffect(() => {
    loadData();
  }, [keyId, timeRange]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // 计算时间范围
      let startDate: string | undefined;
      const now = new Date();

      if (timeRange === '24h') {
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        startDate = start.toISOString();
      } else if (timeRange === '7d') {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate = start.toISOString();
      } else if (timeRange === '30d') {
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDate = start.toISOString();
      }

      const [key, stats] = await Promise.all([
        getAPIKeyDetail(keyId),
        getAPIKeyUsageStats(keyId, startDate ? { start_date: startDate } : undefined),
      ]);

      // 如果没有 key_preview，从完整 key 生成预览
      if (!key.key_preview && key.key) {
        key.key_preview = key.key.substring(0, 8) + '...';
      }

      setApiKey(key);
      setUsageStats(stats);
    } catch (err) {
      toasterRef.current?.show({
        title: '加载失败',
        message: err instanceof Error ? err.message : '获取数据失败',
        variant: 'error',
        position: 'top-right',
      });
      router.push('/dashboard/api-keys');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!apiKey) return;

    if (!confirm(`确定要删除 "${apiKey.name}" 吗？删除后将无法恢复。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAPIKey(keyId);
      toasterRef.current?.show({
        title: '删除成功',
        message: 'API密钥已删除',
        variant: 'success',
        position: 'top-right',
      });
      router.push('/dashboard/api-keys');
    } catch (err) {
      toasterRef.current?.show({
        title: '删除失败',
        message: err instanceof Error ? err.message : '删除API密钥失败',
        variant: 'error',
        position: 'top-right',
      });
      setIsDeleting(false);
    }
  };

  const handleUpdateType = async (newType: string) => {
    if (!apiKey) return;

    setIsUpdatingType(true);
    try {
      await updateAPIKeyType(keyId, newType as any);
      toasterRef.current?.show({
        title: '更新成功',
        message: 'API密钥类型已更新',
        variant: 'success',
        position: 'top-right',
      });
      await loadData();
    } catch (err) {
      toasterRef.current?.show({
        title: '更新失败',
        message: err instanceof Error ? err.message : '更新API密钥类型失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsUpdatingType(false);
    }
  };

  const handleCopyKey = () => {
    if (!apiKey) return;
    const keyToCopy = apiKey.key || apiKey.key_preview;
    navigator.clipboard.writeText(keyToCopy);
    toasterRef.current?.show({
      title: '已复制',
      message: 'API密钥已复制到剪贴板',
      variant: 'success',
      position: 'top-right',
    });
  };

  const getConfigTypeInfo = (type: string) => {
    return CONFIG_TYPES.find(t => t.value === type) || CONFIG_TYPES[0];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-center py-12">
          <MorphingSquare className="size-8" />
        </div>
      </div>
    );
  }

  if (!apiKey || !usageStats) {
    return null;
  }

  const typeInfo = getConfigTypeInfo(apiKey.config_type);
  const successRate = usageStats.total_requests > 0
    ? ((usageStats.success_requests / usageStats.total_requests) * 100).toFixed(1)
    : 0;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Toaster ref={toasterRef} />

      {/* 返回按钮 */}
      <Button
        variant="ghost"
        onClick={() => router.push('/dashboard/api-keys')}
        className="mb-6 gap-2"
      >
        <IconArrowLeft className="size-4" />
        返回列表
      </Button>

      {/* 页面头部 */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={cn('w-2 h-16 rounded-full', typeInfo.color)} />
            <div>
              <h1 className="text-3xl font-bold mb-2">{apiKey.name}</h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{typeInfo.label}</Badge>
                {!apiKey.is_active && (
                  <Badge variant="destructive">已禁用</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {/* 时间范围选择器 */}
            <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">最近 24 小时</SelectItem>
                <SelectItem value="7d">最近 7 天</SelectItem>
                <SelectItem value="30d">最近 30 天</SelectItem>
                <SelectItem value="all">全部时间</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-2 text-red-500 hover:text-red-600"
            >
              {isDeleting ? (
                <MorphingSquare className="size-4" />
              ) : (
                <IconTrash className="size-4" />
              )}
              删除
            </Button>
          </div>
        </div>

        {/* API Key 信息卡片 */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">API Key</Label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-sm break-all">
                    {showFullKey ? (apiKey.key || apiKey.key_preview) : apiKey.key_preview}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowFullKey(!showFullKey)}
                    title={showFullKey ? '隐藏完整密钥' : '显示完整密钥'}
                    disabled={!apiKey.key}
                  >
                    {showFullKey ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleCopyKey}>
                    <IconCopy className="size-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">服务类型</Label>
                <Select
                  value={apiKey.config_type}
                  onValueChange={handleUpdateType}
                  disabled={isUpdatingType}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONFIG_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <div className={cn('w-2 h-2 rounded-full', type.color)} />
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">创建时间</Label>
                <div className="text-sm">{formatDate(apiKey.created_at)}</div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">最后使用</Label>
                <div className="text-sm">
                  {apiKey.last_used_at ? formatDate(apiKey.last_used_at) : '从未使用'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 时间范围提示 */}
      <div className="mb-4">
        <div className="text-sm text-muted-foreground">
          数据统计范围: {
            timeRange === '24h' ? '最近 24 小时' :
            timeRange === '7d' ? '最近 7 天' :
            timeRange === '30d' ? '最近 30 天' :
            '全部时间'
          }
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">总请求数</div>
              <IconActivity className="size-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {usageStats.total_requests.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              成功 {usageStats.success_requests} / 失败 {usageStats.failed_requests}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">成功率</div>
              <IconTrendingUp className="size-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">{successRate}%</div>
            <div className="text-xs text-green-600 dark:text-green-400">
              {usageStats.success_requests} 次成功
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">
                {apiKey.config_type === 'kiro' ? '配额消耗' : 'Token 用量'}
              </div>
              <IconDatabase className="size-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {apiKey.config_type === 'kiro'
                ? `$${usageStats.total_quota_consumed.toFixed(2)}`
                : usageStats.total_tokens.toLocaleString()
              }
            </div>
            <div className="text-xs text-muted-foreground">
              {apiKey.config_type === 'kiro'
                ? `基于配额计费`
                : `输入 ${usageStats.input_tokens.toLocaleString()} / 输出 ${usageStats.output_tokens.toLocaleString()}`
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-muted-foreground">平均耗时</div>
              <IconClock className="size-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-bold mb-1">
              {Math.round(usageStats.avg_duration_ms)}ms
            </div>
            <div className="text-xs text-muted-foreground">
              配额消耗 ${usageStats.total_quota_consumed.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 数据分析图表 */}
      {usageStats.total_requests > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconChartBar className="size-5" />
              <CardTitle>数据分析</CardTitle>
            </div>
            <CardDescription>可视化展示使用情况和消耗分布</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="model" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-3">
                <TabsTrigger value="model">模型消耗分布</TabsTrigger>
                <TabsTrigger value="timeline">调用次数分布</TabsTrigger>
                <TabsTrigger value="endpoint">端点分布</TabsTrigger>
              </TabsList>

              {/* 模型消耗分布 */}
              <TabsContent value="model" className="mt-6">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium mb-1">模型消耗分布</div>
                    <div className="text-xs text-muted-foreground">
                      总计: ${usageStats.total_quota_consumed.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeRange === '24h' ? '最近 24 小时' :
                     timeRange === '7d' ? '最近 7 天' :
                     timeRange === '30d' ? '最近 30 天' :
                     '全部时间'}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={(() => {
                      // 使用后端返回的聚合数据
                      const hourlyModelStats: Record<string, Record<string, number>> = {};
                      const allModels = new Set<string>();

                      // 检查 hourly_model_stats 是否存在
                      if (!usageStats.hourly_model_stats || usageStats.hourly_model_stats.length === 0) {
                        return [];
                      }

                      // 处理后端返回的按小时聚合的数据
                      usageStats.hourly_model_stats.forEach(stat => {
                        const date = new Date(stat.hour);
                        const hourKey = `${date.getMonth() + 1}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00`;

                        if (!hourlyModelStats[hourKey]) {
                          hourlyModelStats[hourKey] = {};
                        }

                        const modelName = stat.model_id;
                        allModels.add(modelName);

                        hourlyModelStats[hourKey][modelName] = parseFloat(stat.quota_consumed);
                      });

                      // 计算每个模型的总消耗，用于排序和过滤
                      const modelTotals: Record<string, number> = {};
                      allModels.forEach(model => {
                        modelTotals[model] = 0;
                        Object.values(hourlyModelStats).forEach(hourData => {
                          modelTotals[model] += hourData[model] || 0;
                        });
                      });

                      // 过滤掉总消耗为0的模型，并按总消耗降序排序（消耗最多的在最底下）
                      const sortedModels = Array.from(allModels)
                        .filter(model => modelTotals[model] > 0)
                        .sort((a, b) => modelTotals[b] - modelTotals[a]);

                      // 转换为图表数据格式
                      return Object.entries(hourlyModelStats)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([time, models]) => {
                          const dataPoint: any = { time };
                          sortedModels.forEach(model => {
                            dataPoint[model] = models[model] ? parseFloat(models[model].toFixed(4)) : 0;
                          });
                          return dataPoint;
                        });
                    })()}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="time"
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                      label={{ value: '配额消耗 ($)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      content={<CustomTooltip />}
                      wrapperStyle={getTooltipWrapperStyle()}
                      cursor={false}
                    />
                    <Legend />
                    {(() => {
                      // 检查数据是否存在
                      if (!usageStats.hourly_model_stats || usageStats.hourly_model_stats.length === 0) {
                        return null;
                      }

                      // 使用后端返回的聚合数据生成所有模型的 Bar 组件
                      const allModels = new Set<string>();
                      usageStats.hourly_model_stats.forEach(stat => {
                        allModels.add(stat.model_id);
                      });

                      // 计算每个模型的总消耗用于排序和过滤
                      const modelTotals: Record<string, number> = {};
                      allModels.forEach(model => {
                        modelTotals[model] = usageStats.hourly_model_stats
                          .filter(stat => stat.model_id === model)
                          .reduce((sum, stat) => sum + parseFloat(stat.quota_consumed), 0);
                      });

                      // 过滤掉总消耗为0的模型，并按总消耗降序排序（消耗最多的在最底下）
                      const sortedModels = Array.from(allModels)
                        .filter(model => modelTotals[model] > 0)
                        .sort((a, b) => modelTotals[b] - modelTotals[a]);

                      // 为每个模型分配颜色
                      const colors = [
                        '#f59e0b', // 橙色
                        '#3b82f6', // 蓝色
                        '#10b981', // 绿色
                        '#ef4444', // 红色
                        '#8b5cf6', // 紫色
                        '#ec4899', // 粉色
                        '#14b8a6', // 青色
                        '#f97316', // 深橙色
                      ];

                      return sortedModels.map((model, index) => (
                        <Bar
                          key={model}
                          dataKey={model}
                          stackId="a"
                          fill={colors[index % colors.length]}
                        />
                      ));
                    })()}
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* 调用次数分布 */}
              <TabsContent value="timeline" className="mt-6">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium mb-1">调用次数分布</div>
                    <div className="text-xs text-muted-foreground">
                      按时间段统计的请求次数
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeRange === '24h' ? '最近 24 小时' :
                     timeRange === '7d' ? '最近 7 天' :
                     timeRange === '30d' ? '最近 30 天' :
                     '全部时间'}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={(() => {
                      // 按小时分组统计
                      const hourlyStats: Record<string, { success: number; failed: number; models: Set<string> }> = {};

                      usageStats.recent_requests.forEach(req => {
                        if (!req.created_at) return;
                        const date = new Date(req.created_at);
                        const hourKey = `${date.getMonth() + 1}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:00`;

                        if (!hourlyStats[hourKey]) {
                          hourlyStats[hourKey] = { success: 0, failed: 0, models: new Set() };
                        }

                        if (req.success) {
                          hourlyStats[hourKey].success++;
                        } else {
                          hourlyStats[hourKey].failed++;
                        }

                        if (req.model_name) {
                          hourlyStats[hourKey].models.add(req.model_name);
                        }
                      });

                      return Object.entries(hourlyStats)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([time, stats]) => ({
                          time,
                          成功: stats.success,
                          失败: stats.failed,
                        }));
                    })()}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="time"
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                    />
                    <Tooltip
                      content={<SimpleTooltip />}
                      wrapperStyle={getTooltipWrapperStyle()}
                      cursor={false}
                    />
                    <Legend />
                    <Bar dataKey="成功" stackId="a" fill="#10b981" />
                    <Bar dataKey="失败" stackId="a" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* 端点分布 */}
              <TabsContent value="endpoint" className="mt-6">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium mb-1">端点调用分布</div>
                    <div className="text-xs text-muted-foreground">
                      不同 API 端点的请求次数
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeRange === '24h' ? '最近 24 小时' :
                     timeRange === '7d' ? '最近 7 天' :
                     timeRange === '30d' ? '最近 30 天' :
                     '全部时间'}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={Object.entries(usageStats.by_endpoint)
                      .sort((a, b) => b[1].total_requests - a[1].total_requests)
                      .slice(0, 10)
                      .map(([endpoint, stats]) => ({
                        name: endpoint.length > 30 ? '...' + endpoint.substring(endpoint.length - 30) : endpoint,
                        fullName: endpoint,
                        请求次数: stats.total_requests,
                        配额消耗: parseFloat(stats.total_quota_consumed.toFixed(2)),
                      }))}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="name"
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: 'currentColor' }}
                    />
                    <Tooltip
                      content={<SimpleTooltip />}
                      wrapperStyle={getTooltipWrapperStyle()}
                      cursor={false}
                    />
                    <Legend />
                    <Bar dataKey="请求次数" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* 按服务类型统计 */}
      {Object.keys(usageStats.by_config_type).length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>按服务类型统计</CardTitle>
            <CardDescription>不同服务类型的使用情况</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(usageStats.by_config_type).map(([type, stats]) => {
                const typeInfo = getConfigTypeInfo(type);
                return (
                  <div key={type} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={cn('w-3 h-3 rounded-full', typeInfo.color)} />
                      <span className="font-semibold">{typeInfo.label}</span>
                      <Badge variant="outline" className="ml-auto">
                        {stats.total_requests} 次
                      </Badge>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">成功率:</span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          {stats.success_rate}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">成功/失败:</span>
                        <span className="font-medium">
                          {stats.success_requests} / {stats.failed_requests}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Token:</span>
                        <span className="font-medium">{stats.total_tokens.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">配额:</span>
                        <span className="font-medium">${stats.total_quota_consumed.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 按模型统计 */}
      {Object.keys(usageStats.by_model).length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>按模型统计</CardTitle>
            <CardDescription>不同 AI 模型的使用情况</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(usageStats.by_model)
                .sort((a, b) => b[1].total_requests - a[1].total_requests)
                .map(([model, stats]) => (
                  <div key={model} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate mb-1" title={model}>
                        {model}
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>请求: {stats.total_requests}</span>
                        <span className="text-green-600 dark:text-green-400">
                          成功率: {stats.success_rate}%
                        </span>
                        <span>Token: {stats.total_tokens.toLocaleString()}</span>
                        <span>配额: ${stats.total_quota_consumed.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {((stats.total_requests / usageStats.total_requests) * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-muted-foreground">占比</div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 按端点统计 */}
      {Object.keys(usageStats.by_endpoint).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>按 API 端点统计</CardTitle>
            <CardDescription>不同 API 端点的使用情况</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(usageStats.by_endpoint)
                .sort((a, b) => b[1].total_requests - a[1].total_requests)
                .map(([endpoint, stats]) => (
                  <div key={endpoint} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <code className="text-sm font-mono text-muted-foreground flex-1 mr-4">
                        {endpoint}
                      </code>
                      <Badge variant="outline">{stats.total_requests} 次</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground mb-1">成功率</div>
                        <div className="font-semibold text-green-600 dark:text-green-400">
                          {stats.success_rate}%
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Token</div>
                        <div className="font-semibold">{stats.total_tokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">配额</div>
                        <div className="font-semibold">${stats.total_quota_consumed.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">平均耗时</div>
                        <div className="font-semibold">{Math.round(stats.avg_duration_ms)}ms</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 最近请求记录 */}
      {usageStats.recent_requests && usageStats.recent_requests.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>最近请求记录</CardTitle>
            <CardDescription>最近 10 条 API 请求详情</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {usageStats.recent_requests.map((req) => (
                <div
                  key={req.id}
                  className={cn(
                    'border rounded-lg p-3 hover:bg-muted/50 transition-colors',
                    !req.success && 'border-red-200 dark:border-red-900'
                  )}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant={req.success ? 'default' : 'destructive'} className="shrink-0">
                        {req.success ? '成功' : '失败'}
                      </Badge>
                      <code className="text-xs font-mono text-muted-foreground truncate">
                        {req.method} {req.endpoint}
                      </code>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {req.created_at ? new Date(req.created_at).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      }) : '-'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    {req.model_name && (
                      <div>
                        <span className="text-muted-foreground">模型: </span>
                        <span className="font-medium">{req.model_name}</span>
                      </div>
                    )}
                    {req.config_type && (
                      <div>
                        <span className="text-muted-foreground">服务: </span>
                        <span className="font-medium">{req.config_type}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">耗时: </span>
                      <span className="font-medium">{req.duration_ms}ms</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Token: </span>
                      <span className="font-medium">{req.total_tokens.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">配额: </span>
                      <span className="font-medium">${parseFloat(String(req.quota_consumed)).toFixed(4)}</span>
                    </div>
                  </div>

                  {!req.success && req.error_message && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2 rounded">
                      <span className="font-semibold">错误: </span>
                      {req.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 无数据提示 */}
      {usageStats.total_requests === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <IconActivity className="size-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">该 API Key 暂无使用记录</p>
              <p className="text-sm">使用此 API Key 发起请求后，统计数据将显示在这里</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('text-sm font-medium', className)}>{children}</div>;
}
