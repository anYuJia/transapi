import database from '../db/database.js';
import logger from '../utils/logger.js';

// 缓存 TTL：避免每次请求都查表（但又能较快感知配置变更）
const CACHE_TTL_MS = 60 * 1000;

class KiroSubscriptionModelService {
  constructor() {
    this._tableEnsured = false;
    this._cache = null; // { loadedAt: number, map: Map<string, string[]> }
  }

  _normalizeSubscription(subscription) {
    if (typeof subscription !== 'string') return '';
    return subscription.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  _invalidateCache() {
    this._cache = null;
  }

  async _ensureTable() {
    if (this._tableEnsured) return;

    try {
      await database.query(`
        CREATE TABLE IF NOT EXISTS public.kiro_subscription_models (
          subscription text PRIMARY KEY,
          allowed_model_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
          created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
        )
      `);
      this._tableEnsured = true;
    } catch (error) {
      logger.error('确保 kiro_subscription_models 表存在失败:', error.message);
      throw error;
    }
  }

  async _getRulesMap() {
    const now = Date.now();
    if (this._cache && now - this._cache.loadedAt < CACHE_TTL_MS) {
      return this._cache.map;
    }

    await this._ensureTable();

    const result = await database.query(
      'SELECT subscription, allowed_model_ids FROM kiro_subscription_models'
    );

    const map = new Map();
    for (const row of result.rows) {
      const key = this._normalizeSubscription(row.subscription);
      let allowedModelIds = row.allowed_model_ids;

      if (typeof allowedModelIds === 'string') {
        try {
          allowedModelIds = JSON.parse(allowedModelIds);
        } catch {
          allowedModelIds = [];
        }
      }

      if (!Array.isArray(allowedModelIds)) {
        allowedModelIds = [];
      }

      map.set(
        key,
        allowedModelIds
          .filter((id) => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      );
    }

    this._cache = { loadedAt: now, map };
    return map;
  }

  async isModelAllowed(subscription, modelId) {
    if (!modelId) return true;
    const key = this._normalizeSubscription(subscription);
    if (!key) return true;

    const rulesMap = await this._getRulesMap();
    const allowedModelIds = rulesMap.get(key);

    // 没有配置规则：为兼容旧行为，默认放行
    if (allowedModelIds === undefined) return true;

    // 有配置规则：只允许白名单内的模型
    return allowedModelIds.includes(modelId);
  }

  async filterAccountsByModel(accounts, modelId) {
    if (!Array.isArray(accounts) || !modelId) return accounts || [];

    const rulesMap = await this._getRulesMap();

    return accounts.filter((account) => {
      const key = this._normalizeSubscription(account?.subscription);
      const allowedModelIds = rulesMap.get(key);

      // 没有配置规则：默认放行
      if (allowedModelIds === undefined) return true;

      return allowedModelIds.includes(modelId);
    });
  }

  async listDistinctSubscriptionsFromAccounts() {
    try {
      const result = await database.query(
        'SELECT DISTINCT subscription FROM kiro_accounts ORDER BY subscription'
      );
      return result.rows
        .map((row) => row.subscription)
        .filter((v) => typeof v === 'string')
        .map((v) => this._normalizeSubscription(v))
        .filter(Boolean);
    } catch (error) {
      logger.error('获取 Kiro 账号订阅层列表失败:', error.message);
      throw error;
    }
  }

  async listSubscriptionModelRules() {
    const accountSubscriptions = await this.listDistinctSubscriptionsFromAccounts();
    const rulesMap = await this._getRulesMap();

    const allSubscriptions = new Set(accountSubscriptions);
    for (const sub of rulesMap.keys()) {
      allSubscriptions.add(sub);
    }

    const sorted = Array.from(allSubscriptions).sort();

    return sorted.map((subscription) => {
      const allowedModelIds = rulesMap.get(subscription);
      return {
        subscription,
        configured: allowedModelIds !== undefined,
        model_ids: allowedModelIds !== undefined ? allowedModelIds : null,
      };
    });
  }

  async upsertSubscriptionModelRule(subscription, modelIds) {
    await this._ensureTable();

    const normalizedSubscription = this._normalizeSubscription(subscription);
    if (!normalizedSubscription) {
      throw new Error('subscription 是必填字段');
    }

    // model_ids 为 null：删除配置（回到默认放行的旧行为）
    if (modelIds === null) {
      return this.deleteSubscriptionModelRule(normalizedSubscription);
    }

    if (!Array.isArray(modelIds)) {
      throw new Error('model_ids 必须是字符串数组或 null');
    }

    const normalizedModelIds = Array.from(
      new Set(
        modelIds
          .filter((id) => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    );

    const result = await database.query(
      `INSERT INTO kiro_subscription_models (subscription, allowed_model_ids, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (subscription)
       DO UPDATE SET allowed_model_ids = EXCLUDED.allowed_model_ids, updated_at = CURRENT_TIMESTAMP
       RETURNING subscription, allowed_model_ids, created_at, updated_at`,
      [normalizedSubscription, JSON.stringify(normalizedModelIds)]
    );

    this._invalidateCache();

    return {
      subscription: this._normalizeSubscription(result.rows[0].subscription),
      model_ids: result.rows[0].allowed_model_ids,
      created_at: result.rows[0].created_at,
      updated_at: result.rows[0].updated_at,
    };
  }

  async deleteSubscriptionModelRule(subscription) {
    await this._ensureTable();

    const normalizedSubscription = this._normalizeSubscription(subscription);
    if (!normalizedSubscription) {
      throw new Error('subscription 是必填字段');
    }

    const result = await database.query(
      'DELETE FROM kiro_subscription_models WHERE subscription = $1',
      [normalizedSubscription]
    );

    this._invalidateCache();

    return { deleted: result.rowCount > 0, subscription: normalizedSubscription };
  }
}

const kiroSubscriptionModelService = new KiroSubscriptionModelService();
export default kiroSubscriptionModelService;
export { KiroSubscriptionModelService };

