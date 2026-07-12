(function(){
  'use strict';

  if(window.__UKMLA_WARD_LAW_TOPIC__) return;
  window.__UKMLA_WARD_LAW_TOPIC__=true;

  const TOPIC_ID='ward-law-ethics-professional-practice';
  const TOPIC_TITLE='Ward law, ethics and professional practice';
  const PROFILE='ward_law_ethics';
  const scenarios=[
    {t:'The patient agrees without understanding',r:'The patient says “yes” immediately but cannot explain the procedure, risks or alternatives.',l:'Valid consent requires capacity, adequate information and voluntariness; a signature alone is insufficient.',a:'Explain the purpose, material risks, reasonable alternatives and the option of no treatment, then check understanding.',e:'Document the individual risks discussed, questions answered and the patient’s decision.',v:'Writing only “consent obtained” or relying on a form completed by someone else.'},
    {t:'The patient refuses recommended treatment',r:'A capacitous adult declines antibiotics, surgery, blood products or another potentially life-saving intervention.',l:'A capacitous adult may refuse treatment for rational, irrational or religious reasons.',a:'Explore their reasoning, correct misunderstandings, explain likely consequences and offer reasonable alternatives.',e:'Document the capacity assessment, information provided, exact refusal and safety-netting; involve a senior for high-risk refusals.',v:'Treating refusal as evidence of incapacity or proceeding because the decision appears unwise.'},
    {t:'Possible lack of capacity',r:'Delirium, cognitive impairment, psychosis, intoxication or communication difficulty raises genuine doubt.',l:'Capacity is presumed and assessed for the specific decision at the time it must be made.',a:'Treat reversible causes and support communication before testing understanding, retention, use or weighing, and communication.',e:'State the decision assessed, evidence for impairment and precisely which functional element failed.',v:'Recording “confused—lacks capacity” without a proper assessment.'},
    {t:'Capacity fluctuates',r:'A patient with delirium or medication effects is clearer at some times than others.',l:'Capacity is time-specific; non-urgent decisions should be delayed when capacity is likely to return.',a:'Optimise pain, oxygenation, hydration, hearing, language support and timing.',e:'Document fluctuations, steps taken and why the decision was or was not postponed.',v:'Making a permanent incapacity label based on one poor assessment.'},
    {t:'An emergency prevents full consent',r:'Immediate treatment is required to prevent death or serious deterioration, and the patient cannot decide.',l:'Necessary and proportionate emergency treatment may be provided in the patient’s best interests.',a:'Give the least restrictive treatment needed to address the emergency while checking rapidly for known refusals or legal proxies.',e:'Document the emergency, incapacity, treatment given, alternatives considered and senior involvement.',v:'Extending emergency authority to non-urgent treatment once the immediate danger has passed.'},
    {t:'Best-interests treatment is required',r:'The adult lacks capacity and a treatment decision cannot safely wait.',l:'The decision must reflect the patient’s welfare, wishes, values and beliefs—not simply medical convenience.',a:'Check for an advance decision, legal proxy or deputy; involve the patient and consult people who know them.',e:'Compare benefits, burdens and less restrictive alternatives, then explain why the chosen option serves this patient.',v:'Asking relatives to “consent” unless they hold the relevant legal authority.'},
    {t:'Relatives demand treatment clinicians consider futile',r:'Family members request CPR, ventilation, artificial feeding or surgery that the team does not recommend.',l:'Relatives cannot require clinically inappropriate treatment, but their knowledge of the patient’s wishes is important.',a:'Clarify prognosis, uncertainties and the patient’s likely priorities; seek a senior and multidisciplinary review.',e:'Document meetings, areas of agreement, unresolved disputes and offers of a second opinion.',v:'Describing relatives as decision-makers when they are providing evidence about the patient’s perspective.'},
    {t:'Relatives oppose beneficial treatment',r:'Family members refuse treatment for a patient who lacks capacity.',l:'Unless they possess applicable legal authority, relatives cannot veto treatment that is in the patient’s best interests.',a:'Explore their concerns and check for an advance refusal, health and welfare proxy or court order.',e:'Seek senior, legal or court advice where disagreement is serious, persistent or concerns major treatment.',v:'Proceeding covertly without addressing the conflict or confirming the legal position.'},
    {t:'Advance decision or legal proxy is mentioned',r:'Someone reports an advance decision, lasting power of attorney, welfare attorney or court-appointed deputy.',l:'The document’s validity, scope and applicability must be checked before relying on it.',a:'Obtain and review the document, confirm activation requirements and identify whether it covers the proposed decision.',e:'Record what was verified, who was contacted and why the document does or does not apply.',v:'Assuming any relative automatically has decision-making authority.'},
    {t:'DNACPR is being considered',r:'CPR would be unsuccessful or its burdens are likely to outweigh potential benefit.',l:'DNACPR concerns CPR only and should normally be discussed with the patient.',a:'Explain the clinical recommendation, what CPR involves and which treatments will continue.',e:'Document the rationale, discussion, people consulted, review date and broader emergency-care plan.',v:'Treating DNACPR as “do not treat,” “not for antibiotics” or automatic ward-based care only.'},
    {t:'The team believes DNACPR discussion would cause harm',r:'Clinicians consider that discussing CPR may cause serious physical or psychological harm.',l:'Mere distress, disagreement or discomfort is not normally enough to exclude the patient.',a:'Consider sensitive communication, timing, support from family or specialists, and whether meaningful involvement remains possible.',e:'Clearly document the specific anticipated harm and obtain senior agreement.',v:'Omitting discussion because it is difficult or because the clinical decision appears obvious.'},
    {t:'A ceiling-of-care decision is needed',r:'The patient may deteriorate, and the team must decide whether ICU, ventilation, vasopressors or surgery would be appropriate.',l:'Each treatment requires an individualised assessment of benefit, burden and the patient’s wishes.',a:'Specify treatments that remain appropriate, treatments not recommended and triggers for review.',e:'Use ReSPECT or the local emergency-care planning document alongside clear clinical notes.',v:'Writing only “not for escalation” without explaining what care should still be provided.'},
    {t:'A patient with capacity wants to leave',r:'The patient intends to leave despite significant medical risk.',l:'A capacitous adult may leave hospital and refuse further care.',a:'Assess capacity for the decision, explain risks and alternatives, address reversible reasons for leaving and offer follow-up.',e:'Document capacity, advice, the patient’s reasons, observations and safety-netting.',v:'Detaining the patient solely because clinicians strongly disagree with the decision.'},
    {t:'A confused patient tries to leave',r:'The patient may lack capacity and would face serious harm outside hospital.',l:'Restriction must have a lawful basis, be necessary, proportionate and the least restrictive option.',a:'Treat reversible causes, use de-escalation and seek senior, psychiatric and local MCA/DoLS advice.',e:'Document the immediate risk, legal framework considered, restrictions used and review arrangements.',v:'Assuming “lacks capacity” automatically authorises indefinite detention.'},
    {t:'Mental disorder may require detention',r:'A patient poses serious risk because of mental disorder and is refusing assessment or attempting to leave.',l:'Mental Health Act powers may be required where detention or compulsory psychiatric treatment is the issue.',a:'Contact senior clinicians and liaison psychiatry urgently; follow local holding-power and security procedures.',e:'Record risks, mental state, capacity findings, advice sought and the legal power used.',v:'Using capacity legislation as a substitute for appropriate Mental Health Act assessment.'},
    {t:'Restraint is being considered',r:'Physical, chemical or environmental restriction is proposed to deliver care or prevent harm.',l:'Restraint must be necessary to prevent harm and proportionate to the likelihood and seriousness of that harm.',a:'Use de-escalation and less restrictive measures first; ensure adequate staffing, monitoring and review.',e:'Record why restraint was necessary, alternatives attempted, duration, observations and authorisation.',v:'Using sedation or restraint for staff convenience or without reassessment.'},
    {t:'Confidential information is requested by relatives',r:'A relative asks for diagnosis, results or prognosis.',l:'Confidentiality continues even when relatives are closely involved in care.',a:'Obtain the patient’s permission where possible; listen to information from relatives even when you cannot disclose information back.',e:'Note the patient’s preferences and any limited disclosure made in their interests.',v:'Confirming sensitive information simply because the caller knows personal details.'},
    {t:'Police request medical information',r:'Police request notes, results, an address or confirmation that the patient is present.',l:'Police status alone does not remove the duty of confidentiality.',a:'Ask for the purpose, legal authority and precise information required; obtain consent unless disclosure is required by law or justified to prevent serious harm.',e:'Consult the information-governance or senior team where practicable and record the reasoning.',v:'Handing over complete records when a limited disclosure would meet the lawful purpose.'},
    {t:'A court order or solicitor’s request arrives',r:'The ward receives a demand for records or a clinical statement.',l:'A valid court order must be followed, but ordinary solicitor correspondence does not automatically compel disclosure.',a:'Verify the document and refer it to the trust or board’s legal and information-governance teams.',e:'Preserve relevant records and document what was disclosed and under what authority.',v:'Editing retrospective notes, destroying material or responding informally from memory.'},
    {t:'Safeguarding an adult at risk',r:'There are signs of abuse, neglect, coercion, exploitation or unsafe care.',l:'Relevant information may be shared without consent when necessary and proportionate to protect the person or others.',a:'Address immediate safety, speak privately with the patient where possible and contact the safeguarding team.',e:'Record factual observations, exact words used, capacity, risks and referrals made.',v:'Conducting your own extensive investigation or confronting a suspected perpetrator without a plan.'},
    {t:'A child may be experiencing abuse',r:'Injury pattern, behaviour, disclosure or family circumstances raise child-protection concerns.',l:'The child’s welfare is paramount; confidentiality does not prevent necessary safeguarding disclosure.',a:'Treat urgent needs, discuss immediately with a senior and follow the local child-protection pathway.',e:'Document observations and statements verbatim, including who was present.',v:'Promising secrecy or delaying referral until abuse is proven.'},
    {t:'A young person requests confidential treatment',r:'A person under 16 seeks contraception, sexual-health care or another intervention without parental involvement.',l:'A sufficiently mature young person may consent when able to understand the nature and implications of the decision.',a:'Assess competence, voluntariness, safeguarding risk and whether parental involvement can safely be encouraged.',e:'Document the competence assessment, advice, confidentiality discussion and safeguarding reasoning.',v:'Automatically disclosing to parents or assuming age alone determines capacity.'},
    {t:'Parents refuse treatment for a child',r:'Parents decline treatment that clinicians believe is necessary to prevent serious harm.',l:'Parental responsibility must be exercised in the child’s interests and may be overridden by the court.',a:'Seek senior paediatric, safeguarding and legal advice urgently; provide emergency treatment where immediately necessary.',e:'Document prognosis, treatment options, parental reasons and attempts to resolve disagreement.',v:'Allowing a prolonged dispute to delay time-critical treatment.'},
    {t:'A prescribing error has occurred',r:'The wrong drug, dose, route, frequency or patient has been involved.',l:'The immediate duty is to protect the patient, followed by candour, reporting and learning.',a:'Stop or correct the prescription, assess harm, initiate monitoring or treatment, and inform senior staff, nursing staff and pharmacy.',e:'Record the clinical facts, discussion with the patient and incident-reporting reference.',v:'Altering records to conceal the error or waiting for symptoms before acting.'},
    {t:'A colleague asks you to prescribe without assessing',r:'You are asked to prescribe insulin, anticoagulation, controlled drugs or discharge medication for an unfamiliar patient.',l:'The prescriber remains professionally responsible and must have sufficient reliable information.',a:'Review the patient, indication, allergies, observations, renal or hepatic function, interactions and monitoring needs.',e:'Decline and escalate when the information or supervision is inadequate.',v:'Prescribing solely because “the consultant asked” or “this is what we usually give.”'},
    {t:'Something has gone wrong and the patient must be told',r:'An act or omission has caused, or may cause, harm or significant distress.',l:'Professional candour requires openness, explanation, apology and appropriate remedy.',a:'Make the patient safe, inform a senior, explain known facts honestly and describe the next steps.',e:'Document the conversation and complete the local incident process.',v:'Delaying all communication until the investigation is complete or treating an apology as an admission of liability.'},
    {t:'A colleague’s conduct may endanger patients',r:'Impairment, intoxication, serious incompetence, dishonesty or repeated unsafe practice is observed.',l:'Doctors must act promptly where patient safety or dignity may be seriously compromised.',a:'Protect the immediate patient, speak to the responsible senior and follow local raising-concerns procedures.',e:'Keep an objective factual account of events, actions and people informed.',v:'Relying on informal gossip or remaining silent through misplaced loyalty.'},
    {t:'End-of-life treatment is being reviewed',r:'Treatment may be prolonging dying or causing burden without meaningful benefit.',l:'There is a strong presumption in favour of preserving life, but no duty to provide treatment lacking overall benefit.',a:'Review capacity, wishes, advance planning, symptom burden, reversibility and the likely benefits and burdens of each intervention.',e:'Agree goals of care, symptom plans, hydration or nutrition decisions, escalation limits and review triggers.',v:'Describing withdrawal of burdensome treatment as withdrawal of care.'},
    {t:'Clinically assisted nutrition or hydration is disputed',r:'The team or family disagree about tube feeding or clinically assisted hydration.',l:'These are medical treatments requiring the same capacity or best-interests analysis as other interventions.',a:'Clarify the clinical goal, probability of benefit, burdens, patient wishes and available alternatives.',e:'Obtain specialist, ethics or legal advice where disagreement remains or the decision is finely balanced.',v:'Treating food and fluids as legally automatic regardless of clinical circumstances.'},
    {t:'A notifiable disease is suspected',r:'The clinical presentation suggests a legally notifiable infection or contamination.',l:'Notification is generally based on clinical suspicion; laboratory confirmation should not be awaited.',a:'Isolate and treat appropriately, contact infection specialists and notify the relevant public-health body.',e:'Telephone urgent cases and document when, how and to whom notification was made.',v:'Assuming microbiology, another doctor or the hospital system will automatically notify.'},
    {t:'A patient dies on the ward',r:'Death requires verification, review of circumstances and a decision about certification or referral.',l:'The doctor must follow the applicable national death-certification, medical-examiner and coroner or procurator-fiscal processes.',a:'Verify death, review the notes and circumstances, identify devices or suspicious features and discuss uncertainties with a senior.',e:'Complete the required documentation accurately and refer where statutory criteria are met.',v:'Guessing a cause of death or issuing certification before clarifying whether formal referral is required.'},
    {t:'Notes are being written after the event',r:'Important discussions or decisions were not recorded contemporaneously.',l:'Records must be clear, accurate, attributable and must not misrepresent when they were written.',a:'Add a dated and timed retrospective entry explaining when the events occurred and why the entry is late.',e:'Include the evidence available, people involved, decisions and outstanding actions.',v:'Backdating, deleting earlier entries or rewriting the record as though it were contemporaneous.'},
    {t:'A patient is secretly recording the consultation',r:'The patient records audio or video without prior agreement.',l:'Patients may generally record consultations in which they participate, although privacy and safety issues may still arise.',a:'Continue professionally, clarify the purpose and ensure other patients or confidential material are not captured.',e:'Seek local advice if recording interferes with care or includes staff or patients outside the consultation.',v:'Refusing necessary care solely because the patient is recording.'},
    {t:'A doctor is asked to post or discuss a case online',r:'A clinical case is being considered for social media, teaching or messaging groups.',l:'Removing a name may not adequately anonymise a distinctive patient.',a:'Use approved secure systems, obtain appropriate consent where identification is possible and minimise details.',e:'Follow organisational teaching, research and information-governance procedures.',v:'Posting unusual cases, images or results on personal accounts or informal messaging groups.'}
  ];

  function esc(value){
    return String(value).replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[char]));
  }

  function searchText(item){
    return [TOPIC_TITLE,item.t,item.r,item.l,item.a,item.e,item.v].join(' ');
  }

  function cardHtml(item,index){
    return `<details class="card ward-law-card" data-ai-profile="${PROFILE}" data-search="${esc(searchText(item))}">
      <summary>${esc(item.t)}</summary>
      <ul class="items">
        <li class="tts-ready"><span class="label">Recognise:</span> <span class="aspect-text">${esc(item.r)}</span></li>
        <li class="tts-ready"><span class="label">Legal rule:</span> <span class="aspect-text">${esc(item.l)}</span></li>
        <li class="tts-ready"><span class="label">Act:</span> <span class="aspect-text">${esc(item.a)}</span></li>
        <li class="tts-ready"><span class="label">Record/escalate:</span> <span class="aspect-text">${esc(item.e)}</span></li>
        <li class="red-flags tts-ready"><span class="label">Avoid:</span> <span class="aspect-text">${esc(item.v)}</span></li>
        <li hidden data-ai-alias="1"><span class="label">Mimics:</span> ${esc(item.r)}</li>
        <li hidden data-ai-alias="1"><span class="label">Ix:</span> ${esc(item.l)}</li>
        <li hidden data-ai-alias="1"><span class="label">Tx:</span> ${esc(item.a)}</li>
        <li hidden data-ai-alias="1"><span class="label">Escalate:</span> ${esc(item.e)}</li>
        <li hidden data-ai-alias="1"><span class="label">Red flags:</span> ${esc(item.v)}</li>
      </ul>
    </details>`;
  }

  function updateStats(){
    document.querySelectorAll('.stats .stat').forEach(stat=>{
      if(/^22 sections$/i.test(stat.textContent.trim())) stat.textContent='23 sections';
      if(/^415 conditions$/i.test(stat.textContent.trim())) stat.textContent='449 conditions';
    });
  }

  function updateSearch(section){
    const input=document.getElementById('search');
    const cards=[...section.querySelectorAll('.ward-law-card')];
    const run=()=>{
      const query=(input?.value||'').trim().toLowerCase();
      let shown=0;
      cards.forEach(card=>{
        const visible=!query||String(card.dataset.search||'').toLowerCase().includes(query);
        card.hidden=!visible;
        if(visible) shown+=1;
      });
      section.hidden=shown===0;
      const count=document.getElementById('visible-count');
      if(count&&query){
        const existing=parseInt(count.textContent,10);
        if(Number.isFinite(existing)) count.textContent=`${existing+shown} visible conditions`;
      }
    };
    input?.addEventListener('input',()=>setTimeout(run,0));
    run();
  }

  function setupTts(section){
    let active=null;
    section.addEventListener('click',event=>{
      const row=event.target.closest('.tts-ready');
      if(!row||row.hasAttribute('hidden')||event.target.closest('button,a,input,textarea,select')) return;
      if(!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      section.querySelectorAll('.reading-active').forEach(node=>node.classList.remove('reading-active'));
      if(active===row){ active=null; return; }
      active=row;
      row.classList.add('reading-active');
      const text=row.textContent.replace(/^Recognise:|^Legal rule:|^Act:|^Record\/escalate:|^Avoid:/,'').trim();
      const utterance=new SpeechSynthesisUtterance(text);
      utterance.onend=utterance.onerror=()=>{
        row.classList.remove('reading-active');
        if(active===row) active=null;
      };
      speechSynthesis.speak(utterance);
    });
  }

  function addNav(){
    const nav=document.querySelector('.nav');
    if(!nav||nav.querySelector(`a[href="#${TOPIC_ID}"]`)) return;
    const li=document.createElement('li');
    li.innerHTML=`<a href="#${TOPIC_ID}"><span class="topic-bulb" style="--bulb-color:hsl(36 84% 43%)"></span><span>${TOPIC_TITLE}</span><small>34</small><span class="topic-score">50%</span></a>`;
    nav.appendChild(li);
  }

  function addAiTopicOption(){
    const select=document.getElementById('aiq-topic');
    if(!select||[...select.options].some(option=>option.value===TOPIC_TITLE)) return false;
    const option=document.createElement('option');
    option.value=TOPIC_TITLE;
    option.textContent=TOPIC_TITLE;
    select.appendChild(option);
    return true;
  }

  function addTopic(){
    if(document.getElementById(TOPIC_ID)){
      addAiTopicOption();
      return;
    }
    const content=document.querySelector('.content');
    if(!content) return;
    const section=document.createElement('section');
    section.id=TOPIC_ID;
    section.className='section ward-law-section';
    section.dataset.aiProfile=PROFILE;
    section.innerHTML=`
      <div class="section-header"><h2>${TOPIC_TITLE}</h2><div class="section-count">34 scenarios</div></div>
      <div class="notice">Ward-focused legal, ethical and professional scenarios using five recurring headings: recognise, legal rule, act, record/escalate, and avoid. UK statutory routes vary by nation.</div>
      <div class="cards">${scenarios.map(cardHtml).join('')}</div>
      <div class="notice"><strong>Nation-specific warning.</strong> England and Wales: Mental Capacity Act 2005, Mental Health Act 1983 and DoLS. Scotland: Adults with Incapacity (Scotland) Act 2000, including section 47 treatment certificates, with separate mental-health and death-investigation processes. Northern Ireland: Mental Capacity Act (Northern Ireland) 2016 and its implementation framework. GMC standards apply across the UK, but local NHS policy and national legislation must be checked before coercive action, death documentation or incapacity management.<br><br><strong>Final rule:</strong> Capacity → wishes → lawful authority → proportional action → clear documentation → senior escalation when uncertain.</div>`;
    const sections=[...content.querySelectorAll('.section')];
    const last=sections[sections.length-1];
    if(last) last.insertAdjacentElement('afterend',section); else content.appendChild(section);

    addNav();
    updateStats();
    updateSearch(section);
    setupTts(section);

    document.getElementById('expand-all')?.addEventListener('click',()=>section.querySelectorAll('.card').forEach(card=>card.open=true));
    document.getElementById('collapse-all')?.addEventListener('click',()=>section.querySelectorAll('.card').forEach(card=>card.open=false));

    addAiTopicOption();
    const observer=new MutationObserver(()=>{
      if(addAiTopicOption()) document.dispatchEvent(new CustomEvent('ukmlaAdditionalTopicReady',{detail:{topic:TOPIC_TITLE,profile:PROFILE}}));
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),20000);

    document.dispatchEvent(new CustomEvent('ukmlaAdditionalTopicReady',{detail:{topic:TOPIC_TITLE,profile:PROFILE}}));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addTopic,{once:true});
  else addTopic();
})();
