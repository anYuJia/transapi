import database from '../db/database.js';
import logger from '../utils/logger.js';

/**
 * Kiro消费日志服务
 */
class KiroConsumptionService {
  /**
   * 记录消费日志
   * @param {Object} params - 参数对象
   * @param {string} params.user_id - 用户ID
   * @param {string} params.account_id - 账号ID
   * @param {string} params.model_id - 模型ID
   * @param {number} params.credit_used - 消耗的credit
   * @param {number} params.is_shared - 是否共享账号 (0/1)
   * @param {number} [params.api_key_id] - API Key ID (可选)
   * @param {string} [params.endpoint] - API 端点 (可选)
   * @param {string} [params.method] - HTTP 方法 (可选)
   * @param {number} [params.duration_ms] - 请求耗时 (可选)
   * @param {boolean} [params.success] - 是否成功 (可选)
   * @param {number} [params.status_code] - 状态码 (可选)
   * @param {string} [params.error_message] - 错误信息 (可选)
   * @param {number} [params.input_tokens] - 输入token (可选)
   * @param {number} [params.output_tokens] - 输出token (可选)
   * @param {number} [params.total_tokens] - 总token (可选)
   * @param {boolean} [params.stream] - 是否流式 (可选)
   */
  async logConsumption({
    user_id,
    account_id,
    model_id,
    credit_used,
    is_shared,
    api_key_id = null,
    endpoint = null,
    method = 'POST',
    duration_ms = 0,
    success = true,
    status_code = null,
    error_message = null,
    input_tokens = 0,
    output_tokens = 0,
    total_tokens = 0,
    stream = false
  }) {
    try {
      // 保留4位小数
      const roundedCredit = parseFloat(credit_used.toFixed(4));

      const query = `
        INSERT INTO kiro_consumption_log (
          user_id, account_id, model_id, credit_used, is_shared,
          api_key_id, endpoint, method, duration_ms, success, status_code,
          error_message, input_tokens, output_tokens, total_tokens, stream
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING log_id, consumed_at
      `;

      const result = await database.query(query, [
        user_id,
        account_id,
        model_id,
        roundedCredit,
        is_shared,
        api_key_id,
        endpoint,
        method,
        duration_ms,
        success,
        status_code,
        error_message,
        input_tokens,
        output_tokens,
        total_tokens,
        stream
      ]);

      logger.info(`Kiro消费日志已记录: user_id=${user_id}, account_id=${account_id}, model=${model_id}, credit=${roundedCredit}, api_key_id=${api_key_id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('记录Kiro消费日志失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户消费历史
   * @param {string} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 限制数量
   * @param {number} options.offset - 偏移量
   */
  async getUserConsumption(user_id, { limit = 100, offset = 0 } = {}) {
    try {
      const query = `
        SELECT 
          l.log_id,
          l.account_id,
          l.model_id,
          l.credit_used,
          l.is_shared,
          l.consumed_at,
          a.account_name
        FROM kiro_consumption_log l
        LEFT JOIN kiro_accounts a ON l.account_id = a.account_id
        WHERE l.user_id = $1
        ORDER BY l.consumed_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await database.query(query, [user_id, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('获取用户消费历史失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取账号消费统计
   * @param {string} account_id - 账号ID
   * @param {Object} options - 查询选项
   * @param {string} options.start_date - 开始日期
   * @param {string} options.end_date - 结束日期
   */
  async getAccountStats(account_id, { start_date, end_date } = {}) {
    try {
      let query = `
        SELECT 
          model_id,
          COUNT(*) as request_count,
          SUM(credit_used) as total_credit,
          AVG(credit_used) as avg_credit,
          MIN(credit_used) as min_credit,
          MAX(credit_used) as max_credit
        FROM kiro_consumption_log
        WHERE account_id = $1
      `;

      const params = [account_id];
      
      if (start_date) {
        params.push(start_date);query += ` AND consumed_at >= $${params.length}`;
      }
      
      if (end_date) {
        params.push(end_date);
        query += ` AND consumed_at <= $${params.length}`;
      }

      query += ` GROUP BY model_id ORDER BY total_credit DESC`;

      const result = await database.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error('获取账号消费统计失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户总消费统计
   * @param {string} user_id - 用户ID
   * @param {Object} options - 查询选项
   */
  async getUserTotalStats(user_id, { start_date, end_date } = {}) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_requests,
          SUM(credit_used) as total_credit,
          AVG(credit_used) as avg_credit,
          SUM(CASE WHEN is_shared = 1 THEN credit_used ELSE 0 END) as shared_credit,
          SUM(CASE WHEN is_shared = 0 THEN credit_used ELSE 0 END) as private_credit
        FROM kiro_consumption_log
        WHERE user_id = $1
      `;

      const params = [user_id];
      
      if (start_date) {
        params.push(start_date);
        query += ` AND consumed_at >= $${params.length}`;
      }
      
      if (end_date) {
        params.push(end_date);
        query += ` AND consumed_at <= $${params.length}`;
      }

      const result = await database.query(query, params);
      return result.rows[0];
    } catch (error) {
      logger.error('获取用户总消费统计失败:', error.message);
      throw error;
    }
  }

  /**
   * 按 API Key 获取消费统计
   * @param {number} api_key_id - API Key ID
   * @param {Object} options - 查询选项
   * @param {string} options.start_date - 开始日期
   * @param {string} options.end_date - 结束日期
   */
  async getStatsByApiKey(api_key_id, { start_date, end_date } = {}) {
    try {
      // 基础统计
      let baseQuery = `
        SELECT
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_requests,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed_requests,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(credit_used) as total_quota_consumed,
          AVG(duration_ms) as avg_duration_ms
        FROM kiro_consumption_log
        WHERE api_key_id = $1
      `;

      const params = [api_key_id];

      if (start_date) {
        params.push(start_date);
        baseQuery += ` AND consumed_at >= $${params.length}`;
      }

      if (end_date) {
        params.push(end_date);
        baseQuery += ` AND consumed_at <= $${params.length}`;
      }

      const baseResult = await database.query(baseQuery, params);
      const baseStats = baseResult.rows[0];

      // 按 model 统计
      let modelQuery = `
        SELECT
          model_id,
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_requests,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed_requests,
          SUM(total_tokens) as total_tokens,
          SUM(credit_used) as total_quota_consumed
        FROM kiro_consumption_log
        WHERE api_key_id = $1
      `;

      const modelParams = [api_key_id];

      if (start_date) {
        modelParams.push(start_date);
        modelQuery += ` AND consumed_at >= $${modelParams.length}`;
      }

      if (end_date) {
        modelParams.push(end_date);
        modelQuery += ` AND consumed_at <= $${modelParams.length}`;
      }

      modelQuery += ` GROUP BY model_id ORDER BY total_requests DESC LIMIT 50`;

      const modelResult = await database.query(modelQuery, modelParams);

      // 按 endpoint 统计
      let endpointQuery = `
        SELECT
          endpoint,
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as success_requests,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failed_requests,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(credit_used) as total_quota_consumed,
          AVG(duration_ms) as avg_duration_ms
        FROM kiro_consumption_log
        WHERE api_key_id = $1 AND endpoint IS NOT NULL
      `;

      const endpointParams = [api_key_id];

      if (start_date) {
        endpointParams.push(start_date);
        endpointQuery += ` AND consumed_at >= $${endpointParams.length}`;
      }

      if (end_date) {
        endpointParams.push(end_date);
        endpointQuery += ` AND consumed_at <= $${endpointParams.length}`;
      }

      endpointQuery += ` GROUP BY endpoint ORDER BY total_requests DESC LIMIT 100`;

      const endpointResult = await database.query(endpointQuery, endpointParams);

      // 按小时和模型聚合数据（用于图表）
      let hourlyModelQuery = `
        SELECT
          DATE_TRUNC('hour', consumed_at) as hour,
          model_id,
          SUM(credit_used) as quota_consumed,
          COUNT(*) as request_count
        FROM kiro_consumption_log
        WHERE api_key_id = $1
      `;

      const hourlyModelParams = [api_key_id];

      if (start_date) {
        hourlyModelParams.push(start_date);
        hourlyModelQuery += ` AND consumed_at >= $${hourlyModelParams.length}`;
      }

      if (end_date) {
        hourlyModelParams.push(end_date);
        hourlyModelQuery += ` AND consumed_at <= $${hourlyModelParams.length}`;
      }

      hourlyModelQuery += ` GROUP BY DATE_TRUNC('hour', consumed_at), model_id ORDER BY hour ASC`;

      const hourlyModelResult = await database.query(hourlyModelQuery, hourlyModelParams);

      // 最近请求记录
      let recentQuery = `
        SELECT
          log_id as id,
          endpoint,
          method,
          model_id as model_name,
          'kiro' as config_type,
          success,
          status_code,
          duration_ms,
          input_tokens,
          output_tokens,
          total_tokens,
          credit_used as quota_consumed,
          error_message,
          consumed_at as created_at
        FROM kiro_consumption_log
        WHERE api_key_id = $1
      `;

      const recentParams = [api_key_id];

      if (start_date) {
        recentParams.push(start_date);
        recentQuery += ` AND consumed_at >= $${recentParams.length}`;
      }

      if (end_date) {
        recentParams.push(end_date);
        recentQuery += ` AND consumed_at <= $${recentParams.length}`;
      }

      recentQuery += ` ORDER BY consumed_at DESC LIMIT 10`;

      const recentResult = await database.query(recentQuery, recentParams);

      return {
        base: baseStats,
        by_model: modelResult.rows,
        by_endpoint: endpointResult.rows,
        hourly_model_stats: hourlyModelResult.rows,
        recent_requests: recentResult.rows
      };
    } catch (error) {
      logger.error('按API Key获取消费统计失败:', error.message);
      throw error;
    }
  }
}

const kiroConsumptionService = new KiroConsumptionService();
export default kiroConsumptionService;