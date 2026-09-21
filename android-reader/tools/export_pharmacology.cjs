const fs=require('fs'), vm=require('vm'), path=require('path');
const root=path.resolve(__dirname,'../..');
const ctx={window:{}};vm.createContext(ctx);
const html=fs.readFileSync(path.join(root,'v2/app.html'),'utf8');
for(const m of html.matchAll(/src="\.\/(v2\/pharmacology-data[^?"\s]*\.js)/g)) vm.runInContext(fs.readFileSync(path.join(root,m[1]),'utf8'),ctx);
process.stdout.write(JSON.stringify(ctx.window.UKMLA_PHARMACOLOGY_DATA));
