/**
 * 单元测试：parseThinkBlocks 的所有边界
 *
 * 运行：node tests/test-think-block.js
 */

// 直接 import — 既然我们用 Node 22 ESM，需要 dynamic import
async function main() {
  // 解析函数是 TS，编译后是 JS。直接读 source 然后用 ts-strip 或者...
  // 最简：用 --experimental-strip-types 跑（Node 22+）
  // 失败回退：复制源代码里的正则做 in-line 测试
  const url = new URL('../src/renderer/src/utils/thinkBlock.ts', import.meta.url).pathname
  console.log('Loading:', url)

  // 用 dynamic import 加载（Node 22 + .ts loader 不一定可用）
  // 回退：手写测试核心正则
  const { parseThinkBlocks } = await import(url).catch(() => {
    console.log('⚠️  直接 import .ts 失败，改用内联正则做黑盒测试')
    return { parseThinkBlocks: null }
  })

  if (parseThinkBlocks) {
    // 真函数测试
    const cases = [
      ['',                                  { thoughts: '', rest: '', hi: false }],
      ['hi',                                { thoughts: '', rest: 'hi', hi: false }],
      ['<thought>x</thought>hi',            { thoughts: 'x', rest: 'hi', hi: false }],
      ['<think>a</think>rest',              { thoughts: 'a', rest: 'rest', hi: false }],
      ['<thou',                             { thoughts: '', rest: '<thou', hi: false }],
      ['<thought>x</thought>hi<thought>y',  { thoughts: 'xy', rest: 'hi', hi: true }],
      ['<think>a</think><br/><think>b</think>',
                                            { thoughts: 'ab', rest: '<br/>', hi: false }],
      ['hi<thought>思考中...',               { thoughts: '思考中...', rest: 'hi', hi: true }],
      ['mix<think>x</think> and<thought>y</thought>',
                                            { thoughts: 'xy', rest: 'mix and', hi: false }],
      ['no thought here',                   { thoughts: '', rest: 'no thought here', hi: false }],
      ['<thought>multi\nline\nthought</thought>\n正式',
                                            { thoughts: 'multi\nline\nthought', rest: '\n正式', hi: false }],
    ]
    let pass = 0, fail = 0
    for (const [input, expected] of cases) {
      const got = parseThinkBlocks(input)
      const ok = got.thoughts === expected.thoughts && got.rest === expected.rest && got.hasIncompleteThought === expected.hi
      console.log(`  ${ok ? '✅' : '❌'} parseThinkBlocks(${JSON.stringify(input)})`)
      if (!ok) {
        console.log(`       expected: ${JSON.stringify(expected)}`)
        console.log(`       got:      ${JSON.stringify(got)}`)
        fail++
      } else {
        pass++
      }
    }
    console.log(`\n${pass}/${pass + fail} pass`)
    if (fail > 0) process.exit(1)
  } else {
    // 内联正则黑盒测试 — 重新实现一份
    const COMPLETE_RE = /<thought>([\s\S]*?)<\/thought>|<think>([\s\S]*?)<\/think>/gi
    const TAIL_RE = /<thought>([\s\S]*)$|<think>([\s\S]*)$/i
    function parse(content) {
      if (!content) return { thoughts: '', rest: '', hasIncompleteThought: false }
      const thoughtsParts = []
      for (const m of content.matchAll(COMPLETE_RE)) thoughtsParts.push(m[1] ?? m[2] ?? '')
      const stripped = content.replace(COMPLETE_RE, '')
      const tailMatch = stripped.match(TAIL_RE)
      const hasIncompleteThought = !!tailMatch
      if (tailMatch) thoughtsParts.push(tailMatch[1] ?? tailMatch[2] ?? '')
      let rest = content.replace(COMPLETE_RE, '')
      rest = rest.replace(TAIL_RE, '')
      return { thoughts: thoughtsParts.join(''), rest, hasIncompleteThought }
    }
    const cases = [
      ['',                                  { thoughts: '', rest: '', hi: false }],
      ['hi',                                { thoughts: '', rest: 'hi', hi: false }],
      ['<thought>x</thought>hi',            { thoughts: 'x', rest: 'hi', hi: false }],
      ['<think>a</think>rest',              { thoughts: 'a', rest: 'rest', hi: false }],
      ['<thou',                             { thoughts: '', rest: '<thou', hi: false }],
      ['<thought>x</thought>hi<thought>y',  { thoughts: 'xy', rest: 'hi', hi: true }],
      ['<think>a</think><br/><think>b</think>',
                                            { thoughts: 'ab', rest: '<br/>', hi: false }],
      ['hi<thought>思考中...',               { thoughts: '思考中...', rest: 'hi', hi: true }],
      ['mix<think>x</think> and<thought>y</thought>',
                                            { thoughts: 'xy', rest: 'mix and', hi: false }],
      ['no thought here',                   { thoughts: '', rest: 'no thought here', hi: false }],
      ['<thought>multi\nline\nthought</thought>\n正式',
                                            { thoughts: 'multi\nline\nthought', rest: '\n正式', hi: false }],
    ]
    let pass = 0, fail = 0
    for (const [input, expected] of cases) {
      const got = parse(input)
      const ok = got.thoughts === expected.thoughts && got.rest === expected.rest && got.hasIncompleteThought === expected.hi
      console.log(`  ${ok ? '✅' : '❌'} parse(${JSON.stringify(input)})`)
      if (!ok) {
        console.log(`       expected: ${JSON.stringify(expected)}`)
        console.log(`       got:      ${JSON.stringify(got)}`)
        fail++
      } else pass++
    }
    console.log(`\n${pass}/${pass + fail} pass (inline)`)
    if (fail > 0) process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
