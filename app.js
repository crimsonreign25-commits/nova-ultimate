const $ = (id) => document.getElementById(id);
const USER_ID = 'mobile-user';
const ACCESSIBILITY_KEY = 'nova_accessibility_profile_v1';
let activePersona = localStorage.getItem('nova_persona') || 'nova';
let latestResponse = '';
let selectedAttachments = [];
let recognition = null;
let isListening = false;
let liveVoiceMode = false;
let isSpeaking = false;
let isSendingMessage = false;
let activeSpeechAudio = null;
let activeSpeechCancel = null;
let cameraStream = null;
let cameraFacingMode = 'environment';
let conversations = JSON.parse(localStorage.getItem('nova_conversations') || '[]');
let memories = JSON.parse(localStorage.getItem('nova_memories') || '[]');
let currentConversation = { id: crypto.randomUUID?.() || String(Date.now()), title: 'New Chat', messages: [] };
let serverChatReady = false;
let latestAutonomousTaskId = null;

async function saveState(){ localStorage.setItem('nova_conversations', JSON.stringify(conversations.slice(-30))); localStorage.setItem('nova_memories', JSON.stringify(memories.slice(-30))); localStorage.setItem('nova_persona', activePersona); updateMemoryUI(); if(serverChatReady && currentConversation.messages.length){try{await postJson('/api/chat',{user_id:USER_ID,id:currentConversation.id,title:currentConversation.title,messages:currentConversation.messages});}catch{}} }
function toast(message){ const el=$('toast'); if(!el)return; el.textContent=message; el.hidden=false; clearTimeout(window.__novaToast); window.__novaToast=setTimeout(()=>el.hidden=true,2600); }
function updateSendButtonState(){const button=$('sendButton');const input=$('messageInput');if(!button||!input)return;button.disabled=isSendingMessage||(!input.value.trim()&&!selectedAttachments.length);button.setAttribute('aria-disabled',String(button.disabled));}
function scrollTo(id){ const el=$(id); if(id==='voiceWorkspace'){openVoiceStudio();return;} if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }
function openVoiceStudio(){document.body.classList.add('voice-studio-active');$('voiceWorkspace')?.setAttribute('aria-hidden','false');$('voiceBackButton')?.focus({preventScroll:true});announce('NOVA Voice Studio opened.');}
function closeVoiceStudio(){document.body.classList.remove('voice-studio-active');$('voiceWorkspace')?.setAttribute('aria-hidden','true');document.querySelector('.rail-btn[data-target="assistantWorkspace"]')?.focus({preventScroll:true});announce('Returned to NOVA chat.');}
function announce(message){const el=$('srAnnouncer');if(!el)return;el.textContent='';window.setTimeout(()=>{el.textContent=String(message||'')},20);}
function updateCaptions(text){const box=$('novaCaptions'),out=$('captionText');if(!box||!out)return;if(!text){box.hidden=true;out.textContent='';return}out.textContent=text;box.hidden=!accessibilityProfile.captions;}
let accessibilityProfile={largeText:false,highContrast:false,reduceMotion:false,captions:true,voiceOnly:false,focusMode:false};
function saveAccessibilityProfile(){localStorage.setItem(ACCESSIBILITY_KEY,JSON.stringify(accessibilityProfile));}
function applyAccessibilityProfile(){const p=accessibilityProfile;document.body.classList.toggle('access-large-text',!!p.largeText);document.body.classList.toggle('access-high-contrast',!!p.highContrast);document.body.classList.toggle('access-reduce-motion',!!p.reduceMotion);document.body.classList.toggle('access-voice-only',!!p.voiceOnly);document.body.classList.toggle('access-focus-mode',!!p.focusMode);[['accessLargeText','largeText'],['accessHighContrast','highContrast'],['accessReduceMotion','reduceMotion'],['accessCaptions','captions'],['accessVoiceOnly','voiceOnly'],['accessFocusMode','focusMode']].forEach(([id,key])=>{const el=$(id);if(el)el.checked=!!p[key]});const status=$('accessibilityStatus');if(status)status.textContent=Object.values(p).some(Boolean)?'Personalized':'Adaptive';updateCaptions($('captionText')?.textContent||'');}
function setupAccessibility(){try{const saved=JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY)||'null');if(saved&&typeof saved==='object')accessibilityProfile={...accessibilityProfile,...saved}}catch{};applyAccessibilityProfile();const pairs=[['accessLargeText','largeText'],['accessHighContrast','highContrast'],['accessReduceMotion','reduceMotion'],['accessCaptions','captions'],['accessVoiceOnly','voiceOnly'],['accessFocusMode','focusMode']];pairs.forEach(([id,key])=>$(id)?.addEventListener('change',e=>{accessibilityProfile[key]=e.target.checked;saveAccessibilityProfile();applyAccessibilityProfile();announce(`${key.replace(/([A-Z])/g,' $1')} ${e.target.checked?'enabled':'disabled'}`);if(key==='voiceOnly'&&e.target.checked){if(!recognition){toast('Voice-first mode needs microphone support in this browser.')}else{$('liveVoiceButton')?.classList.add('active');liveVoiceMode=true;updateMode('VOICE FIRST');if(!isListening)try{recognition.start()}catch{}}}if(key==='voiceOnly'&&!e.target.checked&&liveVoiceMode){liveVoiceMode=false;$('liveVoiceButton')?.classList.remove('active');updateMode('TEXT MODE');if(isListening)recognition?.stop()}}));$('accessibilityReset')?.addEventListener('click',()=>{accessibilityProfile={largeText:false,highContrast:false,reduceMotion:false,captions:true,voiceOnly:false,focusMode:false};saveAccessibilityProfile();applyAccessibilityProfile();announce('Accessibility settings reset to the NOVA adaptive defaults.');toast('Accessibility settings reset.');});$('accessibilityHelp')?.addEventListener('click',()=>{toast('NOVA supports screen readers, keyboard navigation, captions, voice-first mode, larger text, high contrast, reduced motion and focus mode.');announce('NOVA accessibility guide: screen readers, keyboard navigation, captions, voice-first mode, larger text, high contrast, reduced motion and focus mode are available.');});window.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='a'){e.preventDefault();scrollTo('settingsPanel');$('accessibilityTitle')?.focus();announce('Accessibility settings opened.')}if(e.altKey&&e.key.toLowerCase()==='m'){e.preventDefault();$('micButton')?.click();}if(e.altKey&&e.key.toLowerCase()==='v'){e.preventDefault();$('liveVoiceButton')?.click();}});}
function setNovaState(state='idle'){
  if($('personaHologram'))$('personaHologram').dataset.state=state;
  if($('personaStateLabel'))$('personaStateLabel').textContent=state==='listening'?'● LISTENING':state==='speaking'?'● SPEAKING':state==='thinking'?'● PROCESSING':'● READY';
  if($('personaTalkStatus')&&state==='listening')$('personaTalkStatus').textContent=`${(activePersona||'nova').toUpperCase()} is listening…`;
  if($('personaTalkStatus')&&state==='speaking')$('personaTalkStatus').textContent=`${(activePersona||'nova').toUpperCase()} is speaking…`;
  document.body.classList.remove('nova-alive','nova-thinking','nova-speaking','nova-listening','nova-attention');
  document.body.classList.add(`nova-${state}`);
  const labels={idle:'● Ready',thinking:'● Thinking',speaking:'● Speaking',listening:'● Listening',attention:'● Ready'};
  const conversations={idle:'NOVA is ready',thinking:'NOVA is thinking…',speaking:'NOVA is speaking…',listening:'NOVA is listening…',attention:'NOVA is ready'};
  if($('thinkingState')) $('thinkingState').textContent=labels[state]||labels.idle;
  if($('conversationLabel')) $('conversationLabel').textContent=conversations[state]||conversations.idle;
  if(state==='thinking'||state==='listening'||state==='speaking') announce(conversations[state]);
}
function setThinking(on){ $('typingIndicator').hidden=!on; setNovaState(on?'thinking':'idle'); }
function novaAttention(){ setNovaState('attention'); window.clearTimeout(window.__novaAttention); window.__novaAttention=window.setTimeout(()=>setNovaState('idle'),1800); }
function setGreeting(){
  const hour=new Date().getHours();
  const greeting=hour<5?'Still up? I’m here.':hour<12?'Good morning. I’m ready.':hour<18?'Good afternoon. I’m ready.':'Good evening. I’m here with you.';
  const el=$('heroGreeting'); if(el) el.textContent=greeting;
}
function updateMode(text){ $('workspaceMode').textContent=text; }
function addChatMessage(role,text,time=new Date()){ const row=document.createElement('div'); row.className=`message-row ${role==='user'?'user-message':'nova-message'}`; const avatar=document.createElement('div'); avatar.className='chat-avatar'; avatar.textContent=role==='user'?'U':'N'; const bubble=document.createElement('div'); bubble.className='bubble'; const who=document.createElement('b'); who.textContent=role==='user'?'YOU':activePersona.toUpperCase(); const body=document.createElement('p'); body.textContent=text; const stamp=document.createElement('time'); stamp.textContent=time.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); bubble.append(who,body,stamp); row.append(avatar,bubble); $('chatFeed').append(row); $('chatFeed').scrollTop=$('chatFeed').scrollHeight; }
function renderConversation(){ $('chatFeed').innerHTML=''; if(!currentConversation.messages.length){ addChatMessage('nova','Absolutely! I can help you build, research, analyze, code, or plan. What are we working on?'); return; } currentConversation.messages.forEach(m=>addChatMessage(m.role,m.text,new Date(m.at))); }
function archiveCurrent(){ if(currentConversation.messages.length){ conversations.push({...currentConversation}); saveState(); } }
function newChat(){ archiveCurrent(); currentConversation={id:crypto.randomUUID?.()||String(Date.now()),title:'New Chat',messages:[]}; latestResponse=''; renderConversation(); $('messageInput').value=''; updateMode('TEXT MODE'); renderHistory(); toast('New NOVA conversation started.'); }
function formatFileSize(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1024/1024).toFixed(1)} MB`;}
function renderAttachments(){ const box=$('attachmentPreview'); box.innerHTML=''; $('clearAttachments').hidden=!selectedAttachments.length; selectedAttachments.forEach((item,index)=>{ const card=document.createElement('div');card.className='attachment-card'; if(item.type.startsWith('image/')&&item.previewUrl){const img=document.createElement('img');img.src=item.previewUrl;img.alt=item.name;card.append(img)}else{const icon=document.createElement('div');icon.className='attachment-file-icon';icon.textContent='📄';card.append(icon)} const meta=document.createElement('div');meta.className='attachment-meta';const n=document.createElement('span');n.className='attachment-name';n.textContent=item.name;const s=document.createElement('span');s.className='attachment-size';s.textContent=formatFileSize(item.size);meta.append(n,s);const r=document.createElement('button');r.className='attachment-remove';r.type='button';r.textContent='✕';r.onclick=()=>{const [gone]=selectedAttachments.splice(index,1);if(gone?.previewUrl)URL.revokeObjectURL(gone.previewUrl);renderAttachments()};card.append(meta,r);box.append(card);}); }
function addFiles(files){ let added=0; let rejected=0; Array.from(files).forEach(file=>{if(selectedAttachments.some(x=>x.name===file.name&&x.size===file.size))return;if(selectedAttachments.length>=5||file.size>8*1024*1024){rejected++;return;}selectedAttachments.push({name:file.name,size:file.size,type:file.type||'application/octet-stream',file,previewUrl:file.type.startsWith('image/')?URL.createObjectURL(file):null});added++;}); renderAttachments(); if(selectedAttachments.length)updateMode('ATTACHMENTS'); if(added)toast(`${added} file${added===1?'':'s'} attached.`); if(rejected)toast('Maximum 5 files; each file must be 8 MB or smaller.'); updateSendButtonState(); return added; }
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
async function buildAttachmentPayload(){const out=[];for(const item of selectedAttachments){const supported=item.type.startsWith('image/')||/\.(pdf|docx|xlsx|pptx|txt|csv)$/i.test(item.name)||['text/plain','text/csv','application/pdf'].includes(item.type);if(!supported){out.push({name:item.name,type:item.type,unsupported:true});continue}out.push({name:item.name,type:item.type,data:await fileToDataUrl(item.file)});}return out;}
async function postJson(url,payload){const headers={'Content-Type':'application/json'};if(accountSession?.access_token)headers.Authorization=`Bearer ${accountSession.access_token}`;const res=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`Request failed (${res.status})`);return data;}
async function syncChats(){try{const d=await fetch(`/api/chat?user_id=${encodeURIComponent(USER_ID)}`).then(r=>r.json());if(Array.isArray(d.conversations)){conversations=d.conversations;serverChatReady=true;updateMemoryUI();renderHistory();}}catch{serverChatReady=false}}
async function persistCurrent(){if(!currentConversation.messages.length)return;try{await postJson('/api/chat',{user_id:USER_ID,id:currentConversation.id,title:currentConversation.title,messages:currentConversation.messages});serverChatReady=true;}catch{}}
async function queueOfflineMessage(message){const q=JSON.parse(localStorage.getItem('nova_offline_queue')||'[]');q.push({id:crypto.randomUUID?.()||String(Date.now()),message,user_id:universalUserId?.()||USER_ID,persona:activePersona,createdAt:Date.now()});localStorage.setItem('nova_offline_queue',JSON.stringify(q.slice(-20)));toast('NOVA saved this request locally and will retry when you are online.');announce('Request saved for later because NOVA is offline.');}
async function flushOfflineQueue(){if(!navigator.onLine)return;const q=JSON.parse(localStorage.getItem('nova_offline_queue')||'[]');if(!q.length)return;const remaining=[];for(const item of q){try{await postJson('/assist',{message:item.message,user_id:item.user_id,persona:item.persona,attachments:[]});}catch{remaining.push(item);break;}}localStorage.setItem('nova_offline_queue',JSON.stringify(remaining));if(q.length&&!remaining.length)toast('NOVA completed the saved offline requests.');}
async function sendMessage(prefilled=null){const input=$('messageInput');if(!input)return;const message=String(prefilled??input.value??'').trim();if(!message&&!selectedAttachments.length)return;if(isSendingMessage)return;if(!navigator.onLine){if(message)await queueOfflineMessage(message);input.value='';updateSendButtonState();return;}if(isSpeaking){toast('Stop voice playback before sending another message.');return;}isSendingMessage=true;updateSendButtonState();const displayMessage=message||'Analyze my attachments.';try{const attachments=await buildAttachmentPayload();currentConversation.messages.push({role:'user',text:displayMessage,at:Date.now()});if(currentConversation.title==='New Chat')currentConversation.title=message.slice(0,44)||'Attachment analysis';addChatMessage('user',displayMessage);input.value='';updateSendButtonState();novaAttention();setThinking(true);const data=await postJson('/assist',{message:displayMessage,user_id:USER_ID,conversation_id:currentConversation.id,persona:activePersona,attachments});latestResponse=data.response||'No response returned.';if($('personaSpeakButton'))$('personaSpeakButton').disabled=!latestResponse;if($('speakButton'))$('speakButton').disabled=!latestResponse;currentConversation.messages.push({role:'nova',text:latestResponse,at:Date.now()});addChatMessage('nova',latestResponse);if($('voiceTranscript')&&document.body.classList.contains('voice-studio-active'))$('voiceTranscript').textContent=`You: ${displayMessage}\n\n${activePersona.toUpperCase()}: ${latestResponse}`;if((liveVoiceMode||document.body.classList.contains('voice-studio-active'))&&latestResponse)await speakText(latestResponse,true);}catch(error){const errorText=`I couldn't complete that request: ${error?.message||'An unexpected error occurred.'}`;currentConversation.messages.push({role:'nova',text:errorText,at:Date.now()});addChatMessage('nova',errorText);toast(error?.message||'NOVA request failed.');}finally{isSendingMessage=false;setThinking(false);renderHistory();await saveState();updateSendButtonState();}}
function renderHistory(){const list=$('historyList');list.innerHTML='';const q=String($('chatHistorySearch')?.value||'').toLowerCase().trim();const items=[...conversations].reverse().filter(c=>!q||`${c.title} ${(c.messages||[]).map(m=>m.text).join(' ')}`.toLowerCase().includes(q)).slice(0,20);if(!items.length){list.innerHTML='<div class="history-empty">No matching conversations.</div>';return;}items.forEach((c)=>{const wrap=document.createElement('div');wrap.className='history-item';const b=document.createElement('button');b.textContent=c.title||'Conversation';const meta=document.createElement('small');meta.textContent=new Date(c.updatedAt||c.messages?.at(-1)?.at||Date.now()).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});b.append(meta);b.onclick=async()=>{await persistCurrent();currentConversation={...c};renderConversation();scrollTo('assistantWorkspace');};const more=document.createElement('button');more.className='history-more';more.textContent='•••';more.onclick=async(e)=>{e.stopPropagation();const action=prompt('Type rename or delete');if(action==='rename'){const title=prompt('New conversation name',c.title||'Conversation');if(title?.trim()){c.title=title.trim();await postJson('/api/chat',{user_id:USER_ID,id:c.id,title:c.title,messages:c.messages});renderHistory();}}else if(action==='delete'){if(confirm('Delete this conversation?')){await fetch(`/api/chat/${encodeURIComponent(c.id)}?user_id=${encodeURIComponent(USER_ID)}`,{method:'DELETE'});conversations=conversations.filter(x=>x.id!==c.id);renderHistory();}}};wrap.append(b,more);list.append(wrap);});}
function updateMemoryUI(){ $('memoryCount').textContent=memories.length; $('historyCount').textContent=conversations.length+(currentConversation.messages.length?1:0); $('messageCount').textContent=conversations.reduce((n,c)=>n+(c.messages?.length||0),0)+(currentConversation.messages?.length||0); const box=$('memoryItems');box.innerHTML='';(memories.length?memories:['No saved memories yet.']).slice(-8).forEach(m=>{const s=document.createElement('span');s.textContent=m.text||m;box.append(s);});}
async function loadStatus(){try{const d=await fetch('/api/status').then(r=>r.json());const providers=d.aiRouter?.providers||[];const groq=providers.find(p=>p.id==='groq');const gemini=providers.find(p=>p.id==='gemini');$('groqStatus').textContent=groq?.configured?'Connected':'Not configured';$('geminiStatus').textContent=gemini?.configured?'Connected':'Not configured';$('voiceStatus').textContent=d.voiceEngine?.ready?'Ready':'Browser fallback';$('providerStatus').textContent=groq?.configured||gemini?.configured?'AI routing online':'Add a free AI provider key';$('settingsVoice').textContent=d.voiceEngine?.ready?'NOVA voice service ready':'Device-native voice available';}catch{ $('groqStatus').textContent='Offline';$('geminiStatus').textContent='Offline';$('voiceStatus').textContent='Offline';}}

async function executeCommand(task){
  const input=(task||$('commandInput').value||'').trim(); if(!input)return;
  $('agentInput').value=input; scrollTo('agentPanel'); await runAgent(input);
}

async function runAutonomousBuild(goal){
  setThinking(true); showExecutionProgress('planning'); toast('NOVA is starting a private sandbox…');
  try{
    const started=await postJson('/api/autonomous-build',{goal,user_id:USER_ID,persona:activePersona,name:'nova-task'}); const taskId=started.taskId; latestAutonomousTaskId=taskId;
    let done=false; while(!done){await new Promise(r=>setTimeout(r,650));const task=await fetch(`/api/autonomous-progress/${encodeURIComponent(taskId)}`).then(r=>r.json());renderExecutionProgress(task.progress||[]);if(task.status==='completed'||task.status==='failed'){done=true;if(task.status==='completed'){const summary='Done — NOVA implemented the solution in a private sandbox, tested it, fixed issues when needed, verified the result, and packaged the final result.';addChatMessage('nova',summary);currentConversation.messages.push({role:'nova',text:summary,at:Date.now()});showFinalResult(task.result); $('finalResult').querySelector('[data-result-action]').onclick=async()=>{const r=await fetch(`/api/autonomous-download/${encodeURIComponent(taskId)}`);if(!r.ok){toast('Verified result is no longer available.');return;}const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='NOVA-verified-result.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);};}else{const msg=`NOVA found an issue during verification and stopped safely. ${task.error||'The sandbox was rolled back.'}`;addChatMessage('nova',msg);currentConversation.messages.push({role:'nova',text:msg,at:Date.now()});}}}
    await persistCurrent(); renderHistory(); saveState();
  }catch(e){addChatMessage('nova',`Autonomous build could not start: ${e.message}`);toast(e.message)} finally{setThinking(false)}
}
function showExecutionProgress(items){const box=$('executionProgress');if(!box)return;box.hidden=false;box.innerHTML='';(items||[]).forEach(item=>{const row=document.createElement('div');row.className=`exec-step ${item.status}`;row.innerHTML=`<span>${item.status==='done'?'✓':item.status==='active'?'◌':'○'}</span><b>${item.label}</b>`;box.append(row)});}
function showFinalResult(result){const card=$('finalResult');if(!card)return;card.hidden=false;card.querySelector('[data-result-title]').textContent='Ready — your result is verified';card.querySelector('[data-result-detail]').textContent=`Built in a private sandbox${result?.rounds?` • ${result.rounds} build round${result.rounds===1?'':'s'}`:''}.`;card.querySelector('[data-result-action]').onclick=async()=>{if(!result?.artifact?.path){toast('Verified result is not available yet.');return;}toast('Preparing your verified result…');};}

function renderAgentTrace(trace){
  const box=$('agentTrace'); box.innerHTML='';
  (trace||[]).forEach((item)=>{const row=document.createElement('div');row.className=`agent-trace-row ${item.status}`;row.innerHTML=`<span class="trace-icon">${item.status==='done'?'✓':item.status==='failed'?'!':item.status==='skipped'?'–':'◌'}</span><div><b>${item.label}</b><small>${item.detail||item.status.toUpperCase()}</small></div><time>${item.at||0}ms</time>`;box.append(row);});
}
function setCoreState(state,signal){$('thinkingState').textContent=state;$('coreSignal').textContent=signal;$('agentLiveState').textContent=state.replace('● ','').toUpperCase();}
async function runAgent(goal){
  if(!goal.trim())return;
  const trace=$('agentTrace'), result=$('agentResult'); result.hidden=true; trace.innerHTML='<div class="agent-empty active">NOVA is constructing an execution graph…</div>';
  $('agentStepCount').textContent='—';$('agentToolCount').textContent='—';$('agentSourceCount').textContent='—';$('agentElapsed').textContent='0.0';$('agentDuration').textContent='RUNNING';
  setCoreState('● Planning','DECOMPOSING OBJECTIVE'); $('typingIndicator').hidden=false;
  try{
    const data=await postJson('/api/agent',{goal,user_id:USER_ID,persona:activePersona,attachments:await buildAttachmentPayload()});
    renderAgentTrace(data.trace||[]);
    const tools=new Set((data.trace||[]).map(x=>x.tool).filter(Boolean));
    $('agentStepCount').textContent=(data.steps||data.trace||[]).length;$('agentToolCount').textContent=tools.size;$('agentSourceCount').textContent=(data.research||[]).length;$('agentElapsed').textContent=((data.durationMs||0)/1000).toFixed(1);$('agentDuration').textContent=`${data.durationMs||0}ms`;
    setCoreState('● Complete','EXECUTION VERIFIED');
    result.hidden=false; result.innerHTML=`<div class="result-head"><b>NOVA RESULT</b><span>${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span></div><p>${escapeHtml(data.response||'Workflow complete.').replace(/\n/g,'<br>')}</p>`;
    if(data.research?.length){ $('researchResults').innerHTML=''; data.research.forEach(item=>{const card=document.createElement('div');card.className='research-item';const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener';a.textContent=item.title;const p=document.createElement('p');p.textContent=item.snippet||item.url;card.append(a,p);$('researchResults').append(card);}); $('researchState').textContent='Agent gathered live sources'; }
    if(data.security){$('scanResult').textContent=JSON.stringify(data.security,null,2);}
    if(data.response){currentConversation.messages.push({role:'user',text:goal,at:Date.now()});currentConversation.messages.push({role:'nova',text:data.response,at:Date.now()});if(currentConversation.title==='New Chat')currentConversation.title=goal.slice(0,44);addChatMessage('user',goal);addChatMessage('nova',data.response);latestResponse=data.response;saveState();renderHistory();}
  }catch(e){trace.innerHTML=`<div class="agent-empty failed">Agent stopped: ${escapeHtml(e.message)}</div>`;setCoreState('● Error','EXECUTION INTERRUPTED');$('agentDuration').textContent='FAILED';toast(e.message);}
  finally{$('typingIndicator').hidden=true;}
}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function setupCommandCenter(){
  $('commandForm')?.addEventListener('submit',e=>{e.preventDefault();executeCommand();});
  $('agentForm')?.addEventListener('submit',e=>{e.preventDefault();runAgent($('agentInput').value);});
  document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>{const k=b.dataset.command;const presets={research:'Research the latest information about ',analyze:'Analyze my attached files and explain the key findings.',code:'Build a production-ready solution for ',security:'Scan this URL for security risks: '};$('commandInput').value=presets[k]||'';$('agentInput').value=$('commandInput').value;$('agentInput').focus();scrollTo('agentPanel');});
}


async function loadBuilderWorkspaces(){try{const d=await fetch('/api/builder/workspaces').then(r=>r.json());const sel=$('builderWorkspace');sel.innerHTML='<option value="">Select workspace…</option>'+(d.workspaces||[]).map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.id)}</option>`).join('');}catch(e){toast(e.message)}}
async function refreshBuilder(){const id=$('builderWorkspace').value;if(!id)return;try{const d=await fetch(`/api/builder/workspaces/${encodeURIComponent(id)}`).then(r=>r.json());$('builderFiles').innerHTML=(d.files||[]).map(f=>`<div class="builder-file"><span>${escapeHtml(f.path)}</span><small>${f.size} B</small></div>`).join('')||'Workspace is empty.';}catch(e){$('builderFiles').textContent=e.message}}
async function runBuilderTest(){const id=$('builderWorkspace').value;if(!id)return toast('Select a workspace first.');try{$('builderTest').textContent='Testing…';const d=await postJson(`/api/builder/workspaces/${encodeURIComponent(id)}/test`,{});$('builderTest').textContent=JSON.stringify(d,null,2);toast(d.ok?'Builder verification passed.':'Builder verification found failures.');}catch(e){$('builderTest').textContent=e.message}}
async function setupBuilder(){if(!$('builderPanel'))return;loadBuilderWorkspaces();$('builderRefresh').onclick=refreshBuilder;$('builderWorkspace').onchange=refreshBuilder;$('builderCreate').onclick=async()=>{const name=prompt('Workspace name','nova-project');if(!name)return;try{const d=await postJson('/api/builder/workspaces',{name});await loadBuilderWorkspaces();$('builderWorkspace').value=d.id;await refreshBuilder();toast('Sandbox workspace created.')}catch(e){toast(e.message)}};$('builderTestBtn').onclick=runBuilderTest;$('builderPlanForm').onsubmit=async e=>{e.preventDefault();const id=$('builderWorkspace').value;if(!id)return toast('Select a workspace first.');try{const d=await postJson(`/api/builder/workspaces/${encodeURIComponent(id)}/plan`,{goal:$('builderGoal').value});$('builderPlan').textContent=JSON.stringify(d,null,2);}catch(e){$('builderPlan').textContent=e.message}};$('builderBuildBtn').onclick=async()=>{const id=$('builderWorkspace').value,goal=$('builderGoal').value.trim();if(!id||!goal)return toast('Select a workspace and enter a goal first.');try{$('builderPlan').textContent='NOVA is autonomously building…';const d=await postJson(`/api/builder/workspaces/${encodeURIComponent(id)}/build`,{goal,persona:activePersona});$('builderPlan').textContent=JSON.stringify(d,null,2);await refreshBuilder();toast(d.ok?`Build verified • SHA-256 ${d.artifact?.sha256||'ready'}`:'Build finished with verification issues.');}catch(e){$('builderPlan').textContent=e.message;toast(e.message);await refreshBuilder();}};$('builderManifestBtn').onclick=async()=>{const id=$('builderWorkspace').value;if(!id)return toast('Select a workspace first.');try{const d=await fetch(`/api/builder/workspaces/${encodeURIComponent(id)}/manifest`).then(r=>r.json());$('builderPlan').textContent=JSON.stringify(d,null,2);}catch(e){toast(e.message)}};$('builderImport').onclick=()=>$('builderImportInput').click();$('builderImportInput').onchange=async e=>{const id=$('builderWorkspace').value,file=e.target.files?.[0];if(!id||!file)return;try{const reader=new FileReader();reader.onload=async()=>{try{const d=await postJson(`/api/builder/workspaces/${encodeURIComponent(id)}/import`,{data:reader.result});toast(`Imported ${d.imported} files.`);await refreshBuilder();}catch(err){toast(err.message)}};reader.readAsDataURL(file);}finally{e.target.value='';}};$('builderPackageBtn').onclick=async()=>{const id=$('builderWorkspace').value;if(!id)return toast('Select a workspace first.');try{const r=await fetch(`/api/builder/workspaces/${encodeURIComponent(id)}/package`,{method:'POST'});if(!r.ok)throw new Error((await r.json()).error||'Packaging failed');const blob=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${id}-artifact.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Artifact packaged.')}catch(e){toast(e.message)}}}

const NOVA_APPEARANCE_KEY='nova_appearance_v1';
const NOVA_APPEARANCE_DEFAULTS={style:'holographic',theme:'midnight',hologram:'living-avatar',motion:'full',density:'comfortable'};
function readAppearance(){try{return {...NOVA_APPEARANCE_DEFAULTS,...JSON.parse(localStorage.getItem(NOVA_APPEARANCE_KEY)||'{}')}}catch{return {...NOVA_APPEARANCE_DEFAULTS}}}
function applyAppearance(announceChange=false){
  const a=readAppearance(); const root=document.documentElement; const body=document.body;
  ['theme-midnight','theme-aurora','theme-nebula','theme-emerald','theme-sunset','theme-ocean','theme-forest','theme-light'].forEach(c=>body.classList.remove(c));
  body.classList.add(`theme-${a.theme==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'midnight'):a.theme}`);
  ['style-premium-glass','style-holographic','style-minimal','style-professional','style-immersive','style-classic'].forEach(c=>body.classList.remove(c));body.classList.add(`style-${a.style}`);
  body.dataset.hologram=a.hologram;body.dataset.motion=a.motion;body.dataset.density=a.density;
  const holo=$('personaHologram');if(holo){holo.dataset.representation=a.hologram;holo.hidden=a.hologram==='off';}
  ['novaUiStyle','novaTheme','novaHologramStyle','novaMotion','novaDensity'].forEach((id,i)=>{const el=$(id);if(el)el.value=[a.style,a.theme,a.hologram,a.motion,a.density][i]});
  if(announceChange)toast('NOVA appearance saved on this device.');
}
function setupPersonalization(){
  const ids=['novaUiStyle','novaTheme','novaHologramStyle','novaMotion','novaDensity'];
  const current=readAppearance();ids.forEach((id,i)=>{if($(id))$(id).value=[current.style,current.theme,current.hologram,current.motion,current.density][i]});
  $('savePersonalization')?.addEventListener('click',()=>{const next={style:$('novaUiStyle').value,theme:$('novaTheme').value,hologram:$('novaHologramStyle').value,motion:$('novaMotion').value,density:$('novaDensity').value};localStorage.setItem(NOVA_APPEARANCE_KEY,JSON.stringify(next));applyAppearance(true);});
  $('resetPersonalization')?.addEventListener('click',()=>{localStorage.setItem(NOVA_APPEARANCE_KEY,JSON.stringify(NOVA_APPEARANCE_DEFAULTS));applyAppearance();toast('Appearance restored to NOVA defaults.');});
  applyAppearance();
}

function setupNav(){document.querySelectorAll('.rail-btn').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.rail-btn').forEach(x=>x.classList.toggle('active',x===btn));if(btn.dataset.target==='voiceWorkspace'){openVoiceStudio();}else{closeVoiceStudio();scrollTo(btn.dataset.target);} $('commandRail').classList.remove('open');});$('voiceBackButton')?.addEventListener('click',closeVoiceStudio);window.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('voice-studio-active'))closeVoiceStudio();});}
function setupPrompts(){document.querySelectorAll('[data-prompt]').forEach(btn=>btn.onclick=()=>{ $('messageInput').value=btn.dataset.prompt+' ';scrollTo('assistantWorkspace');$('messageInput').focus();});document.querySelector('[data-research]')?.addEventListener('click',()=>{scrollTo('researchPanel');$('researchInput').focus();});document.querySelector('[data-autonomous]')?.addEventListener('click',()=>{const goal=prompt('What should NOVA build autonomously?');if(goal?.trim()){runAutonomousBuild(goal.trim())}});$('moreTools').onclick=()=>scrollTo('toolsPanel');}
const PERSONA_PRESENTATION={
  nova:{tagline:'Your core intelligence',desc:'Futuristic, intelligent and balanced',voice:'nova',rate:1,pitch:.98},
  jarvis:{tagline:'The precise strategist',desc:'Precise, formal and technical',voice:'jarvis',rate:.96,pitch:.82},
  friday:{tagline:'Your calm companion',desc:'Warm, calm and conversational',voice:'friday',rate:1.02,pitch:1.05},
  atlas:{tagline:'The focused powerhouse',desc:'Deep, strong and commanding',voice:'atlas',rate:.92,pitch:.82},
  lyra:{tagline:'The creative spark',desc:'Friendly, expressive and imaginative',voice:'lyra',rate:1.04,pitch:1.08},
  orion:{tagline:'The thoughtful explorer',desc:'Cinematic, curious and composed',voice:'orion',rate:.94,pitch:.92}
};
function updatePersonaPresentation(){
  const key=PERSONA_PRESENTATION[activePersona]?activePersona:'nova';
  const persona=PERSONA_PRESENTATION[key];
  const holo=$('personaHologram');
  if(holo){holo.className=`persona-hologram persona-${key}`;holo.dataset.persona=key;holo.dataset.state=isListening?'listening':isSpeaking?'speaking':'idle';}
  if($('personaHoloInitial'))$('personaHoloInitial').textContent=key[0].toUpperCase();
  if($('personaHoloName'))$('personaHoloName').textContent=key.toUpperCase();
  if($('personaHoloTagline'))$('personaHoloTagline').textContent=persona.tagline;
  if($('personaTalkButton'))$('personaTalkButton').textContent=isListening?'■ Stop listening':`🎙 Start listening to ${key.toUpperCase()}`;
  if($('personaTalkStatus'))$('personaTalkStatus').textContent=`${persona.desc}. Tap Start listening to speak, or use chat for text.`;
  if($('voiceStudioStatus'))$('voiceStudioStatus').textContent=`${key.toUpperCase()} is ready • ${persona.desc}`;
  if($('personaVoiceMode'))$('personaVoiceMode').textContent='Device-native voice fallback';
  document.querySelectorAll('[data-persona]').forEach(x=>{if(x.classList.contains('persona-btn')){x.classList.toggle('active',x.dataset.persona===key);x.setAttribute('aria-pressed',String(x.dataset.persona===key));}});
  if($('activePersonaTitle'))$('activePersonaTitle').textContent=key.toUpperCase();
  if($('railPersonaName'))$('railPersonaName').textContent=key.toUpperCase();
  if($('personaStateLabel'))$('personaStateLabel').textContent=isListening?'● LISTENING':isSpeaking?'● SPEAKING':'● READY';
  if($('personaSpeakButton'))$('personaSpeakButton').disabled=!latestResponse;
}
function setupPersonas(){
  document.querySelectorAll('.persona-btn').forEach(btn=>btn.onclick=()=>{
    const next=btn.dataset.persona;if(!PERSONA_PRESENTATION[next])return;
    activePersona=next;updatePersonaPresentation();saveState();novaAttention();
    announce(`${next.toUpperCase()} persona selected. ${PERSONA_PRESENTATION[next].desc}.`);
    toast(`${next.toUpperCase()} persona activated.`);
  });
  $('personaTalkButton')?.addEventListener('click',()=>{
    if(!recognition){toast('Speech recognition is unavailable in this browser. You can still type in Chat or use a supported browser.');$('personaTalkStatus').textContent='Speech recognition is unavailable here. You can still use the chat composer.';return;}
    if(isListening){recognition.stop();return;}
    liveVoiceMode=true;$('liveVoiceButton')?.classList.add('active');updateMode('LIVE VOICE');
    $('liveVoiceStatus').textContent='Live Voice enabled. Listening…';
    try{recognition.start();$('personaTalkStatus').textContent=`${activePersona.toUpperCase()} is listening. Go ahead.`;}catch(e){$('personaTalkStatus').textContent='Could not start the microphone. Check browser microphone permission.';}
  });
  $('personaSpeakButton')?.addEventListener('click',()=>speakText(latestResponse,false));
  updatePersonaPresentation();
}
async function searchWeb(query){if(!query.trim())return;const results=$('researchResults');results.innerHTML='<div class="tool-output">Searching the web…</div>';$('researchState').textContent='Searching';try{const data=await postJson('/research',{query});results.innerHTML='';(data.results||[]).forEach(item=>{const card=document.createElement('div');card.className='research-item';const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener';a.textContent=item.title;const p=document.createElement('p');p.textContent=item.snippet||item.url;card.append(a,p);results.append(card);});if(!data.results?.length)results.innerHTML='<div class="tool-output">No results found.</div>'; $('researchState').textContent='Ready';}catch(e){results.innerHTML=`<div class="tool-output">Research unavailable: ${e.message}</div>`;$('researchState').textContent='Offline';}}
function setupReferenceControls(){document.querySelectorAll('.capability-card [data-target]').forEach(btn=>btn.addEventListener('click',()=>scrollTo(btn.dataset.target)));document.querySelectorAll('.capability-card [data-action]').forEach(btn=>btn.addEventListener('click',()=>{const action=btn.dataset.action;if(action==='camera')$('cameraButton')?.click();if(action==='upload')$('fileInput')?.click();if(action==='voice')openVoiceStudio();}));document.querySelectorAll('.persona-pills [data-persona]').forEach(btn=>btn.addEventListener('click',()=>document.querySelector(`.persona-btn[data-persona="${btn.dataset.persona}"]`)?.click()));}
function setupTools(){document.querySelectorAll('[data-tool]').forEach(btn=>btn.onclick=async()=>{const tool=btn.dataset.tool;const out=$('toolOutput');if(tool==='calculator'){const expr=prompt('Enter a calculation');if(expr){try{const safe=expr.replace(/[^0-9+\-*/().%\s]/g,'');const result=Function(`"use strict";return (${safe})`)();out.textContent=`Calculator: ${expr} = ${result}`;}catch{out.textContent='Invalid calculation.'}}return}const prompts={web:'Research the latest information about ',code:'Write production-ready code for ',image:'Analyze the attached image carefully.',pdf:'Summarize the attached PDF.',automation:'Create an automation plan for '};$('messageInput').value=prompts[tool]||'';scrollTo('assistantWorkspace');$('messageInput').focus();});}
function setupMicrophone(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('micStatus').textContent='Voice input is not supported by this browser.';return;}recognition=new SR();recognition.continuous=false;recognition.interimResults=true;recognition.lang=navigator.language||'en-US';recognition.onstart=()=>{isListening=true; setNovaState('listening');$('micButton').classList.add('active');$('micStatus').textContent='Listening… speak clearly to NOVA.';updateMode(liveVoiceMode?'LIVE VOICE':'VOICE INPUT')};recognition.onresult=e=>{let finalText='';let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=t;else interim+=t;}if(finalText.trim()){$('messageInput').value=(`${$('messageInput').value} ${finalText}`).trim();if($('voiceTranscript'))$('voiceTranscript').textContent=`You: ${finalText}`;if(liveVoiceMode)sendMessage();}if(interim){$('micStatus').textContent=`Hearing: ${interim}`;if($('voiceStudioStatus'))$('voiceStudioStatus').textContent=`Hearing: ${interim}`}};recognition.onend=()=>{isListening=false; setNovaState('idle');$('micButton').classList.remove('active');$('micStatus').textContent='Microphone ready.'};recognition.onerror=e=>{$('micStatus').textContent=`Microphone: ${e.error}`};$('micButton').onclick=()=>{if(isListening)recognition.stop();else try{recognition.start()}catch{}};}
function populateDeviceVoices(){const select=$('voiceChoice');if(!select||!('speechSynthesis'in window))return;const previous=select.value;const voices=window.speechSynthesis.getVoices();select.innerHTML='<option value="">Automatic persona voice</option>';voices.forEach((voice,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${voice.name} (${voice.lang})`;select.append(option)});if(previous&&[...select.options].some(o=>o.value===previous))select.value=previous;}
function stopVoicePlayback(){if(activeSpeechAudio){activeSpeechAudio.onended=null;activeSpeechAudio.onerror=null;activeSpeechAudio.pause();activeSpeechAudio.currentTime=0;activeSpeechAudio.src='';activeSpeechAudio=null;}if(activeSpeechCancel){const cancel=activeSpeechCancel;activeSpeechCancel=null;cancel();}if('speechSynthesis'in window)window.speechSynthesis.cancel();isSpeaking=false;setNovaState(isListening?'listening':'idle');if($('voiceStudioStatus'))$('voiceStudioStatus').textContent=isListening?'Listening — speak naturally':'Playback stopped';if($('liveVoiceStatus'))$('liveVoiceStatus').textContent='Audio stopped.';}
async function speakText(text,live=false){
  if(!text)return;if(isSpeaking)stopVoicePlayback();setNovaState('speaking');isSpeaking=true;updateCaptions(text.slice(0,1200));let objectUrl=null;
  const rate=Number($('voiceRate')?.value||1);const personaVoice=PERSONA_PRESENTATION[activePersona]||PERSONA_PRESENTATION.nova;
  try{
    // NOVA-native speech is the default: no paid service or API key required.
    if('speechSynthesis'in window && typeof SpeechSynthesisUtterance!=='undefined'){
      window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text.slice(0,5000));utterance.rate=rate||personaVoice.rate;utterance.pitch=personaVoice.pitch;
      const availableVoices=window.speechSynthesis.getVoices();const select=$('voiceChoice');const chosenByUser=select&&select.value!==''?availableVoices[Number(select.value)]:null;
      const preferredNames={nova:['Google UK English Female','Microsoft Zira','Samantha'],jarvis:['Microsoft David','Google UK English Male','Alex'],friday:['Samantha','Google US English','Microsoft Aria'],atlas:['Microsoft David','Alex','Google UK English Male'],lyra:['Samantha','Microsoft Aria','Google UK English Female'],orion:['Alex','Microsoft David','Google UK English Male']}[activePersona]||[];
      const chosenVoice=chosenByUser||availableVoices.find(v=>preferredNames.some(n=>v.name.toLowerCase().includes(n.toLowerCase())));if(chosenVoice)utterance.voice=chosenVoice;
      if(live&&$('liveVoiceStatus'))$('liveVoiceStatus').textContent='NOVA is speaking with the device voice…';
      await new Promise((resolve,reject)=>{activeSpeechCancel=resolve;utterance.onend=resolve;utterance.onerror=e=>reject(new Error(`Device speech failed: ${e.error||'unknown error'}`));window.speechSynthesis.speak(utterance);});
    }else{
      // Optional cloud adapter is used only when the browser has no native TTS.
      const r=await fetch('/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,persona:activePersona})});if(!r.ok)throw new Error((await r.json()).error||'Native speech is unavailable and no optional voice provider responded.');
      objectUrl=URL.createObjectURL(await r.blob());const audio=new Audio(objectUrl);activeSpeechAudio=audio;audio.playbackRate=rate; if(live&&$('liveVoiceStatus'))$('liveVoiceStatus').textContent='NOVA is speaking…';
      await new Promise((resolve,reject)=>{activeSpeechCancel=resolve;audio.onended=resolve;audio.onerror=()=>reject(new Error('Audio playback failed.'));audio.play().catch(reject);});
    }
  }catch(e){toast(e.message||'NOVA voice playback failed.');}
  finally{if(objectUrl)URL.revokeObjectURL(objectUrl);activeSpeechAudio=null;activeSpeechCancel=null;isSpeaking=false;if(!accessibilityProfile.captions)updateCaptions('');setNovaState(live&&liveVoiceMode?'listening':'idle');if($('voiceStudioStatus'))$('voiceStudioStatus').textContent=live&&liveVoiceMode?'Listening — your turn':'Ready when you are';if(live&&liveVoiceMode){if($('liveVoiceStatus'))$('liveVoiceStatus').textContent='Listening again…';setTimeout(()=>{if(!isListening&&recognition)try{recognition.start()}catch{}},250);}}
}
function setupLiveVoice(){$('liveVoiceButton').onclick=()=>{if(!recognition){toast('Live Voice is not supported here.');return}liveVoiceMode=!liveVoiceMode;$('liveVoiceButton').classList.toggle('active',liveVoiceMode);$('liveVoiceStatus').textContent=liveVoiceMode?'Live Voice enabled. Listening…':'Live Voice is off.';updateMode(liveVoiceMode?'LIVE VOICE':'TEXT MODE');if(liveVoiceMode&&!isListening)try{recognition.start()}catch{}else if(!liveVoiceMode&&isListening)recognition.stop();};$('speakButton')?.addEventListener('click',()=>speakText(latestResponse,false));$('speakButton')?.toggleAttribute('disabled',!latestResponse);$('voiceStopButton')?.addEventListener('click',stopVoicePlayback);$('voiceCaptionsToggle')?.addEventListener('change',e=>{accessibilityProfile.captions=e.target.checked;saveAccessibilityProfile();if(!e.target.checked)updateCaptions('');else if(latestResponse)updateCaptions(latestResponse.slice(0,1200));});$('voiceRate')?.addEventListener('input',e=>{if($('voiceRateOutput'))$('voiceRateOutput').textContent=`${Number(e.target.value).toFixed(2).replace(/0$/,'')}×`;});$('voiceCameraButton')?.addEventListener('click',()=>$('cameraButton')?.click());$('voiceChoice')?.addEventListener('focus',populateDeviceVoices);populateDeviceVoices();if('speechSynthesis'in window)window.speechSynthesis.onvoiceschanged=populateDeviceVoices;}
function setupCamera(){const modal=$('cameraModal');$('cameraButton').onclick=async()=>{modal.hidden=false;updateMode('CAMERA');if(!navigator.mediaDevices?.getUserMedia){$('cameraMessage').textContent='Camera access is unavailable in this browser or page context. Open NOVA over HTTPS and try again.';return;}try{cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:cameraFacingMode,width:{ideal:1280},height:{ideal:720}},audio:false});$('cameraPreview').srcObject=cameraStream;$('cameraMessage').textContent='Camera ready. Capture a photo to attach it to NOVA.';announce('Camera ready. Capture a photo when you choose.');}catch(error){const reason=error?.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser settings and try again.':error?.name==='NotFoundError'?'No camera was found on this device. You can upload an image instead.':'Camera could not start. Check browser permission and ensure no other app is using the camera.';$('cameraMessage').textContent=reason;announce(reason)}};function close(){cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;if($('cameraPreview'))$('cameraPreview').srcObject=null;modal.hidden=true;}$('closeCamera').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()});$('switchCameraButton').onclick=async()=>{cameraFacingMode=cameraFacingMode==='environment'?'user':'environment';close();$('cameraButton').click()};$('captureButton').onclick=()=>{if(!cameraStream){$('cameraMessage').textContent='Start the camera before capturing a photo.';return;}const v=$('cameraPreview');const c=$('cameraCanvas');if(!v.videoWidth||!v.videoHeight){$('cameraMessage').textContent='Camera is still starting. Please wait a moment and try again.';return;}c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0,c.width,c.height);c.toBlob(blob=>{if(blob){const attached=addFiles([new File([blob],`NOVA-Capture-${Date.now()}.jpg`,{type:'image/jpeg'})]);$('cameraMessage').textContent=attached?'Photo captured and attached. Add a question in chat to ask NOVA about it.':'Photo captured, but NOVA already has 5 attachments or the image could not be added. Remove an attachment and try again.';announce($('cameraMessage').textContent)}else $('cameraMessage').textContent='Photo capture failed. Please try again.'},'image/jpeg',.92)};}
$('assistantForm').addEventListener('submit',e=>{e.preventDefault();sendMessage()});$('messageInput').addEventListener('input',updateSendButtonState);$('messageInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(e.isComposing)return;sendMessage();}});$('fileInput').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});$('clearAttachments').onclick=()=>{selectedAttachments.forEach(x=>x.previewUrl&&URL.revokeObjectURL(x.previewUrl));selectedAttachments=[];renderAttachments();updateSendButtonState()};$('newChat').onclick=newChat;$('clearConversation').onclick=newChat;$('mobileMenu').onclick=()=>{const open=$('commandRail').classList.toggle('open');$('mobileMenu').setAttribute('aria-expanded',String(open));announce(open?'NOVA navigation opened':'NOVA navigation closed')};$('uploadFile').onclick=()=>$('fileInput').click();$('takePhoto').onclick=()=>$('cameraButton').click();$('globalSearch').onclick=()=>{scrollTo('researchPanel');$('researchInput').focus()};$('notificationButton').onclick=async()=>{try{const d=await universalRequest(`/api/notifications?user_id=${encodeURIComponent(universalUserId())}`);const unread=(d.notifications||[]).filter(n=>!n.read);if(!unread.length){toast('No new NOVA notifications.');return;}toast(unread.slice(0,3).map(n=>n.message||n.title||'NOVA notification').join(' • '));for(const n of unread.slice(0,3))await universalRequest(`/api/notifications/${encodeURIComponent(n.id)}/read`,{method:'POST',body:JSON.stringify({user_id:universalUserId()})});}catch{toast('NOVA notifications are unavailable right now.');}};$('requestAdvanced')?.addEventListener('click',async()=>{const reason=prompt('What restricted NOVA information or feature do you need?');if(!reason?.trim())return;try{await postJson('/api/access/request',{user_id:USER_ID,resource:'advanced',reason:reason.trim()});toast('Request sent to NOVA creator for review.');}catch(e){toast(e.message)}});$('profileButton').onclick=()=>scrollTo('voiceWorkspace');$('railPersona').onclick=()=>scrollTo('voiceWorkspace');$('researchButton').onclick=()=>searchWeb($('researchInput').value);$('researchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchWeb(e.target.value)}});$('saveMemory').onclick=()=>{const text=prompt('What should NOVA remember about this conversation?');if(text?.trim()){memories.push({text:text.trim(),at:Date.now()});saveState();toast('Memory saved locally.')}};$('clearMemory').onclick=()=>{if(confirm('Clear NOVA local memory?')){memories=[];saveState();toast('Local memory cleared.')}};$('scanForm').addEventListener('submit',async e=>{e.preventDefault();try{$('scanResult').textContent='Scanning…';const d=await postJson('/scan-url',{url:$('scanInput').value});$('scanResult').textContent=JSON.stringify(d,null,2)}catch(err){$('scanResult').textContent=err.message}});$('viewAllHistory').onclick=()=>{scrollTo('historyPanel');toast(`${conversations.length} saved conversations in this browser.`)};
setupAccessibility();setupPersonalization();setNovaState('idle');setGreeting();setupNav();setupPrompts();setupPersonas();setupReferenceControls();setupTools();setupCommandCenter();setupBuilder();$('coreSignal').textContent='READY • AWAITING OBJECTIVE';setupMicrophone();setupLiveVoice();setupCamera();renderConversation();renderHistory();updateMemoryUI();updateSendButtonState();loadStatus();syncChats();


// NOVA 10.0 Identity + install layer: guest-first, account-enhanced.
const NOVA_SESSION_KEY = 'nova_session';
const NOVA_MODE_KEY = 'nova_mode';
let accountMode = localStorage.getItem(NOVA_MODE_KEY) || 'guest';
let accountSession = null;
let accountIntent = 'signin';
function accountDisplayName() {
  const user = accountSession?.user;
  const metadata = user?.user_metadata || {};
  const savedName = user?.name || metadata.full_name || metadata.name || metadata.display_name;
  if (savedName && String(savedName).trim()) return String(savedName).trim();
  if (user?.email) return String(user.email).split('@')[0];
  return 'Guest';
}
function accountRole() { return accountSession?.access?.role || 'user'; }
function setAccountUI() {
  const name = accountDisplayName();
  const role = accountRole();
  const sub = !accountSession ? 'Guest Mode' : role === 'creator' ? 'Creator • Full Experience' : role === 'viewer' ? 'Authorised Personnel' : 'Full Experience • User';
  const pn = $('profileName');
  const avatar = document.querySelector('#profileButton .user-avatar');
  if (pn) pn.innerHTML = `${escapeHtml(name)}<small>${escapeHtml(sub)}</small>`;
  if (avatar) { avatar.textContent = name.slice(0,1).toUpperCase(); avatar.setAttribute('aria-label', `${name}, ${sub}`); }
  const profileButton = $('profileButton');
  if (profileButton) {
    profileButton.dataset.novaRole = role;
    profileButton.setAttribute('aria-label', `Account: ${name}. Role: ${sub}. Right-click to sign out.`);
    profileButton.classList.toggle('creator-account', role === 'creator');
  }
  document.body.dataset.novaRole = accountSession ? role : 'guest';
  document.body.classList.toggle('guest-mode', !accountSession);
}
function openAccountGate(intent='signin') {
  accountIntent=intent;
  const gate=$('accountGate'); if(!gate) return;
  gate.hidden=false;
  $('signInTab').classList.toggle('active',intent==='signin'); $('signUpTab').classList.toggle('active',intent==='signup');
  $('accountSubmit').textContent=intent==='signup'?'Create account ↗':'Sign in ↗';
  $('accountPassword').setAttribute('autocomplete',intent==='signup'?'new-password':'current-password');
}
function closeAccountGate(){const g=$('accountGate'); if(g) g.hidden=true;}
async function accountRequest(path, body){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'Account request failed'); return d;
}
async function hydrateVerifiedIdentity() {
  if (!accountSession?.access_token) return null;
  const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${accountSession.access_token}` } });
  const identity = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(identity.error || 'Your NOVA session could not be verified.');
  // Role data is accepted only from the authenticated server response.
  accountSession.user = { ...(accountSession.user || {}), ...(identity.user || {}) };
  accountSession.access = identity.access || { role: 'user', label: 'User' };
  localStorage.setItem(NOVA_SESSION_KEY, JSON.stringify(accountSession));
  return identity;
}
async function finishAccountSession(data){
  accountSession=data.session||null;
  if(accountSession) {
    localStorage.setItem(NOVA_SESSION_KEY,JSON.stringify(accountSession));
    try { await hydrateVerifiedIdentity(); }
    catch (error) { accountSession.access = { role: 'user', label: 'User' }; toast(`Signed in, but role verification failed: ${error.message}`); }
  }
  accountMode=accountSession?'account':'guest'; localStorage.setItem(NOVA_MODE_KEY,accountMode); setAccountUI(); closeAccountGate(); syncUniversalProfile?.(); refreshAccessCapabilities?.();
  if (accountSession?.access?.role === 'creator') toast(`Welcome back, ${accountDisplayName()} — Creator access verified.`);
  else toast(accountSession?'NOVA full experience unlocked across supported devices.':'Running in guest mode.');
}
async function restoreAccount(){
  try {
    const raw=localStorage.getItem(NOVA_SESSION_KEY);
    if(!raw) return setAccountUI();
    accountSession=JSON.parse(raw);
    await hydrateVerifiedIdentity();
    accountMode='account'; setAccountUI(); syncUniversalProfile?.(); refreshAccessCapabilities?.();
  } catch {
    localStorage.removeItem(NOVA_SESSION_KEY); accountSession=null; accountMode='guest'; setAccountUI();
  }
}
function setupIdentityLayer(){
  $('signInTab')?.addEventListener('click',()=>openAccountGate('signin')); $('signUpTab')?.addEventListener('click',()=>openAccountGate('signup'));
  $('togglePasswordVisibility')?.addEventListener('change',e=>{const password=$('accountPassword'); if(password) password.type=e.target.checked?'text':'password';});
  $('continueGuest')?.addEventListener('click',closeAccountGate);
  $('accountForm')?.addEventListener('submit',async e=>{e.preventDefault(); const status=$('accountStatus'); status.textContent='Connecting to NOVA Identity…'; try { const d=await accountRequest(accountIntent==='signup'?'/api/auth/signup':'/api/auth/signin',{email:$('accountEmail').value,password:$('accountPassword').value}); if(d.confirmationRequired){status.textContent='Check your email to confirm the account, then sign in.';return;} await finishAccountSession(d); } catch(err){status.textContent=err.message;} });
  $('profileButton')?.addEventListener('contextmenu',e=>{e.preventDefault(); if(accountSession){localStorage.removeItem(NOVA_SESSION_KEY);accountSession=null;accountMode='guest';setAccountUI();toast('Signed out. Guest mode remains available.');} else openAccountGate('signin');});
  $('profileButton')?.addEventListener('click',()=>{if(!accountSession) openAccountGate('signin');});
  restoreAccount();
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.novaInstallPrompt=e;toast('NOVA can be installed on this device. Open the browser menu to install.');});
if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
setupIdentityLayer();

// NOVA 21.2 Universal Assistant: cross-device profile, safety, proactive and install controls.
const NOVA_PROFILE_KEY='nova_universal_profile';
function universalUserId(){return accountSession?.user?.id||'guest';}
async function universalRequest(url,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(accountSession?.access_token)headers.Authorization=`Bearer ${accountSession.access_token}`;const r=await fetch(url,{...options,headers});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d;}
async function syncUniversalProfile(){try{const id=universalUserId();const p=await universalRequest(`/api/profile?user_id=${encodeURIComponent(id)}`);localStorage.setItem(NOVA_PROFILE_KEY,JSON.stringify(p));const a=p.accessibility||{};accessibilityProfile={...accessibilityProfile,largeText:!!a.largeText,highContrast:!!a.highContrast,reduceMotion:!!a.reducedMotion,captions:a.captions!==false,voiceOnly:!!a.voiceFirst,focusMode:!!a.focusMode};saveAccessibilityProfile();applyAccessibilityProfile();$('universalStatus').textContent='Your NOVA preferences are synchronized for this account.';}catch{try{const p=JSON.parse(localStorage.getItem(NOVA_PROFILE_KEY)||'{}');if(p.accessibility){accessibilityProfile={...accessibilityProfile,largeText:!!p.accessibility.largeText,highContrast:!!p.accessibility.highContrast,reduceMotion:!!p.accessibility.reducedMotion,captions:p.accessibility.captions!==false,voiceOnly:!!p.accessibility.voiceFirst,focusMode:!!p.accessibility.focusMode};applyAccessibilityProfile();}}catch{}}}
async function saveUniversalProfile(){const profile={accessibility:{largeText:!!accessibilityProfile.largeText,highContrast:!!accessibilityProfile.highContrast,reducedMotion:!!accessibilityProfile.reduceMotion,captions:!!accessibilityProfile.captions,voiceFirst:!!accessibilityProfile.voiceOnly,focusMode:!!accessibilityProfile.focusMode},interaction:{persona:activePersona},privacy:{localFirst:true}};try{await universalRequest('/api/profile',{method:'PUT',body:JSON.stringify({user_id:universalUserId(),profile})});localStorage.setItem(NOVA_PROFILE_KEY,JSON.stringify(profile));}catch{}}
async function refreshAccessCapabilities(){
  const badge=$('accessLevelBadge'), description=$('accessLevelDescription'), list=$('accessCapabilityList'), notice=$('internalFeaturesNotice');
  try {
    const headers={}; if(accountSession?.access_token) headers.Authorization=`Bearer ${accountSession.access_token}`;
    const response=await fetch('/api/access/capabilities',{headers,cache:'no-store'});
    const policy=await response.json(); if(!response.ok) throw new Error(policy.error||'Access status unavailable');
    const role=policy.role||'guest'; document.body.dataset.novaRole=role;
    if(badge) badge.textContent=policy.label||role;
    if(description) description.textContent=policy.description||'Access is controlled by NOVA security policy.';
    const labels={ 'chat:basic':'Basic chat','chat:full':'Full chat','voice:use':'Voice Studio','camera:use':'Camera & vision','memory:own':'Personal memory','files:own':'Personal files','research:use':'Research tools','accessibility:personalize':'Accessibility settings','profile:own':'Personal profile','restricted:read':'Approved read-only information','*':'All system capabilities' };
    if(list){ list.replaceChildren(); [...new Set(policy.permissions||[])].forEach(permission=>{const chip=document.createElement('span');chip.textContent=labels[permission]||permission;list.append(chip);}); }
    if(notice) notice.textContent=policy.internalFeaturesHidden?'Internal developer tools, access audits, provider secrets and system configuration are hidden for this role.':'Creator access verified. Internal controls are available; changes to sensitive settings should still be reviewed carefully.';
    document.querySelectorAll('.advanced-nav').forEach(el=>el.setAttribute('aria-hidden',String(role!=='creator')));
    return policy;
  } catch(error) { if(badge) badge.textContent='Unavailable'; if(description) description.textContent='NOVA could not verify your access status. Restricted controls stay hidden until verification succeeds.'; document.body.dataset.novaRole=accountSession?'user':'guest'; document.querySelectorAll('.advanced-nav').forEach(el=>el.setAttribute('aria-hidden','true')); return null; }
}

function setupUniversalLayer(){
  [['accessLargeText','largeText'],['accessHighContrast','highContrast'],['accessReduceMotion','reduceMotion'],['accessCaptions','captions'],['accessVoiceOnly','voiceOnly'],['accessFocusMode','focusMode']].forEach(([id])=>$(id)?.addEventListener('change',()=>saveUniversalProfile()));
  $('installNova')?.addEventListener('click',async()=>{if(window.novaInstallPrompt){window.novaInstallPrompt.prompt();await window.novaInstallPrompt.userChoice.catch(()=>{});window.novaInstallPrompt=null;}else toast('On Android, open the browser menu and choose Install app / Add to Home screen.');});
  syncUniversalProfile();
  refreshAccessCapabilities();
  $('refreshAccessCapabilities')?.addEventListener('click',()=>refreshAccessCapabilities());
  window.addEventListener('online',()=>{document.body.classList.remove('nova-offline');toast('NOVA is back online.');flushOfflineQueue();});window.addEventListener('offline',()=>{document.body.classList.add('nova-offline');toast('NOVA is offline. Safe local features remain available.');});
  if(!navigator.onLine)document.body.classList.add('nova-offline');
  setTimeout(async()=>{try{const d=await universalRequest('/api/proactive/evaluate',{method:'POST',body:JSON.stringify({context:{lowConnectivity:!navigator.onLine}})});if(d.suggestions?.length)$('universalStatus').textContent=d.suggestions[0].message;}catch{}},1500);
}
setupUniversalLayer();
flushOfflineQueue();
