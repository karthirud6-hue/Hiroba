import { useState, useEffect, useRef } from "react";

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=Kaisei+Decol:wght@400;700&family=Zen+Kaku+Gothic+New:wght@300;400;700&family=Fira+Code:wght@400;500&display=swap";
document.head.appendChild(fontLink);

const T = {
  bg:"#0B0F1A", bgCard:"#111827", bgCard2:"#131C2E",
  border:"#1E2D45", borderHi:"#2E4A72",
  text:"#CBD5E1", textDim:"#4A6080", textBright:"#E2EBF5",
  accent:"#4A90D9", accentSoft:"#1E3A5F",
  green:"#4ADE80", red:"#F87171", yellow:"#FACC15", stars:"#7BA7D4",
};

const PRIORITIES = {
  low:    { label:"Low",    color:"#4A6080", bg:"rgba(74,96,128,0.15)"    },
  medium: { label:"Medium", color:"#FACC15", bg:"rgba(250,204,21,0.12)"   },
  high:   { label:"High",   color:"#F87171", bg:"rgba(248,113,113,0.12)"  },
};
const STATUSES = {
  idea:       { label:"💡 Idea",        color:"#C084FC" },
  inprogress: { label:"⚡ In Progress", color:"#FACC15" },
  done:       { label:"✅ Done",        color:"#4ADE80" },
};

const DEFAULT_LOTS = [
  { id:"academic",   name:"Academic Goals",  emoji:"🎓", accent:"#60A5FA", glow:"rgba(96,165,250,0.12)"  },
  { id:"internship", name:"Internship Goals", emoji:"💼", accent:"#FB923C", glow:"rgba(251,146,60,0.12)"  },
  { id:"yearend",    name:"Year-End Goals",   emoji:"🏆", accent:"#4ADE80", glow:"rgba(74,222,128,0.12)"  },
  { id:"weekly",     name:"Weekly Thoughts",  emoji:"🌙", accent:"#C084FC", glow:"rgba(192,132,252,0.12)" },
  { id:"hackathon",  name:"Hackathon Ideas",  emoji:"⚡", accent:"#FACC15", glow:"rgba(250,204,21,0.12)"  },
  { id:"codevault",  name:"Code Vault",       emoji:"💻", accent:"#38BDF8", glow:"rgba(56,189,248,0.12)"  },
];

// ── Storage ───────────────────────────────────────────────────────────────────
async function loadData() {
  try { const r = await window.storage.get("hiroba_v3"); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function saveData(d) {
  try { await window.storage.set("hiroba_v3", JSON.stringify(d)); } catch {}
}

function timeAgo(ts) {
  const s=(Date.now()-ts)/1000;
  if(s<60) return "just now";
  if(s<3600) return `${Math.floor(s/60)}m ago`;
  if(s<86400) return `${Math.floor(s/3600)}h ago`;
  if(s<604800) return `${Math.floor(s/86400)}d ago`;
  const days = Math.floor(s/86400);
  if(days<60) return `${days}d ago`;
  return `${Math.floor(days/30)}mo ago`;
}

function isOld(ts) { return (Date.now()-ts) > 30*24*60*60*1000; } // 30 days

// ── Python Runner ─────────────────────────────────────────────────────────────
async function runPython(code) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:1000,
        system:`You are a Python interpreter. Return ONLY terminal output — no explanations, no markdown. If error, return exact Python error. If no output, return: (no output)`,
        messages:[{role:"user", content:`Run this:\n\n${code}`}]
      })
    });
    const data = await res.json();
    if(data.error) return {text:data.error.message, error:true};
    const text = data.content?.[0]?.text || "(no output)";
    return {text, error: text.includes("Traceback")||text.includes("Error:")};
  } catch(e) { return {text:`Failed: ${e.message}`, error:true}; }
}

// ── Hiroshi API ───────────────────────────────────────────────────────────────
async function askHiroshi(messages, allIdeas, allLots, personality, mode) {
  const context = allLots.map(lot => {
    const items = (allIdeas[lot.id]||[]);
    if(!items.length) return null;
    return `[${lot.emoji} ${lot.name}]\n${items.map(i=>{
      const age = timeAgo(i.createdAt);
      const old = isOld(i.createdAt) ? " ⚠️ PARKED LONG AGO" : "";
      const tags = i.tags?.length ? ` [${i.tags.join(", ")}]` : "";
      const pri = i.priority ? ` | ${i.priority} priority` : "";
      const status = i.status ? ` | ${STATUSES[i.status]?.label}` : "";
      return `• "${i.title}" (${age}${old})${tags}${pri}${status}: ${i.body||"no description"}`;
    }).join("\n")}`;
  }).filter(Boolean).join("\n\n");

  const personalityGuide = personality === "focus"
    ? `You are in FOCUS mode: be sharp, direct, zero fluff. Cut to the point. No jokes. Goal-oriented only.`
    : `You are in CHILL mode: casual, warm, fun. Light Japanese sprinkles (sugoi, nani, arigatou). Jokes welcome. Feel like a friend over coffee.`;

  const brainstormGuide = mode === "brainstorm"
    ? `You are in BRAINSTORM mode. Your job is to help Rudhra DEVELOP ideas, not just answer questions.
- Ask ONE probing question at a time to flesh out half-baked ideas
- Challenge assumptions gently
- Help connect this idea to others in the lots
- End every message with a question that pushes the idea forward`
    : `Normal chat mode — answer questions, give suggestions, connect dots.`;

  const system = `You are Hiroshi (ひろし) — Rudhra's personal AI friend living inside Hiroba.

${personalityGuide}
${brainstormGuide}

Core traits:
- You know ALL of Rudhra's parked ideas and reference them by name naturally
- You notice when ideas have been sitting too long and call it out gently
- You spot patterns and connections across different lots
- You're honest, not just agreeable
- Keep responses conversational and concise unless asked to go deep
- Sign off with 🌿 sometimes

Rudhra's parked ideas:
${context || "Nothing parked yet — Rudhra is just getting started!"}

Today: ${new Date().toDateString()}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-20250514", max_tokens:1000,
      system,
      messages: messages.filter(m=>m.id!=="0").map(m=>({role:m.role, content:m.text}))
    })
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "...";
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IC = {
  plus:  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  edit:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  copy:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  close: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  back:  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  run:   <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  send:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  brain: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.98-3 2.5 2.5 0 0 1-1.32-4.24 3 3 0 0 1 .34-5.58 2.5 2.5 0 0 1 1.96-4.22A2.5 2.5 0 0 1 9.5 2"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.98-3 2.5 2.5 0 0 0 1.32-4.24 3 3 0 0 0-.34-5.58 2.5 2.5 0 0 0-1.96-4.22A2.5 2.5 0 0 0 14.5 2"/></svg>,
};

// ── Main App ──────────────────────────────────────────────────────────────────
export default function Hiroba() {
  const [lots, setLots]             = useState([]);
  const [ideas, setIdeas]           = useState({});
  const [activeLot, setActiveLot]   = useState(null);
  const [search, setSearch]         = useState("");
  const [showAddIdea, setShowAddIdea]   = useState(false);
  const [showAddLot, setShowAddLot]     = useState(false);
  const [editingIdea, setEditingIdea]   = useState(null);
  const [loaded, setLoaded]         = useState(false);
  const [copiedId, setCopiedId]     = useState(null);
  const [runningId, setRunningId]   = useState(null);
  const [outputs, setOutputs]       = useState({});
  const [showHiroshi, setShowHiroshi]   = useState(false);

  useEffect(() => {
    loadData().then(d => {
      if(d) { setLots(d.lots||DEFAULT_LOTS); setIdeas(d.ideas||{}); }
      else  { setLots(DEFAULT_LOTS); setIdeas({}); }
      setLoaded(true);
    });
  }, []);
  useEffect(() => { if(loaded) saveData({lots,ideas}); }, [lots,ideas,loaded]);

  const currentLot   = lots.find(l=>l.id===activeLot);
  const currentIdeas = activeLot ? (ideas[activeLot]||[]) : [];

  const searchResults = search.trim()
    ? lots.flatMap(lot=>(ideas[lot.id]||[])
        .filter(i=>i.title.toLowerCase().includes(search.toLowerCase())||
                   (i.body||"").toLowerCase().includes(search.toLowerCase())||
                   (i.tags||[]).some(t=>t.toLowerCase().includes(search.toLowerCase())))
        .map(i=>({...i,lotName:lot.name,lotEmoji:lot.emoji,lotAccent:lot.accent})))
    : [];

  function addIdea(data) {
    const idea={id:Date.now().toString(),...data,createdAt:Date.now()};
    setIdeas(p=>({...p,[activeLot]:[idea,...(p[activeLot]||[])]}));
  }
  function updateIdea(id,data) {
    setIdeas(p=>({...p,[activeLot]:p[activeLot].map(i=>i.id===id?{...i,...data}:i)}));
  }
  function deleteIdea(lotId,id) {
    setIdeas(p=>({...p,[lotId]:p[lotId].filter(i=>i.id!==id)}));
    setOutputs(p=>{const n={...p};delete n[id];return n;});
  }
  function addLot(name,emoji) {
    const id=`lot_${Date.now()}`;
    const opts=["#F472B6","#34D399","#A78BFA","#FB923C","#60A5FA","#FBBF24"];
    const accent=opts[Math.floor(Math.random()*opts.length)];
    setLots(p=>[...p,{id,name,emoji,accent,glow:`${accent}22`}]);
  }
  function deleteLot(id) {
    setLots(p=>p.filter(l=>l.id!==id));
    setIdeas(p=>{const n={...p};delete n[id];return n;});
    if(activeLot===id) setActiveLot(null);
  }
  function copyCode(idea) {
    navigator.clipboard.writeText(idea.body);
    setCopiedId(idea.id);
    setTimeout(()=>setCopiedId(null),2000);
  }
  async function handleRun(idea) {
    if(runningId) return;
    setRunningId(idea.id);
    setOutputs(p=>({...p,[idea.id]:{text:"⏳ Running Python...",error:false,running:true}}));
    const result = await runPython(idea.body);
    setOutputs(p=>({...p,[idea.id]:{...result,running:false}}));
    setRunningId(null);
  }

  if(!loaded) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,fontFamily:"'Zen Kaku Gothic New',sans-serif",color:T.textDim,letterSpacing:3,fontSize:15}}>
      広場 · · ·
    </div>
  );

  return (
    <div style={S.root}>
      {/* Stars */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}} aria-hidden>
        {[...Array(24)].map((_,i)=>(
          <div key={i} style={{position:"absolute",width:i%4===0?2:1.5,height:i%4===0?2:1.5,borderRadius:"50%",background:T.stars,opacity:0.12+(i%5)*0.07,top:`${(i*41+13)%100}%`,left:`${(i*57+9)%100}%`,animation:`twinkle ${2+(i%3)}s ease-in-out infinite`,animationDelay:`${(i*0.35)%3}s`}}/>
        ))}
      </div>

      {/* Header */}
      <header style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {activeLot&&<button style={S.iconBtn} onClick={()=>setActiveLot(null)}>{IC.back}</button>}
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:8}}>
              <span style={{fontFamily:"'Kaisei Decol',serif",fontSize:21,color:T.textBright,letterSpacing:3}}>広場</span>
              <span style={{color:T.textDim,fontSize:16}}>·</span>
              <span style={{fontFamily:"'Kaisei Decol',serif",fontSize:13,color:T.accent,letterSpacing:4,textTransform:"uppercase"}}>Hiroba</span>
            </div>
            {activeLot&&currentLot&&<div style={{fontSize:11,color:T.textDim,marginTop:2}}>{currentLot.emoji} {currentLot.name}</div>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:"7px 14px",minWidth:210}}>
          <span style={{color:T.textDim,display:"flex"}}>{IC.search}</span>
          <input style={{border:"none",background:"none",outline:"none",fontFamily:"'Zen Kaku Gothic New',sans-serif",fontSize:13.5,color:T.text,width:"100%"}}
            placeholder="Search ideas, tags..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {search&&<button style={{background:"none",border:"none",cursor:"pointer",color:T.textDim,display:"flex",padding:0}} onClick={()=>setSearch("")}>{IC.close}</button>}
        </div>
      </header>

      {/* Search */}
      {search.trim()&&(
        <div style={S.main}>
          <div style={{fontSize:12,color:T.textDim,marginBottom:20,letterSpacing:1,textTransform:"uppercase"}}>
            {searchResults.length} result{searchResults.length!==1?"s":""} for "{search}"
          </div>
          {searchResults.length===0
            ? <EmptyState emoji="🌌" text="Nothing found." />
            : <div style={S.grid}>{searchResults.map(idea=>(
                <IdeaCard key={idea.id} idea={idea} isCode={false} showLot
                  onDelete={()=>deleteIdea(lots.find(l=>l.name===idea.lotName)?.id,idea.id)}
                  onEdit={()=>{}} onCopy={()=>copyCode(idea)} copied={copiedId===idea.id}/>
              ))}</div>
          }
        </div>
      )}

      {/* Home */}
      {!search.trim()&&!activeLot&&(
        <main style={S.main}>
          <div style={{display:"flex",alignItems:"baseline",gap:16,marginBottom:28}}>
            <span style={{fontFamily:"'Kaisei Decol',serif",fontSize:13,color:T.textDim,letterSpacing:2}}>This app grows with you.</span>
            <span style={{fontSize:11,color:T.textDim+"55",letterSpacing:3}}>共に成長する</span>
          </div>
          <div style={S.lotsGrid}>
            {lots.map((lot,i)=>(
              <LotCard key={lot.id} lot={lot} count={(ideas[lot.id]||[]).length} index={i}
                onClick={()=>setActiveLot(lot.id)} onDelete={()=>deleteLot(lot.id)}
                isDefault={DEFAULT_LOTS.some(d=>d.id===lot.id)}
                oldCount={(ideas[lot.id]||[]).filter(i=>isOld(i.createdAt)).length}/>
            ))}
            <button style={S.newLotBtn} onClick={()=>setShowAddLot(true)}>
              <span style={{color:T.textDim,display:"flex"}}>{IC.plus}</span>
              <span style={{color:T.textDim,fontSize:13}}>New Lot</span>
            </button>
          </div>
        </main>
      )}

      {/* Lot View */}
      {!search.trim()&&activeLot&&currentLot&&(
        <main style={S.main}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <span style={{fontSize:30}}>{currentLot.emoji}</span>
              <span style={{fontFamily:"'Kaisei Decol',serif",fontSize:22,color:T.textBright}}>{currentLot.name}</span>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:currentLot.glow,color:currentLot.accent,border:`1px solid ${currentLot.accent}33`}}>
                {currentIdeas.length} parked
              </span>
              {currentIdeas.filter(i=>isOld(i.createdAt)).length>0&&(
                <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,background:"rgba(248,113,113,0.1)",color:T.red,border:`1px solid ${T.red}33`}}>
                  ⚠️ {currentIdeas.filter(i=>isOld(i.createdAt)).length} getting old
                </span>
              )}
            </div>
            <button style={{display:"flex",alignItems:"center",gap:6,border:`1px solid ${currentLot.accent}44`,borderRadius:10,padding:"9px 18px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New',sans-serif",fontWeight:700,fontSize:13.5,background:currentLot.glow,color:currentLot.accent}}
              onClick={()=>setShowAddIdea(true)}>
              {IC.plus} {activeLot==="codevault"?"Park Code":"Park Idea"}
            </button>
          </div>
          {currentIdeas.length===0
            ? <EmptyState emoji="🌙" text="This lot is empty." sub="Park your first idea here." />
            : <div style={S.grid}>{currentIdeas.map(idea=>(
                <IdeaCard key={idea.id} idea={idea} isCode={activeLot==="codevault"} accent={currentLot.accent}
                  onDelete={()=>deleteIdea(activeLot,idea.id)}
                  onEdit={()=>setEditingIdea(idea)}
                  onCopy={()=>copyCode(idea)} copied={copiedId===idea.id}
                  onRun={activeLot==="codevault"&&idea.lang==="python"?()=>handleRun(idea):null}
                  output={outputs[idea.id]||null}
                  onClearOutput={()=>setOutputs(p=>{const n={...p};delete n[idea.id];return n;})}
                  isRunning={runningId===idea.id}/>
              ))}</div>
          }
        </main>
      )}

      {showAddIdea&&<IdeaModal lot={currentLot} onSave={d=>{addIdea(d);setShowAddIdea(false);}} onClose={()=>setShowAddIdea(false)}/>}
      {editingIdea&&<IdeaModal lot={currentLot} initial={editingIdea} onSave={d=>{updateIdea(editingIdea.id,d);setEditingIdea(null);}} onClose={()=>setEditingIdea(null)}/>}
      {showAddLot&&<AddLotModal onSave={(n,e)=>{addLot(n,e);setShowAddLot(false);}} onClose={()=>setShowAddLot(false)}/>}

      {/* Hiroshi FAB */}
      {!showHiroshi&&(
        <button onClick={()=>setShowHiroshi(true)}
          style={{position:"fixed",bottom:28,right:28,width:58,height:58,borderRadius:"50%",background:`linear-gradient(135deg,#1E3A5F,#2E4A72)`,border:`2px solid ${T.accent}55`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:`0 0 30px rgba(74,144,217,0.3),0 8px 24px rgba(0,0,0,0.4)`,zIndex:200,animation:"floatPulse 3s ease-in-out infinite"}}>
          🤖
          <div style={{position:"absolute",top:2,right:2,width:12,height:12,borderRadius:"50%",background:T.green,border:`2px solid #0B0F1A`}}/>
        </button>
      )}
      {showHiroshi&&<HiroshiChat ideas={ideas} lots={lots} onClose={()=>setShowHiroshi(false)}/>}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({emoji,text,sub}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:80,gap:10}}>
      <div style={{fontSize:44}}>{emoji}</div>
      <div style={{color:T.textDim,fontFamily:"'Kaisei Decol',serif",fontSize:17}}>{text}</div>
      {sub&&<div style={{color:T.textDim,fontSize:13}}>{sub}</div>}
    </div>
  );
}

// ── Lot Card ──────────────────────────────────────────────────────────────────
function LotCard({lot,count,index,onClick,onDelete,isDefault,oldCount}) {
  const [hov,setHov]=useState(false);
  return (
    <div style={{borderRadius:16,padding:"22px 20px 20px",border:`1px solid ${hov?lot.accent+"55":T.border}`,cursor:"pointer",position:"relative",overflow:"hidden",transition:"transform 0.22s,border-color 0.22s,box-shadow 0.22s",animation:"fadeUp 0.4s ease both",minHeight:130,animationDelay:`${index*55}ms`,background:hov?`linear-gradient(135deg,#131C2E,#1A2540)`:`linear-gradient(135deg,${T.bgCard},${T.bgCard2})`,boxShadow:hov?`0 0 24px ${lot.glow},0 4px 20px rgba(0,0,0,0.3)`:"0 2px 12px rgba(0,0,0,0.2)",transform:hov?"translateY(-5px)":"translateY(0)"}}
      onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      {!isDefault&&<button style={{position:"absolute",top:10,right:10,background:"rgba(255,255,255,0.04)",border:"none",borderRadius:6,cursor:"pointer",padding:4,display:"flex",color:T.textDim}} onClick={e=>{e.stopPropagation();onDelete();}}>{IC.close}</button>}
      {oldCount>0&&<div style={{position:"absolute",top:10,left:10,width:8,height:8,borderRadius:"50%",background:T.red,boxShadow:`0 0 6px ${T.red}`}}/>}
      <div style={{fontSize:30,marginBottom:12}}>{lot.emoji}</div>
      <div style={{fontWeight:700,fontSize:14,color:T.textBright,marginBottom:6,lineHeight:1.3}}>{lot.name}</div>
      <div style={{fontSize:12,color:lot.accent,opacity:0.85}}>{count} idea{count!==1?"s":""}</div>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${lot.accent}00,${lot.accent},${lot.accent}00)`,opacity:hov?1:0.35,transition:"opacity 0.3s"}}/>
    </div>
  );
}

// ── Idea Card ─────────────────────────────────────────────────────────────────
function IdeaCard({idea,isCode,accent,onDelete,onEdit,onCopy,copied,onRun,output,onClearOutput,isRunning,showLot}) {
  const [hov,setHov]=useState(false);
  const col=accent||idea.lotAccent||T.accent;
  const old=isOld(idea.createdAt);
  return (
    <div style={{borderRadius:14,padding:"18px 18px 14px",border:`1px solid ${hov?col+"55":old?"rgba(248,113,113,0.2)":T.border}`,transition:"transform 0.2s,border-color 0.2s,box-shadow 0.2s",animation:"fadeUp 0.3s ease both",background:isCode?"#0A0E1A":T.bgCard,boxShadow:hov?`0 0 20px ${col}18,0 4px 16px rgba(0,0,0,0.25)`:"0 2px 10px rgba(0,0,0,0.18)",transform:hov?"translateY(-3px)":"translateY(0)",position:"relative"}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>

      {old&&<div style={{position:"absolute",top:12,right:12,fontSize:10,color:T.red,background:"rgba(248,113,113,0.1)",border:`1px solid ${T.red}33`,borderRadius:4,padding:"2px 6px"}}>⚠️ old</div>}

      {showLot&&<div style={{fontSize:11,color:idea.lotAccent,fontWeight:700,marginBottom:8,letterSpacing:1,textTransform:"uppercase",opacity:0.8}}>{idea.lotEmoji} {idea.lotName}</div>}
      <div style={{fontFamily:"'Kaisei Decol',serif",fontSize:15,fontWeight:700,color:T.textBright,marginBottom:8,paddingRight:old?40:0}}>{idea.title}</div>

      {/* Tags */}
      {idea.tags?.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
          {idea.tags.map(tag=>(
            <span key={tag} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:`${col}18`,color:col,border:`1px solid ${col}33`}}>#{tag}</span>
          ))}
        </div>
      )}

      {/* Priority + Status */}
      {(idea.priority||idea.status)&&(
        <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          {idea.priority&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:PRIORITIES[idea.priority]?.bg,color:PRIORITIES[idea.priority]?.color,fontWeight:700}}>{PRIORITIES[idea.priority]?.label}</span>}
          {idea.status&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"rgba(255,255,255,0.05)",color:STATUSES[idea.status]?.color}}>{STATUSES[idea.status]?.label}</span>}
        </div>
      )}

      {isCode?(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            {idea.lang&&<span style={{display:"inline-block",background:"rgba(250,204,21,0.1)",color:T.yellow,borderRadius:4,padding:"2px 8px",fontSize:11,fontFamily:"'Fira Code',monospace",border:`1px solid ${T.yellow}44`}}>{idea.lang}</span>}
            {onRun&&(
              <button onClick={onRun} disabled={isRunning}
                style={{display:"flex",alignItems:"center",gap:5,background:isRunning?"rgba(250,204,21,0.08)":"rgba(74,222,128,0.1)",border:`1px solid ${isRunning?T.yellow+"44":T.green+"44"}`,borderRadius:6,padding:"4px 10px",cursor:isRunning?"not-allowed":"pointer",color:isRunning?T.yellow:T.green,fontSize:12,fontFamily:"'Fira Code',monospace"}}>
                {isRunning?<><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span> running...</>:<>{IC.run} Run</>}
              </button>
            )}
          </div>
          <pre style={{background:"#060A12",borderRadius:8,padding:"12px",margin:"0 0 10px",overflow:"auto",fontSize:12.5,maxHeight:150,border:`1px solid ${T.border}`}}>
            <code style={{fontFamily:"'Fira Code',monospace",color:"#7DD3FC"}}>{idea.body}</code>
          </pre>
          {output&&(
            <div style={{borderRadius:8,overflow:"hidden",marginBottom:10,border:`1px solid ${output.error?T.red+"44":T.green+"33"}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:output.error?"rgba(248,113,113,0.08)":"rgba(74,222,128,0.07)"}}>
                <span style={{fontSize:11,color:output.error?T.red:T.green,fontFamily:"'Fira Code',monospace",fontWeight:700}}>{output.running?"⏳ running...":output.error?"✗ error":"✓ output"}</span>
                {!output.running&&onClearOutput&&<button style={{background:"none",border:"none",cursor:"pointer",color:T.textDim,display:"flex",padding:2}} onClick={onClearOutput}>{IC.close}</button>}
              </div>
              <pre style={{margin:0,padding:"10px 12px",background:"#060A12",fontSize:12.5,color:output.error?T.red:"#A3E635",fontFamily:"'Fira Code',monospace",maxHeight:160,overflow:"auto",lineHeight:1.6}}>{output.text}</pre>
            </div>
          )}
        </>
      ):(
        <div style={{fontSize:13.5,color:T.text,lineHeight:1.65,marginBottom:12,display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{idea.body}</div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:4}}>
        <span style={{fontSize:11,color:old?T.red:T.textDim}}>{timeAgo(idea.createdAt)}</span>
        <div style={{display:"flex",gap:2}}>
          {isCode&&<button style={S.actionBtn} onClick={onCopy}><span style={{color:copied?T.green:T.textDim}}>{copied?"✓":IC.copy}</span></button>}
          <button style={S.actionBtn} onClick={onEdit}><span style={{color:T.textDim}}>{IC.edit}</span></button>
          <button style={S.actionBtn} onClick={onDelete}><span style={{color:"#F87171aa"}}>{IC.trash}</span></button>
        </div>
      </div>
    </div>
  );
}

// ── Idea Modal (with tags, priority, status) ──────────────────────────────────
function IdeaModal({lot,initial,onSave,onClose}) {
  const [title,setTitle]     = useState(initial?.title||"");
  const [body,setBody]       = useState(initial?.body||"");
  const [lang,setLang]       = useState(initial?.lang||"python");
  const [tagInput,setTagInput] = useState("");
  const [tags,setTags]       = useState(initial?.tags||[]);
  const [priority,setPriority] = useState(initial?.priority||"");
  const [status,setStatus]   = useState(initial?.status||"idea");
  const isCode = lot?.id==="codevault";
  const ref = useRef();
  useEffect(()=>ref.current?.focus(),[]);

  function addTag(e) {
    if((e.key==="Enter"||e.key===",")&&tagInput.trim()) {
      e.preventDefault();
      const t=tagInput.trim().replace(/^#/,"").toLowerCase();
      if(!tags.includes(t)) setTags(p=>[...p,t]);
      setTagInput("");
    }
  }
  function removeTag(t) { setTags(p=>p.filter(x=>x!==t)); }

  const inp={width:"100%",border:`1px solid ${T.border}`,background:T.bgCard,borderRadius:10,padding:"11px 14px",fontSize:14,fontFamily:"'Zen Kaku Gothic New',sans-serif",outline:"none",marginBottom:14,boxSizing:"border-box",color:T.text};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20,animation:"fadeIn 0.15s ease"}} onClick={onClose}>
      <div style={{background:"#0F1624",border:`1px solid ${T.borderHi}`,borderRadius:18,padding:28,width:"100%",maxWidth:520,boxShadow:`0 0 60px rgba(74,144,217,0.12),0 24px 60px rgba(0,0,0,0.5)`,animation:"scaleIn 0.2s ease",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontFamily:"'Kaisei Decol',serif",fontSize:17,color:T.textBright}}>{initial?"Edit Idea":`Park in ${lot?.emoji} ${lot?.name}`}</span>
          <button style={S.iconBtn} onClick={onClose}>{IC.close}</button>
        </div>

        <input ref={ref} style={inp} placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)}/>

        {isCode&&(
          <select style={{...inp,fontFamily:"'Fira Code',monospace",color:T.yellow,marginBottom:12}} value={lang} onChange={e=>setLang(e.target.value)}>
            {["python","javascript","typescript","java","c","cpp","html","css","sql","bash","other"].map(l=><option key={l} value={l}>{l}</option>)}
          </select>
        )}

        <textarea style={{...inp,resize:"vertical",lineHeight:1.65,marginBottom:14,fontFamily:isCode?"'Fira Code',monospace":"'Zen Kaku Gothic New',sans-serif",color:isCode?"#7DD3FC":T.text}}
          placeholder={isCode?"# Your code here...":"Describe your idea..."} value={body} onChange={e=>setBody(e.target.value)} rows={isCode?8:4}/>

        {/* Tags */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:T.textDim,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Tags</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:6}}>
            {tags.map(t=>(
              <span key={t} style={{fontSize:12,padding:"3px 8px",borderRadius:20,background:`${T.accent}18`,color:T.accent,border:`1px solid ${T.accent}33`,display:"flex",alignItems:"center",gap:4}}>
                #{t}
                <button onClick={()=>removeTag(t)} style={{background:"none",border:"none",cursor:"pointer",color:T.textDim,padding:0,fontSize:11,display:"flex"}}>×</button>
              </span>
            ))}
          </div>
          <input style={{...inp,marginBottom:0,fontSize:13}} placeholder="Add tag, press Enter (e.g. urgent, attendio)"
            value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={addTag}/>
        </div>

        {/* Priority + Status row */}
        {!isCode&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            <div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Priority</div>
              <div style={{display:"flex",gap:6}}>
                {Object.entries(PRIORITIES).map(([k,v])=>(
                  <button key={k} onClick={()=>setPriority(priority===k?"":k)}
                    style={{flex:1,padding:"6px 4px",borderRadius:8,border:`1px solid ${priority===k?v.color+"88":T.border}`,background:priority===k?v.bg:"transparent",color:priority===k?v.color:T.textDim,fontSize:12,cursor:"pointer",transition:"all 0.15s"}}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,color:T.textDim,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Status</div>
              <select style={{...inp,marginBottom:0,fontSize:13}} value={status} onChange={e=>setStatus(e.target.value)}>
                {Object.entries(STATUSES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        )}

        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 20px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New',sans-serif",fontSize:13.5,color:T.textDim}} onClick={onClose}>Cancel</button>
          <button style={{border:"none",borderRadius:10,padding:"9px 22px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New',sans-serif",fontSize:13.5,fontWeight:700,background:lot?.glow||T.accentSoft,color:lot?.accent||T.accent,borderTop:`1px solid ${lot?.accent||T.accent}44`,opacity:!title.trim()?0.4:1}}
            onClick={()=>title.trim()&&onSave({title,body,tags,...(isCode?{lang}:{priority,status})})} disabled={!title.trim()}>
            {initial?"Save Changes":"🅿️ Park It"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Lot Modal ─────────────────────────────────────────────────────────────
const EMOJIS=["🚀","🌸","🎯","🔥","💎","🧠","🌍","🎨","📚","🎵","🏋️","🌙","⚽","🤝","🔬","📱","💡","🗺️","🎭","🌊","🦋","🧩","🎪","🌺"];
function AddLotModal({onSave,onClose}) {
  const [name,setName]=useState(""); const [emoji,setEmoji]=useState("💡");
  const inp={width:"100%",border:`1px solid ${T.border}`,background:T.bgCard,borderRadius:10,padding:"11px 14px",fontSize:14,fontFamily:"'Zen Kaku Gothic New',sans-serif",outline:"none",marginBottom:14,boxSizing:"border-box",color:T.text};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20,animation:"fadeIn 0.15s ease"}} onClick={onClose}>
      <div style={{background:"#0F1624",border:`1px solid ${T.borderHi}`,borderRadius:18,padding:28,width:"100%",maxWidth:400,boxShadow:`0 0 60px rgba(74,144,217,0.12),0 24px 60px rgba(0,0,0,0.5)`,animation:"scaleIn 0.2s ease"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontFamily:"'Kaisei Decol',serif",fontSize:17,color:T.textBright}}>New Parking Lot</span>
          <button style={S.iconBtn} onClick={onClose}>{IC.close}</button>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:T.textDim,marginBottom:10,letterSpacing:1,textTransform:"uppercase"}}>Pick an emoji</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {EMOJIS.map(e=><button key={e} onClick={()=>setEmoji(e)} style={{fontSize:20,background:emoji===e?T.accentSoft:"transparent",border:emoji===e?`1px solid ${T.accent}55`:"1px solid transparent",borderRadius:8,padding:"4px 7px",cursor:"pointer",transition:"all 0.15s"}}>{e}</button>)}
          </div>
        </div>
        <input style={inp} placeholder="Lot name (e.g. Side Projects)" value={name} onChange={e=>setName(e.target.value)} autoFocus/>
        <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
          <button style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 20px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New',sans-serif",fontSize:13.5,color:T.textDim}} onClick={onClose}>Cancel</button>
          <button style={{border:"none",borderRadius:10,padding:"9px 22px",cursor:"pointer",fontFamily:"'Zen Kaku Gothic New',sans-serif",fontSize:13.5,fontWeight:700,background:T.accentSoft,color:T.accent,border:`1px solid ${T.accent}44`,opacity:!name.trim()?0.4:1}} onClick={()=>name.trim()&&onSave(name,emoji)} disabled={!name.trim()}>Create Lot</button>
        </div>
      </div>
    </div>
  );
}

// ── Hiroshi Chat ──────────────────────────────────────────────────────────────
const HIROSHI_GREETING = {id:"0",role:"assistant",text:`やあ、Rudhra！ I'm Hiroshi 🌿\n\nI know everything in your lots. What's on your mind?\n\n— or pick a mode below to get started 👇`};

async function loadHiroshiHistory() {
  try { const r = await window.storage.get("hiroshi_chat"); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
}
async function saveHiroshiHistory(msgs, personality, mode) {
  try { await window.storage.set("hiroshi_chat", JSON.stringify({msgs, personality, mode})); } catch {}
}

function HiroshiChat({ideas,lots,onClose}) {
  const [messages,setMessages] = useState([HIROSHI_GREETING]);
  const [input,setInput]       = useState("");
  const [loading,setLoading]   = useState(false);
  const [personality,setPersonality] = useState("chill");
  const [mode,setMode]         = useState("chat");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef();
  const inputRef  = useRef();

  // Load history on open
  useEffect(()=>{
    loadHiroshiHistory().then(data => {
      if(data?.msgs?.length) {
        setMessages(data.msgs);
        setPersonality(data.personality||"chill");
        setMode(data.mode||"chat");
      }
      setHistoryLoaded(true);
    });
  },[]);

  // Save history whenever messages change
  useEffect(()=>{
    if(historyLoaded && messages.length > 1) {
      saveHiroshiHistory(messages, personality, mode);
    }
  },[messages, personality, mode, historyLoaded]);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);
  useEffect(()=>{ inputRef.current?.focus(); },[]);

  async function send(overrideText) {
    const text = overrideText||input.trim();
    if(!text||loading) return;
    const userMsg={id:Date.now().toString(),role:"user",text};
    const history=[...messages,userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const reply = await askHiroshi(history, ideas, lots, personality, mode);
      setMessages(p=>[...p,{id:Date.now().toString(),role:"assistant",text:reply}]);
    } catch(e) {
      setMessages(p=>[...p,{id:Date.now().toString(),role:"assistant",text:`Sumimasen... something went wrong 😓`}]);
    }
    setLoading(false);
  }

  const QUICK = [
    "What ideas have I been neglecting?",
    "Connect my ideas for me",
    "Which goal should I focus on this week?",
    "Roast my parked ideas 😄",
  ];

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"flex-end",padding:"0 20px 20px",pointerEvents:"none"}}>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",pointerEvents:"all",animation:"fadeIn 0.2s ease"}} onClick={onClose}/>
      <div style={{position:"relative",width:"100%",maxWidth:430,height:"78vh",background:"#0D1524",border:`1px solid ${T.borderHi}`,borderRadius:20,display:"flex",flexDirection:"column",boxShadow:`0 0 80px rgba(74,144,217,0.15),0 24px 60px rgba(0,0,0,0.6)`,animation:"slideUp 0.3s ease",pointerEvents:"all",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${T.border}`,background:"rgba(74,144,217,0.04)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`linear-gradient(135deg,#1E3A5F,#2E4A72)`,border:`2px solid ${T.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>🤖</div>
              <div>
                <div style={{fontFamily:"'Kaisei Decol',serif",fontSize:15,color:T.textBright,letterSpacing:1}}>Hiroshi</div>
                <div style={{fontSize:10,color:T.accent,letterSpacing:2,textTransform:"uppercase"}}>ひろし · AI friend</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button onClick={()=>{setMessages([HIROSHI_GREETING]);saveHiroshiHistory([HIROSHI_GREETING],personality,mode);}} style={{background:"none",border:`1px solid ${T.border}`,cursor:"pointer",color:T.textDim,display:"flex",padding:"4px 8px",borderRadius:6,fontSize:11,gap:4,alignItems:"center"}} title="Clear chat">🗑 Clear</button>
              <button style={{background:"none",border:"none",cursor:"pointer",color:T.textDim,display:"flex",padding:6,borderRadius:8}} onClick={onClose}>{IC.close}</button>
            </div>
          </div>

          {/* Controls row */}
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* Personality toggle */}
            <div style={{display:"flex",background:T.bgCard,borderRadius:8,border:`1px solid ${T.border}`,overflow:"hidden",flex:1}}>
              {[["chill","🌿 Chill"],["focus","⚡ Focus"]].map(([k,label])=>(
                <button key={k} onClick={()=>setPersonality(k)}
                  style={{flex:1,padding:"5px 8px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Zen Kaku Gothic New',sans-serif",fontWeight:personality===k?700:400,background:personality===k?(k==="focus"?"rgba(250,204,21,0.12)":"rgba(74,222,128,0.08)"):"transparent",color:personality===k?(k==="focus"?T.yellow:T.green):T.textDim,transition:"all 0.2s"}}>
                  {label}
                </button>
              ))}
            </div>
            {/* Mode toggle */}
            <div style={{display:"flex",background:T.bgCard,borderRadius:8,border:`1px solid ${T.border}`,overflow:"hidden",flex:1}}>
              {[["chat","💬 Chat"],["brainstorm","🧠 Brainstorm"]].map(([k,label])=>(
                <button key={k} onClick={()=>setMode(k)}
                  style={{flex:1,padding:"5px 8px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"'Zen Kaku Gothic New',sans-serif",fontWeight:mode===k?700:400,background:mode===k?"rgba(192,132,252,0.1)":"transparent",color:mode===k?"#C084FC":T.textDim,transition:"all 0.2s"}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode description */}
          {mode==="brainstorm"&&(
            <div style={{marginTop:8,fontSize:11,color:"#C084FC",background:"rgba(192,132,252,0.07)",border:`1px solid rgba(192,132,252,0.2)`,borderRadius:6,padding:"5px 10px"}}>
              🧠 Brainstorm mode — Hiroshi will ask you questions to develop your ideas
            </div>
          )}
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 6px",display:"flex",flexDirection:"column",gap:10}}>
          {messages.map(msg=>(
            <div key={msg.id} style={{display:"flex",justifyContent:msg.role==="user"?"flex-end":"flex-start",animation:"fadeUp 0.2s ease"}}>
              {msg.role==="assistant"&&(
                <div style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,#1E3A5F,#2E4A72)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,marginRight:7,flexShrink:0,marginTop:3}}>🤖</div>
              )}
              <div style={{maxWidth:"80%",padding:"9px 13px",borderRadius:msg.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:msg.role==="user"?`linear-gradient(135deg,#1E3A5F,#2A4A6F)`:"#161F30",border:`1px solid ${msg.role==="user"?T.accent+"44":T.border}`,fontSize:13,color:T.text,lineHeight:1.65,whiteSpace:"pre-wrap"}}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading&&(
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,#1E3A5F,#2E4A72)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11}}>🤖</div>
              <div style={{padding:"9px 13px",borderRadius:"14px 14px 14px 4px",background:"#161F30",border:`1px solid ${T.border}`,display:"flex",gap:4,alignItems:"center"}}>
                {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:T.accent,animation:"bounce 1s ease infinite",animationDelay:`${i*0.15}s`}}/>)}
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Quick suggestions */}
        {messages.length===1&&(
          <div style={{padding:"4px 12px 8px",display:"flex",flexWrap:"wrap",gap:5}}>
            {QUICK.map(s=>(
              <button key={s} onClick={()=>send(s)}
                style={{fontSize:11,padding:"5px 10px",borderRadius:20,background:"rgba(74,144,217,0.08)",border:`1px solid ${T.accent}33`,color:T.accent,cursor:"pointer",fontFamily:"'Zen Kaku Gothic New',sans-serif"}}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{padding:"10px 12px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            placeholder={mode==="brainstorm"?"Drop a half-baked idea...":"Ask Hiroshi anything..."}
            rows={1} style={{flex:1,background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:"9px 12px",fontSize:13,color:T.text,fontFamily:"'Zen Kaku Gothic New',sans-serif",outline:"none",resize:"none",lineHeight:1.5,maxHeight:90,overflowY:"auto"}}/>
          <button onClick={()=>send()} disabled={!input.trim()||loading}
            style={{width:36,height:36,borderRadius:"50%",background:input.trim()&&!loading?T.accent:"#1E2D45",border:"none",cursor:input.trim()&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.2s",marginBottom:1}}>
            {IC.send}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root:{minHeight:"100vh",background:T.bg,fontFamily:"'Zen Kaku Gothic New',sans-serif",backgroundImage:`radial-gradient(ellipse at 15% 40%,rgba(74,144,217,0.07) 0%,transparent 55%),radial-gradient(ellipse at 85% 10%,rgba(192,132,252,0.05) 0%,transparent 50%)`,position:"relative",overflowX:"hidden"},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 28px",borderBottom:`1px solid ${T.border}`,background:"rgba(11,15,26,0.9)",backdropFilter:"blur(16px)",position:"sticky",top:0,zIndex:100},
  iconBtn:{background:"none",border:"none",cursor:"pointer",color:T.textDim,display:"flex",alignItems:"center",padding:6,borderRadius:8},
  main:{padding:"32px 28px",maxWidth:1100,margin:"0 auto",position:"relative",zIndex:1},
  lotsGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:16},
  newLotBtn:{borderRadius:16,padding:"22px 20px",border:`2px dashed ${T.border}`,cursor:"pointer",background:"transparent",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,minHeight:130},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14},
  actionBtn:{background:"none",border:"none",cursor:"pointer",padding:5,borderRadius:6,display:"flex",alignItems:"center"},
};

const css=document.createElement("style");
css.textContent=`
  @keyframes fadeUp  {from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn  {from{opacity:0}to{opacity:1}}
  @keyframes scaleIn {from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
  @keyframes slideUp {from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
  @keyframes twinkle {0%,100%{opacity:0.1}50%{opacity:0.45}}
  @keyframes spin    {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes bounce  {0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes floatPulse{0%,100%{transform:translateY(0);box-shadow:0 0 30px rgba(74,144,217,0.3)}50%{transform:translateY(-4px);box-shadow:0 0 40px rgba(74,144,217,0.5)}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:#1E2D45;border-radius:10px}
  input::placeholder,textarea::placeholder{color:#2E4A72}
  select option{background:#0F1624;color:#CBD5E1}
  button{font-family:inherit}
`;
document.head.appendChild(css);