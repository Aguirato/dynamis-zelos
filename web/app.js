import {SERVICE_UUID,CHARACTERISTIC_UUID,parsePacket,encodePacket,SignalProcessor,PacketTracker,DemoGenerator} from './core.js';
import {toCSV,summarize} from './session.js';

const $ = id => document.getElementById(id);
const MAX_ROWS = 240000;
let channels = [], mode = 'demo', recording = null, latest = null, history = [], connecting = false;
let lastPaint = 0, demoClock = performance.now(), demoRemainder = 0;
const labels = ['Vastus lateralis','Vastus medialis','Rectus femoris','Biceps femoris'];
let database;
const databaseReady = new Promise((resolve,reject) => {
  const request = indexedDB.open('dynamis-zelos',1);
  request.onupgradeneeded = () => request.result.createObjectStore('sessions',{keyPath:'id'});
  request.onsuccess = () => {database = request.result; resolve(database);};
  request.onerror = () => reject(request.error);
}).catch(() => {notify('Browser storage is unavailable. Export each recording before leaving.', true); return null;});

function notify(message,error=false) { $('notice').textContent=message; $('notice').classList.toggle('error',error); }
function makeChannel(id,label,index) {
  return {id,label,index,processor:new SignalProcessor(),tracker:new PacketTracker(),trace:[],result:null,lastSeen:-Infinity,device:null,characteristic:null,listener:null,reference:null,calibration:null,errors:0,dropped:0,duplicates:0,outOfOrder:0,timingGaps:0,previousTime:null,status:'Waiting',recentClipped:-Infinity};
}
function renderChannels() {
  $('channels').replaceChildren(); $('channel-select').replaceChildren();
  for (const channel of channels) {
    const option = document.createElement('option'); option.value=channel.id; option.textContent=channel.label; $('channel-select').append(option);
    const row=document.createElement('div'); row.className='channel';
    const top=document.createElement('div');top.className='channel-top';
    const input=document.createElement('input');input.value=channel.label;input.maxLength=40;input.setAttribute('aria-label',`Channel ${channel.index+1} muscle label`);
    input.addEventListener('change',()=>{channel.label=input.value.trim()||`Channel ${channel.index+1}`;input.value=channel.label;option.textContent=channel.label;});
    const value=document.createElement('output');value.textContent='—';top.append(input,value);
    const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('span');bar.append(fill);
    const bottom=document.createElement('div');bottom.className='channel-bottom';const quality=document.createElement('span');quality.textContent='Waiting for samples';
    const calibrate=document.createElement('button');calibrate.textContent='Set reference';calibrate.setAttribute('aria-label',`Set reference for channel ${channel.index+1}`);
    calibrate.onclick=()=>{
      if(recording) return notify('Stop recording before changing the reference.',true);
      if(performance.now()-channel.lastSeen>1000||!channel.result?.ready) return notify('Wait for a stable stream before setting a reference.',true);
      channel.calibration={rms:[],remaining:3000};notify(`Recording a 3-second reference for ${channel.label}. Keep a consistent, comfortable contraction.`);
    };
    bottom.append(quality,calibrate);row.append(top,bar,bottom);$('channels').append(row);
    channel.ui={value,fill,quality,calibrate,input};
  }
}
function disconnectAll() {
  for(const channel of channels) {
    if(channel.characteristic && channel.listener) channel.characteristic.removeEventListener('characteristicvaluechanged',channel.listener);
    if(channel.device?.gatt.connected) channel.device.gatt.disconnect();
  }
  channels=[];
}
function startDemo() {
  if(recording||connecting) return notify('Finish the current recording or connection first.',true);
  disconnectAll(); mode='demo';
  channels=labels.map((label,i)=>{const channel=makeChannel(`demo-${i+1}`,label,i);channel.generator=new DemoGenerator({seed:42+i,channel:i});channel.reference=150;channel.processor.setReference(150);channel.status='Synthetic';return channel;});
  demoClock=performance.now(); demoRemainder=0;renderChannels();
  $('source-pill').textContent='DEMO · SYNTHETIC DATA';$('demo-button').textContent='Restart demo';
  notify('Demo running: four synthetic channels. The 150-count reference is illustrative.');
}
async function connectSensor() {
  if(recording||connecting) return notify('Finish the current recording or connection first.',true);
  if(!navigator.bluetooth || !window.isSecureContext) return notify('Live Bluetooth requires a supported Chrome/Edge browser on localhost or HTTPS. Demo is available here.',true);
  if(mode==='ble'&&channels.length>=8)return notify('Eight channels are already assigned. Use Disconnect all to start a new set.',true);
  connecting=true;$('connect-button').disabled=true;
  let device,channel;
  try {
    device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE_UUID]}]});
    if(channels.some(c=>c.device?.id===device.id))throw new Error('This device is already assigned. Disconnect all before reconnecting it.');
    const server=await device.gatt.connect();
    const service=await server.getPrimaryService(SERVICE_UUID);
    const characteristic=await service.getCharacteristic(CHARACTERISTIC_UUID);
    if(mode==='demo'){disconnectAll();mode='ble';}
    channel=makeChannel(`sensor-${channels.length+1}`,device.name||`Sensor ${channels.length+1}`,channels.length);
    channel.device=device;channel.characteristic=characteristic;channel.status='Waiting';
    channel.listener=event=>{
      try{consume(channel,parsePacket(event.target.value));}
      catch(error){channel.errors++;channel.status='Invalid packet';if(channel.errors===1)notify(`Packet rejected: ${error.message}`,true);}
    };
    characteristic.addEventListener('characteristicvaluechanged',channel.listener);
    device.addEventListener('gattserverdisconnected',()=>{
      if(!channels.includes(channel))return;
      channel.status='Disconnected';channel.lastSeen=-Infinity;channel.calibration=null;channel.result=null;
      if(recording)stopRecording('Sensor disconnected; recording stopped.');
      notify(`${channel.label} disconnected. Use Disconnect all, then reconnect.`,true);
    },{once:true});
    channels.push(channel);renderChannels();
    await characteristic.startNotifications();
    $('source-pill').textContent='LIVE · BLUETOOTH';$('demo-button').textContent='Disconnect all';
    notify(`Connected ${channel.label}. Check packet loss and clipping, then set a reference. Physical performance is not yet validated.`);
  }catch(error){
    if(channel){channels=channels.filter(c=>c!==channel);if(channel.characteristic)channel.characteristic.removeEventListener('characteristicvaluechanged',channel.listener);renderChannels();}
    if(device?.gatt.connected&&!channels.some(c=>c.device?.id===device.id))device.gatt.disconnect();
    notify(error.name==='NotFoundError'?'Bluetooth selection cancelled.':`Connection failed: ${error.message}`,error.name!=='NotFoundError');
  }finally{connecting=false;$('connect-button').disabled=false;}
}
function consume(channel,packet) {
  const tracked=channel.tracker.update(packet);
  if(!tracked.accepted){if(tracked.duplicate)channel.duplicates++;else channel.outOfOrder++;return;}
  const timingGap=channel.previousTime!==null&&Math.abs(tracked.timestampUs-channel.previousTime-5000)>500;
  channel.previousTime=tracked.timestampUs;channel.dropped=tracked.totalDropped;
  if(tracked.dropped||timingGap){channel.processor.reset();if(channel.calibration)notify(`Reference capture cancelled for ${channel.label}: the signal was interrupted.`,true);channel.calibration=null;channel.trace.push({timeUs:tracked.timestampUs,value:null});if(timingGap)channel.timingGaps++;}
  channel.lastSeen=performance.now();channel.status=mode==='demo'?'Synthetic':'Streaming';
  for(let i=0;i<packet.samples.length;i++){
    const raw=packet.samples[i],result=channel.processor.push(raw);channel.result=result;
    channel.trace.push({timeUs:tracked.timestampUs+i*1000,value:result.filtered});if(result.clipped)channel.recentClipped=channel.lastSeen;
    if(channel.calibration && result.ready){
      channel.calibration.rms.push(result.rms);
      if(--channel.calibration.remaining<=0){
        const values=channel.calibration.rms;const reference=Math.sqrt(values.reduce((sum,n)=>sum+n*n,0)/values.length);channel.calibration=null;
        if(reference<1||channel.lastSeen-channel.recentClipped<3000)notify('Reference rejected: weak or clipped signal. Adjust the setup and retry.',true);
        else{channel.reference=reference;channel.processor.setReference(reference);notify(`Reference saved for ${channel.label}: ${reference.toFixed(1)} ADC counts RMS.`);}
      }
    }
    if(recording){
      recording.rows.push({session_id:recording.id,source:mode==='demo'?'synthetic':'bluetooth',channel:channel.id,label:channel.label,packet_sequence:packet.sequence,device_time_us:tracked.timestampUs+i*1000,host_elapsed_ms:Math.round(performance.now()-recording.started),raw_adc:raw,filtered_adc:result.filtered,rms_adc:result.rms,reference_rms_adc:channel.reference,relative_reference_percent:result.activation,clipped:result.clipped?1:0});
      if(recording.rows.length>=MAX_ROWS)stopRecording('Capture limit reached (240,000 samples). Recording saved.');
    }
  }
  const oldest=tracked.timestampUs+(packet.samples.length-1)*1000-3000000;
  const first=channel.trace.findIndex(point=>point.timeUs>=oldest);
  if(first>0)channel.trace.splice(0,first);
  if(channel.trace.length>3100)channel.trace.splice(0,channel.trace.length-3100);
}
function startRecording() {
  if(connecting)return notify('Wait for the sensor connection to finish.',true);
  if(channels.some(c=>c.calibration))return notify('Wait for reference capture to finish.',true);
  if(!channels.length||channels.some(c=>performance.now()-c.lastSeen>1000||!c.result?.ready))return notify('All assigned channels need a fresh stream before recording.',true);
  recording={id:crypto.randomUUID(),started:performance.now(),created:new Date().toISOString(),source:mode,rows:[],transportBaseline:new Map(channels.map(c=>[c.id,{lost:c.dropped,invalid:c.errors,timingGaps:c.timingGaps,duplicates:c.duplicates,outOfOrder:c.outOfOrder}]))};
  for(const c of channels)c.ui.input.disabled=true;
  $('record-button').textContent='■ Stop & save';$('connect-button').disabled=true;$('demo-button').disabled=true;
  notify('Recording locally. Keep this tab visible; background throttling can interrupt acquisition.');
}
async function stopRecording(message='Recording saved in this browser.') {
  const capture=recording;if(!capture)return;recording=null;
  for(const c of channels)c.ui.input.disabled=false;
  $('record-button').textContent='● Start recording';$('connect-button').disabled=false;$('demo-button').disabled=false;
  if(!capture.rows.length){notify('Recording was empty. Nothing saved.',true);return;}
  const savedSession={id:capture.id,created:capture.created,source:capture.source,durationMs:performance.now()-capture.started,count:capture.rows.length,summary:summarize(capture.rows),csv:toCSV(capture.rows),transport:channels.map(c=>{const baseline=capture.transportBaseline.get(c.id);return {channel:c.id,lost:c.dropped-baseline.lost,invalid:c.errors-baseline.invalid,timingGaps:c.timingGaps-baseline.timingGaps,duplicates:c.duplicates-baseline.duplicates,outOfOrder:c.outOfOrder-baseline.outOfOrder};})};
  latest=savedSession;$('export-button').disabled=false;history.unshift(savedSession);notify(message);renderHistory();
  const db=await databaseReady;if(!db)return;
  try{await new Promise((resolve,reject)=>{const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put(savedSession);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  catch{notify('Browser storage is full or unavailable. Export CSV now; this recording is only held in memory.',true);}
}
function downloadSession(session){if(!session)return;const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([session.csv],{type:'text/csv;charset=utf-8'}));link.download=`zelos-${session.source}-${session.created.replaceAll(':','-')}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
function renderHistory(){
  const list=$('history-list');list.replaceChildren();$('comparison').hidden=true;
  if(!history.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='Your first session starts in Signal studio. Record a few seconds, then stop to save it here.';list.append(empty);return;}
  history.forEach(session=>{
    const card=document.createElement('section');card.className='panel session-card';
    const detail=document.createElement('div');const title=document.createElement('h2');title.textContent=new Date(session.created).toLocaleString('en-US');
    const description=document.createElement('p');description.textContent=`${session.source==='demo'?'SYNTHETIC':'BLUETOOTH'} · ${(session.durationMs/1000).toFixed(1)} seconds · ${session.count.toLocaleString('en-US')} samples · ${session.summary.length} channels`;
    detail.append(title,description);const controls=document.createElement('div');const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.value=session.id;check.addEventListener('change',renderComparison);label.append(check,' Compare');
    const download=document.createElement('button');download.textContent='↓ CSV';download.onclick=()=>downloadSession(session);controls.append(label,download);card.append(detail,controls);list.append(card);
  });
}
function renderComparison(){
  const selected=[...$('history-list').querySelectorAll('input:checked')].map(input=>history.find(s=>s.id===input.value));$('comparison').hidden=!selected.length;
  const wrap=$('comparison-table');wrap.replaceChildren();wrap.className='table-wrap';const table=document.createElement('table');
  const head=document.createElement('tr');for(const text of ['Session / source','Channel','Samples','Mean RMS','Peak RMS','Clipped samples']){const cell=document.createElement('th');cell.textContent=text;head.append(cell);}table.append(head);
  for(const session of selected)for(const stats of session.summary){const row=document.createElement('tr');for(const value of [new Date(session.created).toLocaleTimeString('en-US')+' / '+session.source,stats.label,stats.samples,stats.meanRms.toFixed(2),stats.peak.toFixed(2),stats.clipped]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}table.append(row);}wrap.append(table);
}
function paint(now){
  $('channel-count').replaceChildren(document.createTextNode(String(channels.filter(c=>now-c.lastSeen<2000).length).padStart(2,'0')));const total=document.createElement('small');total.textContent='/ 08';$('channel-count').append(total);
  const loss=channels.reduce((s,c)=>s+c.dropped,0);$('loss-count').textContent=String(loss);const unit=document.createElement('small');unit.textContent='missing seq.';$('loss-count').append(unit);
  const issues=channels.reduce((s,c)=>s+c.errors+c.timingGaps+c.duplicates+c.outOfOrder,0);
  $('health-note').textContent=mode==='demo'?'Synthetic stream · no radio involved':`${issues} timing / invalid / duplicate / late events`;
  const ms=recording?now-recording.started:latest?.durationMs||0;const seconds=Math.floor(ms/1000);$('duration').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('capture-state').textContent=recording?`${recording.rows.length.toLocaleString('en-US')} / 240,000 samples`:latest?'Last recording · saved locally or ready to export':'Ready to record';
  for(const c of channels){const fresh=now-c.lastSeen<2000;const r=c.result;const value=fresh&&r?.ready?r.activation:null;
    c.ui.value.textContent=value===null?'—':`${value.toFixed(0)}%`;c.ui.fill.style.width=`${Math.min(100,value||0)}%`;
    c.ui.quality.textContent=!fresh?(c.status==='Disconnected'?'Disconnected':'No recent data'):c.calibration?`Reference: ${Math.ceil(c.calibration.remaining/1000)}s`:now-c.recentClipped<1000?'Clipping detected':`${r?.rms.toFixed(1)||'0'} counts · ${c.reference?'reference set':'no reference'}`;
    c.ui.calibrate.disabled=!!recording||!!c.calibration||!fresh;
  }
  drawChart(now);
}
function drawChart(now){
  const canvas=$('signal-chart'),rect=canvas.getBoundingClientRect();if(!rect.width)return;const scale=devicePixelRatio||1;
  if(canvas.width!==Math.round(rect.width*scale)||canvas.height!==Math.round(rect.height*scale)){canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);}
  const ctx=canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);
  const channel=channels.find(c=>c.id===$('channel-select').value)||channels[0];const samples=channel?.trace||[];const max=Math.max(100,...samples.map(point=>Math.abs(point.value||0)))*1.15;
  ctx.font='9px monospace';ctx.textAlign='left';ctx.strokeStyle='#29332c';ctx.fillStyle='#748278';ctx.lineWidth=.6;
  for(let i=0;i<5;i++){const y=10+(h-20)*i/4;ctx.beginPath();ctx.moveTo(33,y);ctx.lineTo(w,y);ctx.stroke();ctx.fillText(Math.round(max*(1-i/2)),0,y+3);}
  for(let i=0;i<7;i++){const x=33+(w-33)*i/6;ctx.beginPath();ctx.moveTo(x,10);ctx.lineTo(x,h-10);ctx.stroke();}
  if(channel&&now-channel.lastSeen<2000){ctx.strokeStyle='#f9d342';ctx.lineWidth=1.1;ctx.beginPath();let drawing=false;const step=Math.max(1,Math.floor(3000/(w*2)));const endTime=samples.at(-1)?.timeUs||0;
    for(let i=0;i<samples.length;i++){const point=samples[i];if(point.value===null){drawing=false;continue;}if(drawing&&i%step!==0&&i!==samples.length-1)continue;const x=33+(w-33)*(1-(endTime-point.timeUs)/3000000),y=h/2-point.value/max*(h-20)/2;if(drawing)ctx.lineTo(x,y);else ctx.moveTo(x,y);drawing=true;}ctx.stroke();
  }
  $('signal-info').textContent=channel?`${channel.label} · 100 ms RMS window`:'Connect a sensor to see its signal';
}
function tick(now){
  if(mode==='demo'){
    const elapsed=Math.min(now-demoClock,1000);demoClock=now;demoRemainder+=elapsed;
    while(demoRemainder>=5){for(const channel of channels)consume(channel,parsePacket(encodePacket(channel.generator.nextPacket())));demoRemainder-=5;}
  }
  if(recording&&mode==='ble'&&channels.some(c=>now-c.lastSeen>2000))stopRecording('Stream timed out. Recording stopped; inspect the connection.');
  if(now-lastPaint>80){paint(now);lastPaint=now;}requestAnimationFrame(tick);
}
for(const button of document.querySelectorAll('.nav'))button.onclick=()=>{document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!==`${button.dataset.view}-view`);$('page-name').textContent=button.dataset.view==='live'?'SIGNAL STUDIO':button.dataset.view==='history'?'SESSION LIBRARY':'CONNECT HARDWARE';if(button.dataset.view==='history')renderHistory();};
$('demo-button').onclick=()=>{if(mode==='ble') {if(recording||connecting)return;disconnectAll();}startDemo();};
$('connect-button').onclick=connectSensor;$('record-button').onclick=()=>recording?stopRecording():startRecording();$('export-button').onclick=()=>downloadSession(latest);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording)stopRecording('Tab became hidden. Recording stopped to avoid misleading timing.');});
window.addEventListener('beforeunload',event=>{if(recording){event.preventDefault();event.returnValue='';}});
databaseReady.then(db=>{if(!db)return;const request=db.transaction('sessions').objectStore('sessions').getAll();request.onsuccess=()=>{history=[...new Map([...history,...request.result].map(s=>[s.id,s])).values()].sort((a,b)=>b.created.localeCompare(a.created));renderHistory();};});
startDemo();requestAnimationFrame(tick);
