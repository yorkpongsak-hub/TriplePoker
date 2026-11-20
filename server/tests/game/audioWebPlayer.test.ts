jest.mock('../../../client/node_modules/expo-asset',()=>({Asset:{fromModule:(id:number)=>({uri:`asset-${id}.mp3`})}}));
let media:any;
beforeEach(()=>{
  (globalThis as any).Audio=class {
    paused=true;ended=false;readyState=3;currentTime=0;duration=1;volume=1;loop=false;blocked=true;
    listeners=new Map<string,()=>void>();
    constructor(public src:string){media=this;}
    load=jest.fn();removeAttribute=jest.fn();pause=jest.fn(()=>{this.paused=true;});
    play=jest.fn(()=>{if(this.blocked)return Promise.reject(new Error('NotAllowedError'));this.paused=false;return Promise.resolve();});
    addEventListener=(name:string,fn:()=>void)=>this.listeners.set(name,fn);
    removeEventListener=(name:string)=>this.listeners.delete(name);
  };
});
afterEach(()=>{delete (globalThis as any).Audio;});
const flushWeb=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('autoplay rejection stays paused and the next permitted gesture recovers',async()=>{
  const {createManagedPlayer}=require('../../../client/src/audio/playerFactory.web');
  const player=createManagedPlayer(1);player.play();await flushWeb();expect(player.playing).toBe(false);
  media.blocked=false;player.play();await flushWeb();expect(player.playing).toBe(true);
  player.remove();expect(media.listeners.size).toBe(0);
});
test('a pending successful play cannot restart a removed player',async()=>{
  const {createManagedPlayer}=require('../../../client/src/audio/playerFactory.web');
  const player=createManagedPlayer(1);let resolvePlay:()=>void=()=>{};
  media.play.mockImplementation(()=>new Promise<void>(resolve=>{resolvePlay=()=>{media.paused=false;resolve();};}));
  player.play();player.remove();resolvePlay();await flushWeb();expect(media.paused).toBe(true);
});
test('two recovery attempts do not cancel the newest playback and finish emits cleanup',async()=>{
  const {createManagedPlayer}=require('../../../client/src/audio/playerFactory.web');
  const player=createManagedPlayer(1);media.blocked=false;
  const callback=jest.fn();player.addListener('playbackStatusUpdate',callback);
  player.play();player.play();await flushWeb();expect(player.playing).toBe(true);
  media.ended=true;media.listeners.get('ended')();expect(callback).toHaveBeenCalledWith({isLoaded:true,didJustFinish:true});
  player.remove();
});
