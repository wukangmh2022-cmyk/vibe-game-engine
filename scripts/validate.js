const fs=require('fs');
const p=process.argv[2];
try{
  const s=fs.readFileSync(p,'utf8');
  JSON.parse(s);
  console.log('OK:', p);
}catch(e){
  console.error('ERR:', p, e.message);
  process.exit(1);
}
