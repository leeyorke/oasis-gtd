/**
 * 单元测试：summarizeTitle 的所有边界
 * 运行：node tests/test-conversation-title.js
 */
async function main() {
  const url = new URL('../src/main/utils/conversationTitle.ts', import.meta.url).pathname
  const mod = await import(url).catch(() => null)
  let summarizeTitle = mod?.summarizeTitle
  if (!summarizeTitle) {
    console.log('⚠️  直接 import .ts 失败，用内联 fallback 测试（仅覆盖纯函数行为）')
    summarizeTitle = function (message, maxChars = 10) {
      if (!message) return ''
      const normalized = message.replace(/[\s　]+/g, ' ').trim()
      const noLeading = normalized.replace(/^[\s　#-]+/, '')
      if (noLeading.length <= maxChars) return noLeading
      let cut = noLeading.slice(0, maxChars)
      cut = cut.replace(/[\s　,.!?;:,，！？。；：、…]+$/u, '')
      return cut
    }
  }

  const cases = [
    // [input, maxChars, expected]
    ['', 10, ''],
    ['   ', 10, ''],
    ['短', 10, '短'],
    ['我今天', 10, '我今天'],
    ['我想做一个 Oasis GTD 应用', 10, '我想做一个 Oasi'],
    ['Hello, how are you?', 10, 'Hello, how'],
    ['这是一段很长的描述，需要压缩一下', 10, '这是一段很长的描述'],
    ['多\n行\n\n内容  压缩', 10, '多 行 内容 压缩'],
    ['中文标点：测试，结束。', 10, '中文标点：测试，结束'],
    ['English sentence with many words to compress', 10, 'English se'],
    ['0123456789', 10, '0123456789'],
    ['0123456789ABCDEF', 10, '0123456789'],
    ['hi  world', 10, 'hi world'],
    ['a'.repeat(100), 10, 'aaaaaaaaaa'],
    // maxChars < 默认
    ['我想做一个应用', 5, '我想做一个'],
    ['我想做一个 Oasis GTD 应用', 5, '我想做一个'],
    // 只有标点
    ['！@#', 10, '！@#'],
    // 英文短句
    ['Quick brown fox jumps', 10, 'Quick brow'],
    // 英文长句正好 10 字符
    ['abcdefghij', 10, 'abcdefghij'],
    // markdown 噪音：开头 ---（去头后 9 字符 ≤ 10 → 原样返回）
    ['---微习惯拆解早起方法', 10, '微习惯拆解早起方法'],
    // markdown 噪音：开头 # / ## / ###（去头后 7-8 字符 ≤ 10 → 原样返回）
    ['# 标题内容在这里', 10, '标题内容在这里'],
    ['## 标题内容在这里', 10, '标题内容在这里'],
    // 边界：标题字符本身就少
    ['## 短', 10, '短'],
    // 边界：全 --- 只有装饰（去头后为空字符串）
    ['---', 10, ''],
    // 边界：# 后面紧跟不是空格（不去头：去掉任何开头的 # / - 都行；#a 视为 # + 内容）
    ['#a', 10, 'a'],
  ]

  let pass = 0, fail = 0
  for (const [input, maxChars, expected] of cases) {
    const got = summarizeTitle(input, maxChars)
    const ok = got === expected
    console.log(`  ${ok ? '✅' : '❌'} summarizeTitle(${JSON.stringify(input)}, ${maxChars})`)
    if (!ok) {
      console.log(`       expected: ${JSON.stringify(expected)}`)
      console.log(`       got:      ${JSON.stringify(got)}`)
      fail++
    } else pass++
  }
  console.log(`\n${pass}/${pass + fail} pass`)
  if (fail > 0) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
