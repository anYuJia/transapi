'use client';

import { useEffect, useState, useRef, Fragment } from 'react';
import {
  deleteAPIKey,
  generateAPIKey,
  getAPIKeys,
  updateAPIKeyType,
  getCodexFallbackConfig,
  getCurrentUser,
  getKiroSubscriptionModelRules,
  getOpenAIModels,
  saveCodexFallbackConfig,
  upsertKiroSubscriptionModelRule,
  clearCodexFallbackConfig,
  getAPIKeyUsageStats,
  type KiroSubscriptionModelRule,
  type OpenAIModel,
  type PluginAPIKey,
  type UserResponse,
  type APIKeyUsageStats,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconCopy, IconKey, IconTrash, IconEye, IconEyeOff, IconSettings, IconPlus, IconInfoCircle, IconAlertTriangle, IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { MorphingSquare } from '@/components/ui/morphing-square';
import { cn } from '@/lib/utils';
import Toaster, { ToasterRef } from '@/components/ui/toast';
import { getPublicApiBaseUrl } from '@/lib/apiBase';

const CONFIG_TYPE_PAGE_SIZE = 3;
const CONFIG_TYPE_ORDER = [
  'antigravity',
  'kiro',
  'qwen',
  'zai-tts',
  'zai-image',
  'codex',
  'gemini-cli',
] as const;

export default function SettingsPage() {
  const toasterRef = useRef<ToasterRef>(null);
  const [apiKeys, setApiKeys] = useState<PluginAPIKey[]>([]);
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<number | null>(null);
  const [isEditTypeDialogOpen, setIsEditTypeDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<PluginAPIKey | null>(null);
  const [editingConfigType, setEditingConfigType] = useState<PluginAPIKey['config_type']>('antigravity');
  const [isUpdatingKeyType, setIsUpdatingKeyType] = useState(false);
  const [selectedConfigType, setSelectedConfigType] = useState<'antigravity' | 'kiro' | 'qwen' | 'codex' | 'gemini-cli' | 'zai-tts' | 'zai-image'>('antigravity');
  const [configTypePage, setConfigTypePage] = useState(0);
  const [keyName, setKeyName] = useState('');
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);

  const isAdmin = (currentUser?.trust_level ?? 0) >= 3;
  const [kiroModels, setKiroModels] = useState<OpenAIModel[]>([]);
  const [subscriptionRules, setSubscriptionRules] = useState<KiroSubscriptionModelRule[]>([]);
  const [isKiroConfigLoading, setIsKiroConfigLoading] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState<string | null>(null);
  const [newSubscription, setNewSubscription] = useState('');

  const [apiEndpoint, setApiEndpoint] = useState(() => getPublicApiBaseUrl());
  const [expandedKeyId, setExpandedKeyId] = useState<number | null>(null);
  const [keyUsageStats, setKeyUsageStats] = useState<Record<number, APIKeyUsageStats>>({});
  const [loadingUsageKeyId, setLoadingUsageKeyId] = useState<number | null>(null);

  const configTypeTotalPages = Math.ceil(CONFIG_TYPE_ORDER.length / CONFIG_TYPE_PAGE_SIZE);
  const visibleConfigTypes = CONFIG_TYPE_ORDER.slice(
    configTypePage * CONFIG_TYPE_PAGE_SIZE,
    (configTypePage + 1) * CONFIG_TYPE_PAGE_SIZE
  );

  // CodexCLI 兜底服务（当 Codex 账号全部冻结/不可用时，转发到自定义 /responses 上游）
  const [codexFallbackBaseUrl, setCodexFallbackBaseUrl] = useState('');
  const [codexFallbackKey, setCodexFallbackKey] = useState('');
  const [codexFallbackHasKey, setCodexFallbackHasKey] = useState(false);
  const [codexFallbackKeyMasked, setCodexFallbackKeyMasked] = useState<string | null>(null);
  const [isCodexFallbackLoading, setIsCodexFallbackLoading] = useState(false);
  const [isCodexFallbackSaving, setIsCodexFallbackSaving] = useState(false);
  const [isCodexFallbackClearing, setIsCodexFallbackClearing] = useState(false);

  useEffect(() => {
    const base = getPublicApiBaseUrl();
    if (/^https?:\/\//i.test(base)) return;
    setApiEndpoint(`${window.location.origin}${base}`);
  }, []);

  useEffect(() => {
    if (!isCreateDialogOpen) return;
    const index = CONFIG_TYPE_ORDER.indexOf(selectedConfigType);
    setConfigTypePage(index >= 0 ? Math.floor(index / CONFIG_TYPE_PAGE_SIZE) : 0);
  }, [isCreateDialogOpen, selectedConfigType]);

  const loadAPIKeys = async () => {
    try {
      const data = await getAPIKeys();
      setApiKeys(data);
    } catch (err) {
      // 如果没有 API Key,这是正常的
      setApiKeys([]);
    }
  };

  const loadCodexFallback = async () => {
    setIsCodexFallbackLoading(true);
    try {
      const data = await getCodexFallbackConfig();
      setCodexFallbackBaseUrl(data.base_url || '');
      setCodexFallbackHasKey(Boolean(data.has_key));
      setCodexFallbackKeyMasked(data.api_key_masked || null);
      setCodexFallbackKey('');
    } catch (err) {
      // 不阻塞设置页，其它功能不依赖兜底配置
      toasterRef.current?.show({
        title: '加载失败',
        message: err instanceof Error ? err.message : '获取 CodexCLI 兜底配置失败',
        variant: 'warning',
        position: 'top-right',
      });
    } finally {
      setIsCodexFallbackLoading(false);
    }
  };

  const normalizeSubscription = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();

  const loadKiroAdminConfig = async () => {
    setIsKiroConfigLoading(true);

    try {
      try {
        const rules = await getKiroSubscriptionModelRules();
        setSubscriptionRules(rules);
      } catch (err) {
        toasterRef.current?.show({
          title: '加载失败',
          message: err instanceof Error ? err.message : '获取订阅层模型配置失败',
          variant: 'error',
          position: 'top-right',
        });
      }

      try {
        const modelsResp = await getOpenAIModels('kiro');
        setKiroModels(modelsResp.data || []);
      } catch (err) {
        setKiroModels([]);
        toasterRef.current?.show({
          title: '加载失败',
          message: err instanceof Error ? err.message : '获取 Kiro 模型列表失败',
          variant: 'warning',
          position: 'top-right',
        });
      }
    } finally {
      setIsKiroConfigLoading(false);
    }
  };

  const setSubscriptionRule = async (subscription: string, modelIds: string[] | null) => {
    const normalized = normalizeSubscription(subscription);
    if (!normalized) return;

    setSavingSubscription(normalized);
    try {
      await upsertKiroSubscriptionModelRule(normalized, modelIds);

      setSubscriptionRules((prev) => {
        const next = prev.map((r) =>
          r.subscription === normalized
            ? { ...r, configured: modelIds !== null, model_ids: modelIds }
            : r
        );

        if (!next.some((r) => r.subscription === normalized)) {
          next.push({ subscription: normalized, configured: modelIds !== null, model_ids: modelIds });
          next.sort((a, b) => a.subscription.localeCompare(b.subscription));
        }

        return next;
      });

      toasterRef.current?.show({
        title: '已保存',
        message: `已更新 ${normalized}`,
        variant: 'success',
        position: 'top-right',
      });
    } catch (err) {
      toasterRef.current?.show({
        title: '保存失败',
        message: err instanceof Error ? err.message : '保存订阅层配置失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setSavingSubscription(null);
    }
  };

  const handleToggleWhitelist = async (subscription: string, enabled: boolean) => {
    if (!enabled) {
      await setSubscriptionRule(subscription, null);
      return;
    }

    if (kiroModels.length === 0) {
      toasterRef.current?.show({
        title: '无法启用',
        message: '未获取到 Kiro 模型列表，无法启用白名单',
        variant: 'warning',
        position: 'top-right',
      });
      return;
    }

    const allModelIds = kiroModels.map((m) => m.id).filter(Boolean);
    await setSubscriptionRule(subscription, allModelIds);
  };

  const handleToggleModel = async (subscription: string, modelId: string, checked: boolean) => {
    const normalized = normalizeSubscription(subscription);
    const rule = subscriptionRules.find((r) => r.subscription === normalized);
    if (!rule || !rule.configured) return;

    const current = Array.isArray(rule.model_ids) ? rule.model_ids : [];
    const next = checked
      ? Array.from(new Set([...current, modelId]))
      : current.filter((id) => id !== modelId);

    await setSubscriptionRule(normalized, next);
  };

  const handleAddSubscription = async () => {
    const normalized = normalizeSubscription(newSubscription);
    if (!normalized) return;

    if (subscriptionRules.some((r) => r.subscription === normalized)) {
      toasterRef.current?.show({
        title: '已存在',
        message: `${normalized} 已在列表中`,
        variant: 'warning',
        position: 'top-right',
      });
      return;
    }

    if (kiroModels.length === 0) {
      toasterRef.current?.show({
        title: '无法添加',
        message: '未获取到 Kiro 模型列表，无法创建白名单配置',
        variant: 'warning',
        position: 'top-right',
      });
      return;
    }

    const allModelIds = kiroModels.map((m) => m.id).filter(Boolean);
    await setSubscriptionRule(normalized, allModelIds);
    setNewSubscription('');
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        await loadAPIKeys();

        const userData = await getCurrentUser();
        setCurrentUser(userData);

        await loadCodexFallback();

        if (userData.trust_level >= 3) {
          await loadKiroAdminConfig();
        }
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const handleOpenCreateDialog = () => {
    setKeyName('');
    setSelectedConfigType('antigravity');
    setIsCreateDialogOpen(true);
  };

  const handleGenerateKey = async () => {
    if (!keyName.trim()) {
      toasterRef.current?.show({
        title: '输入错误',
        message: '请输入API密钥名称',
        variant: 'warning',
        position: 'top-right',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const result = await generateAPIKey(keyName, selectedConfigType);
      setNewApiKey(result.key);
      setShowApiKey(true);
      setIsDialogOpen(true);
      setIsCreateDialogOpen(false);
      // 重新加载列表
      await loadAPIKeys();
    } catch (err) {
      toasterRef.current?.show({
        title: '生成失败',
        message: err instanceof Error ? err.message : '生成API密钥失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setNewApiKey('');
    setShowApiKey(false);
  };

  const handleDeleteKey = async (keyId: number) => {
    if (!confirm('确定要删除此API密钥吗？删除后将无法恢复，所有使用此密钥的应用将无法访问 AI 资源。')) {
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
      // 重新加载列表
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

  const handleToggleUsageStats = async (keyId: number) => {
    if (expandedKeyId === keyId) {
      setExpandedKeyId(null);
      return;
    }

    setExpandedKeyId(keyId);

    if (keyUsageStats[keyId]) {
      return;
    }

    setLoadingUsageKeyId(keyId);
    try {
      const stats = await getAPIKeyUsageStats(keyId);
      setKeyUsageStats(prev => ({ ...prev, [keyId]: stats }));
    } catch (err) {
      toasterRef.current?.show({
        title: '加载失败',
        message: err instanceof Error ? err.message : '获取用量统计失败',
        variant: 'error',
        position: 'top-right',
      });
      setExpandedKeyId(null);
    } finally {
      setLoadingUsageKeyId(null);
    }
  };

  const handleOpenEditTypeDialog = (key: PluginAPIKey) => {
    setEditingKey(key);
    setEditingConfigType(key.config_type);
    setIsEditTypeDialogOpen(true);
  };

  const handleUpdateKeyType = async () => {
    if (!editingKey) return;
    if (editingConfigType === editingKey.config_type) {
      setIsEditTypeDialogOpen(false);
      setEditingKey(null);
      return;
    }

    setIsUpdatingKeyType(true);
    try {
      await updateAPIKeyType(editingKey.id, editingConfigType);
      toasterRef.current?.show({
        title: '已更新',
        message: 'API密钥类型已修改',
        variant: 'success',
        position: 'top-right',
      });
      await loadAPIKeys();
      setIsEditTypeDialogOpen(false);
      setEditingKey(null);
    } catch (err) {
      toasterRef.current?.show({
        title: '更新失败',
        message: err instanceof Error ? err.message : '更新API密钥类型失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsUpdatingKeyType(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toasterRef.current?.show({
      title: '复制成功',
      message: 'API密钥已复制到剪贴板',
      variant: 'success',
      position: 'top-right',
    });
  };

  const handleSaveCodexFallback = async () => {
    const baseUrl = codexFallbackBaseUrl.trim();
    const key = codexFallbackKey.trim();

    if (!baseUrl) {
      toasterRef.current?.show({
        title: '输入错误',
        message: '请填写基础URL（例如 https://api.openai.com/v1）',
        variant: 'warning',
        position: 'top-right',
      });
      return;
    }

    setIsCodexFallbackSaving(true);
    try {
      const data = await saveCodexFallbackConfig({
        base_url: baseUrl,
        api_key: key ? key : null,
      });

      setCodexFallbackBaseUrl(data.base_url || baseUrl);
      setCodexFallbackHasKey(Boolean(data.has_key));
      setCodexFallbackKeyMasked(data.api_key_masked || null);
      setCodexFallbackKey('');

      toasterRef.current?.show({
        title: '已保存',
        message: 'CodexCLI 兜底服务配置已更新',
        variant: 'success',
        position: 'top-right',
      });
    } catch (err) {
      toasterRef.current?.show({
        title: '保存失败',
        message: err instanceof Error ? err.message : '保存 CodexCLI 兜底配置失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsCodexFallbackSaving(false);
    }
  };

  const handleClearCodexFallback = async () => {
    if (!confirm('确定要清空 CodexCLI 兜底服务配置吗？')) return;

    setIsCodexFallbackClearing(true);
    try {
      const data = await clearCodexFallbackConfig();
      setCodexFallbackBaseUrl(data.base_url || '');
      setCodexFallbackHasKey(Boolean(data.has_key));
      setCodexFallbackKeyMasked(data.api_key_masked || null);
      setCodexFallbackKey('');

      toasterRef.current?.show({
        title: '已清空',
        message: 'CodexCLI 兜底服务配置已清空',
        variant: 'success',
        position: 'top-right',
      });
    } catch (err) {
      toasterRef.current?.show({
        title: '清空失败',
        message: err instanceof Error ? err.message : '清空 CodexCLI 兜底配置失败',
        variant: 'error',
        position: 'top-right',
      });
    } finally {
      setIsCodexFallbackClearing(false);
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return key;
    return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <div className="flex items-center justify-center h-64">
            <MorphingSquare />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">

        <Toaster ref={toasterRef} defaultPosition="top-right" />

        {/* API Key 管理 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  API密钥管理
                </CardTitle>
              </div>
              <Button
                onClick={handleOpenCreateDialog}
                size="sm"
                className="gap-1"
              >
                <IconPlus className="size-4" />
                创建
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* API Keys 列表 */}
            {apiKeys.length > 0 ? (
              <div className="space-y-3">
                <Label className="text-sm font-medium">当前已创建{apiKeys.length}个密钥</Label>
                <div className="border rounded-lg overflow-x-auto -mx-2 md:mx-0 border-x md:border-x">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 text-sm font-medium min-w-[120px]">名称</th>
                        <th className="text-left p-3 text-sm font-medium min-w-[100px]">类型</th>
                        <th className="text-left p-3 text-sm font-medium min-w-[180px]">密钥</th>
                        <th className="text-left p-3 text-sm font-medium min-w-[130px]">创建时间</th>
                        <th className="text-left p-3 text-sm font-medium min-w-[130px]">最后使用</th>
                        <th className="text-left p-3 text-sm font-medium min-w-[100px]">用量</th>
                        <th className="text-right p-3 text-sm font-medium min-w-[80px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((key) => (
                        <Fragment key={key.id}>
                          <tr className="border-b last:border-b-0 hover:bg-muted/30">
                            <td className="p-3 text-sm">
                              {key.name}
                            </td>
                            <td className="p-3">
                              {key.config_type === 'kiro' ? (
                                <Badge>Kiro</Badge>
                              ) : key.config_type === 'qwen' ? (
                                <Badge variant="outline">Qwen</Badge>
                              ) : key.config_type === 'codex' ? (
                                <Badge variant="outline">Codex</Badge>
                              ) : key.config_type === 'gemini-cli' ? (
                                <Badge variant="outline">GeminiCLI</Badge>
                              ) : key.config_type === 'zai-tts' ? (
                                <Badge variant="outline">ZAI TTS</Badge>
                              ) : key.config_type === 'zai-image' ? (
                                <Badge variant="outline">ZAI Image</Badge>
                              ) : (
                                <Badge variant="secondary">Antigravity</Badge>
                              )}
                            </td>
                            <td className="p-3 text-xs font-mono text-muted-foreground">
                              <div className="max-w-[180px] truncate" title={key.key_preview}>
                                {key.key_preview}
                              </div>
                            </td>
                            <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(key.created_at).toLocaleString('zh-CN')}
                            </td>
                            <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                              {key.last_used_at
                                ? new Date(key.last_used_at).toLocaleString('zh-CN')
                                : '从未使用'
                              }
                            </td>
                            <td className="p-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleUsageStats(key.id)}
                                disabled={loadingUsageKeyId === key.id}
                                className="text-xs h-7 px-2"
                              >
                                {loadingUsageKeyId === key.id ? (
                                  <MorphingSquare className="size-3 mr-1" />
                                ) : expandedKeyId === key.id ? (
                                  <IconChevronUp className="size-3 mr-1" />
                                ) : (
                                  <IconChevronDown className="size-3 mr-1" />
                                )}
                                {expandedKeyId === key.id ? '收起' : '查看'}
                              </Button>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenEditTypeDialog(key)}
                                  disabled={deletingKeyId === key.id || isUpdatingKeyType}
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                  aria-label="修改类型"
                                >
                                  <IconSettings className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDeleteKey(key.id)}
                                  disabled={deletingKeyId === key.id || isUpdatingKeyType}
                                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                  aria-label="删除"
                                >
                                  {deletingKeyId === key.id ? (
                                    <MorphingSquare className="size-4" />
                                  ) : (
                                    <IconTrash className="size-4" />
                                  )}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expandedKeyId === key.id && keyUsageStats[key.id] && (
                            <tr key={`${key.id}-usage`} className="border-b bg-muted/20">
                              <td colSpan={7} className="p-4">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium">用量统计</div>
                                    <div className="text-xs text-muted-foreground">
                                      {keyUsageStats[key.id].range.start_date && keyUsageStats[key.id].range.end_date
                                        ? `${new Date(keyUsageStats[key.id].range.start_date!).toLocaleDateString()} - ${new Date(keyUsageStats[key.id].range.end_date!).toLocaleDateString()}`
                                        : '全部时间'}
                                    </div>
                                  </div>

                                  {/* 总览卡片 */}
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-background rounded-lg p-3 border">
                                      <div className="text-xs text-muted-foreground mb-1">总请求数</div>
                                      <div className="text-2xl font-semibold">{keyUsageStats[key.id].total_requests.toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        成功 {keyUsageStats[key.id].success_requests} / 失败 {keyUsageStats[key.id].failed_requests}
                                      </div>
                                    </div>
                                    <div className="bg-background rounded-lg p-3 border">
                                      <div className="text-xs text-muted-foreground mb-1">成功率</div>
                                      <div className="text-2xl font-semibold">
                                        {keyUsageStats[key.id].total_requests > 0
                                          ? ((keyUsageStats[key.id].success_requests / keyUsageStats[key.id].total_requests) * 100).toFixed(1)
                                          : 0}%
                                      </div>
                                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                        {keyUsageStats[key.id].success_requests} 次成功
                                      </div>
                                    </div>
                                    <div className="bg-background rounded-lg p-3 border">
                                      <div className="text-xs text-muted-foreground mb-1">Token 用量</div>
                                      <div className="text-2xl font-semibold">{keyUsageStats[key.id].total_tokens.toLocaleString()}</div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        输入 {keyUsageStats[key.id].input_tokens.toLocaleString()} / 输出 {keyUsageStats[key.id].output_tokens.toLocaleString()}
                                      </div>
                                    </div>
                                    <div className="bg-background rounded-lg p-3 border">
                                      <div className="text-xs text-muted-foreground mb-1">平均耗时</div>
                                      <div className="text-2xl font-semibold">{Math.round(keyUsageStats[key.id].avg_duration_ms)}ms</div>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        配额消耗 {keyUsageStats[key.id].total_quota_consumed.toFixed(2)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* 按服务类型统计 */}
                                  {Object.keys(keyUsageStats[key.id].by_config_type).length > 0 && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-2">📊 按服务类型</div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {Object.entries(keyUsageStats[key.id].by_config_type).map(([type, stats]) => (
                                          <div key={type} className="bg-background rounded-lg p-3 border">
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="font-medium text-sm">{type}</span>
                                              <Badge variant="outline" className="text-xs">
                                                {stats.total_requests} 次
                                              </Badge>
                                            </div>
                                            <div className="space-y-1 text-xs text-muted-foreground">
                                              <div className="flex justify-between">
                                                <span>成功率:</span>
                                                <span className="font-medium">
                                                  {stats.total_requests > 0
                                                    ? ((stats.success_requests / stats.total_requests) * 100).toFixed(1)
                                                    : 0}%
                                                </span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span>Token:</span>
                                                <span className="font-medium">{stats.total_tokens.toLocaleString()}</span>
                                              </div>
                                              <div className="flex justify-between">
                                                <span>配额:</span>
                                                <span className="font-medium">{stats.total_quota_consumed.toFixed(2)}</span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 按模型统计 */}
                                  {Object.keys(keyUsageStats[key.id].by_model).length > 0 && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-2">🤖 按模型</div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {Object.entries(keyUsageStats[key.id].by_model)
                                          .sort((a, b) => b[1].total_requests - a[1].total_requests)
                                          .slice(0, 6)
                                          .map(([model, stats]) => (
                                            <div key={model} className="bg-background rounded-lg p-3 border">
                                              <div className="flex items-center justify-between mb-2">
                                                <span className="font-medium text-xs truncate" title={model}>
                                                  {model.length > 20 ? model.substring(0, 20) + '...' : model}
                                                </span>
                                                <Badge variant="secondary" className="text-xs">
                                                  {stats.total_requests}
                                                </Badge>
                                              </div>
                                              <div className="space-y-1 text-xs text-muted-foreground">
                                                <div className="flex justify-between">
                                                  <span>Token:</span>
                                                  <span className="font-medium">{stats.total_tokens.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                  <span>配额:</span>
                                                  <span className="font-medium">{stats.total_quota_consumed.toFixed(2)}</span>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                      {Object.keys(keyUsageStats[key.id].by_model).length > 6 && (
                                        <div className="text-xs text-muted-foreground text-center mt-2">
                                          还有 {Object.keys(keyUsageStats[key.id].by_model).length - 6} 个模型未显示
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* 按端点统计 */}
                                  {Object.keys(keyUsageStats[key.id].by_endpoint).length > 0 && (
                                    <div>
                                      <div className="text-xs font-medium text-muted-foreground mb-2">🔗 按 API 端点</div>
                                      <div className="space-y-2">
                                        {Object.entries(keyUsageStats[key.id].by_endpoint)
                                          .sort((a, b) => b[1].total_requests - a[1].total_requests)
                                          .slice(0, 5)
                                          .map(([endpoint, stats]) => (
                                            <div key={endpoint} className="bg-background rounded-lg p-3 border">
                                              <div className="flex items-start justify-between mb-2">
                                                <code className="text-xs font-mono text-muted-foreground flex-1 mr-2">
                                                  {endpoint}
                                                </code>
                                                <Badge variant="outline" className="text-xs shrink-0">
                                                  {stats.total_requests} 次
                                                </Badge>
                                              </div>
                                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                                <div>
                                                  <span className="text-muted-foreground">成功率: </span>
                                                  <span className="font-medium">
                                                    {stats.total_requests > 0
                                                      ? ((stats.success_requests / stats.total_requests) * 100).toFixed(1)
                                                      : 0}%
                                                  </span>
                                                </div>
                                                <div>
                                                  <span className="text-muted-foreground">Token: </span>
                                                  <span className="font-medium">{stats.total_tokens.toLocaleString()}</span>
                                                </div>
                                                <div>
                                                  <span className="text-muted-foreground">配额: </span>
                                                  <span className="font-medium">{stats.total_quota_consumed.toFixed(2)}</span>
                                                </div>
                                                <div>
                                                  <span className="text-muted-foreground">平均: </span>
                                                  <span className="font-medium">{Math.round(stats.avg_duration_ms)}ms</span>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                      {Object.keys(keyUsageStats[key.id].by_endpoint).length > 5 && (
                                        <div className="text-xs text-muted-foreground text-center mt-2">
                                          还有 {Object.keys(keyUsageStats[key.id].by_endpoint).length - 5} 个端点未显示
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* 无数据提示 */}
                                  {keyUsageStats[key.id].total_requests === 0 && (
                                    <div className="text-center py-8 text-muted-foreground">
                                      <p className="text-sm">该 API Key 暂无使用记录</p>
                                      <p className="text-xs mt-1">使用此 API Key 发起请求后，统计数据将显示在这里</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">暂无API密钥</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API 端点信息 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              API 端点
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">默认 API 端点</Label>
              <div className="flex gap-2">
                <Input
                  value={apiEndpoint}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopyKey(apiEndpoint)}
                >
                  <IconCopy className="size-4" />
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
              <div className="flex gap-3">
                <IconAlertTriangle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-yellow-500">注意</p>
                  <p className="font-sm text-muted-foreground">你需要提供有效的 API 密钥才能访问此端点。要获取模型列表，你的账户内至少需要添加一个可用账号。我们支持 OpenAI 格式或 Anthropic 格式的消息。</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CodexCLI 兜底服务 */}
        <Card className="mt-6">
          <CardHeader>
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                CodexCLI 兜底服务
              </CardTitle>
              <CardDescription>
                当 Codex 账号全部冻结/不可用时，自动转发到你配置的上游（程序会自动补全 <span className="font-mono">/responses</span>）。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">平台</th>
                    <th className="text-left p-3 font-medium">基础URL</th>
                    <th className="text-left p-3 font-medium">KEY</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 align-top">
                      <Badge variant="secondary">CodexCLI</Badge>
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        value={codexFallbackBaseUrl}
                        onChange={(e) => setCodexFallbackBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        className="font-mono text-sm"
                        disabled={isCodexFallbackLoading || isCodexFallbackSaving || isCodexFallbackClearing}
                      />
                    </td>
                    <td className="p-3 align-top">
                      <Input
                        type="password"
                        value={codexFallbackKey}
                        onChange={(e) => setCodexFallbackKey(e.target.value)}
                        placeholder={codexFallbackHasKey ? (codexFallbackKeyMasked || '已保存') : '请输入KEY'}
                        className="font-mono text-sm"
                        disabled={isCodexFallbackLoading || isCodexFallbackSaving || isCodexFallbackClearing}
                      />
                      {codexFallbackHasKey && !codexFallbackKey.trim() && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          已保存 KEY（不会在前端显示明文）。留空并保存 = 不修改 KEY。
                        </p>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleClearCodexFallback}
                disabled={isCodexFallbackSaving || isCodexFallbackClearing || isCodexFallbackLoading}
              >
                {isCodexFallbackClearing ? (
                  <>
                    <MorphingSquare className="size-4 mr-2" />
                    清空中...
                  </>
                ) : (
                  '清空'
                )}
              </Button>
              <Button
                onClick={handleSaveCodexFallback}
                disabled={isCodexFallbackSaving || isCodexFallbackClearing || isCodexFallbackLoading}
              >
                {isCodexFallbackSaving ? (
                  <>
                    <MorphingSquare className="size-4 mr-2" />
                    保存中...
                  </>
                ) : (
                  '保存'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2">
                    Kiro 订阅层模型权限
                  </CardTitle>
                  <CardDescription>
                    未配置时默认全部允许；启用白名单后按勾选模型限制。
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadKiroAdminConfig}
                  disabled={isKiroConfigLoading}
                >
                  {isKiroConfigLoading ? (
                    <>
                      <MorphingSquare className="size-4 mr-2" />
                      刷新中
                    </>
                  ) : (
                    '刷新'
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">新增订阅层</Label>
                <div className="flex gap-2">
                  <Input
                    value={newSubscription}
                    onChange={(e) => setNewSubscription(e.target.value)}
                    placeholder="例如：KIRO FREE"
                    disabled={savingSubscription !== null}
                  />
                  <Button
                    onClick={handleAddSubscription}
                    disabled={!newSubscription.trim() || savingSubscription !== null || kiroModels.length === 0}
                  >
                    添加
                  </Button>
                </div>
                {kiroModels.length === 0 && (
                  <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-muted-foreground">
                    暂时无法获取 Kiro 模型列表（可能需要加入 Beta），将无法启用/创建白名单。
                  </div>
                )}
              </div>

              {subscriptionRules.length > 0 ? (
                <div className="space-y-3">
                  {subscriptionRules.map((rule) => (
                    <div key={rule.subscription} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{rule.subscription}</span>
                            {rule.configured ? (
                              <Badge>白名单</Badge>
                            ) : (
                              <Badge variant="secondary">默认全允许</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {rule.configured ? '仅允许勾选的模型' : '未配置：默认允许全部模型'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {savingSubscription === rule.subscription && (
                            <MorphingSquare className="size-4" />
                          )}
                          <Switch
                            isSelected={rule.configured}
                            onChange={(selected) => handleToggleWhitelist(rule.subscription, !!selected)}
                            isDisabled={savingSubscription !== null && savingSubscription !== rule.subscription}
                          />
                        </div>
                      </div>

                      {rule.configured && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {kiroModels.map((m) => (
                            <label key={m.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={Array.isArray(rule.model_ids) ? rule.model_ids.includes(m.id) : false}
                                onCheckedChange={(checked) =>
                                  handleToggleModel(rule.subscription, m.id, !!checked)
                                }
                                disabled={savingSubscription === rule.subscription}
                              />
                              <span className="font-mono text-xs">{m.id}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  暂无订阅层记录，你可以手动添加。
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 创建 API Key 弹窗 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>创建API密钥</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">名称</Label>
              <Input
                id="key-name"
                placeholder="输入API密钥名称"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="space-y-3">
              <Label>类型</Label>

              {configTypeTotalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    第 {configTypePage + 1} / {configTypeTotalPages} 页
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setConfigTypePage((prev) => Math.max(0, prev - 1))}
                      disabled={configTypePage === 0}
                      aria-label="上一页"
                    >
                      <IconChevronLeft className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setConfigTypePage((prev) => Math.min(configTypeTotalPages - 1, prev + 1))
                      }
                      disabled={configTypePage >= configTypeTotalPages - 1}
                      aria-label="下一页"
                    >
                      <IconChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Antigravity */}
              <label
                hidden={!visibleConfigTypes.includes('antigravity')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'antigravity' ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="antigravity"
                  checked={selectedConfigType === 'antigravity'}
                  onChange={() => setSelectedConfigType('antigravity')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Antigravity</h3>
                    <Badge variant="secondary">默认</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    使用Antigravity账号配额
                  </p>
                </div>
              </label>

              {/* Kiro */}
              <label
                hidden={!visibleConfigTypes.includes('kiro')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'kiro'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="kiro"
                  checked={selectedConfigType === 'kiro'}
                  onChange={() => setSelectedConfigType('kiro')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Kiro</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    使用Kiro账号配额
                  </p>
                </div>
              </label>

              {/* Qwen */}
              <label
                hidden={!visibleConfigTypes.includes('qwen')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'qwen'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="qwen"
                  checked={selectedConfigType === 'qwen'}
                  onChange={() => setSelectedConfigType('qwen')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Qwen</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    使用Qwen账号配额
                  </p>
                </div>
              </label>

              {/* ZAI TTS */}
              <label
                hidden={!visibleConfigTypes.includes('zai-tts')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'zai-tts'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="zai-tts"
                  checked={selectedConfigType === 'zai-tts'}
                  onChange={() => setSelectedConfigType('zai-tts')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">ZAI TTS</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    用于调用 /v1/audio/speech（需先在“账户管理”添加 ZAI TTS 账号）
                  </p>
                </div>
              </label>

              {/* ZAI Image */}
              <label
                hidden={!visibleConfigTypes.includes('zai-image')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'zai-image'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="zai-image"
                  checked={selectedConfigType === 'zai-image'}
                  onChange={() => setSelectedConfigType('zai-image')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">ZAI Image</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    用于调用 /v1/images/generations（model=glm-image，需先在“账户管理”添加 ZAI Image 账号）
                  </p>
                </div>
              </label>

              {/* Codex */}
              <label
                hidden={!visibleConfigTypes.includes('codex')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'codex'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="codex"
                  checked={selectedConfigType === 'codex'}
                  onChange={() => setSelectedConfigType('codex')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Codex</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    使用 Codex 账号池（fill-first）
                  </p>
                </div>
              </label>

              {/* GeminiCLI */}
              <label
                hidden={!visibleConfigTypes.includes('gemini-cli')}
                className={cn(
                  "flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors",
                  selectedConfigType === 'gemini-cli'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                )}
              >
                <input
                  type="radio"
                  name="config_type"
                  value="gemini-cli"
                  checked={selectedConfigType === 'gemini-cli'}
                  onChange={() => setSelectedConfigType('gemini-cli')}
                  className="w-4 h-4 mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">GeminiCLI</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    使用 GeminiCLI（Cloud Code Assist）账号配额
                  </p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={isGenerating}
            >
              取消
            </Button>
            <Button
              onClick={handleGenerateKey}
              disabled={isGenerating || !keyName.trim()}
            >
              {isGenerating ? (
                <>
                  <MorphingSquare className="size-4 mr-2" />
                  创建中...
                </>
              ) : (
                '创建'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 修改 API Key 类型弹窗 */}
      <Dialog
        open={isEditTypeDialogOpen}
        onOpenChange={(open) => {
          setIsEditTypeDialogOpen(open);
          if (!open) setEditingKey(null);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>修改密钥类型</DialogTitle>
            <DialogDescription>
              {editingKey ? `密钥：${editingKey.name}` : '修改此密钥走的渠道类型'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>新类型</Label>
              <Select
                value={editingConfigType}
                onValueChange={(value) => setEditingConfigType(value as PluginAPIKey['config_type'])}
                disabled={isUpdatingKeyType}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="antigravity">Antigravity</SelectItem>
                  <SelectItem value="kiro">Kiro</SelectItem>
                  <SelectItem value="qwen">Qwen</SelectItem>
                  <SelectItem value="codex">Codex</SelectItem>
                  <SelectItem value="gemini-cli">GeminiCLI</SelectItem>
                  <SelectItem value="zai-tts">ZAI TTS</SelectItem>
                  <SelectItem value="zai-image">ZAI Image</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                修改后，使用该密钥的请求会走新类型对应的渠道。
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditTypeDialogOpen(false)}
              disabled={isUpdatingKeyType}
            >
              取消
            </Button>
            <Button
              onClick={handleUpdateKeyType}
              disabled={
                isUpdatingKeyType ||
                !editingKey ||
                editingConfigType === editingKey.config_type
              }
            >
              {isUpdatingKeyType ? (
                <>
                  <MorphingSquare className="size-4 mr-2" />
                  保存中...
                </>
              ) : (
                '保存'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Key 成功弹窗 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>生成成功</DialogTitle>
            <DialogDescription>
              请妥善保存此密钥，关闭后将无法再次查看完整内容
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>API密钥</Label>
              <div className="flex gap-2">
                <Input
                  value={showApiKey ? (newApiKey || '') : maskApiKey(newApiKey || '')}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <IconEyeOff className="size-4" />
                  ) : (
                    <IconEye className="size-4" />
                  )}
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

          <DialogFooter>
            <Button onClick={handleCloseDialog}>
              我已保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
