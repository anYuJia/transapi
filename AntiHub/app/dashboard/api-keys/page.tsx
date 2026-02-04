'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteAPIKey,
  generateAPIKey,
  getAPIKeys,
  getAPIKeyUsageStats,
  updateAPIKeyType,
  type PluginAPIKey,
  type APIKeyUsageStats,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  IconKey,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconCopy,
  IconChevronRight,
  IconSearch,
  IconFilter,
} from '@tabler/icons-react';
import { MorphingSquare } from '@/components/ui/morphing-square';
import { cn } from '@/lib/utils';
import Toaster, { ToasterRef } from '@/components/ui/toast';

const CONFIG_TYPES = [
  { value: 'antigravity', label: 'Antigravity', color: 'bg-purple-500' },
  { value: 'kiro', label: 'Kiro', color: 'bg-blue-500' },
  { value: 'qwen', label: 'Qwen', color: 'bg-green-500' },
  { value: 'codex', label: 'Codex', color: 'bg-orange-500' },
  { value: 'gemini-cli', label: 'Gemini CLI', color: 'bg-red-500' },
  { value: 'zai-tts', label: 'ZAI TTS', color: 'bg-pink-500' },
  { value: 'zai-image', label: 'ZAI Image', color: 'bg-indigo-500' },
] as const;

export default function APIKeysPage() {
  const router = useRouter();
  const toasterRef = useRef<ToasterRef>(null);
  const [apiKeys, setApiKeys] = useState<PluginAPIKey[]>([]);
  const [filteredKeys, setFilteredKeys] = useState<PluginAPIKey[]>([]);
  const [usageStats, setUsageStats] = useState<Record<number, APIKeyUsageStats>>({});
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<number | null>(null);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedConfigType, setSelectedConfigType] = useState<'antigravity' | 'kiro' | 'qwen' | 'codex' | 'gemini-cli' | 'zai-tts' | 'zai-image'>('antigravity');

  useEffect(() => {
    loadAPIKeys();
  }, []);

  useEffect(() => {
    filterAPIKeys();
  }, [apiKeys, searchQuery, filterType]);

  const loadAPIKeys = async () => {
    try {
      setIsLoading(true);
      const keys = await getAPIKeys();
      setApiKeys(keys);

      // 并行加载所有 API Key 的使用统计
      const statsPromises = keys.map(key =>
        getAPIKeyUsageStats(key.id).catch(() => null)
      );
      const statsResults = await Promise.all(statsPromises);

      // 构建 usageStats 对象
      const stats: Record<number, APIKeyUsageStats> = {};
      keys.forEach((key, index) => {
        if (statsResults[index]) {
          stats[key.id] = statsResults[index]!;
        }
      });
      setUsageStats(stats);
    } catch (err) {
      toasterRef.current?.show({
        title: '加载失败',
        message: err instanceof Error ? err.message : '获取API密钥列表失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterAPIKeys = () => {
    let filtered = apiKeys;

    // 按类型过滤
    if (filterType !== 'all') {
      filtered = filtered.filter(key => key.config_type === filterType);
    }

    // 按搜索关键词过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(key =>
        key.name.toLowerCase().includes(query) ||
        key.key_preview.toLowerCase().includes(query)
      );
    }

    setFilteredKeys(filtered);
  };

  const handleGenerateKey = async () => {
    if (!keyName.trim()) {
      toasterRef.current?.show({
        title: '验证失败',
        message: '请输入API密钥名称',
        variant: 'error',
        position: 'top-right',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateAPIKey(keyName, selectedConfigType);
      setNewApiKey(result.key);
      setShowApiKey(true);
      toasterRef.current?.show({
        title: '创建成功',
        message: 'API密钥已创建，请妥善保管',
        variant: 'success',
        position: 'top-right',
      });
      await loadAPIKeys();
    } catch (err) {
      toasterRef.current?.show({
        title: '创建失败',
        message: err instanceof Error ? err.message : '创建API密钥失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setNewApiKey('');
    setShowApiKey(false);
    setKeyName('');
    setSelectedConfigType('antigravity');
  };

  const toggleKeyVisibility = (keyId: number) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev);
      if (newSet.has(keyId)) {
        newSet.delete(keyId);
      } else {
        newSet.add(keyId);
      }
      return newSet;
    });
  };

  const handleDeleteKey = async (keyId: number, keyName: string) => {
    if (!confirm(`确定要删除 "${keyName}" 吗？删除后将无法恢复，所有使用此密钥的应用将无法访问 AI 资源。`)) {
      return;
    }

    setDeletingKeyId(keyId);
    try {
      await deleteAPIKey(keyId);
      toasterRef.current?.show({
        title: '删除成功',
        message: 'API密钥已删除',
        variant: 'success',
        position: 'top-right',
      });
      await loadAPIKeys();
    } catch (err) {
      toasterRef.current?.show({
        title: '删除失败',
        message: err instanceof Error ? err.message : '删除API密钥失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setDeletingKeyId(null);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toasterRef.current?.show({
      title: '已复制',
      message: 'API密钥已复制到剪贴板',
      variant: 'success',
      position: 'top-right',
    });
  };

  const handleViewDetails = (keyId: number) => {
    router.push(`/dashboard/api-keys/${keyId}`);
  };

  const getConfigTypeInfo = (type: string) => {
    return CONFIG_TYPES.find(t => t.value === type) || CONFIG_TYPES[0];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays} 天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} 个月前`;
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Toaster ref={toasterRef} />

      {/* 页面头部 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">API Keys</h1>
        <p className="text-muted-foreground">
          管理你的 API 密钥，查看使用情况和统计数据
        </p>
      </div>

      {/* 操作栏 */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* 搜索框 */}
        <div className="relative flex-1">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索 API Key 名称或密钥..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 类型过滤 */}
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full md:w-[180px]">
            <div className="flex items-center gap-2">
              <IconFilter className="size-4" />
              <SelectValue placeholder="所有类型" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有类型</SelectItem>
            {CONFIG_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 创建按钮 */}
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <IconPlus className="size-4" />
          创建 API Key
        </Button>
      </div>

      {/* API Keys 列表 */}
      <Card>
        <CardHeader>
          <CardTitle>API Keys ({filteredKeys.length})</CardTitle>
          <CardDescription>
            {filterType !== 'all' && `筛选: ${getConfigTypeInfo(filterType).label} • `}
            {searchQuery && `搜索: "${searchQuery}" • `}
            共 {apiKeys.length} 个密钥
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <MorphingSquare className="size-8" />
            </div>
          ) : filteredKeys.length === 0 ? (
            <div className="text-center py-12">
              <IconKey className="size-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchQuery || filterType !== 'all' ? '没有找到匹配的 API Key' : '还没有创建任何 API Key'}
              </p>
              {!searchQuery && filterType === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)} variant="outline" className="gap-2">
                  <IconPlus className="size-4" />
                  创建第一个 API Key
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredKeys.map((key) => {
                const typeInfo = getConfigTypeInfo(key.config_type);
                const stats = usageStats[key.id];
                return (
                  <div
                    key={key.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 items-center p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {/* 类型指示器 */}
                    <div className={cn('w-1 h-12 rounded-full', typeInfo.color)} />

                    {/* 名称和类型 */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{key.name}</h3>
                        <Badge variant="outline" className="text-xs">
                          {typeInfo.label}
                        </Badge>
                        {!key.is_active && (
                          <Badge variant="destructive" className="text-xs">
                            已禁用
                          </Badge>
                        )}
                      </div>
                      <code className="font-mono text-xs text-muted-foreground">{key.key_preview}</code>
                    </div>

                    {/* 已用配额 */}
                    <div className="text-center min-w-[100px]">
                      {stats ? (
                        <>
                          <div className="text-sm font-medium">${stats.total_quota_consumed.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">已用配额</div>
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground">加载中...</div>
                      )}
                    </div>

                    {/* 请求次数 */}
                    <div className="text-center min-w-[100px]">
                      {stats ? (
                        <>
                          <div className="text-sm font-medium">{stats.total_requests}</div>
                          <div className="text-xs text-muted-foreground">次请求</div>
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground">-</div>
                      )}
                    </div>

                    {/* 创建时间 */}
                    <div className="text-center min-w-[120px]">
                      <div className="text-sm">{formatDate(key.created_at)}</div>
                      <div className="text-xs text-muted-foreground">创建时间</div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(key.id)}
                        className="gap-2"
                      >
                        查看详情
                        <IconChevronRight className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteKey(key.id, key.name)}
                        disabled={deletingKeyId === key.id}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        {deletingKeyId === key.id ? (
                          <MorphingSquare className="size-4" />
                        ) : (
                          <IconTrash className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 创建 API Key 对话框 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>创建新的 API Key</DialogTitle>
            <DialogDescription>
              创建一个新的 API 密钥来访问 AI 服务
            </DialogDescription>
          </DialogHeader>

          {!newApiKey ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">密钥名称</Label>
                <Input
                  id="key-name"
                  placeholder="例如：生产环境、测试环境"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="config-type">服务类型</Label>
                <Select
                  value={selectedConfigType}
                  onValueChange={(value: any) => setSelectedConfigType(value)}
                  disabled={isGenerating}
                >
                  <SelectTrigger id="config-type">
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
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">
                  ⚠️ 请妥善保管此密钥，它只会显示一次
                </p>
              </div>

              <div className="space-y-2">
                <Label>你的 API Key</Label>
                <div className="flex gap-2">
                  <Input
                    value={newApiKey}
                    readOnly
                    type={showApiKey ? 'text' : 'password'}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopyKey(newApiKey)}
                  >
                    <IconCopy className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!newApiKey ? (
              <>
                <Button variant="outline" onClick={handleCloseDialog} disabled={isGenerating}>
                  取消
                </Button>
                <Button onClick={handleGenerateKey} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <MorphingSquare className="size-4 mr-2" />
                      创建中...
                    </>
                  ) : (
                    '创建'
                  )}
                </Button>
              </>
            ) : (
              <Button onClick={handleCloseDialog} className="w-full">
                完成
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
