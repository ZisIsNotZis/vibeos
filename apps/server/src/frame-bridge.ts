const marker = "data-vibeos-frame-bridge";
const source = String.raw`<script data-vibeos-frame-bridge>(function(){
  const pending=new Map();let channel;
  function send(operation){return new Promise((resolve,reject)=>{if(!channel){reject(new Error("VibeOS bridge is not ready"));return}const requestId=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error("VibeOS operation timed out"))},60000);pending.set(requestId,{resolve,reject,timer});parent.postMessage({type:"vibeos:request",channel,requestId,operation},"*")})}
  addEventListener("message",event=>{const message=event.data;if(!message||typeof message!=="object")return;
    if(message.type==="vibeos:init"&&typeof message.channel==="string"){channel=message.channel;document.documentElement.dataset.theme=message.theme;parent.postMessage({type:"vibeos:ready",channel},"*");dispatchEvent(new Event("vibeos:ready"));return}
    if(message.type==="vibeos:theme"&&message.channel===channel)document.documentElement.dataset.theme=message.theme;
    if(message.type==="vibeos:state"&&message.channel===channel){for(const listener of listeners)listener(message.state);return}
    if(message.type==="vibeos:result"&&message.channel===channel){const item=pending.get(message.requestId);if(!item)return;pending.delete(message.requestId);clearTimeout(item.timer);message.ok?item.resolve(message.value):item.reject(new Error(message.error||"Operation failed"))}
  });
  const listeners=new Set();
  window.vibeOS=Object.freeze({request:send,navigate:(url,mode)=>send({type:"navigate",url,mode}),storage:Object.freeze({read:key=>send({type:"storage.read",key}),write:(key,value)=>send({type:"storage.write",key,value})}),state:Object.freeze({read:()=>send({type:"state.read"}),write:(state,revision)=>send({type:"state.write",state,revision}),subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}),dispatch:intent=>send({type:"dispatch",intent}),ai:Object.freeze({command:(command,options)=>send({type:"ai.command",command,scope:options&&options.scope,context:options&&options.context,output:options&&options.output})})});
  parent.postMessage({type:"vibeos:ready"},"*");
})();</script>`;
export function injectFrameBridge(html: string) {
  if (html.includes(marker)) return html;
  const head = html.match(/<head(?:\s[^>]*)?>/i);
  if (head?.index !== undefined) return html.slice(0, head.index + head[0].length) + source + html.slice(head.index + head[0].length);
  return source + html;
}
