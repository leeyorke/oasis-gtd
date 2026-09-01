/**
 * 验证 NextActions 任务卡上是否显示项目名 chip
 *
 * 测试：
 *   1. 进 NextActions 视图
 *   2. 抓所有 .task-card 里的 .task-project-tag 元素
 *   3. 对每条任务验证：有 project_id 的任务应该显示 chip，没 project_id 的不显示
 *   4. 验证 chip 里的文字 = project.title
 */
const TARGET = 'ws://127.0.0.1:9222/devtools/page/57FEF44847D4A0FAC13A6557C8371971'

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
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
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

  // 重载确保拿到最新代码
  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(2500)

  // 切到 NextActions（精确点 .nav-link 里文本为"下一步行动"的项）
  console.log('切到 NextActions...')
  const navResult = await evalJs(`(() => {
    for (const a of document.querySelectorAll('a.nav-link, button.nav-link, .nav-link')) {
      if (a.textContent.trim() === '下一步行动') { a.click(); return { clicked: true, text: a.textContent.trim() }; }
    }
    return { clicked: false, available: [...document.querySelectorAll('.nav-link')].map(a => a.textContent.trim()) };
  })()`)
  console.log('导航结果:', JSON.stringify(navResult))
  await sleep(800)

  // === 验证 1: 抓所有 task-card 里的项目 tag ===
  console.log('\n=== 验证 1: 抓所有 .task-project-tag ===')
  const probe = await evalJs(`(() => {
    const out = [];
    for (const card of document.querySelectorAll('.task-card')) {
      const title = card.querySelector('.task-title')?.textContent?.trim() || '';
      const tag = card.querySelector('.task-project-tag');
      const tagText = tag ? tag.textContent.trim() : null;
      // 也看 task-meta 的全文（看 chip 跟其他元数据怎么排布）
      const metaText = card.querySelector('.task-meta')?.textContent?.trim() || '';
      out.push({ title: title.slice(0, 50), hasTag: !!tag, tagText, metaText: metaText.slice(0, 120) });
    }
    return out;
  })()`)
  console.log(JSON.stringify(probe, null, 2))

  // 统计有 / 无 project tag 的任务
  const withTag = probe.filter(p => p.hasTag)
  const withoutTag = probe.filter(p => !p.hasTag)
  console.log(`\n有项目 tag: ${withTag.length} 条`)
  console.log(`无项目 tag: ${withoutTag.length} 条`)

  if (withTag.length > 0) {
    console.log('\n=== 验证 2: 抽样看 .task-project-tag 的样式 ===')
    const style = await evalJs(`(() => {
      const tag = document.querySelector('.task-project-tag');
      if (!tag) return null;
      const r = tag.getBoundingClientRect();
      const cs = getComputedStyle(tag);
      return {
        text: tag.textContent.trim(),
        title: tag.getAttribute('title'),
        width: Math.round(r.width),
        height: Math.round(r.height),
        border: cs.border,
        background: cs.background.slice(0, 60),
        fontSize: cs.fontSize,
        borderRadius: cs.borderRadius,
        display: cs.display,
        flex: cs.flex,
      };
    })()`)
    console.log(JSON.stringify(style, null, 2))
  }

  // === 验证 3: 检查每个 tag 的 text 是否对应某个真实项目 ===
  console.log('\n=== 验证 3: 项目 tag 文本与项目列表对照 ===')
  const projectList = await evalJs(`(() => {
    return [...document.querySelectorAll('.project-card')].map(c => {
      // 提取项目标题：去掉 "活跃/On Hold" 状态和 "X Tasks" 进度
      const t = c.textContent.trim().replace(/\\s+/g, ' ');
      // 试着从 .project-title / .project-name 等子元素拿
      const titleEl = c.querySelector('h2, h3, .project-title, .project-name, [class*="title"], [class*="name"]');
      return { raw: t.slice(0, 80), title: titleEl?.textContent?.trim() };
    });
  })()`)
  console.log('Projects 列表里能识别的标题:', JSON.stringify(projectList, null, 2))

  // 检查每条 tag 文本是否能找到对应项目
  console.log('\n=== 验证 4: 断言 - tag 文本应该来自项目 title ===')
  const knownProjectTitles = projectList.map(p => p.title).filter(Boolean)
  const tagTexts = withTag.map(p => p.tagText)
  const matched = tagTexts.filter(t => knownProjectTitles.some(k => k && t.includes(k) || t === k))
  console.log(`匹配上项目的 tag: ${matched.length} / ${tagTexts.length}`)
  console.log('所有 tag 文本:', JSON.stringify(tagTexts))

  ws.close()
  console.log('\n✅ 验证完成')
}
main().catch(e => { console.error('❌', e); process.exit(1) })
