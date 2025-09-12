const fs=require('fs');
const s=fs.readFileSync('flip-memory-game-v1.json','utf8');
console.log('len', s.length);
const i=4462; const from=i-40; const to=i+40; 
console.log(s.slice(from,to));
console.log('\nHEX:');
const buf=Buffer.from(s);
const seg=buf.slice(from,to);
console.log(seg.toString('hex'));
