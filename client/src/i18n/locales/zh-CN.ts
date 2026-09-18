import type { TranslationShape } from '../types'
const zhCN: TranslationShape = {
  common: { continue: '继续', back: '返回', close: '关闭', cancel: '取消', confirm: '确认', done: '完成', loading: '加载中…', error: '发生错误，请重试。', language: '语言', settings: '设置', play: '开始', enter: '进入', exit: '退出', retry: '重试', comingSoon: '即将推出' },
  entry: { enter: '进入', howToPlay: '玩法说明', openDoor: '打开大门', level: '等级 {level}' },
  lobby: { title: 'TriplePoker: Rise 大厅', tierDSolo: 'D 级单人模式', continueSolo: '继续你的单人等级之旅', buyIn: '入场费：{amount}', notEnoughTokens: '代币不足', backToLobby: '返回大厅', liveTables: '进行中的牌桌', noLiveTables: '此级别没有进行中的牌桌。' },
  game: { arrange: '摆牌', reveal: '亮牌', autoReveal: '自动亮牌', pile: '牌组 {pile}', foul: '犯规', winner: '胜者', youWin: '你赢了！', youLose: '你输了', greatJob: '干得漂亮！', combo: '连击！', superCombo: '超级连击！', matchComplete: '对局完成', matchEnd: '对局结束', finalTokenBalance: '最终代币余额', level: '等级 {level}', league: '联赛', countdown: '{seconds} 秒', hand: '第 {current} / {total} 手' },
  poker: { handRank: { royal_flush: '皇家同花顺', straight_flush: '同花顺', four_of_a_kind: '四条', full_house: '葫芦', flush: '同花', straight: '顺子', three_of_a_kind: '三条', two_pair: '两对', one_pair: '一对', high_card: '高牌' }, bestFive: '最佳 5 张' },
  ranking: { top20: '前 20 名', rank: '排名 #{rank}', player: '玩家', points: '积分', streak: '连胜', tournamentStarted: '前 20 名竞赛已开始', timeRemaining: '剩余时间', tournamentEnded: '竞赛已结束', finalRank: '最终排名', reward: '奖励', champion: '冠军' },
  actions: { auction: '拍卖', call: '跟注', fold: '弃牌', reveal: '亮牌', autoReveal: '自动亮牌', matchmaking: '正在匹配' },
  economy: { token: '代币', tokens: '代币', crown: '皇冠', insufficientTokens: '代币不足。', tokensReturned: '{amount} 代币已返还到你的钱包。' },
  errors: { unauthorized: '无法验证你的会话，请重新登录。', invalidPin: 'PIN 必须恰好为 4 位数字。', tierLocked: '此级别尚未解锁，请继续游戏。', adUnavailable: '广告服务不可用，你可以继续游戏。', matchNotFound: '未找到对局，请重试。' },
  tutorial: { title: '玩法说明', close: '关闭教程', pileOrder: '保持牌组 1 ≤ 牌组 2 ≤ 牌组 3。' },
  vip: { vip: 'VIP', pro: 'VIP Pro', proPlus: 'VIP Pro Plus' },
}
export default zhCN
