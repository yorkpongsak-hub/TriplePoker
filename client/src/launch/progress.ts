import { Match, totals } from './engine';
export type Progress = { matches: number; wins: number; sealWins: number; lessonsPassed: boolean; completed: string[] };
export const EMPTY_PROGRESS: Progress = {matches:0,wins:0,sealWins:0,lessonsPassed:false,completed:[]};
export function recordMatch(progress: Progress, match: Match): Progress {
  if(match.results.length !== 3 || progress.completed.includes(match.id)) return progress;
  const score = totals(match.results);
  return {...progress,matches:progress.matches+1,wins:progress.wins+Number(score[0]>score[1]),sealWins:progress.sealWins+match.results.filter(r => r.sealWon).length,completed:[...progress.completed,match.id].slice(-200)};
}
export const practiceComplete = (p: Progress) => p.matches >= 5 && p.sealWins >= 2;
/** Tier D is the launch destination after the two onboarding matches. */
export const tierDUnlocked = (p: Progress) => p.matches >= 2;
export const advancedUnlocked = (p: Progress) => practiceComplete(p) && p.lessonsPassed;
export const LESSONS = [
  {question:'Which arrangement is legal?',answers:['Pile 1 <= Pile 2 <= Pile 3','Put the strongest hand in Pile 1','Only Pile 3 matters'],correct:0,why:'Compare full poker hands, including both shared cards. Equal strength is allowed.'},
  {question:'How is Pile 3 scored?',answers:['All seven cards count together','Best three of your five + both shared cards','Only your five private cards'],correct:1,why:'Every pile is evaluated as a five-card poker hand. Pile 3 gives you five private cards to choose three from.'},
  {question:'You use your seal on a tied pile. What happens?',answers:['You get two points','The seal returns next hand','Each player gets half a point; your seal is spent'],correct:2,why:'A seal adds one point only for an outright win. It is used once per match, even if the pile loses or ties.'},
  {question:'What changes at the advanced tables?',answers:['Duel points turn into tokens','Separate token rules, auctions and Call/Fold decisions','Your seal can be purchased'],correct:1,why:'Advanced tables have their own rules and entry requirements. Duel points never become tokens. Read each table guide before joining.'},
];
