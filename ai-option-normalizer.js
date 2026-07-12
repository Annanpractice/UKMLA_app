(function(){
  'use strict';

  const previousFetch=window.fetch.bind(window);
  const API='https://api.openai.com/v1/responses';
  const QUIZ_FORMAT='ukmla_ai_quiz';

  function emit(message){
    document.dispatchEvent(new CustomEvent('ukmlaAiGenerationCheckpoint',{detail:{message}}));
  }

  function outputText(data){
    if(data&&typeof data.output_text==='string') return data.output_text;
    for(const item of (data&&data.output)||[]){
      for(const content of item.content||[]){
        if(content&&content.type==='output_text'&&content.text) return content.text;
      }
    }
    return '';
  }

  function requestFormat(init){
    try{return JSON.parse(init&&init.body||'{}')?.text?.format?.name||'';}
    catch(_){return '';}
  }

  function stripMeta(text){
    return String(text||'')
      .replace(/\s*[—–-]\s*(?:[^—–|]+)\s*[—–|]\s*(?:Ix|Tx|Escalate|Mimics|Red flags)\s*$/i,'')
      .replace(/\s*\|\s*(?:[^|]+)\s*\|\s*(?:Ix|Tx|Escalate|Mimics|Red flags)\s*$/i,'')
      .trim();
  }

  function localClean(set){
    for(const question of set.questions||[]){
      for(const option of question.options||[]) option.text=stripMeta(option.text);
    }
    return set;
  }

  function schema(){
    return {
      type:'object',
      additionalProperties:false,
      required:['questions'],
      properties:{
        questions:{
          type:'array',minItems:10,maxItems:10,
          items:{
            type:'object',additionalProperties:false,required:['id','options'],
            properties:{
              id:{type:'string'},
              options:{
                type:'array',minItems:5,maxItems:5,
                items:{
                  type:'object',additionalProperties:false,required:['id','text'],
                  properties:{id:{type:'string',enum:['A','B','C','D','E']},text:{type:'string'}}
                }
              }
            }
          }
        }
      }
    };
  }

  function merge(base,normalised){
    const byId=new Map((normalised.questions||[]).map(question=>[question.id,question]));
    for(const question of base.questions||[]){
      const replacement=byId.get(question.id);
      if(!replacement) continue;
      const options=new Map((replacement.options||[]).map(option=>[option.id,option.text]));
      for(const option of question.options||[]){
        if(options.has(option.id)) option.text=stripMeta(options.get(option.id));
      }
    }
    return localClean(base);
  }

  async function normalise(data,headers){
    emit('Parsing the generated ten-question set…');
    const raw=outputText(data);
    if(!raw) return data;

    let set;
    try{set=JSON.parse(raw);}catch(_){return data;}

    emit('Compressing and normalising all answer options…');
    set=localClean(set);
    const prompt='Perform the final editorial normalisation of the answer options in this very-difficult UKMLA SBA set. Return all ten question IDs and A-E option texts only. Preserve each option meaning, clinical correctness, option order, and the existing correct answer. Compress every option to the shortest clinically unambiguous noun phrase: aim for 1–5 words and use a hard maximum of 8 words, except an unavoidable standard drug-and-dose expression may use up to 10. Delete explanations, reasons, teaching, parenthetical detail, source labels and redundant qualifiers. Make all five options within each question deliberately parallel in grammatical structure, specificity and level of detail, with similar lengths. The correct answer must not be conspicuous. Remove all visible topic names, condition labels, section names, scoring categories, and tags such as Ix, Tx, Escalate, Mimics, or Red flags. Do not add explanations or metadata to option text. Quiz:\n'+JSON.stringify(set);

    try{
      emit('Sending the answer set for final short-option normalisation…');
      const response=await previousFetch(API,{
        method:'POST',
        headers,
        body:JSON.stringify({
          model:'gpt-5-mini',
          input:[
            {role:'system',content:[{type:'input_text',text:'Return only the requested schema-conforming option normalisation. Every option must be as short as clinically safe.'}]},
            {role:'user',content:[{type:'input_text',text:prompt}]}
          ],
          text:{format:{type:'json_schema',name:'ukmla_option_normalisation',strict:true,schema:schema()}}
        })
      });
      if(!response.ok){
        emit('Option normalisation request failed; using local metadata cleaning instead.');
        data.output_text=JSON.stringify(set);
        return data;
      }
      emit('Short normalised options received; merging them with hidden scoring metadata…');
      const result=await response.json();
      const text=outputText(result);
      if(text) set=merge(set,JSON.parse(text));
    }catch(_){
      emit('Option normalisation could not complete; using locally cleaned answers.');
    }

    emit('Final concise answer text prepared for local validation…');
    data.output_text=JSON.stringify(set);
    return data;
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input&&input.url;
    if(url!==API||requestFormat(init)!==QUIZ_FORMAT) return previousFetch(input,init);

    emit('Sending the UKMLA quiz specification and source material to the model…');
    const response=await previousFetch(input,init);
    if(!response.ok) return response;

    emit('Generated quiz received; starting the final answer checks…');
    const data=await response.clone().json();
    const polished=await normalise(data,init&&init.headers);
    return new Response(JSON.stringify(polished),{
      status:response.status,
      statusText:response.statusText,
      headers:{'Content-Type':'application/json'}
    });
  };
})();
