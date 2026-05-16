'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

const CL: Record<string, { lbl: string; sh: string }> = {
  red:   { lbl: 'ĐỎ',   sh: 'Đ' },
  blue:  { lbl: 'XANH', sh: 'X' },
  green: { lbl: 'LÁ',   sh: 'L' },
}

type Pred = { sequence: string[]; predicted: string | null; actual: string | null; confidence: number | null; reason: string }

export default function Home() {
  const [hist, setHist] = useState<string[]>([])
  const [preds, setPreds] = useState<Pred[]>([])
  const [thinking, setThinking] = useState(false)
  const [status, setStatus] = useState('Chưa kết nối')
  const [statusCls, setStatusCls] = useState('')
  const [predColor, setPredColor] = useState('')
  const [predName, setPredName] = useState('– – –')
  const [predConf, setPredConf] = useState('')
  const [predReason, setPredReason] = useState('Share màn hình và khoanh vùng bảng màu để bắt đầu.')
  const [predBadge, setPredBadge] = useState<'w'|'th'|'ok'|'ng'>('w')
  const [scanChips, setScanChips] = useState<{label:string;cls:string}[]>([])
  const [scanIv, setScanIv] = useState(5)
  const [thrR, setThrR] = useState(20)
  const [thrB, setThrB] = useState(20)
  const [thrG, setThrG] = useState(20)
  const [toast, setToast] = useState('')
  const [toastShow, setToastShow] = useState(false)
  const [debugMsg, setDebugMsg] = useState('')
  const [zoneInfo, setZoneInfo] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [hasZone, setHasZone] = useState(false)

  const cvMainRef = useRef<HTMLCanvasElement>(null)
  const cvSelRef  = useRef<HTMLCanvasElement>(null)
  const videoRef  = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loopRef   = useRef(false)
  const selRef    = useRef<{x:number;y:number;w:number;h:number}|null>(null)
  const dragRef   = useRef(false)
  const dsRef     = useRef<{x:number;y:number}|null>(null)
  const dnRef     = useRef<{x:number;y:number}|null>(null)
  const lastColorRef = useRef<string|null>(null)
  const histRef   = useRef<string[]>([])
  const predsRef  = useRef<Pred[]>([])
  const thinkingRef = useRef(false)
  const curPredIdxRef = useRef<number|null>(null)
  const thrRRef   = useRef(20), thrBRef = useRef(20), thrGRef = useRef(20)

  useEffect(() => { histRef.current = hist }, [hist])
  useEffect(() => { predsRef.current = preds }, [preds])
  useEffect(() => { thinkingRef.current = thinking }, [thinking])
  useEffect(() => { thrRRef.current = thrR }, [thrR])
  useEffect(() => { thrBRef.current = thrB }, [thrB])
  useEffect(() => { thrGRef.current = thrG }, [thrG])

  useEffect(() => {
    const h = localStorage.getItem('cp4h'), p = localStorage.getItem('cp4p')
    if (h) { const parsed = JSON.parse(h); setHist(parsed); histRef.current = parsed }
    if (p) { const parsed = JSON.parse(p); setPreds(parsed); predsRef.current = parsed }
  }, [])

  const save = useCallback((h: string[], p: Pred[]) => {
    localStorage.setItem('cp4h', JSON.stringify(h))
    localStorage.setItem('cp4p', JSON.stringify(p))
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg); setToastShow(true)
    setTimeout(() => setToastShow(false), 3000)
  }, [])

  const setDot = useCallback((cls: string, txt: string) => {
    setStatusCls(cls); setStatus(txt)
  }, [])

  const predict = useCallback(async (currentHist: string[]) => {
    if (thinkingRef.current) return
    setThinking(true); thinkingRef.current = true
    setDot('th', 'Đang phân tích...')

    const entry: Pred = { sequence: [...currentHist], predicted: null, actual: null, confidence: null, reason: '' }
    const newPreds = [...predsRef.current, entry]
    const newIdx = newPreds.length - 1
    setPreds(newPreds); predsRef.current = newPreds
    curPredIdxRef.current = newIdx

    setPredBadge('th'); setPredColor(''); setPredName('…'); setPredConf('')
    setPredReason('AI đang phân tích...'); setDebugMsg('')

    try {
      const apiKey = process.env.NEXT_PUBLIC_AI_KEY
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://1gw.gwai.cloud/v1/messages'

      if (!apiKey) {
        setDebugMsg('Lỗi: Thiếu NEXT_PUBLIC_AI_KEY trong environment')
        setPredBadge('w'); setPredReason('Lỗi cấu hình: Thiếu API key')
        setDot('on', 'Lỗi cấu hình')
        setThinking(false); thinkingRef.current = false
        return
      }

      const cR = currentHist.filter(c => c === 'red').length
      const cB = currentHist.filter(c => c === 'blue').length
      const cG = currentHist.filter(c => c === 'green').length

      const prompt = `Bạn là AI phân tích pattern màu trong trò chơi.

Lịch sử (${currentHist.length} lần): ${currentHist.join(', ')}
10 lần gần nhất: ${currentHist.slice(-10).join(', ')}
Đỏ:${cR} Xanh:${cB} Lá:${cG}

Dự đoán màu TIẾP THEO. Trả lời JSON duy nhất, không thêm gì khác:
{"color":"red|blue|green","confidence":0-100,"reason":"lý do ngắn ≤80 ký tự"}`

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }]
        })
      })

      const rawText = await res.text()

      let data
      try {
        data = JSON.parse(rawText)
      } catch {
        if (rawText.includes('<!DOCTYPE') || rawText.includes('<html')) {
          setDebugMsg('Lỗi: Proxy trả về HTML thay vì JSON. Có thể bị chặn hoặc lỗi cấu hình.')
          setPredBadge('w'); setPredReason('Lỗi: Proxy trả HTML (bị chặn?)')
          setDot('on', 'Lỗi proxy')
        } else {
          setDebugMsg('Lỗi: Không parse được JSON - ' + rawText.slice(0, 100))
          setPredBadge('w'); setPredReason('Lỗi: Response không hợp lệ')
          setDot('on', 'Lỗi')
        }
        setThinking(false); thinkingRef.current = false
        return
      }

      if (data.error) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        setDebugMsg('Lỗi API: ' + errMsg)
        setPredBadge('w'); setPredReason('Lỗi API: ' + errMsg.slice(0,100))
        setDot('on', 'Lỗi API')
        setThinking(false); thinkingRef.current = false
        return
      }

      let text = ''
      if (data.content?.[0]?.text) text = data.content[0].text
      else if (data.choices?.[0]?.message?.content) text = data.choices[0].message.content

      const match = text.match(/\{[\s\S]*?\}/)
      if (!match) {
        setDebugMsg('Lỗi: Không tìm thấy JSON trong response - ' + text.slice(0, 100))
        setPredBadge('w'); setPredReason('Lỗi: AI không trả JSON')
        setDot('on', 'Lỗi')
        setThinking(false); thinkingRef.current = false
        return
      }

      const parsed = JSON.parse(match[0])
      entry.predicted = parsed.color; entry.confidence = parsed.confidence; entry.reason = parsed.reason
      const updated = [...predsRef.current]; updated[newIdx] = { ...entry }
      setPreds(updated); predsRef.current = updated; save(currentHist, updated)
      setPredBadge('ok'); setPredColor(parsed.color)
      setPredName(CL[parsed.color]?.lbl || parsed.color)
      setPredConf(String(parsed.confidence)); setPredReason(parsed.reason)
      setDot('on', 'Đang theo dõi...')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setDebugMsg('Lỗi kết nối: ' + msg); setPredBadge('w')
      setPredReason('Lỗi kết nối: ' + msg.slice(0, 50)); setDot('on', 'Lỗi')
    }
    setThinking(false); thinkingRef.current = false
  }, [save, setDot])

  const onNew = useCallback((color: string) => {
    const idx = curPredIdxRef.current
    if (idx !== null) {
      const p = predsRef.current[idx]
      if (p && p.actual === null && p.predicted !== null) {
        const ok = p.predicted === color
        const updated = [...predsRef.current]
        updated[idx] = { ...p, actual: color }
        setPreds(updated); predsRef.current = updated
        setPredBadge(ok ? 'ok' : 'ng')
        showToast((ok ? '✓ Đúng! ' : '✗ Sai — ') + CL[color]?.lbl)
      }
    }
    const newHist = [...histRef.current, color]
    setHist(newHist); histRef.current = newHist
    save(newHist, predsRef.current)
    if (newHist.length >= 3) predict(newHist)
  }, [predict, save, showToast])

  const scan = useCallback(() => {
    const cm = cvMainRef.current, sel = selRef.current
    if (!cm || !sel) return
    const cx = cm.getContext('2d')
    if (!cx) return
    let data: Uint8ClampedArray
    try { data = cx.getImageData(Math.round(sel.x), Math.round(sel.y), Math.max(1,Math.round(sel.w)), Math.max(1,Math.round(sel.h))).data }
    catch { return }
    let rC=0,bC=0,gC=0,tot=0
    for (let i=0;i<data.length;i+=4) {
      const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3]
      if(a<50) continue; tot++
      const mx=Math.max(r,g,b), dl=mx-Math.min(r,g,b)
      if(dl<25) continue
      if(mx===r&&dl>35&&r>110&&g<170) rC++
      else if(mx===b&&dl>35&&b>90) bC++
      else if(mx===g&&dl>35&&g>90) gC++
    }
    if(!tot) return
    const rP=(rC/tot)*100, bP=(bC/tot)*100, gP=(gC/tot)*100
    const tR=thrRRef.current, tB=thrBRef.current, tG=thrGRef.current
    setScanChips([
      {label:`Đỏ ${rP.toFixed(0)}%`, cls:rP>=tR?'red':'unk'},
      {label:`Xanh ${bP.toFixed(0)}%`, cls:bP>=tB?'blue':'unk'},
      {label:`Lá ${gP.toFixed(0)}%`, cls:gP>=tG?'green':'unk'},
    ])
    const cands: {c:string;v:number}[] = []
    if(rP>=tR) cands.push({c:'red',v:rP})
    if(bP>=tB) cands.push({c:'blue',v:bP})
    if(gP>=tG) cands.push({c:'green',v:gP})
    if(!cands.length) return
    cands.sort((a,b)=>b.v-a.v)
    const det = cands[0].c
    if(det !== lastColorRef.current) { lastColorRef.current = det; onNew(det) }
  }, [onNew])

  const startScan = useCallback((iv: number) => {
    if(scanTimerRef.current) clearInterval(scanTimerRef.current)
    scanTimerRef.current = setInterval(() => { if(selRef.current) scan() }, iv*1000)
  }, [scan])

  const drawLoop = useCallback(() => {
    if(!loopRef.current || !videoRef.current) return
    const cm=cvMainRef.current, cs=cvSelRef.current, vid=videoRef.current
    if(!cm||!cs) { requestAnimationFrame(drawLoop); return }
    const vw=vid.videoWidth||1280, vh=vid.videoHeight||720
    const wrap=document.getElementById('preview-wrap')
    const ww=wrap?.clientWidth||800, wh=wrap?.clientHeight||500
    const sc=Math.min(ww/vw,wh/vh)
    const cw=Math.round(vw*sc), ch=Math.round(vh*sc)
    if(cm.width!==cw||cm.height!==ch) {
      cm.width=cw; cm.height=ch; cm.style.width=cw+'px'; cm.style.height=ch+'px'
      cs.width=cw; cs.height=ch; cs.style.width=cw+'px'; cs.style.height=ch+'px'
    }
    cm.getContext('2d')!.drawImage(vid,0,0,cw,ch)
    const sx=cs.getContext('2d')!
    sx.clearRect(0,0,cw,ch)
    if(dragRef.current&&dsRef.current&&dnRef.current) {
      const rx=Math.min(dsRef.current.x,dnRef.current.x), ry=Math.min(dsRef.current.y,dnRef.current.y)
      const rw=Math.abs(dnRef.current.x-dsRef.current.x), rh=Math.abs(dnRef.current.y-dsRef.current.y)
      sx.save(); sx.strokeStyle='rgba(255,184,59,.9)'; sx.lineWidth=1.5; sx.setLineDash([4,3])
      sx.strokeRect(rx,ry,rw,rh); sx.fillStyle='rgba(255,184,59,.06)'; sx.fillRect(rx,ry,rw,rh); sx.restore()
    }
    const sel=selRef.current
    if(sel&&!dragRef.current) {
      sx.save(); sx.strokeStyle='rgba(59,255,138,.95)'; sx.lineWidth=2; sx.setLineDash([6,3])
      sx.strokeRect(sel.x+1,sel.y+1,sel.w-2,sel.h-2)
      sx.fillStyle='rgba(59,255,138,.07)'; sx.fillRect(sel.x,sel.y,sel.w,sel.h)
      sx.setLineDash([]); sx.fillStyle='rgba(59,255,138,.95)'; sx.font='bold 10px monospace'
      sx.fillText('SCAN ZONE',sel.x+4,sel.y+14); sx.restore()
    }
    requestAnimationFrame(drawLoop)
  }, [])

  const toCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cs=cvSelRef.current!; const r=cs.getBoundingClientRect()
    return {x:(e.clientX-r.left)*(cs.width/r.width), y:(e.clientY-r.top)*(cs.height/r.height)}
  }

  const stopCap = useCallback(() => {
    streamRef.current?.getTracks().forEach(t=>t.stop()); streamRef.current=null
    loopRef.current=false; videoRef.current=null
    if(scanTimerRef.current){clearInterval(scanTimerRef.current); scanTimerRef.current=null}
    selRef.current=null; lastColorRef.current=null
    setCapturing(false); setHasZone(false); setDot('','Đã ngắt kết nối'); setZoneInfo('')
  }, [setDot])

  const toggleCap = useCallback(async () => {
    if(streamRef.current){stopCap(); return}
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false})
      stream.getVideoTracks()[0].addEventListener('ended', stopCap)
      streamRef.current=stream
      const vid=document.createElement('video')
      vid.srcObject=stream; vid.muted=true; await vid.play()
      videoRef.current=vid; loopRef.current=true
      setCapturing(true); setDot('on','Đã kết nối — chọn vùng')
      setZoneInfo('Kéo chuột trên preview để khoanh vùng bảng màu.')
      requestAnimationFrame(drawLoop); startScan(scanIv)
      showToast('✓ Kết nối! Kéo chuột trên preview để chọn vùng.')
    } catch(e:unknown) {
      showToast('✗ Lỗi: '+(e instanceof Error?e.message:String(e)))
    }
  }, [stopCap, drawLoop, startScan, scanIv, setDot, showToast])

  const clearAll = () => {
    if(!confirm('Xóa toàn bộ?')) return
    setHist([]); setPreds([]); histRef.current=[]; predsRef.current=[]; curPredIdxRef.current=null
    lastColorRef.current=null; save([],[]); setPredColor(''); setPredName('– – –')
    setPredConf(''); setPredReason('Share màn hình và khoanh vùng để bắt đầu.'); setPredBadge('w')
    setScanChips([]); setDebugMsg('')
  }

  const cR=hist.filter(c=>c==='red').length, cB=hist.filter(c=>c==='blue').length, cG=hist.filter(c=>c==='green').length
  const done=preds.filter(p=>p.actual!==null), okCount=done.filter(p=>p.predicted===p.actual).length
  const accPct = done.length ? Math.round((okCount/done.length)*100) : null

  const pill = (c:string|null) => {
    if(!c||!CL[c]) return <span className="text-white/20">–</span>
    const s:Record<string,string>={red:'bg-red-500/20 text-red-400',blue:'bg-blue-500/20 text-blue-400',green:'bg-green-500/20 text-green-400'}
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s[c]}`}>{CL[c].lbl}</span>
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0a0a0f] text-[#e8e8f0] grid"
      style={{gridTemplateColumns:'290px 1fr',gridTemplateRows:'50px 1fr'}}>

      <header className="col-span-2 bg-[#12121a] border-b border-white/10 flex items-center px-4 gap-3">
        <div className="font-bold text-lg tracking-tight">COLOR<span className="text-green-400">PRED</span></div>
        <div className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 uppercase tracking-widest font-bold">v4</div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-white/40">
          <div className={`w-2 h-2 rounded-full ${statusCls==='on'?'bg-green-400 animate-pulse':statusCls==='th'?'bg-amber-400 animate-pulse':'bg-white/20'}`}/>
          <span>{status}</span>
        </div>
      </header>

      <aside className="bg-[#12121a] border-r border-white/5 overflow-y-auto flex flex-col gap-3 p-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1.5">Màn hình game</div>
          <button onClick={toggleCap} className={`w-full py-2.5 rounded-lg border font-bold text-[11px] tracking-wider transition-all ${capturing?'bg-red-500/15 text-red-400 border-red-500/30':'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25'}`}>
            {capturing?'⬡ Dừng chia sẻ':'⬡ Bắt đầu chia sẻ màn hình'}
          </button>
          <div className="bg-[#1a1a26] border border-white/5 rounded-md p-2 mt-1.5 text-[10px] text-white/40 leading-relaxed">
            {zoneInfo || <>Nhấn nút trên → chọn tab game → <strong className="text-white/70">kéo chuột trên preview</strong> để chọn vùng.</>}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1">Chu kỳ quét</div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/40">Mỗi</span>
            <input type="range" min={3} max={30} value={scanIv} className="flex-1"
              onChange={e=>{setScanIv(+e.target.value);if(streamRef.current)startScan(+e.target.value)}}/>
            <span className="text-amber-400 font-bold text-[11px] w-7 text-right">{scanIv}s</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1.5">Ngưỡng nhận diện (%)</div>
          {[{lbl:'Đỏ',col:'bg-red-500',v:thrR,s:setThrR},{lbl:'Xanh',col:'bg-blue-500',v:thrB,s:setThrB},{lbl:'Lá',col:'bg-green-400',v:thrG,s:setThrG}].map(t=>(
            <div key={t.lbl} className="flex items-center gap-2 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${t.col}`}/>
              <span className="text-[10px] text-white/40 w-10">{t.lbl}</span>
              <input type="range" min={5} max={60} value={t.v} className="flex-1" onChange={e=>t.s(+e.target.value)}/>
              <span className="text-[10px] text-white/70 w-8 text-right">{t.v}%</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1.5">Chuỗi màu ({hist.length})</div>
          <div className="flex flex-wrap gap-1 min-h-5">
            {hist.length===0?<span className="text-[10px] text-white/20">Chưa có</span>
              :hist.slice(-26).map((c,i,a)=>(
              <div key={i} className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold border ${c==='red'?'bg-red-500/20 border-red-500/30 text-red-400':c==='blue'?'bg-blue-500/20 border-blue-500/30 text-blue-400':'bg-green-500/20 border-green-500/30 text-green-400'} ${i===a.length-1?'scale-110':''}`}>
                {CL[c]?.sh}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/30 mb-1.5">Thống kê</div>
          <div className="grid grid-cols-3 gap-1.5">
            {[{lbl:'Đỏ',n:cR,c:'text-red-400'},{lbl:'Xanh',n:cB,c:'text-blue-400'},{lbl:'Lá',n:cG,c:'text-green-400'}].map(s=>(
              <div key={s.lbl} className="bg-[#1a1a26] border border-white/5 rounded p-1.5 text-center">
                <div className={`text-xl font-bold ${s.c}`}>{s.n}</div>
                <div className="text-[8px] text-white/25 uppercase">{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-white/40 mb-1"><span>Độ chính xác</span><strong className="text-green-400">{accPct!==null?accPct+'%':'–'}</strong></div>
          <div className="h-1 bg-white/10 rounded mb-1"><div className="h-full bg-green-400 rounded transition-all" style={{width:(accPct||0)+'%'}}/></div>
          <div className="flex justify-between text-[10px] text-white/25"><span>✓ {okCount}</span><span>✗ {done.length-okCount}</span></div>
        </div>
        <button onClick={clearAll} className="w-full py-1.5 rounded border border-white/10 text-[10px] text-white/30 hover:border-red-500/40 hover:text-red-400 transition-all">↺ Xóa lịch sử</button>
      </aside>

      <main className="grid overflow-hidden" style={{gridTemplateRows:'1fr 190px'}}>
        <div className="grid overflow-hidden border-b border-white/5" style={{gridTemplateColumns:'1fr 360px'}}>
          <div className="relative bg-black overflow-hidden" id="preview-wrap">
            <canvas ref={cvMainRef} className="absolute top-0 left-0" style={{display:capturing?'block':'none'}}/>
            <canvas ref={cvSelRef} className="absolute top-0 left-0 cursor-crosshair z-10"
              style={{display:capturing?'block':'none'}}
              onMouseDown={e=>{dragRef.current=true;dsRef.current=toCanvas(e);dnRef.current={...dsRef.current!};selRef.current=null;setHasZone(false)}}
              onMouseMove={e=>{if(dragRef.current)dnRef.current=toCanvas(e)}}
              onMouseUp={e=>{
                dragRef.current=false;dnRef.current=toCanvas(e)
                if(dsRef.current&&dnRef.current){
                  const x=Math.min(dsRef.current.x,dnRef.current.x),y=Math.min(dsRef.current.y,dnRef.current.y)
                  const w=Math.abs(dnRef.current.x-dsRef.current.x),h=Math.abs(dnRef.current.y-dsRef.current.y)
                  if(w>8&&h>8){selRef.current={x,y,w,h};setHasZone(true);setZoneInfo(`✓ Vùng quét: ${Math.round(w)}×${Math.round(h)}px. Quét mỗi ${scanIv}s.`);setDot('on','Đang theo dõi...');showToast('✓ Đã chọn vùng!')}
                }
                dsRef.current=null;dnRef.current=null
              }}
              onMouseLeave={()=>{dragRef.current=false;dsRef.current=null;dnRef.current=null}}/>
            {!capturing&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/25">
              <div className="text-6xl opacity-20">⬡</div>
              <div className="text-sm">Chưa chia sẻ màn hình</div>
              <div className="text-xs">Nhấn nút bên trái để bắt đầu</div>
            </div>}
            {capturing&&!hasZone&&<div className="absolute bottom-0 left-0 right-0 z-20 bg-black/70 text-green-400 text-sm text-center py-3 font-bold tracking-wide pointer-events-none">
              ↔ Kéo chuột để chọn vùng bảng màu
            </div>}
          </div>

          <div className="bg-[#12121a] border-l border-white/10 p-5 flex flex-col gap-4 overflow-y-auto">
            <div className="flex justify-between items-center">
              <div className="text-[9px] uppercase tracking-widest text-white/30">Dự đoán tiếp theo</div>
              <div className={`text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wide font-bold ${
                predBadge==='w'?'bg-white/10 text-white/40':predBadge==='th'?'bg-amber-500/20 text-amber-400':predBadge==='ok'?'bg-green-500/20 text-green-400':'bg-red-500/20 text-red-400'}`}>
                {predBadge==='w'?'Chờ':predBadge==='th'?'Phân tích...':predBadge==='ok'?'Dự đoán xong':'Sai rồi'}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl border border-white/10 transition-all duration-500 flex-shrink-0 ${
                predColor==='red'?'bg-red-500 shadow-[0_0_24px_rgba(255,59,59,.5)]':
                predColor==='blue'?'bg-blue-500 shadow-[0_0_24px_rgba(59,143,255,.5)]':
                predColor==='green'?'bg-green-400 shadow-[0_0_24px_rgba(59,255,138,.5)]':'bg-white/10'}`}/>
              <div>
                <div className={`text-4xl font-bold leading-none ${predColor==='red'?'text-red-400':predColor==='blue'?'text-blue-400':predColor==='green'?'text-green-400':'text-white/25'}`}>{predName}</div>
                {predConf&&<div className="text-[11px] text-white/40 mt-1">Tin cậy: <span className="text-amber-400 font-bold">{predConf}%</span></div>}
              </div>
            </div>
            <div className="text-[11px] text-white/40 leading-relaxed border-t border-white/5 pt-3">{predReason}</div>
            {scanChips.length>0&&<div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[9px] text-white/25">Quét cuối:</span>
              {scanChips.map((ch,i)=>(
                <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  ch.cls==='red'?'bg-red-500/20 text-red-400':ch.cls==='blue'?'bg-blue-500/20 text-blue-400':ch.cls==='green'?'bg-green-500/20 text-green-400':'bg-white/10 text-white/30'}`}>{ch.label}</span>
              ))}
            </div>}
            {debugMsg&&<div className="bg-black/60 border border-amber-500/30 rounded-md p-2 text-[10px] text-amber-400 break-all leading-relaxed">{debugMsg}</div>}
          </div>
        </div>

        <div className="overflow-y-auto px-4 py-2">
          <div className="text-[9px] uppercase tracking-widest text-white/25 mb-2">Lịch sử dự đoán</div>
          {preds.length===0
            ?<div className="flex flex-col items-center justify-center h-24 text-white/20 text-xs gap-1"><div className="text-2xl opacity-30">◈</div><div>Chưa có dữ liệu</div></div>
            :<table className="w-full text-[11px]">
              <thead><tr className="text-[9px] uppercase tracking-widest text-white/20 border-b border-white/5">
                {['#','Input','Dự đoán','Thực tế','KQ','%'].map(h=><th key={h} className="text-left py-1 px-2 font-normal">{h}</th>)}
              </tr></thead>
              <tbody>
                {preds.slice().reverse().map((p,i)=>(
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 px-2 text-white/25">{preds.length-i}</td>
                    <td className="py-1.5 px-2 text-white/25">{(p.sequence||[]).slice(-6).map(c=>CL[c]?.sh||'?').join(' ')}</td>
                    <td className="py-1.5 px-2">{pill(p.predicted)}</td>
                    <td className="py-1.5 px-2">{p.actual!==null?pill(p.actual):pill(null)}</td>
                    <td className="py-1.5 px-2">{p.actual===null?<span className="text-white/25">⏳</span>:p.predicted===p.actual?<span className="text-green-400">✓</span>:<span className="text-red-400">✗</span>}</td>
                    <td className="py-1.5 px-2 text-amber-400">{p.confidence!=null?p.confidence+'%':'–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      </main>

      <div className={`fixed bottom-4 right-4 bg-[#1a1a26] border border-white/15 rounded-xl px-4 py-2.5 text-[11px] z-50 transition-all duration-300 max-w-xs ${toastShow?'opacity-100 translate-y-0':'opacity-0 translate-y-6 pointer-events-none'}`}>{toast}</div>
    </div>
  )
}
