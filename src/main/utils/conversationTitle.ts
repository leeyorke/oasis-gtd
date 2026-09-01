/**
 * 把用户消息压缩成一个简短的对话标题。
 *
 * 约束：标题不超过 maxChars 个字符（默认 10）。
 * 策略：
 *   1. 把多空白压成单空格
 *   2. 如果已经够短，直接返回
 *   3. 否则截断到 maxChars
 *   4. 去掉结尾的标点（半角 + 全角）
 *   5. 去掉开头的 markdown 装饰噪音（# / ---）
 *
 * 例：
 *   summarizeTitle('我想做一个 Oasis GTD 应用') → '我想做一个 Oasi'
 *   summarizeTitle('Hello, how are you?')         → 'Hello, how'
 *   summarizeTitle('我今天', 10)                    → '我今天'
 *   summarizeTitle('短', 10)                          → '短'
 *   summarizeTitle('这是一段很长的描述，需要压缩一下', 10)
 *     → '这是一段很长的描述，' (10字) → 去尾标点 → '这是一段很长的描述' (9字)
 */
export function summarizeTitle(message: string, maxChars: number = 10): string {
  if (!message) return ''

  // 1) 把换行 / 多空白（含全角空格 U+3000）压成单空格
  const normalized = message.replace(/[\s　]+/g, ' ').trim()

  // 1.5) 总是先去掉开头的 markdown 装饰噪音（不论长度）
  //    - 头部 1-3 个 # 字符（# / ## / ###）+ 可选空格
  //    - 头部 --- 横线（来自 AI 把 markdown 分割线当标题）
  const noLeading = normalized.replace(/^[\s　#-]+/, '')

  // 2) 已经够短
  if (noLeading.length <= maxChars) {
    return noLeading
  }

  // 3) 截断到 maxChars
  let cut = noLeading.slice(0, maxChars)

  // 4) 去掉结尾的标点（半角 + 全角）
  //    - 半角: , . ! ? : ;
  //    - 全角: ， 。 ！ ？ ： ；
  //    - 顿号: 、  省略号: …
  //    - 末尾空白（半角空格 + 全角空格 U+3000）
  cut = cut.replace(/[\s　,.!?;:,，！？。；：、…]+$/u, '')

  return cut
}
