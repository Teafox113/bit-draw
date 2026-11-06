import { analyzeSource, activePixels, composite, parseColor, toHex } from './core.js';
import { PRESET_PALETTES, hsvToRgb, rgbToHsv, mixRgb, segmentRegions, outlinePixels } from './color-tools.js';
const $=id=>document.getElementById(id);
export function initStudio(api) {
  let analysis=null, analyzedSource=null, hsv=[0,0,0], originalColor='#000000', segments=null, picked=-1, outline=null;
  const run=fn=>{try{return fn();}catch(e){$('studioFeedback').textContent=e.message;api.message(e.message,true);}};
  const button=document.createElement('button');button.id='studioOpen';button.textContent='色盤工作室';button.className='wide';
  $('customSwatches').before(button);
  $('paletteExtract').textContent='分析原圖';
  const picker=document.createElement('button');picker.id='customColorOpen';picker.textContent='自訂選色…';picker.className='text-button';
  document.querySelector('[data-page="edit"] section h2').replaceChildren(document.createTextNode('顏色'),picker);
  document.body.insertAdjacentHTML('beforeend',`<dialog id="studioDialog" class="studio-dialog">
    <div class="dialog-heading"><div><h2>色盤工作室</h2><p>從原圖整理顏色，建立自己的像素配色。</p></div><button id="studioClose" aria-label="關閉色盤工作室">×</button></div>
    <div class="studio-tabs" role="tablist" aria-label="色盤工作室分頁"><button data-studio="analyze" role="tab">原圖分析</button><button data-studio="mix" role="tab">混色與替換</button><button data-studio="presets" role="tab">預設色盤</button><button data-studio="picker" role="tab">自訂選色</button></div>
    <div class="studio-page" data-studio-page="analyze"><div class="studio-intro"><h3>從原始圖片擷取主要配色</h3><p>依色彩分布整理相近色，不受目前圖層修改影響。點擊色卡設為前景色，或指定混色 A / B。</p></div>
      <div class="row"><label for="analysisCount">目標色數</label><select id="analysisCount"><option>8</option><option selected>16</option><option>24</option><option>32</option><option>64</option></select><button id="analyzeSource" class="accent">分析原圖</button></div>
      <p id="analysisInfo">尚未分析。</p><div id="sourceColors" class="source-colors"></div>
      <div class="row"><input id="analysisName" value="原圖工作色盤" maxlength="60" aria-label="分析色盤名稱"><button id="analysisSave" class="accent" disabled>建立工作色盤</button><button id="analysisAppend" disabled>加入目前色盤</button></div>
    </div>
    <div class="studio-page" data-studio-page="mix" hidden><div class="studio-intro"><h3>兩色混合與顏色替換</h3><p>使用 RGB 通道加權混色。替換只影響目前圖層／矩形選區，原始圖片保留。</p></div>
      <div class="row"><label for="mixBookTarget">點選工作色卡指定</label><select id="mixBookTarget"><option value="A">顏色 A</option><option value="B">顏色 B</option></select><span id="mixBookName"></span></div><div id="mixBookColors" class="swatches"></div>
      <div class="mix-colors"><label>顏色 A<input type="color" id="mixA" value="#38606b"><button id="foregroundA">使用前景色</button></label><span>＋</span><label>顏色 B<input type="color" id="mixB" value="#f1bd75"><button id="foregroundB">使用前景色</button></label><span>→</span><div><span>混合結果</span><button id="mixResult" title="設為前景色"></button><output id="mixHex"></output></div></div>
      <label class="range-label" for="mixPercent">B 的比例 <output id="mixPercentLabel">50%</output></label><input id="mixPercent" type="range" min="0" max="100" value="50">
      <div class="compact-actions"><button id="mixUse">設為前景色</button><button id="mixSave">加入工作色盤</button></div>
      <div class="compact-actions"><button id="mergeSwatches">合併 A / B 色卡為混合色</button><button id="replaceSwatch">替換色卡 A → B</button></div><p>色卡操作只整理目前工作色盤；下方「套用替換」才會修改畫布。</p>
      <div class="replace-box"><h3>在畫布替換顏色</h3><div class="field-pair"><label>替換方式<select id="replaceMode"><option value="a-b">A → B</option><option value="a-mix">A → 混合色</option><option value="both-mix">A 與 B → 混合色</option></select></label><label>色差容許值<input id="replaceTolerance" type="number" min="0" max="255" value="0"></label></div><p>0 表示精確同色；其他值容許每個 RGB 通道的差異。保留原有透明度。</p><p id="replaceScope"></p><p id="replaceMatches"></p><button id="replaceColor" class="accent">套用替換 · 可復原</button></div>
    </div>
    <div class="studio-page" data-studio-page="presets" hidden><div class="studio-intro"><h3>12 組起始配色</h3><p>點選單色即可取色；「建立副本」會加入專案，所有色卡都能新增、修改、刪除與匯出。</p></div><div id="presetGallery" class="palette-gallery"></div></div>
    <div class="studio-page" data-studio-page="picker" hidden><div class="studio-intro"><h3>精確自訂顏色</h3><p>在色彩平面選擇飽和度與明度，或輸入 HSV、RGB 和 HEX。</p></div>
      <div class="picker-layout"><div><canvas id="svCanvas" width="280" height="240" aria-label="飽和度與明度選色平面"></canvas><label class="block">色相<input id="hueSlider" type="range" min="0" max="359" value="0"></label></div><div><div class="color-comparison"><div><span>原色</span><div id="oldColor"></div></div><div><span>新色</span><div id="newColor"></div></div></div><label class="block">HEX<input id="pickerHex" maxlength="7" spellcheck="false"></label><div class="picker-fields"><label>H °<input id="pickerH" type="number" min="0" max="359"></label><label>S %<input id="pickerS" type="number" min="0" max="100"></label><label>V %<input id="pickerV" type="number" min="0" max="100"></label><label>R<input id="pickerR" type="number" min="0" max="255"></label><label>G<input id="pickerG" type="number" min="0" max="255"></label><label>B<input id="pickerB" type="number" min="0" max="255"></label></div><button id="pickerUse" class="accent wide">設為前景色</button><button id="pickerSave" class="wide">加入工作色盤</button></div></div>
    </div><p id="studioFeedback" role="status" aria-live="polite">所有圖片與配色都在本機處理。</p></dialog>`);
  document.querySelector('.panel-tabs').insertAdjacentHTML('beforeend','<button data-panel="regions">區域</button>');
  $('inspector').insertAdjacentHTML('beforeend',`<div class="panel-body" data-page="regions" hidden><section><h2>自動區域區分</h2><p class="hint">分析目前圖層的相連色塊。這是色差分區，不會辨識人物或物件語意。</p><label class="block">色差容許值（每通道 0–255）<input id="regionTolerance" type="number" min="0" max="255" value="20"></label><label class="block">相鄰方式<select id="regionConnectivity"><option value="4">四向 · 保留對角分離</option><option value="8">八向 · 連接對角像素</option></select></label><button id="detectRegions" class="wide accent">分析並預覽區域</button><p id="regionInfo" class="hint">尚未分析。透明像素不計入。</p><label><input id="showRegions" type="checkbox"> 顯示區域色標 · 點畫布選區域</label><div id="regionList" class="region-list"></div><button id="paintRegion" class="wide" disabled>以前景色填入選定區域</button><button id="clearRegionPreview" class="wide">關閉區域預覽</button></section>
    <section><h2>自動描邊</h2><label class="block">位置<select id="outlineMode"><option value="outer">外輪廓 · 透明區域</option><option value="inner">內輪廓 · 物體內側</option><option value="regions">區域邊界 · 各色塊內側</option></select></label><div class="field-pair"><label>寬度 px<input id="outlineThickness" type="number" min="1" max="4" value="1"></label><label>描邊顏色<input id="outlineColor" type="color" value="#172c3c"></label></div><button id="outlineForeground" class="wide">使用前景色</button><p class="hint">沿用上方色差與相鄰設定。受畫布與矩形選區限制；套用後新增獨立圖層。</p><div class="compact-actions"><button id="previewOutline">預覽描邊</button><button id="cancelOutline">取消預覽</button></div><button id="applyOutline" class="wide accent" disabled>建立描邊圖層</button><p id="outlineInfo" class="hint">先預覽後套用。</p></section></div>`);
  const info=text=>{$('studioFeedback').textContent=text;api.message(text);};
  const saveColors=colors=>{const book=api.book();api.execute({op:'swatch.save',id:book.id,name:book.name,colors:[...new Set([...book.colors,...colors])]});info('已加入目前工作色盤。');};
  function tab(name){for(const b of document.querySelectorAll('[data-studio]')){b.classList.toggle('active',b.dataset.studio===name);b.setAttribute('aria-selected',String(b.dataset.studio===name));}for(const page of document.querySelectorAll('[data-studio-page]'))page.hidden=page.dataset.studioPage!==name;
    $('replaceScope').textContent=`目前圖層：${api.project().layers.find(l=>l.id===api.project().activeLayerId).name} · ${api.selection()?'只替換矩形選區':'整個圖層'}`;
    if(name==='mix'){renderMixBook();updateMix();}
  }
  function open(name){if(analyzedSource!==api.project().source){analysis=null;$('sourceColors').replaceChildren();$('analysisInfo').textContent='尚未分析。';$('analysisSave').disabled=$('analysisAppend').disabled=true;}
    originalColor=api.color();hsv=rgbToHsv(parseColor(originalColor));drawPicker();tab(name);$('studioFeedback').textContent='所有圖片與配色都在本機處理。';$('studioDialog').showModal();}
  button.onclick=()=>open('analyze');picker.onclick=()=>open('picker');$('paletteExtract').onclick=()=>{open('analyze');$('analyzeSource').click();};$('studioClose').onclick=()=>$('studioDialog').close();
  document.querySelector('.studio-tabs').onclick=e=>{const b=e.target.closest('[data-studio]');if(b)tab(b.dataset.studio);};
  $('analyzeSource').onclick=()=>run(()=>{analysis=analyzeSource(api.project().source,Number($('analysisCount').value));analyzedSource=api.project().source;
    $('analysisInfo').textContent=`${analysis.colors.length} 個主要色 · ${analysis.estimated?'抽樣估計':'完整分析'} ${analysis.samples.toLocaleString()} / ${analysis.total.toLocaleString()} 像素 · 百分比以非透明取樣計算`;
    $('sourceColors').replaceChildren(...analysis.colors.map(c=>{const tile=document.createElement('div');tile.className='source-color';const sw=document.createElement('button');sw.style.background=c.hex;sw.className='source-chip';sw.title=c.hex;sw.setAttribute('aria-label',`原圖色 ${c.hex}`);sw.onclick=()=>{api.setColor(c.hex);info(`前景色 ${c.hex.toUpperCase()}`);};
      const label=document.createElement('span');label.textContent=`${c.hex.toUpperCase()} · ${c.percent.toFixed(1)}%`;const actions=document.createElement('div');for(const key of ['A','B']){const b=document.createElement('button');b.textContent=`設為 ${key}`;b.onclick=()=>{$('mix'+key).value=c.hex;updateMix();info(`已將 ${c.hex.toUpperCase()} 指定為 ${key}，可切換「混色與替換」。`);};actions.append(b);}tile.append(sw,label,actions);return tile;}));
    $('analysisSave').disabled=$('analysisAppend').disabled=!analysis.colors.length;
    if(!analysis.colors.length)info('原圖完全透明，沒有可擷取顏色。');
  });
  $('analysisSave').onclick=()=>run(()=>{api.execute({op:'swatch.save',name:$('analysisName').value.trim(),colors:analysis.colors.map(c=>c.hex)});info('已建立並選取原圖工作色盤。');});
  $('analysisAppend').onclick=()=>run(()=>saveColors(analysis.colors.map(c=>c.hex)));
  $('analysisCount').onchange=()=>{$('analyzeSource').click();};
  const mixed=()=>toHex(mixRgb(parseColor($('mixA').value),parseColor($('mixB').value),Number($('mixPercent').value)));
  function renderMixBook(){const book=api.book();$('mixBookName').textContent=book.name;$('mixBookColors').replaceChildren(...book.colors.map(hex=>{const b=document.createElement('button');b.style.background=hex;b.title=hex;b.setAttribute('aria-label',`混色工作色卡 ${hex}`);b.onclick=()=>{$('mix'+$('mixBookTarget').value).value=hex;updateMix();};return b;}));}
  function updateMatches(){const p=api.project(),px=activePixels(p),r=api.selection()??{x:0,y:0,width:p.width,height:p.height},t=Number($('replaceTolerance').value),from=[$('mixA').value,...($('replaceMode').value==='both-mix'?[$('mixB').value]:[])].map(parseColor);let count=0;
    for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){const i=(y*p.width+x)*4;if(px[i+3]&&from.some(c=>c.slice(0,3).every((v,k)=>Math.abs(v-px[i+k])<=t)))count++;}
    $('replaceMatches').textContent=count?`預計匹配 ${count} 個像素`:'沒有匹配像素。原圖分析色與重建色可能不同，可提高容許值或從畫布吸色。';
  }
  function updateMix(){const hex=mixed();$('mixResult').style.background=hex;$('mixResult').setAttribute('aria-label',`混合色 ${hex}`);$('mixHex').textContent=hex.toUpperCase();$('mixPercentLabel').textContent=$('mixPercent').value+'%';updateMatches();}
  $('replaceMode').onchange=$('replaceTolerance').oninput=updateMatches;
  for(const id of ['mixA','mixB','mixPercent'])$(id).oninput=updateMix;
  for(const k of ['A','B'])$('foreground'+k).onclick=()=>{$('mix'+k).value=api.color();updateMix();};
  $('mixResult').onclick=$('mixUse').onclick=()=>{api.setColor(mixed());info('混合色已設為前景色。');};
  $('mixSave').onclick=()=>run(()=>{api.execute({op:'palette.mix',a:$('mixA').value,b:$('mixB').value,percent:Number($('mixPercent').value)});info('混合色已加入工作色盤。');});
  $('mergeSwatches').onclick=()=>run(()=>{api.execute({op:'swatch.replace',from:[$('mixA').value,$('mixB').value],color:mixed()});info('工作色盤中的 A / B 已合併為混合色，畫布尚未變更。');});
  $('replaceSwatch').onclick=()=>run(()=>{api.execute({op:'swatch.replace',from:[$('mixA').value],color:$('mixB').value});info('工作色盤中的 A 已替換為 B，畫布尚未變更。');});
  $('replaceColor').onclick=()=>run(()=>{const mode=$('replaceMode').value;api.execute({op:'color.replace',from:mode==='both-mix'?[$('mixA').value,$('mixB').value]:[$('mixA').value],color:mode==='a-b'?$('mixB').value:mixed(),tolerance:Number($('replaceTolerance').value),region:api.selection()});info('已替換目前圖層／選區的顏色，可用復原還原。');});
  for(const preset of PRESET_PALETTES){const card=document.createElement('article');card.className='preset-card';const h=document.createElement('h3');h.textContent=preset.name;const sw=document.createElement('div');sw.className='preset-swatches';for(const hex of preset.colors){const b=document.createElement('button');b.style.background=hex;b.title=hex;b.setAttribute('aria-label',`${preset.name} ${hex}`);b.onclick=()=>{api.setColor(hex);info(`前景色 ${hex.toUpperCase()}`);};sw.append(b);}const b=document.createElement('button');b.textContent='建立副本';b.setAttribute('aria-label',`建立 ${preset.name} 副本`);b.onclick=()=>run(()=>{api.execute({op:'swatch.save',name:preset.name,colors:preset.colors});info(`已建立 ${preset.name}，可在主面板繼續編輯。`);});card.append(h,sw,b);$('presetGallery').append(card);}
  function drawPicker(){const [h,s,v]=hsv,hex=toHex(hsvToRgb(...hsv)),canvas=$('svCanvas'),ctx=canvas.getContext('2d');
    ctx.fillStyle=toHex(hsvToRgb(h,100,100));ctx.fillRect(0,0,canvas.width,canvas.height);let g=ctx.createLinearGradient(0,0,canvas.width,0);g.addColorStop(0,'white');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);g=ctx.createLinearGradient(0,0,0,canvas.height);g.addColorStop(0,'#00000000');g.addColorStop(1,'black');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.beginPath();ctx.arc(s/100*canvas.width,(1-v/100)*canvas.height,5,0,Math.PI*2);ctx.strokeStyle='black';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='white';ctx.lineWidth=1;ctx.stroke();
    $('oldColor').style.background=originalColor;$('newColor').style.background=hex;$('pickerHex').value=hex.toUpperCase();$('hueSlider').value=h;
    ['H','S','V'].forEach((k,i)=>$('picker'+k).value=Math.round(hsv[i]));['R','G','B'].forEach((k,i)=>$('picker'+k).value=hsvToRgb(...hsv)[i]);
  }
  const svEvent=e=>{const r=$('svCanvas').getBoundingClientRect();hsv[1]=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));hsv[2]=Math.max(0,Math.min(100,100-(e.clientY-r.top)/r.height*100));drawPicker();};
  $('svCanvas').onpointerdown=e=>{if(e.button!==0)return;$('svCanvas').setPointerCapture(e.pointerId);svEvent(e);};$('svCanvas').onpointermove=e=>{if($('svCanvas').hasPointerCapture(e.pointerId))svEvent(e);};$('svCanvas').onpointerup=e=>{if($('svCanvas').hasPointerCapture(e.pointerId))$('svCanvas').releasePointerCapture(e.pointerId);};
  $('hueSlider').oninput=()=>{hsv[0]=Number($('hueSlider').value);drawPicker();};
  for(const type of ['HSV','RGB'])for(const k of type){$('picker'+k).oninput=()=>{const fields=[...type].map(c=>$('picker'+c)),v=fields.map(f=>Number(f.value)),max=type==='HSV'?[359,100,100]:[255,255,255];if(fields.some(f=>f.value==='')||v.some((n,i)=>!Number.isFinite(n)||n<0||n>max[i]||!Number.isInteger(n)))return;hsv=type==='HSV'?v:rgbToHsv(v);drawPicker();};$('picker'+k).onchange=()=>{drawPicker();};}
  $('pickerHex').oninput=()=>{if(/^#[0-9a-f]{6}$/i.test($('pickerHex').value)){hsv=rgbToHsv(parseColor($('pickerHex').value));drawPicker();}};$('pickerHex').onchange=()=>{if(!/^#[0-9a-f]{6}$/i.test($('pickerHex').value))info('請輸入完整 #RRGGBB 色碼。');drawPicker();};
  $('pickerUse').onclick=()=>{api.setColor(toHex(hsvToRgb(...hsv)));info('自訂顏色已設為前景色。');};$('pickerSave').onclick=()=>run(()=>saveColors([toHex(hsvToRgb(...hsv))]));
  function clear(){segments=null;picked=-1;outline=null;$('showRegions').checked=false;$('regionList').replaceChildren();$('paintRegion').disabled=true;$('applyOutline').disabled=true;$('regionInfo').textContent='尚未分析，或圖層已變更。';$('outlineInfo').textContent='先預覽後套用。';if($('studioDialog').open){renderMixBook();updateMatches();}}
  const options=()=>({tolerance:Number($('regionTolerance').value),connectivity:Number($('regionConnectivity').value)});
  const outlineCommand=()=>({op:'outline.auto',...options(),mode:$('outlineMode').value,thickness:Number($('outlineThickness').value),color:$('outlineColor').value,region:api.selection()});
  function pickRegion(id){picked=id;$('paintRegion').disabled=id<0;for(const b of $('regionList').children)b.classList.toggle('active',Number(b.dataset.id)===id);$('regionInfo').textContent=id<0?'透明處不屬於區域。':`共 ${segments.regions.length} 個區域 · 已選 #${id+1}，${segments.regions[id].area} px`;api.render();}
  $('detectRegions').onclick=()=>run(()=>{const p=api.project();segments=segmentRegions(activePixels(p),p.width,p.height,options());picked=-1;outline=null;$('applyOutline').disabled=true;$('paintRegion').disabled=true;$('showRegions').checked=true;
    $('regionList').replaceChildren(...[...segments.regions].sort((a,b)=>b.area-a.area).slice(0,100).map(r=>{const b=document.createElement('button');b.textContent=`#${r.id+1} · ${r.area} px`;b.dataset.id=r.id;b.style.borderLeft=`5px solid ${toHex(r.color)}`;b.onclick=()=>pickRegion(r.id);return b;}));$('regionInfo').textContent=`找到 ${segments.regions.length} 個區域；列表顯示最大的 100 個，亦可點畫布選取。`;api.render();});
  $('resultCanvas').addEventListener('pointerdown',e=>{if(!segments||!$('showRegions').checked||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const rect=$('resultCanvas').getBoundingClientRect(),p=api.project();const x=Math.max(0,Math.min(p.width-1,Math.floor((e.clientX-rect.left)/rect.width*p.width))),y=Math.max(0,Math.min(p.height-1,Math.floor((e.clientY-rect.top)/rect.height*p.height)));pickRegion(segments.labels[y*p.width+x]);},true);
  $('paintRegion').onclick=()=>run(()=>{if(picked<0)return;const seed=segments.regions[picked].seed;api.execute({op:'region.paint',...options(),...seed,color:api.color(),region:api.selection()});api.message('已填入選定區域，可復原。');});
  $('showRegions').onchange=()=>{if($('showRegions').checked&&!segments)$('detectRegions').click();else api.render();};$('clearRegionPreview').onclick=()=>{$('showRegions').checked=false;api.render();};
  for(const id of ['regionTolerance','regionConnectivity','outlineMode','outlineThickness','outlineColor'])$(id).addEventListener('input',()=>{clear();api.render();});
  $('outlineForeground').onclick=()=>{$('outlineColor').value=api.color();clear();api.render();};
  $('previewOutline').onclick=()=>run(()=>{const p=api.project(),c=outlineCommand(),l=p.layers.find(l=>l.id===p.activeLayerId);if(l.locked||!l.visible)throw Error('請先顯示並解鎖目前圖層');if(p.layers.length>=16)throw Error('最多 16 個圖層');
    const pixels=outlinePixels(activePixels(p),p.width,p.height,{...c,rgb:parseColor(c.color)}),count=pixels.filter((v,i)=>i%4===3&&v).length;if(!count)throw Error('沒有可描邊像素；外描邊需要畫布內的透明空間');outline={pixels,command:structuredClone(c)};$('showRegions').checked=false;$('applyOutline').disabled=false;$('outlineInfo').textContent=`預覽 ${count} 個描邊像素 · 尚未套用`;api.render();});
  $('cancelOutline').onclick=()=>{outline=null;$('applyOutline').disabled=true;$('outlineInfo').textContent='預覽已取消。';api.render();};
  $('applyOutline').onclick=()=>run(()=>{if(outline)api.execute(outline.command);api.message('已建立獨立描邊圖層，可調整透明度或復原。');});
  updateMix();
  return {invalidate:clear, pixels(p,base){
    if(outline){const layers=p.layers.slice(),id='preview';layers.splice(layers.findIndex(l=>l.id===p.activeLayerId)+1,0,{id,visible:true,opacity:1});base=composite({...p,layers,frames:[{...p.frames[0],cels:{...p.frames[0].cels,[id]:outline.pixels}}]});}
    if(segments&&$('showRegions').checked){base=base.slice();const colors=segments.regions.map(r=>hsvToRgb((r.id*137.508)%360,65,95));for(let i=0;i<segments.labels.length;i++){const id=segments.labels[i];if(id<0)continue;const color=id===picked?[255,255,255]:colors[id];for(let k=0;k<3;k++)base[i*4+k]=Math.round(base[i*4+k]*.3+color[k]*.7);base[i*4+3]=255;}}
    return base;
  }};
}
