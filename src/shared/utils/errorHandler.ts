/**
 * 错误处理工具函数
 */

/**
 * 异步操作错误处理包装器
 */
export async function handleAsyncError<T>(
    asyncFn: () => Promise<T>,
    errorMessage: string = '操作失败'
): Promise<T | null> {
    try {
        return await asyncFn()
    } catch (error) {
        console.error(errorMessage, error)
        return null
    }
}

/**
 * 同步操作错误处理包装器
 */
export function handleSyncError<T>(
    syncFn: () => T,
    errorMessage: string = '操作失败'
): T | null {
    try {
        return syncFn()
    } catch (error) {
        console.error(errorMessage, error)
        return null
    }
}