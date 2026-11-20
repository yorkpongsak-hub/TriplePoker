// เซิร์ฟเฉพาะไฟล์ export ในเครื่อง สำหรับตรวจหน้าจอ Launch
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../launch-preview');
const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.json':'application/json'};
http.createServer((req,res)=>{
  const url = new URL(req.url,'http://localhost');
  let target;
  try {target=path.resolve(root,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400);res.end();return;}
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(!fs.existsSync(target)||!fs.statSync(target).isFile())target=path.join(root,'index.html');
  if(!fs.existsSync(target)){res.writeHead(404);res.end('Export not ready');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
  fs.createReadStream(target).pipe(res);
}).listen(8088,'127.0.0.1',()=>console.log('Launch preview: http://127.0.0.1:8088'));
