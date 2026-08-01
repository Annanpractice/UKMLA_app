import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const modeSource=fs.readFileSync('v2/image-mode-control.js','utf8');
const bankSource=fs.readFileSync('v2/image-bank.js','utf8');
assert.equal(modeSource.includes('MutationObserver'),false,'image-mode-control must not install a MutationObserver');
assert.equal(bankSource.includes('MutationObserver'),false,'image-bank must not install a MutationObserver');

let writes=0;
const countWrite=(oldValue,newValue)=>{if(oldValue!==newValue)writes++;return newValue;};

class FakeElement{
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();
    this.children=[];
    this.parentElement=null;
    this._id='';
    this._className='';
    this._textContent='';
    this._hidden=false;
    this._disabled=false;
    this._value='';
    this._innerHTML='';
    this.listeners=new Map();
    this.attributes=new Map();
    this.dataset=new Proxy({}, {set:(target,key,value)=>{target[key]=countWrite(target[key],String(value));return true;}});
    let marginTop='';
    this.style={};
    Object.defineProperty(this.style,'marginTop',{get:()=>marginTop,set:value=>{marginTop=countWrite(marginTop,String(value));}});
  }
  get id(){return this._id;} set id(value){this._id=countWrite(this._id,String(value));}
  get className(){return this._className;} set className(value){this._className=countWrite(this._className,String(value));}
  get textContent(){return this._textContent;} set textContent(value){this._textContent=countWrite(this._textContent,String(value));}
  get hidden(){return this._hidden;} set hidden(value){this._hidden=countWrite(this._hidden,Boolean(value));}
  get disabled(){return this._disabled;} set disabled(value){this._disabled=countWrite(this._disabled,Boolean(value));}
  get value(){return this._value;} set value(value){this._value=countWrite(this._value,String(value));}
  get firstChild(){return this.children[0]||null;}
  get innerHTML(){return this._innerHTML;}
  set innerHTML(value){
    this._innerHTML=countWrite(this._innerHTML,String(value));
    this.children=[];
    if(String(value).includes('id="ai-image-mode"')){
      const label=new FakeElement('label');
      const select=new FakeElement('select');select.id='ai-image-mode';select.className='select';select.value='off';
      const detail=new FakeElement('small');detail.id='ai-image-mode-detail';detail.className='question-source-note';
      this.appendChild(label);this.appendChild(select);this.appendChild(detail);
    }
  }
  appendChild(node){
    if(node.parentElement)node.parentElement.removeChild(node);
    this.children.push(node);node.parentElement=this;writes++;return node;
  }
  insertBefore(node,before){
    if(node.parentElement)node.parentElement.removeChild(node);
    const index=before?this.children.indexOf(before):-1;
    if(index<0)this.children.push(node);else this.children.splice(index,0,node);
    node.parentElement=this;writes++;return node;
  }
  removeChild(node){
    const index=this.children.indexOf(node);
    if(index>=0){this.children.splice(index,1);node.parentElement=null;writes++;}
    return node;
  }
  before(node){if(this.parentElement)this.parentElement.insertBefore(node,this);}
  addEventListener(type,handler){const list=this.listeners.get(type)||[];list.push(handler);this.listeners.set(type,list);}
  setAttribute(name,value){
    const next=String(value);const previous=this.attributes.get(name);
    if(previous!==next){this.attributes.set(name,next);writes++;}
    if(name==='data-ukmla-question-workspace')this.dataset.ukmlaQuestionWorkspace=next;
  }
  getAttribute(name){return this.attributes.get(name)||null;}
  matches(selector){return matches(this,selector);}
  closest(selector){let node=this;while(node){if(matches(node,selector))return node;node=node.parentElement;}return null;}
  querySelector(selector){return findOne(this,selector,false);}
  querySelectorAll(selector){return findAll(this,selector,false);}
}

function matches(node,selector){
  if(selector.startsWith('#'))return node.id===selector.slice(1);
  if(selector.startsWith('.'))return node.className.split(/\s+/).includes(selector.slice(1));
  const attr=selector.match(/^\[data-([a-z0-9-]+)="([^"]+)"\]$/i);
  if(attr){
    const key=attr[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
    return node.dataset[key]===attr[2];
  }
  return node.tagName.toLowerCase()===selector.toLowerCase();
}
function findAll(root,selector,includeRoot=true){
  const found=[];
  if(includeRoot&&matches(root,selector))found.push(root);
  for(const child of root.children){if(matches(child,selector))found.push(child);found.push(...findAll(child,selector,false));}
  return found;
}
function findOne(root,selector,includeRoot=true){return findAll(root,selector,includeRoot)[0]||null;}

const body=new FakeElement('body');
const workspace=new FakeElement('section');workspace.setAttribute('data-ukmla-question-workspace','ai');
const scopeField=new FakeElement('div');scopeField.className='field';
const scope=new FakeElement('select');scope.id='ai-mode';scope.value='random';scopeField.appendChild(scope);
const topic=new FakeElement('select');topic.id='ai-topic';scopeField.appendChild(topic);
const start=new FakeElement('button');start.id='ai-start';workspace.appendChild(scopeField);workspace.appendChild(start);body.appendChild(workspace);

const documentEvents=new Map();
const document={
  readyState:'complete',body,
  createElement:tag=>new FakeElement(tag),
  querySelector:selector=>findOne(body,selector,true),
  querySelectorAll:selector=>findAll(body,selector,true),
  addEventListener(type,handler){const list=documentEvents.get(type)||[];list.push(handler);documentEvents.set(type,list);},
  removeEventListener(type,handler){const list=documentEvents.get(type)||[];documentEvents.set(type,list.filter(item=>item!==handler));},
  dispatchEvent(event){for(const handler of documentEvents.get(event.type)||[])handler(event);return true;}
};

const storage=new Map();
const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
const windowEvents=new Map();
const window={
  UKMLA_V2:{App:{conditions:[],byTopic:new Map()},eventIndex:()=>({conditionAnswered:{},conditionPresented:{}}),coverageState:()=>({covered:[]})},
  UKMLA_V2_AI_ENGINE:{__medicalImagePatched:true,runPipeline:async config=>({questions:[],config})},
  UKMLA_IMAGE_BANK:{setEnabled(){},approvedImages:()=>[{}],prepareConditions:conditions=>conditions.map(item=>({...item})),imagesForCondition:()=>[]},
  UKMLA_V2_AI:{mount:container=>container},
  addEventListener(type,handler){const list=windowEvents.get(type)||[];list.push(handler);windowEvents.set(type,list);}
};
class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}

const context={window,document,localStorage,CustomEvent,console,Map,Set,Promise,Error,Boolean,Number,String,Math,JSON,
  requestAnimationFrame:callback=>{callback();return 1;},setTimeout:callback=>{callback();return 1;},clearTimeout(){}};
vm.createContext(context);
vm.runInContext(modeSource,context,{filename:'image-mode-control.js'});

assert.ok(window.UKMLA_IMAGE_MODE,'mode controller should initialise');
assert.equal(document.querySelectorAll('#ai-image-mode').length,1,'controller should mount exactly one selector');
const baseline=writes;
for(let index=0;index<100;index++)window.UKMLA_IMAGE_MODE.mountControl(workspace);
assert.equal(writes,baseline,'repeated direct mounts must produce no further DOM writes');
for(let index=0;index<100;index++)window.UKMLA_V2_AI.mount(workspace);
assert.equal(writes,baseline,'repeated AI workspace mounts must settle without further DOM writes');
assert.equal(document.querySelectorAll('#ai-image-mode').length,1,'repeated mounts must not duplicate the selector');
console.log(`Image UI stability passed; DOM writes settled at ${baseline}.`);
