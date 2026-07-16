from pathlib import Path

path=Path('v2/ai-engine.js')
text=path.read_text(encoding='utf-8')
old="""  if(!large()?.putRaw||!large()?.getRaw)throw new Error('Durable browser storage is unavailable. The completed set has not been released.');
  const key=pendingSetKey(set);
"""
new="""  if(!large()?.putRaw||!large()?.getRaw){
    saveJob({...job,currentSet:set,status:'complete',percent:100,lastMessage:'Questions ready; awaiting verified Question Bank storage'});
    return null;
  }
  const key=pendingSetKey(set);
"""
if old not in text:
    raise SystemExit('Engine fallback patch target missing')
path.write_text(text.replace(old,new,1),encoding='utf-8')
print('Applied localStorage fallback when IndexedDB is unavailable')
