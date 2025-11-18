/**
 * 时间相关工具函数
 */

/**
 * 生成唯一ID（基于时间戳）
 */
export function generateId(): number {
    return Date.now()
}

/**
 * 获取当前时间戳字符串（本地时间格式）
 */
export function getCurrentTimestamp(): string {
    return new Date().toLocaleTimeString()
}

/**
 * 获取ISO格式时间戳
 */
export function getISOTimestamp(): string {
    return new Date().toISOString()
}