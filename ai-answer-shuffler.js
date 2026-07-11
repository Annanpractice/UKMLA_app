(function(){
  'use strict';
  if(window.__UKMLA_BALANCED_ANSWER_SHUFFLER__) return;
  window.__UKMLA_BALANCED_ANSWER_SHUFFLER__=true;

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const LETTERS=['A','B','C','D','E'];

  function emit(message,detail){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message,detail:detail||null}}));
  }

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of (data&&data.output)||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'&&typeof content.text==='string') return content.text;
      }
    }
    return '';
  }

  function setOutputText(data,text){
    data.output_text=text;
    let replaced=false;
    for(const item of data.output||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'){
          content.text=text;
          replaced=true;
        }
      }
    }
    if(!replaced) data.output=[{content:[{type:'output_text',text}]}];
  }

  function formatName(body){
    return body&&body.text&&body.text.format&&body.text.format.name||'';
  }

  function shuffle(array){
    const copy=array.slice();
    for(let i=copy.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  }

  function optionText(option){
    if(typeof option==='string') return option;
    return option&&typeof option==='object'?(option.text||option.label||option.answer||option.content||''):'';
  }

  function optionId(option,index){
    if(option&&typeof option==='object') return String(option.id||option.optionId||option.letter||option.key||LETTERS[index]);
    return LETTERS[index];
  }

  function normal(value){
    return String(value==null?'':value).trim().toLowerCase();
  }

  function questionsOf(set){
    if(Array.isArray(set)) return set;
    return set&&Array.isArray(set.questions)?set.questions:[];
  }

  function correctIndex(question,options){
    for(const field of ['correctIndex','correctOptionIndex','correctAnswerIndex','answerIndex','keyIndex']){
      const value=question[field];
      const number=typeof value==='string'&&/^\d+$/.test(value)?Number(value):value;
      if(Number.isInteger(number)&&number>=0&&number<options.length) return number;
    }
    for(let i=0;i<options.length;i++){
      const option=options[i];
      if(option&&typeof option==='object'&&(option.isCorrect===true||option.correct===true||option.is_answer===true)) return i;
    }
    for(const field of ['correctOptionId','correctAnswerId','answerId','correctId','key','answerKey','correctLetter']){
      if(question[field]==null) continue;
      const value=normal(question[field]);
      const byId=options.findIndex((option,index)=>normal(optionId(option,index))===value);
      if(byId>=0) return byId;
      const byLetter=LETTERS.findIndex(letter=>normal(letter)===value);
      if(byLetter>=0) return byLetter;
    }
    for(const field of ['correctAnswer','correctOption','answer','correct','keyText']){
      if(typeof question[field]!=='string') continue;
      const value=normal(question[field]);
      const byText=options.findIndex(option=>normal(optionText(option))===value);
      if(byText>=0) return byText;
      const byLetter=LETTERS.findIndex(letter=>normal(letter)===value);
      if(byLetter>=0) return byLetter;
    }
    return -1;
  }

  function assignId(option,id){
    if(!option||typeof option!=='object') return option;
    if('id' in option||(!('optionId' in option)&&!('letter' in option)&&!('key' in option))) option.id=id;
    if('optionId' in option) option.optionId=id;
    if('letter' in option) option.letter=id;
    if('key' in option&&typeof option.key==='string'&&/^[A-E]$/i.test(option.key)) option.key=id;
    return option;
  }

  function updateKey(question,index,correctOption){
    const letter=LETTERS[index];
    const text=optionText(correctOption);
    for(const field of ['correctIndex','correctOptionIndex','correctAnswerIndex','answerIndex','keyIndex']) if(field in question) question[field]=index;
    for(const field of ['correctOptionId','correctAnswerId','answerId','correctId','answerKey','correctLetter']) if(field in question) question[field]=letter;
    if('key' in question&&typeof question.key==='string'&&/^[A-E]$/i.test(question.key)) question.key=letter;
    for(const field of ['correctAnswer','correctOption','answer','correct','keyText']){
      if(!(field in question)||typeof question[field]!=='string') continue;
      question[field]=/^[A-E]$/i.test(question[field].trim())?letter:text;
    }
    question.options.forEach((option,optionIndex)=>{
      if(!option||typeof option!=='object') return;
      if('isCorrect' in option) option.isCorrect=optionIndex===index;
      if('correct' in option&&typeof option.correct==='boolean') option.correct=optionIndex===index;
      if('is_answer' in option) option.is_answer=optionIndex===index;
    });
  }

  function balancedTargets(count){
    const result=[];
    while(result.length<count){
      for(let i=0;i<5&&result.length<count;i++) result.push(i);
    }
    return shuffle(result);
  }

  function balance(set){
    const eligible=questionsOf(set).filter(question=>question&&Array.isArray(question.options)&&question.options.length===5);
    const targets=balancedTargets(eligible.length);
    const distribution={A:0,B:0,C:0,D:0,E:0};
    let changed=0;

    eligible.forEach((question,questionIndex)=>{
      const index=correctIndex(question,question.options);
      if(index<0) return;
      const correct=question.options[index];
      const distractors=shuffle(question.options.filter((_,optionIndex)=>optionIndex!==index));
      const target=targets[questionIndex];
      const reordered=[];
      let d=0;
      for(let i=0;i<5;i++) reordered.push(i===target?correct:distractors[d++]);
      question.options=reordered.map((option,i)=>assignId(option,LETTERS[i]));
      updateKey(question,target,correct);
      distribution[LETTERS[target]]+=1;
      changed+=1;
    });

    return {set,changed,distribution};
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(url!==API||!init||String(init.method||'GET').toUpperCase()!=='POST') return previousFetch(input,init);

    let body;
    try{body=JSON.parse(init.body||'{}');}catch{return previousFetch(input,init);}
    if(formatName(body)!=='ukmla_ai_quiz') return previousFetch(input,init);

    const response=await previousFetch(input,init);
    if(!response.ok) return response;

    let data;
    try{data=await response.clone().json();}catch{return response;}
    const raw=outputText(data);
    if(!raw) return response;

    let set;
    try{set=JSON.parse(raw);}catch{return response;}
    const result=balance(set);
    if(!result.changed){
      emit('Answer-letter shuffle skipped because the correct key could not be identified safely.');
      return response;
    }

    setOutputText(data,JSON.stringify(result.set));
    window.__ukmlaLastAnswerDistribution=result.distribution;
    emit('Balanced correct answers across A–E and shuffled all distractors.',result.distribution);

    return new Response(JSON.stringify(data),{
      status:response.status,
      statusText:response.statusText,
      headers:{'Content-Type':'application/json'}
    });
  };
})();
