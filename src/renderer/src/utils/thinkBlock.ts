/**
 * 解析 LLM 输出中的思考/推理块。
 *
 * 一些模型（Anthropic Claude extended thinking、DeepSeek R1、OpenAI o1 等）
 * 会在正式回复前输出思考过程，常见格式：
 *   <thought>...思考内容...</thought>
 *  <think>...思考内容...</think>
 *
 * 流式场景下标签可能跨 chunk 边界（如 <thou … ght>），所以解析时要同时
 * 处理「完整闭合块」和「末尾未闭合块」——后者也属于思考过程的一部分。
 *
 * 用法：
 *   const { thoughts, rest, hasIncompleteThought } = parseThinkBlocks(content)
 *   // thoughts: 累积的思考内容（不含标签本身）
 *   // rest:     去掉 thought 块后的主体（不含任何 thought 标签）
 *   // hasIncompleteThought: 是否存在未闭合的 thought 块（流式判断用）
 *
 * 行为示例：
 *   parseThinkBlocks('')                                  → { thoughts: '', rest: '', hasIncompleteThought: false }
 *   parseThinkBlocks('hi')                                → { thoughts: '', rest: 'hi', hasIncompleteThought: false }
 *   parseThinkBlocks('<thought>x</thought>hi')            → { thoughts: 'x', rest: 'hi', hasIncompleteThought: false }
 *   parseThinkBlocks('<thou')                             → { thoughts: '', rest: '<thou', hasIncompleteThought: false }
 *   parseThinkBlocks('<thought>x</thought>hi<thought>y')  → { thoughts: 'xy', rest: 'hi', hasIncompleteThought: true }
 *   parseThinkBlocks('<think>a</think><br/><think>b</think>')
 *                                                          → { thoughts: 'ab', rest: '<br/>', hasIncompleteThought: false }
 */

export interface ParsedContent {
  /** 累积的思考内容（不含标签本身）。可能为空字符串。 */
  thoughts: string
  /** 去掉 thought 块后的主体。绝不包含 <thought>/<think> 标签。 */
  rest: string
  /** 是否存在未闭合的 thought 块（用于流式中判断"思考中"还是"思考完成"） */
  hasIncompleteThought: boolean
}

// 完整闭合块：<thought>...</thought> 或 <think>...</think>
// 捕获组 1 / 2 是块内文本（不区分大小写）
const COMPLETE_RE = /<thought>([\s\S]*?)<\/thought>|<think>([\s\S]*?)<\/think>/gi

// 末尾未闭合块：<thought>... 或 <think>... 一直到字符串末尾
// 只匹配最末尾一个未闭合块（前面可能已有完整闭合块）
const TAIL_RE = /<thought>([\s\S]*)$|<think>([\S\s]*)$/i

export function parseThinkBlocks(content: string): ParsedContent {
  if (!content) return { thoughts: '', rest: '', hasIncompleteThought: false }

  // 1) 抽取所有完整闭合块的内部文本
  const thoughtsParts: string[] = []
  for (const m of content.matchAll(COMPLETE_RE)) {
    thoughtsParts.push(m[1] ?? m[2] ?? '')
  }

  // 2) 在抽掉完整闭合块后的字符串里，找末尾未闭合块
  //    用 replace 把所有完整块替换为空，再看尾巴
  const stripped = content.replace(COMPLETE_RE, '')
  const tailMatch = stripped.match(TAIL_RE)
  const hasIncompleteThought = !!tailMatch
  if (tailMatch) {
    thoughtsParts.push(tailMatch[1] ?? tailMatch[2] ?? '')
  }

  // 3) rest = 原始内容去掉所有 thought 标签（包括未闭合的开标签）
  //    分两步：先把完整块连同标签删掉；再删掉尾部开标签
  let rest = content.replace(COMPLETE_RE, '')
  rest = rest.replace(TAIL_RE, '')

  return {
    thoughts: thoughtsParts.join(''),
    rest,
    hasIncompleteThought,
  }
}
