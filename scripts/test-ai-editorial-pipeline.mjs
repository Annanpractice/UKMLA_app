import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../v2/ai-editorial-pipeline.js',import.meta.url),'utf8');
const calls=[];
const progress=[];
let savedJob=null;

function clone(value){return JSON.parse(JSON.stringify(value));}
function option(id,text){return{id,text,topicId:'t',topicName:'Topic',conditionId:'c',conditionName:'Condition',param:'mimics'};}
function question(number,stem=`Stem ${number}`){return{
  id:`q${number}`,questionNumber:number,questionType:`type${number}`,questionTypeLabel:`Type ${number}`,
  topicId:`t${number}`,topicName:`Topic ${number}`,targetConditionId:`c${number}`,targetCondition:`Condition ${number}`,
  learningPoint:'Learning point',stem,leadIn:'What is the diagnosis?',
  options:['A','B','C','D','E'].map((id,index)=>option(id,`Answer ${index+1}`)),correctOptionId:'A',
  decisiveClue:'clue',rationale:'rationale',strongestDistractorId:'B',strongestDistractorExplanation:'explanation',
  guideline:{source:'Internal',title:'Title',checkedDate:null,url:null}
};}
function set(){return{schemaVersion:'ukmla-ai-quiz-v2',quizId:'quiz',topic:'All',generatedAt:new Date().toISOString(),difficulty:'very_difficult',questions:Array.from({length:10},(_,i)=>question(i+1))};}

const TYPES=Array.from({length:10},(_,i)=>[`type${i+1}`,`Type ${i+1}`]);
const conditions=Array.from({length:10},(_,i)=>({id:`c${i+1}`,name:`Condition ${i+1}`,topicId:`t${i+1}`,topic:`Topic ${i+1}`,fields:{mimics:'A, B, C'}}));
const questionSchema={type:'object',additionalProperties:true};
const schema={
  TYPES,
  LIMITS:{stemMaxWords:36,sparseDiagnosisStemMaxWords:28,stemMaxSentences:2,leadInMaxWords:14,optionMaxWords:10},
  PIPELINE_MODES:{},PIPELINE_LABELS:{},
  quizSchema(){return{type:'object',properties:{questions:{items:questionSchema}}};},
  requestBody(prompt,knowledge,name){return{kind:'generation',prompt,name};},
  generationPrompt(){return'generate';},
  checkpointInstruction(stage){return`instruction:${stage}`;},
  balancedShuffle(value){return value;}
};

let assessmentCount=0;
const transport={
  async send(token,body){
    calls.push(clone(body));
    if(body.kind==='generation')return{output_text:JSON.stringify(set())};
    const name=body.text.format.name;
    if(name.startsWith('ukmla_final_assessment_')){
      assessmentCount++;
      const requested=[...body.input[1].content[0].text.matchAll(/question numbers ([0-9, ]+)/gi)][0]?.[1]
        .split(',').map(x=>Number(x.trim())).filter(Boolean)||[];
      const numbers=requested.length?requested:Array.from({length:10},(_,i)=>i+1);
      let failed=[];
      if(assessmentCount===1)failed=[2,5];
      else if(assessmentCount===2)failed=[2];
      return{output_text:JSON.stringify({results:numbers.map(number=>({questionNumber:number,verdict:failed.includes(number)?'fail':'pass',issues:failed.includes(number)?[{code:'weak',message:'weak',fields:['options']}]:[]}))})};
    }
    if(name.startsWith('ukmla_regenerate_q')){
      const number=Number(name.match(/q(\d+)/)[1]);
      return{output_text:JSON.stringify({question:question(number,`Regenerated ${number}`)})};
    }
    const prompt=body.input[1].content[0].text;
    const subset=/question numbers 2, 5/.test(prompt);
    const replacement=subset
      ?[question(1,'MALICIOUS'),question(2,'Re-edited 2'),question(5,'Re-edited 5')]
      :[];
    return{output_text:JSON.stringify({questions:replacement})};
  }
};

const listeners=new Map();
class CustomEvent{constructor(type,init){this.type=type;this.detail=init?.detail;}}
const document={
  readyState:'complete',
  addEventListener(type,fn){const rows=listeners.get(type)||[];rows.push(fn);listeners.set(type,rows);},
  dispatchEvent(event){progress.push(clone(event.detail||{}));for(const fn of listeners.get(event.type)||[])fn(event);}
};
const engine={
  async runPipeline(){throw new Error('old pipeline should not run');},
  async persistCompletedSet(value,job){savedJob=clone(job);savedJob.currentSet=clone(value);}
};
const core={saveJson(key,value){savedJob=clone(value);},coverageState(){return{cycle:3};}};
const window={UKMLA_V2_AI_ENGINE:engine,UKMLA_V2_AI_SCHEMA:schema,UKMLA_V2_AI_TRANSPORT:transport,UKMLA_V2:core};
const context={window,document,CustomEvent,console,setTimeout,clearTimeout,Date,JSON,Math,Error,TypeError,Number,String,Boolean,RegExp,Set,Map,Promise,Object,Array};
vm.runInNewContext(source,context,{filename:'ai-editorial-pipeline.js'});

assert.equal(typeof engine.runPipeline,'function');
const result=await engine.runPipeline({apiKey:'key',conditions,questionTypes:TYPES.map(x=>x[0]),topic:'All',persist:true});
assert.equal(result.questions[0].stem,'Stem 1','locked Q1 must ignore malicious subset edit');
assert.equal(result.questions[1].stem,'Regenerated 2','Q2 should be freshly regenerated after failing subset re-edit');
assert.equal(result.questions[4].stem,'Re-edited 5','Q5 should keep its passing subset edit');
assert.equal(savedJob.status,'complete');
assert.deepEqual(savedJob.approvedQuestionNumbers,Array.from({length:10},(_,i)=>i+1));
assert.equal(result.pipelineMode,'editorial-edit-points-v1');
assert.equal(result.buildTelemetry.regeneratedQuestionNumbers.join(','),'2');

const editorCalls=calls.filter(call=>call.text?.format?.name?.startsWith('ukmla_edit_'));
assert.equal(editorCalls.length,8,'four full-set edit points and four failed-subset edit points');
const subsetCalls=editorCalls.slice(4);
assert.ok(subsetCalls.every(call=>/question numbers 2, 5/.test(call.input[1].content[0].text)),'subset edit cycle must include only failed questions');
const generationCalls=calls.filter(call=>call.kind==='generation');
assert.equal(generationCalls.length,1);
assert.equal(assessmentCount,3);
assert.ok(progress.some(item=>/Final quality checkpoint · 8\/10 approved/.test(item.lastMessage||'')));
assert.ok(progress.some(item=>/Subset editorial cycle · Q2, Q5/.test(item.lastMessage||'')));
console.log('Editorial pipeline regression passed.');
