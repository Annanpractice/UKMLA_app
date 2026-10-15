#!/usr/bin/env python3
"""Build a network-free, reproducible card/reference SQLite snapshot."""
import html,json,re,sqlite3,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def plain(value):
    return html.unescape(re.sub('<[^>]+>',' ',str(value))).strip()
def records():
    data=json.loads((ROOT/'data/conditions.json').read_text())
    for c in data['conditions']:
        fields=c.get('fields',{});labels=c.get('labels',{})
        yield (c['name'],c.get('topic','UKMLA'), '\n\n'.join(f'{labels.get(k,k)}\n{plain(v)}' for k,v in fields.items()),'UKMLA card snapshot · '+c['id'],'card')
    pharma=json.loads(subprocess.check_output(['node',str(ROOT/'android-reader/tools/export_pharmacology.cjs')]))
    for c in pharma['cards']:
        yield (c['name'],'Pharmacology · '+c.get('section',''), '\n\n'.join(f'{pharma["labels"].get(k,k)}\n{plain(v)}' for k,v in c['fields'].items()),'UKMLA pharmacology card snapshot · '+str(c.get('sourceRefs',[])),'card')
    glossary=json.loads((ROOT/'android-reader/reference/nci-glossary.json').read_text())
    for term in glossary['terms']:
        yield (term['term'],'NCI glossary',term['definition'],'National Cancer Institute · '+term['url']+' · retrieved '+glossary['retrieved'],'glossary')
def main():
    output=ROOT/'android-reader/app/src/main/assets/reader.db';output.parent.mkdir(parents=True,exist_ok=True);output.unlink(missing_ok=True)
    db=sqlite3.connect(output)
    db.execute('CREATE TABLE entries(id INTEGER PRIMARY KEY,title TEXT NOT NULL,topic TEXT NOT NULL,body TEXT NOT NULL,attribution TEXT NOT NULL,kind TEXT NOT NULL)')
    db.execute('CREATE VIRTUAL TABLE lookup USING fts4(title,body,tokenize=unicode61)')
    for i,row in enumerate(records(),1):
        db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?)',(i,*row))
        db.execute('INSERT INTO lookup(docid,title,body) VALUES(?,?,?)',(i,row[0],row[2]))
    db.commit()
    counts=dict(db.execute('SELECT kind,count(*) FROM entries GROUP BY kind'))
    assert counts['card']>=983,counts
    assert counts['glossary']>=100,counts
    assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    for word in ['ataxia','heart','insulin']:
        assert db.execute('SELECT count(*) FROM lookup WHERE lookup MATCH ?',(word,)).fetchone()[0]>0
    print(counts,output.stat().st_size)
    db.close()
if __name__=='__main__':main()
