/**
 * 验证项目名现在以纯文本形式显示（无圆角药丸、无圆点）
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/B2689DA145DAD52D3F7E0DD1E61BE992'

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })) })
  }
  async evalJs(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
}

async function main() {
  const ws = new WebSocket(TARGET)
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const cdp = new CDP(ws)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  const evalJs = cdp.evalJs.bind(cdp)
  const sleep = cdp.sleep.bind(cdp)

  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(2500)

  // 切到 NextActions
  await evalJs(`(() => {
    for (const a of document.querySelectorAll('.nav-link')) {
      if (a.textContent.trim() === '下一步行动') { a.click(); return }
    }
  })()`)
  await sleep(1000)

  // === 验证 1: 抓取 task-meta 全文 + 关键 meta 子节点 ===
  console.log('=== 验证 1: task-meta 实际内容 ===')
  const probe = await evalJs(`(() => {
    const out = [];
    for (const card of document.querySelectorAll('.task-card')) {
      const title = card.querySelector('.task-title')?.textContent?.trim() || '';
      const meta = card.querySelector('.task-meta');
      const metaText = meta?.textContent?.trim() || '';
      // 数 meta 里的子元素 + 圆点 span
      const childSpans = [...(meta?.querySelectorAll(':scope > span') || [])].map(s => ({
        text: s.textContent.trim().slice(0, 30),
        cls: s.className || '',
        // 检查是否还有 .task-project-tag 残留
        isOldChip: s.classList.contains('task-project-tag'),
      }));
      out.push({
        title: title.slice(0, 40),
        metaText: metaText.slice(0, 100),
        childSpans,
      });
    }
    return out;
  })()`)
  console.log(JSON.stringify(probe, null, 2))

  // === 验证 2: 确认 .task-project-tag 元素已不存在 ===
  console.log('\n=== 验证 2: .task-project-tag 元素应该不存在 ===')
  const tagCount = await evalJs(`document.querySelectorAll('.task-project-tag').length`)
  console.log(`.task-project-tag 元素数量: ${tagCount}`)
  console.log('断言 (无 .task-project-tag 元素):', tagCount === 0 ? '✅ PASS' : '❌ FAIL')

  // === 验证 3: meta 文本里项目名应该是纯文本，没有圆角药丸/圆点包装 ===
  console.log('\n=== 验证 3: 任务 meta 展示效果（文本片段） ===')
  for (const p of probe) {
    if (p.title.includes('mcp服务') || p.title.includes('oasis')) {
      console.log(`  ${p.title}: ${p.metaText}`)
    }
  }

  // === 验证 4: 抽样量 project 文本 span 的样式 ===
  console.log('\n=== 验证 4: 项目文本 span 样式（应该无 border/background） ===')
  const projectStyle = await evalJs(`(() => {
    // 找一段含 oasis-dev 的 meta
    for (const card of document.querySelectorAll('.task-card')) {
      const title = card.querySelector('.task-title')?.textContent?.trim() || '';
      if (title.includes('mcp服务')) {
        const meta = card.querySelector('.task-meta');
        for (const span of meta?.querySelectorAll(':scope > span') || []) {
          if (span.textContent.trim() === 'oasis-dev') {
            const cs = getComputedStyle(span);
            return {
              text: span.textContent.trim(),
              border: cs.border,
              background: cs.background.slice(0, 60),
              borderRadius: cs.borderRadius,
              padding: cs.padding,
              fontSize: cs.fontSize,
            };
          }
        }
      }
    }
    return null;
  })()`)
  console.log(JSON.stringify(projectStyle, null, 2))
  const noChipStyles = projectStyle && projectStyle.border === '0px none rgb(20, 28, 58)' && projectStyle.background.includes('rgba(0, 0, 0, 0)')
  console.log('断言 (无圆角药丸样式):', noChipStyles ? '✅ PASS' : '❌ FAIL')

  ws.close()
  console.log('\n✅ 验证完成')
}
main().catch(e => { console.error('❌', e); process.exit(1) })
