(() => {
  // 1) Firebase жобасын Firebase Console-дан ашып, төмендегі конфигурацияны өз жобаңызбен ауыстырыңыз.
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
  };
  const firebaseReady = firebaseConfig.apiKey !== "YOUR_API_KEY";
  let db = null, roomRef = null, roomCode = "", playerId = "", myName = "", isHost = false;
  let localRoom = null, unsubscribe = null, selectedCategories = [], toastTimer = null;
  const $ = id => document.getElementById(id);
  const screens = ["home","setup","join","lobby","round","result"];
  const icons = {"Танымал адамдар":"✦","Спорт":"⚡","Место":"⌖","Машина маркасы":"◈","Мемлекеттер":"◎"};
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600)}
  function showScreen(id){screens.forEach(s=>$(s).classList.toggle("active",s===id));window.scrollTo({top:0,behavior:"smooth"})}
  function initFirebase(){
    if(!firebaseReady){toast("Алдымен app.js ішіндегі Firebase конфигурациясын толтыр.");return false}
    if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
    db=firebase.database();return true;
  }
  function randomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let out="";for(let i=0;i<6;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out}
  function uid(){return "p_"+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-3)}
  function makePlayer(name){return {name:name.trim().slice(0,18),ready:false,score:0,joinedAt:Date.now()}}
  function drawPlayers(room){
    const entries=Object.entries(room.players||{}).sort((a,b)=>a[1].joinedAt-b[1].joinedAt);
    $("playerCount").textContent=`${entries.length} / 4 ойыншы`;
    $("players").innerHTML=entries.map(([id,p],i)=>`<div class="player"><div class="avatar">${esc((p.name||"?").slice(0,1).toUpperCase())}</div><div class="player-info"><strong>${esc(p.name)}${id===room.hostId?' · HOST':''}</strong><small>${id===playerId?'Сенің профилің':'Ойыншы '+(i+1)}</small></div><span class="player-state ${p.ready?'ready':''}">${p.ready?'✓ Дайын':'Күтуде'}</span></div>`).join("");
    $("lobby-controls").classList.toggle("hidden",room.phase==="category");
    $("readyBtn").disabled=entries.length<4||room.phase!=="lobby";
    $("readyBtn").style.opacity=$("readyBtn").disabled?".5":"1";
    $("readyBtn").textContent=(room.players[playerId]?.ready?"✓ ДАЙЫНСЫҢ":"✓ ДАЙЫНБЫН");
    $("readyBtn").classList.toggle("is-ready",!!room.players[playerId]?.ready);
    $("lobbyHint").textContent=entries.length<4?`Тағы ${4-entries.length} ойыншы қосылсын. Категория 4 адам жиналғанда ашылады.`:"4 ойыншы жиналды. Категорияны таңдаңдар.";
    $("statusBadge").textContent=room.phase==="lobby"?"КҮТУДЕ":room.phase==="category"?"КАТЕГОРИЯ":"ОЙЫНДА";
    $("next-round").style.display=isHost?"flex":"none";
    $("backLobby").style.display=isHost?"flex":"none";
    drawScores(room,$("scores"));
  }
  function drawScores(room,target){
    const entries=Object.entries(room.players||{}).sort((a,b)=>(b[1].score||0)-(a[1].score||0));
    target.innerHTML=entries.map(([id,p],i)=>`<div class="score-row"><span class="score-rank">${String(i+1).padStart(2,"0")}</span><span class="score-name">${esc(p.name)}${id===playerId?' (сен)':''}</span><span class="score-points">${p.score||0} ұпай</span></div>`).join("")||'<p class="muted">Әзірге ұпай жоқ.</p>';
  }
  function categoryHtml(room){
    const selected=room.selectedCategories||[];
    return `<div class="category-selection"><div class="kicker">КАТЕГОРИЯ ТАҢДАУ</div><h3>Қай тақырыпта ойнаймыз?</h3><p class="muted">Әр ойыншы бір немесе бірнеше категорияны белгілей алады. Барлығы дайын болғанда раунд басталады.</p><div class="category-grid">${Object.keys(window.SPYCATEGORIES).map(cat=>`<button class="category-choice ${selected.includes(cat)?'selected':''}" data-cat="${esc(cat)}"><span class="cat-icon">${icons[cat]||'✦'}</span><span>${esc(cat)}<small style="display:block;color:#8995b3;font-size:9px;margin-top:4px">${window.SPYCATEGORIES[cat].length} сөз</small></span><span class="tick">${selected.includes(cat)?'✓':''}</span></button>`).join("")}</div><button id="categoryReady" class="btn ready full">${room.players[playerId]?.categoryReady?'✓ КАТЕГОРИЯҒА ДАЙЫНСЫҢ':'✓ ТАҢДАУҒА ДАЙЫНБЫН'}</button><p class="category-summary">${selected.length?`Таңдалды: ${selected.map(esc).join(", ")}`:"Әзірге категория таңдалмады."}</p><p class="muted center">Барлық ойыншы дайын болса, ойын басталады.</p></div>`;
  }
  function renderRound(room){
    const round=room.roundData||{};
    $("roundNumber").textContent="ROUND "+String(room.roundNo||1).padStart(2,"0");
    $("roundTitle").textContent="Сенің рөлің";
    $("secretWord").textContent="••••••••";$("secretWord").classList.remove("hidden");
    $("spyHint").classList.add("hidden");$("revealBtn").classList.remove("hidden");$("hideWordBtn").classList.add("hidden");
    $("guessPanel").classList.add("hidden");$("roundWaiting").classList.add("hidden");
    const myRole=(round.roles||{})[playerId];
    if(myRole==="spy"){
      $("roleSymbol").textContent="◉";$("roleLabel").textContent="СЕН — ШПИОН";$("roleMain").textContent="Сөзді тап."; $("roleDescription").textContent="Қалған ойыншылармен сөйлес. Құпия сөзді білмейсің.";
      $("spyHint").textContent="Кеңес: "+(round.hint||"құпия");$("spyHint").classList.remove("hidden");
      $("revealBtn").textContent="КЕҢЕСТІ КӨРСЕТУ";
    }else{
      $("roleSymbol").textContent="✦";$("roleLabel").textContent="ҚҰПИЯ РӨЛ";$("roleMain").textContent="Сөзді есіңде сақта."; $("roleDescription").textContent="Сөзіңді басқаларға тікелей айтпа. Күдік тудырмай жауап бер.";
      $("revealBtn").textContent="ҚҰПИЯ СӨЗДІ КӨРСЕТУ";
    }
    if(myRole==="spy"){$("guessPanel").classList.remove("hidden");$("roundWaiting").classList.add("hidden");}
    else{$("guessPanel").classList.add("hidden");$("roundWaiting").classList.remove("hidden");}
    $("roundScores").innerHTML="";drawScores(room,$("roundScores"));
  }
  function renderResult(room){
    const r=room.lastResult||{};
    $("resultTitle").textContent=r.winner==="spy"?"🕵️ Шпион жеңді!":"🏆 Ойыншылар жеңді!";
    $("resultText").textContent=r.winner==="spy"?`${r.spyName} жасырылған сөзді дұрыс тапты.`:`${r.spyName} сөзді таба алмады. Қалған ойыншылар жеңді.`;
    $("resultWord").textContent=`Құпия сөз: ${r.word||"—"} · Шпион: ${r.spyName||"—"}`;
    drawScores(room,$("resultScores"));
  }
  function renderRoom(room){
    if(!room)return;localRoom=room;
    $("roomCodeLabel").textContent=roomCode;$("copyCode").innerHTML=roomCode+" ⧉";
    drawPlayers(room);
    if(room.phase==="lobby"){
      $("rightTitle").textContent="Ойын ережесі";$("rightSub").textContent="Бөлме дайындалып жатыр";
      $("rightContent").innerHTML='<div class="big-icon">◎</div><h3>Бір ғана шпион.</h3><p>4 ойыншы қосылғанда категория таңдау ашылады. Барлығы категорияны белгілеп, дайын болғанда раунд басталады.</p>';
      showScreen("lobby");
    } else if(room.phase==="category"){
      $("rightTitle").textContent="Категория";$("rightSub").textContent="Барлығы келіссін";
      $("rightContent").innerHTML=categoryHtml(room);
      $("rightContent").querySelectorAll("[data-cat]").forEach(btn=>btn.addEventListener("click",()=>toggleCategory(btn.dataset.cat)));
      const ready=$("categoryReady");if(ready)ready.addEventListener("click",toggleCategoryReady);
      showScreen("lobby");
    } else if(room.phase==="playing"){
      renderRound(room);showScreen("round");
    } else if(room.phase==="result"){
      renderResult(room);showScreen("result");
    }
  }
  function subscribeRoom(){
    if(unsubscribe)unsubscribe();
    roomRef=db.ref("rooms/"+roomCode);
    const cb=snap=>{const data=snap.val();if(!data){toast("Бөлме табылмады немесе жабылды.");return}renderRoom(data);
      if(isHost && data.phase==="category"){
        const ps=Object.values(data.players||{});
        if(ps.length===4 && ps.every(p=>p.categoryReady) && (data.selectedCategories||[]).length) startRound(data);
      }
    };
    roomRef.on("value",cb);unsubscribe=()=>roomRef.off("value",cb);
  }
  async function createRoom(){
    if(!initFirebase())return;
    myName=$("hostName").value.trim();if(!myName){toast("Атыңды енгіз.");return}
    const btn=$("createBtn");btn.disabled=true;
    try{
      let code,ref,snap;
      do{code=randomCode();ref=db.ref("rooms/"+code);snap=await ref.get()}while(snap.exists());
      playerId=uid();isHost=true;roomCode=code;
      const room={code,hostId:playerId,phase:"lobby",roundNo:0,players:{[playerId]:makePlayer(myName)},selectedCategories:[],createdAt:Date.now()};
      await ref.set(room);subscribeRoom();showScreen("lobby");toast("Бөлме құрылды! Кодты достарыңа жібер.");
    }catch(e){console.error(e);toast("Бөлме құру сәтсіз. Firebase баптауларын тексер.")}finally{btn.disabled=false}
  }
  async function joinRoom(){
    if(!initFirebase())return;
    roomCode=$("joinCode").value.trim().toUpperCase();myName=$("joinName").value.trim();
    if(!/^[A-Z0-9]{6}$/.test(roomCode)){toast("6 таңбалы бөлме кодын дұрыс енгіз.");return}
    if(!myName){toast("Ойыншы атыңды енгіз.");return}
    const btn=$("joinBtn");btn.disabled=true;
    try{
      const ref=db.ref("rooms/"+roomCode),snap=await ref.get();
      if(!snap.exists()){toast("Мұндай кодты бөлме табылмады.");return}
      const room=snap.val(),count=Object.keys(room.players||{}).length;
      if(count>=4){toast("Бөлме толып тұр. Ең көбі 4 ойыншы.");return}
      if(room.phase!=="lobby"){toast("Бұл бөлмеде ойын басталып кеткен.");return}
      playerId=uid();isHost=false;
      await ref.child("players/"+playerId).set(makePlayer(myName));
      if(count+1===4 && room.phase==="lobby") await ref.update({phase:"category",selectedCategories:[]});
      subscribeRoom();showScreen("lobby");toast("Бөлмеге сәтті қосылдың!");
    }catch(e){console.error(e);toast("Қосылу мүмкін болмады. Firebase баптауын тексер.")}finally{btn.disabled=false}
  }
  async function toggleReady(){
    if(!roomRef||!localRoom)return;
    const current=!!localRoom.players[playerId]?.ready;
    await roomRef.child("players/"+playerId+"/ready").set(!current);
    const snap=await roomRef.get(),room=snap.val(),players=Object.values(room.players||{});
    if(players.length>=3&&players.length<=4&&players.every(p=>p.ready)&&room.phase==="lobby"){
      await roomRef.update({phase:"category",selectedCategories:[]});
      await roomRef.child("players").get().then(s=>{const updates={};s.forEach(p=>updates[p.key+"/categoryReady"]=false);return roomRef.child("players").update(updates)});
    }
  }
  async function toggleCategory(cat){
    if(!roomRef||!localRoom||localRoom.phase!=="category")return;
    const arr=[...(localRoom.selectedCategories||[])];const i=arr.indexOf(cat);if(i>=0)arr.splice(i,1);else arr.push(cat);
    // Category selection is room-wide and updated live; any player may adjust it.
    await roomRef.child("selectedCategories").set(arr);
    await roomRef.child("players/"+playerId+"/categoryReady").set(false);
  }
  async function toggleCategoryReady(){
    if(!roomRef||!localRoom)return;
    const cur=!!localRoom.players[playerId]?.categoryReady;
    await roomRef.child("players/"+playerId+"/categoryReady").set(!cur);
    const snap=await roomRef.get(),room=snap.val(),players=Object.values(room.players||{});
    if(players.length>=3&&players.every(p=>p.categoryReady)&&room.selectedCategories?.length){
      if(room.hostId===playerId) await startRound(room);
      else toast("Барлығы дайын! Бөлме иесі раундты бастайды.");
    } else if(!room.selectedCategories?.length) toast("Алдымен кемінде бір категория таңда.");
  }
  const hintByCategory={
    "Танымал адамдар":"жұлдыз",
    "Спорт":"жарыс",
    "Место":"саяхат",
    "Машина маркасы":"жылдамдық",
    "Мемлекеттер":"карта"
  };
  function normalize(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("kk").replace(/[^a-zа-яәіңғүұқөһё0-9]/gi,"")}
  async function startRound(roomArg){
    if(!isHost){toast("Раундты бөлме иесі бастайды.");return}
    const snap=await roomRef.get(),room=snap.val()||roomArg;
    const players=Object.keys(room.players||{}),cats=room.selectedCategories||[];
    if(players.length<3||!players.every(id=>room.players[id].categoryReady)||!cats.length){toast("Барлық ойыншы дайын болып, категория таңдалуы керек.");return}
    const cat=cats[Math.floor(Math.random()*cats.length)],list=window.SPYCATEGORIES[cat]||[];
    const word=list[Math.floor(Math.random()*list.length)];
    const spy=players[Math.floor(Math.random()*players.length)],roles={};
    players.forEach(id=>roles[id]=id===spy?"spy":"player");
    const roundData={category:cat,word,spyId:spy,roles,hint:hintByCategory[cat]||"Әңгімеге мұқият құлақ түр.",startedAt:Date.now(),guess:null};
    const updates={phase:"playing",roundNo:(room.roundNo||0)+1,roundData};
    const pUpdates={};players.forEach(id=>pUpdates[id+"/ready"]=false);players.forEach(id=>pUpdates[id+"/categoryReady"]=false);
    await roomRef.update(updates);await roomRef.child("players").update(pUpdates);
  }
  async function submitGuess(){
    if(!roomRef||!localRoom)return;
    const r=localRoom.roundData||{};
    if(r.spyId!==playerId){toast("Тек шпион ғана сөзді болжай алады.");return}
    const guess=$("guessInput").value.trim();if(!guess){toast("Алдымен сөзді жаз.");return}
    const correct=normalize(guess)===normalize(r.word);
    const snap=await roomRef.get(),room=snap.val(),players=room.players||{},updates={};
    Object.keys(players).forEach(id=>{
      let add=0;
      if(correct&&id===r.spyId)add=3;
      if(!correct&&id!==r.spyId)add=1;
      updates[id+"/score"]=(players[id].score||0)+add;
    });
    await roomRef.child("players").update(updates);
    await roomRef.update({phase:"result",lastResult:{winner:correct?"spy":"players",spyName:players[r.spyId]?.name||"Шпион",word:r.word,category:r.category,guess,correct}});
  }
  async function nextRound(){
    if(!roomRef||!localRoom)return;
    if(!isHost){toast("Келесі раундты бөлме иесі бастайды.");return}
    const snap=await roomRef.get(),room=snap.val(),players=room.players||{},updates={};
    Object.keys(players).forEach(id=>{updates[id+"/ready"]=false;updates[id+"/categoryReady"]=false});
    await roomRef.child("players").update(updates);
    await roomRef.update({phase:"lobby",selectedCategories:[],roundData:null,lastResult:null});
  }
  $("startBtn").addEventListener("click",()=>showScreen("setup"));
  $("joinScreenBtn").addEventListener("click",()=>showScreen("join"));
  document.querySelectorAll("[data-back]").forEach(b=>b.addEventListener("click",()=>showScreen("home")));
  $("createBtn").addEventListener("click",createRoom);$("joinBtn").addEventListener("click",joinRoom);
  $("joinCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));
  $("readyBtn").addEventListener("click",toggleReady);
  $("copyCode").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomCode);toast("Бөлме коды көшірілді: "+roomCode)}catch{toast("Бөлме коды: "+roomCode)}});
  $("revealBtn").addEventListener("click",()=>{
    if(!localRoom)return;const r=localRoom.roundData||{},role=(r.roles||{})[playerId];
    if(role==="spy"){$("spyHint").classList.remove("hidden");$("revealBtn").classList.add("hidden");$("hideWordBtn").classList.remove("hidden");}
    else{$("secretWord").textContent=r.word||"—";$("revealBtn").classList.add("hidden");$("hideWordBtn").classList.remove("hidden");}
  });
  $("hideWordBtn").addEventListener("click",()=>{
    $("secretWord").textContent="••••••••";$("spyHint").classList.add("hidden");$("hideWordBtn").classList.add("hidden");$("revealBtn").classList.remove("hidden");
    if(localRoom?.roundData?.spyId===playerId){$("guessPanel").classList.remove("hidden");$("roundWaiting").classList.add("hidden");}
    else{$("roundWaiting").classList.remove("hidden");}
  });
  $("guessBtn").addEventListener("click",submitGuess);
  $("next-round").addEventListener("click",nextRound);
  $("backLobby").addEventListener("click",()=>{if(isHost)nextRound();else toast("Келесі раундты бөлме иесі бастайды.")});
  // UI shows the guess box only for the spy.
  const originalRenderRound=renderRound;
  // Category selection is deliberately available after all connected players mark ready.
  // Firebase realtime listeners keep all phones in sync.
})();