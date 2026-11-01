const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8081;
let latestPose = null;

const server = http.createServer((req,res)=>{
  if(req.method==='GET' && req.url==='/'){
    res.writeHead(200,{'Content-Type':'text/plain'}); res.end('ReplayLive server');
    return;
  }
  if(req.method==='POST' && req.url==='/replay/pose'){
    let body='';
    req.on('data',c=>body+=c);
    req.on('end',()=>{
      try{ latestPose = JSON.parse(body); }catch(e){}
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocket.Server({server});
wss.on('connection', ws=>{
  ws.send(JSON.stringify({t:'welcome'}));
  const interval = setInterval(()=>{
    if(latestPose) ws.send(JSON.stringify(latestPose));
  }, 16);
  ws.on('close',()=>clearInterval(interval));
});

server.listen(PORT, '0.0.0.0', ()=> console.log('ReplayLive server on '+PORT));
