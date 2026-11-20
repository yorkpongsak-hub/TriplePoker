import { TILE_H, TILE_W, getCardBlockingState, physicalOrder, selectableCards } from './board.mjs'
import { cardLegacyLabel, cardPngUrl } from './card-art.mjs'
import { completeHandTransition, createGame, elapsedSeconds, hint, tryPlayerSelection, undo, useMagnet, useShuffle } from './game.mjs'

const root = document.querySelector('#app')
const field = selector => /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.querySelector(selector))
let config = { seed: 205031, size: 5, maxLayers: 4, memoryPercent: 25 }
let state = createGame(config)
let hintId = null
let blockedId = null
let blockedTimer = null
let resolutionTimer = null
let showBlockingDebug = false
let showRules = false
let blockedReason = ''

const imageFor = (card, concealed = false) => concealed ? '/assets/cards/classic/card_back_emerald_crest.png' : cardPngUrl(card)
const esc = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
const renderCardTile = (card, { tag = 'div', classes = '', attributes = '', style = '', overlay = '', concealed = false } = {}) => `<${tag} class="card-tile ${card.assetSet === 'B' && !concealed ? 'asset-set-b' : ''} ${classes}" ${attributes} title="${esc(concealed ? 'Face-down memory card' : cardLegacyLabel(card))}" ${style ? `style="${style}"` : ''}><span class="card-base"></span><span class="card-face-clip"><img class="card-face" draggable="false" src="${imageFor(card, concealed)}" alt="${concealed ? 'Face-down memory card' : card.id}"></span>${overlay}</${tag}>`
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const formatScore = score => Number(score).toLocaleString('en-US', { maximumFractionDigits: 2 })

function render() {
  const legal = new Set(selectableCards(state.cards).map(card => card.id))
  const remaining = state.cards.filter(card => !card.removed).length
  const metrics = state.solver?.metrics
  const activeCards = state.cards.filter(card => !card.removed)
  // Removed cards retain their seeded geometry, so the Stack frame never
  // shrinks or shifts while a run is in progress.
  const extentCards = state.cards
  const frameGap = 3
  const blocking = new Map(activeCards.map(card => [card.id, getCardBlockingState(state.cards, card)]))
  const minX = extentCards.length ? Math.min(...extentCards.map(card => card.left)) : 0
  const minY = extentCards.length ? Math.min(...extentCards.map(card => card.top)) : 0
  const maxX = extentCards.length ? Math.max(...extentCards.map(card => card.left + TILE_W)) : 0
  const maxY = extentCards.length ? Math.max(...extentCards.map(card => card.top + TILE_H)) : 0
  const boardWidth = maxX - minX + frameGap * 2
  const boardHeight = maxY - minY + frameGap * 2
  const elapsed = elapsedSeconds(state)
  const efficiency = state.solverBestScore ? Math.round(state.score / state.solverBestScore * 100) : 0
  root.innerHTML = `<section class="game">
    <h1 class="brand">TRIPLEPOKER: <span>STACK</span></h1>
    <header class="score-hud"><b>SCORE: ${formatScore(state.score)}</b><span class="mission-hud">CURRENT MISSION <strong>${esc(state.currentMission || 'NONE')}</strong></span><span>TIME: <i class="timer-value">${formatTime(elapsed)}</i></span></header>
    <section class="hand-stage" aria-label="Current hand">
      <button class="rules-link" data-action="rules">HOW TO PLAY / กติกา</button>
      <div class="message ${state.status === 'ended' ? 'failed' : ''}">${esc(state.message)}</div>
      <div class="hand ${state.status === 'resolving' ? 'bursting' : ''}">${Array.from({ length: 6 }, (_, index) => `<div class="hand-position">${state.hand[index] ? renderCardTile(state.hand[index], { classes: 'hand-tile', attributes: `aria-label="Committed ${state.hand[index].id}"` }) : '<div class="slot" aria-hidden="true"></div>'}</div>`).join('')}</div>
      ${state.status === 'resolving' ? `<div class="hand-result ${state.pendingHand?.missionSuccess ? 'mission-success' : ''}"><strong>${esc(state.lastRank)}</strong><em>${esc(state.pendingHand?.relation || '')} ×${Number(state.pendingHand?.multiplier || 1).toFixed(2)}</em><span>+${state.lastPoints} → ${formatScore(state.score)}</span><i></i><i></i><i></i><i></i><i></i><i></i></div>` : ''}
    </section>
    <div class="board-wrap"><div class="board" style="width:${boardWidth}px;height:${boardHeight}px;transform:translate(${-minX + frameGap}px,${-minY + frameGap}px)">${[...activeCards].sort((a, b) => physicalOrder(a) - physicalOrder(b)).map(card => { const info = blocking.get(card.id); const concealed = card.faceDown && state.revealedMemorySlot !== card.slotId; return renderCardTile(card, { tag: 'button', concealed, classes: `${blockedId === card.slotId ? 'blocked-tap' : ''} ${hintId === card.slotId ? 'hint' : ''} ${card.faceDown ? 'memory-card' : ''} ${card.faceDown && !concealed ? 'memory-revealed' : ''}`, attributes: `data-card="${card.slotId}" aria-label="${concealed ? 'Face-down memory card' : card.id}"`, style: `left:${card.left}px;top:${card.top}px;z-index:${card.layer}`, overlay: showBlockingDebug ? `<span class="card-debug">${card.id} ${card.slotId} L${card.layer} R${card.row} Xq${card.xUnits} Yq${card.yUnits}<br>top:[${info.topBlockers.join(',')}]<br>left:${info.leftBlocker || 'free'} right:${info.rightBlocker || 'free'}<br>selectable:${info.selectable}</span>` : '' }) }).join('')}</div></div>
    <nav class="tools">
      <button data-action="shuffle" ${state.status !== 'playing' ? 'disabled' : ''}>↻ SHUFFLE</button>
      <button data-action="magnet" ${state.status !== 'playing' ? 'disabled' : ''}>⦿ MAGNET</button>
      <button data-action="hint" ${state.status !== 'playing' ? 'disabled' : ''}>✦ HINT</button>
      <button data-action="undo" ${state.status !== 'playing' || !state.history.length ? 'disabled' : ''}>↶ UNDO</button>
    </nav>
    <details class="debug"><summary>DEBUG PANEL</summary><div class="debug-grid">
      <label>Seed<input id="seed" type="number" value="${state.seed}"></label>
      <label>Stack spread<select id="size"><option value="4" ${state.size === 4 ? 'selected' : ''}>Compact · 5 columns</option><option value="5" ${state.size === 5 ? 'selected' : ''}>Wide · 6 columns</option></select></label>
      <label>Max layers<select id="layers"><option ${state.maxLayers === 3 ? 'selected' : ''}>3</option><option ${state.maxLayers === 4 ? 'selected' : ''}>4</option></select></label>
      <label>Memory cards<select id="memory"><option value="12" ${state.memoryPercent === 12 ? 'selected' : ''}>Easy · 12%</option><option value="25" ${state.memoryPercent === 25 ? 'selected' : ''}>Medium · 25%</option><option value="42" ${state.memoryPercent === 42 ? 'selected' : ''}>Hard · 42%</option></select></label>
      <div class="debug-actions"><button data-action="new">NEW SEED</button><button data-action="replay">REPLAY SEED</button></div>
      <div class="debug-actions"><button data-action="blocking-debug">BLOCKING DEBUG: ${showBlockingDebug ? 'ON' : 'OFF'}</button></div>
      ${showBlockingDebug && blockedReason ? `<div class="blocking-reason">${esc(blockedReason)}</div>` : ''}
      <div class="metrics">Seed: ${state.seed} · Starting selectable: ${state.startingAccessibleCount} · Selectable: ${legal.size} · Remaining: ${remaining}
Hands: ${state.handsCompleted} · Player score: ${formatScore(state.score)} · Solver best score: ${state.solverBestScore ?? 0} · Efficiency: ${efficiency}%
Mission: ${state.currentMission || 'None'} · Achievable: ${state.achievableMissions.join(', ') || 'None'} · Memory: ${state.memoryPercent}%
${showBlockingDebug ? `Mission path (debug): ${state.missionPath.join(' → ') || 'none'}` : ''}
Time: ${formatTime(elapsed)} · Undo: ${state.undoCount}
Solver: ${state.solver?.result || 'not run'} · Nodes: ${state.solver?.nodes || 0} · Backtracks: ${state.solver?.backtracks || 0} · Avg choices: ${metrics?.averageChoices ?? 0}
Hand history:
${state.handHistory.map((entry, index) => `${index + 1}. ${entry.cards.join(' ')} / ${entry.rank} / +${entry.points} ×${Number(entry.multiplier || 1).toFixed(2)} = ${formatScore(entry.cumulativeScore ?? entry.points)}`).join('\n') || 'None'}</div>
    </div></details>
    ${state.status === 'ended' ? `<div class="result-overlay"><h2>FINAL SCORE ${formatScore(state.score)}</h2><p>TIME ${formatTime(elapsed)}</p><p>UNDO COUNT ${state.undoCount}</p><p>SOLVER BEST SCORE ${state.solverBestScore ?? 0}</p><p>SCORE EFFICIENCY ${efficiency}%</p><button data-action="replay">REPLAY SEED</button></div>` : ''}
    ${showRules ? `<div class="rules-overlay" role="dialog" aria-modal="true" aria-labelledby="rules-title"><article class="rules-card"><button class="rules-close" data-action="rules" aria-label="Close rules">×</button><h2 id="rules-title">TRIPLEPOKER: STACK — กติกา</h2>
      <ol>
        <li><b>เป้าหมาย:</b> เปิด Stack และทำ Current Mission ให้ตรงเพื่อเล่นต่อ พร้อมสะสมคะแนนให้สูงที่สุด</li>
        <li><b>การเลือกไพ่:</b> เลือกได้เมื่อไม่มีไพ่ชั้นบนทับ และด้านซ้ายหรือขวาว่างอย่างน้อยหนึ่งด้าน ไพ่ที่เลือกไม่ได้จะสั่นเท่านั้น</li>
        <li><b>Memory Card:</b> ไพ่คว่ำที่เลือกได้ต้องแตะครั้งแรกเพื่อเปิดดู และแตะใบเดิมครั้งที่สองเพื่อเข้ามือ เปิดค้างได้ครั้งละหนึ่งใบ</li>
        <li><b>Mission:</b> Solver สร้างเฉพาะอันดับที่ทำได้จริง และไม่สร้าง High Card ไพ่ที่จำเป็นจะไม่ถูกบอกหรือไฮไลต์</li>
        <li><b>ครบ 5 ใบ:</b> ถ้าอันดับตรง Mission แบบ exact จะจบมือนั้นทันที ใช้ไพ่ครบทั้งห้า และเริ่มรอบใหม่ด้วยมือว่าง ถ้ายังไม่ตรงให้เลือกใบที่ 6</li>
        <li><b>ครบ 6 ใบ:</b> ใช้ Best 5 จาก 6 หากตรง Mission ไพ่ที่ไม่ถูกใช้จะย้ายไปช่องแรกของรอบถัดไป หากไม่ตรง Mission หรือ Best 5 เป็น High Card เกมจบหลัง VFX</li>
        <li><b>Joker:</b> Joker ทั้งสามใบเป็นไพ่ Wild เต็มรูปแบบและแทนค่าเพื่อสร้างอันดับที่ดีที่สุด</li>
        <li><b>คะแนนมือ:</b> High Card 1, Pair 2, Two Pair 3, Three of a Kind 4, Straight 5, Flush 6, Full House 8, Four of a Kind 10, Straight Flush 15 และ Royal Flush 20</li>
        <li><b>คะแนนสะสม:</b> ปัดเป็นจำนวนเต็มทุกมือด้วยสูตร <code>round((คะแนนเดิม + คะแนนมือ) × ตัวคูณ)</code> — exact 1.10, สูงกว่า 1.02, ต่ำกว่า 0.95 และ High Card 0.90</li>
        <li><b>Items:</b> Shuffle สับ identity ของไพ่บนกระดานโดยไม่เปลี่ยนตำแหน่ง; Magnet ใช้กับไพ่ใบที่ 6 ตามเงื่อนไข; Hint ชี้ตำแหน่งโดยไม่เปิดหน้าไพ่คว่ำ; Undo สำเร็จหัก 2 คะแนน</li>
        <li><b>จบเกม:</b> นอกจากผลหกใบที่ไม่ตรง Mission/เป็น High Card แล้ว เกมจะจบเมื่อไม่มีทางเลือกไพ่ที่ถูกกติกาพอให้เติมมือจนครบหกใบ</li>
        <li><b>เวลาและอันดับ:</b> เวลาไม่เพิ่มหรือลดคะแนน ใช้ตัดสินเมื่อคะแนนเท่ากัน จากนั้นจึงดูจำนวน Undo ที่น้อยกว่า</li>
      </ol>
      <button class="rules-done" data-action="rules">เข้าใจแล้ว</button></article></div>` : ''}
  </section>`
  if (state.status === 'resolving' && !resolutionTimer) resolutionTimer = setTimeout(() => { completeHandTransition(state); resolutionTimer = null; render() }, 1250)
}

function readConfig(useNewSeed = false) {
  const seed = useNewSeed ? Math.floor(Math.random() * 999999999) + 1 : Number(field('#seed')?.value || state.seed)
  config = { seed, size: Number(field('#size')?.value || 5), maxLayers: Number(field('#layers')?.value || 4), memoryPercent: Number(field('#memory')?.value || state.memoryPercent || 25) }
  state = createGame(config)
  hintId = null
}

root.addEventListener('click', event => {
  const target = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest('[data-card], [data-action]') : null)
  if (!target || target.hasAttribute('disabled')) return
  const cardId = target.dataset.card
  const action = target.dataset.action
  if (cardId) {
    const attempt = tryPlayerSelection(state, cardId)
    if (attempt.selected) { hintId = null; blockedId = null; blockedReason = '' }
    else if (attempt.blocked) {
      blockedId = cardId
      if (showBlockingDebug) {
        const info = getCardBlockingState(state.cards, state.cards.find(card => card.slotId === cardId || card.id === cardId))
        blockedReason = [`TOP BLOCKED BY: ${info.topBlockers.join(', ') || 'none'}`, `LEFT BLOCKED BY: ${info.leftBlocker || 'none'}`, `RIGHT BLOCKED BY: ${info.rightBlocker || 'none'}`].join('\n')
      }
      clearTimeout(blockedTimer)
      blockedTimer = setTimeout(() => { if (blockedId === cardId) { blockedId = null; render() } }, 380)
    }
  } else if (action === 'shuffle') { useShuffle(state); hintId = null }
  else if (action === 'magnet') { useMagnet(state); hintId = null }
  else if (action === 'hint') hintId = hint(state)
  else if (action === 'undo') { undo(state); hintId = null }
  else if (action === 'new') readConfig(true)
  else if (action === 'replay') readConfig(false)
  else if (action === 'rules') showRules = !showRules
  else if (action === 'blocking-debug') showBlockingDebug = !showBlockingDebug
  render()
})

setInterval(() => {
  const timer = document.querySelector('.timer-value')
  if (timer && state.status === 'playing') timer.textContent = formatTime(elapsedSeconds(state))
}, 250)
render()
