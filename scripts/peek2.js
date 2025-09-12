const fs=require('fs');
const s=fs.readFileSync('flip-memory-game-v1.json','utf8');
console.log('len', s.length);
const i=4462; let start=i-120; if(start<0) start=0; let end=i+120; if(end>s.length) end=s.length;
console.log('slice:', s.slice(start,end));
console.log('codes:');
for(let j=start;j<end;j++){
  const code=s.charCodeAt(j);
  if(j===i) process.stdout.write('\n>>>HERE<<<\n');
  process.stdout.write(code+' ');
}
console.log('\n');
