/* Public playing styles inform the design; all ratings below are game values. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PingCharacters=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const AXES=Object.freeze([['attack','进攻'],['spin','旋转'],['defense','防守'],['speed','速度'],['control','控制'],['variation','变化']]);
  const entries=[
    ['ma-long','马龙','ML','中国','right','横拍','balanced','全面衔接、正手进攻与落点控制。','https://tabletennis.guide/player/long-ma'],
    ['fan-zhendong','樊振东','FZD','中国','right','横拍','aggressive','两面强攻，快速对抗与稳健反击。','https://www.butterfly-global.com/en/product/fan-zhendong/'],
    ['wang-chuqin','王楚钦','WCQ','中国','left','横拍','aggressive','左手抢攻，发接发与近台衔接。','https://tabletennis.guide/player/chuqin-wang'],
    ['xu-xin','许昕','XX','中国','left','直拍','balanced','直拍弧圈，侧旋变化与大范围调动。','https://www.stigasports.com/en/players-teams-tt/xu-xin'],
    ['zhang-jike','张继科','ZJK','中国','right','横拍','aggressive','反手起板，旋转与爆发衔接。','https://tabletennis.guide/player/jike-zhang'],
    ['lin-gaoyuan','林高远','LGY','中国','left','横拍','balanced','左手快节奏，近台两面连续。','https://tabletennis.guide/player/gaoyuan-lin'],
    ['liang-jingkun','梁靖崑','LJK','中国','right','横拍','aggressive','厚实两面进攻，中近台力量对抗。','https://tabletennis.guide/player/jingkun-liang'],
    ['harimoto','张本智和','TH','日本','right','横拍','aggressive','近台快速反手，抢先衔接与反击。','https://www.butterfly.co.jp/players/detail/harimoto-tomokazu.html'],
    ['lin-yun-ju','林昀儒','LYJ','中华台北','left','横拍','balanced','左手拧拉，细腻触球与快速反击。','https://www.butterfly-global.com/en/product/lin_yun-ju/'],
    ['moregard','莫雷加德','TM','瑞典','right','横拍','balanced','节奏变化，灵活封挡与多样落点。','https://www.stigasports.com/en/players-teams-tt/truls-moregardh']
  ];
  // Representative public equipment, rather than a claim about today's
  // custom competition blade. Sources and dates are recorded in 选手资料.html.
  const BLADES=Object.freeze({
    w968:{name:'DHS W968 / 狂飚龙5',brand:'DHS',shape:'classic',stripe:'#445b48',accent:'#dbad65',wood:'#d9bd87',label:'W968',layers:7},
    fzd:{name:'Butterfly 樊振东 ALC',brand:'BUTTERFLY',shape:'classic',stripe:'#4e72a0',accent:'#9cb8d4',wood:'#d9bf96',label:'FAN ZHENDONG',layers:7},
    q968:{name:'DHS Q968',brand:'DHS',shape:'attack',stripe:'#425fa2',accent:'#b7c4dc',wood:'#d5b584',label:'Q968',layers:7},
    dynasty:{name:'STIGA Dynasty Carbon 许昕版',brand:'STIGA',shape:'classic',stripe:'#344e67',accent:'#be9860',wood:'#d6b783',label:'DYNASTY CARBON',layers:7},
    zjk:{name:'Butterfly Viscaria · 张继科代表装备',brand:'BUTTERFLY',shape:'classic',stripe:'#547287',accent:'#acb5bc',wood:'#dac099',label:'VISCARIA',layers:7},
    lgy:{name:'远鉴 干将 AL-carbon · 资料参考',brand:'YUANJIAN',shape:'classic',stripe:'#467d83',accent:'#a5c4bd',wood:'#d9bf96',label:'GANJIANG',layers:7},
    club:{name:'专业木纹拍 · 自定义外观',brand:'PING CLUB',shape:'classic',stripe:'#654a44',accent:'#cfb27a',wood:'#d9b886',label:'CLUB SERIES',layers:7},
    harimoto:{name:'Butterfly 张本智和 Innerforce SUPER ALC',brand:'BUTTERFLY',shape:'attack',stripe:'#773c49',accent:'#ccb2b8',wood:'#dcc09c',label:'HARIMOTO',layers:7},
    viscaria:{name:'Butterfly Viscaria SUPER ALC',brand:'BUTTERFLY',shape:'classic',stripe:'#47778a',accent:'#a2c8cd',wood:'#d6bb8e',label:'VISCARIA',layers:7},
    cybershape:{name:'STIGA Cybershape Carbon Truls版',brand:'STIGA',shape:'cybershape',stripe:'#425b44',accent:'#c6b16e',wood:'#d8bb83',label:'CYBERSHAPE',layers:7}
  });
  const DEFAULT_BLADES=Object.freeze({'ma-long':'w968','fan-zhendong':'fzd','wang-chuqin':'q968','xu-xin':'dynasty','zhang-jike':'zjk','lin-gaoyuan':'lgy','liang-jingkun':'club',harimoto:'harimoto','lin-yun-ju':'viscaria',moregard:'cybershape'});
  function blade(id,override='auto') { const key=BLADES[override]?override:DEFAULT_BLADES[get(id).id];return {id:key,...BLADES[key]}; }
  // Every profile spends the same six-point budget. These are deliberately
  // exaggerated game identities, not measured abilities or real-world ranks.
  const identities={
    'ma-long':[[1.05,1.06,.99,.72,1.43,.75],'精准控场','极限追球较慢','六边形控场','连续第 2 拍起，拍心准确接球并向前挥拍','#e9d18a','precision'],
    'fan-zhendong':[[1.43,1.02,1.28,.78,.74,.75],'重炮对抗','小角度变化较少','重炮连击','连续第 2 拍起，准确快速前挥','#f49b66','pressure'],
    'wang-chuqin':[[1.27,1.06,.72,1.43,.76,.76],'高速抢攻','偏心接球容错较小','王之爆冲','本分首次回球，用正手拍心接球并快速前挥','#efb25a','rush'],
    'xu-xin':[[.75,1.45,1.28,.77,.80,.95],'强旋大范围','直线球速偏慢','云端弧线','拍心接准，向前同时明显横向擦拍','#83d3b5','curve'],
    'zhang-jike':[[1.17,1.39,.82,.92,.72,.98],'反手强拧','偏心触球较难控制','霸王拧','近台反手拍心接球，快速斜向擦拍','#c3a0ef','flick'],
    'lin-gaoyuan':[[.78,1.00,.74,1.45,1.16,.87],'快速衔接','强攻力量偏低','闪电衔接','本分第二次回球起，近台拍心接球并快速前挥','#94d6d2','quick'],
    'liang-jingkun':[[1.45,1.03,1.30,.65,.80,.77],'厚重力量','大范围移动较慢','厚重弧圈','拍心接准，大力向前挥拍','#f3a18d','heavy'],
    harimoto:[[.96,.76,1.04,1.45,1.05,.74],'迎前快拨','旋转变化偏少','迎前快拨','近台迎前，在球落台后约 0.3 秒内用拍心快速接回','#e4be77','early'],
    'lin-yun-ju':[[.76,1.40,.69,1.12,1.24,.79],'细腻拧拉','接球范围较小','冷静拧拉','近台反手拍心接准，斜向擦拍','#9dc6f4','touch'],
    moregard:[[.71,.78,1.14,.93,.99,1.45],'节奏变线','直接强攻偏慢','魔术变线','连续回球时，用拍心横擦，将球打向上一拍的另一侧','#d9c783','change']
  };
  const PROFILES=Object.freeze(Object.fromEntries(Object.entries(identities).map(([id,[values,strength,weakness,signature,trigger,color,style]])=>[id,Object.freeze({multipliers:Object.freeze(Object.fromEntries(AXES.map(([key],i)=>[key,values[i]]))),strength,weakness,signature,trigger,color,style})])));
  const profile=id=>PROFILES[get(id).id];
  const TACTICS=Object.freeze({
    'ma-long':{short:.22,body:.22,wide:.85,pace:1,near:-1.48},
    'fan-zhendong':{short:.06,body:.32,wide:.88,pace:1.06,near:-1.47},
    'wang-chuqin':{short:.12,body:.18,wide:1.02,pace:1.04,near:-1.30},
    'xu-xin':{short:.30,body:.10,wide:1.12,pace:.93,near:-1.62},
    'zhang-jike':{short:.18,body:.20,wide:1.02,pace:1.03,near:-1.33},
    'lin-gaoyuan':{short:.12,body:.18,wide:.92,pace:1.06,near:-1.28},
    'liang-jingkun':{short:.06,body:.36,wide:.82,pace:1.04,near:-1.60},
    harimoto:{short:.08,body:.25,wide:.90,pace:1.08,near:-1.24},
    'lin-yun-ju':{short:.30,body:.15,wide:1.03,pace:.98,near:-1.32},
    moregard:{short:.42,body:.12,wide:1.15,pace:.94,near:-1.46}
  });
  const tactics=id=>TACTICS[get(id).id];

  // Playable identities rather than additional points on the rating chart.
  // Reach here describes a visual swing, not a larger collision volume.
  const PLAY = Object.freeze({
    'ma-long':       ['稳住选定的线路', '拍心打准后更容易守住选定的落点。', '长短交替，再打开空当。', .38,1.00,1.12,.92,1.0,'#485e55'],
    'fan-zhendong':  ['借快球反压', '正面接住快球时更容易借力打深。', '用深球压住对手身体，再抢第二拍。', .34,1.13,1.02,1.10,.86,'#664638'],
    'wang-chuqin':   ['前三板抢攻', '发接发后的第一拍正手更容易提速。', '接发后找开阔斜线，主动抢攻。', .33,1.08,1.18,.92,1.08,'#475b72'],
    'xu-xin':       ['侧旋拉开角度', '主动横擦时，外拐和斜线比直线强攻更有威胁。', '偏爱大角度侧旋斜线。', .43,.96,1.36,1.14,1.32,'#345e55'],
    'zhang-jike':   ['反手拧起低球', '近台反手横擦低球，更容易打出带侧旋的上旋球。', '遇到近台低球，优先反手起板。', .31,.91,.87,1.24,1.24,'#59536b'],
    'lin-gaoyuan':  ['近台连续快压', '第二拍起，近台接准能保持快节奏。', '连拍保持偏深，不让对手站稳。', .28,.89,1.00,.82,.92,'#3c606a'],
    'liang-jingkun':['扎实正面重拉', '有时间站稳强挥时，更容易把球压深。', '站定后以上旋深球顶住底线。', .44,1.17,.86,1.21,.84,'#754c45'],
    harimoto:       ['抢上升点', '近台迎接刚弹起的球，能打出更平、更早的快拨。', '贴近台面抢节奏，被顶退后以稳回为主。', .26,.83,.78,.72,.86,'#5c5340'],
    'lin-yun-ju':   ['轻拧小角度', '近台反手以中等力量轻拧，短斜线更容易压住。', '优先用短侧旋将对手拉进台内。', .30,.80,1.11,.88,1.19,'#4c596e'],
    moregard:       ['控节奏后变线', '连续回球改打另一侧时，能更轻地拉开角度。', '观察上一拍与对手移动，突然反向变线。', .37,.89,1.20,.81,1.08,'#655b43']
  });
  const styles = Object.freeze(Object.fromEntries(Object.entries(PLAY).map(([id,[label,play,ai,duration,drive,sweep,lift,wrist,kit]])=>
    [id,Object.freeze({label,play,ai,motion:Object.freeze({ duration,drive,sweep,lift,wrist,kit })})])));
  const style=id=>styles[get(id).id];

  // At impact: continuous blend and a real target/spin change. No input
  // offsets, ball steering, increased hit volume or forced scoring.
  function strokeTrait(id,c) {
    const t=(lo,hi,v)=>{ const p=Math.max(0,Math.min(1,(v-lo)/(hi-lo))); return p*p*(3-2*p); };
    const clean=1-t(.22,.64,c.contact), near=1-t(1.22,1.58,c.z), power=t(1.1,3.6,c.power), brush=t(.65,2.6,Math.abs(c.brush));
    switch(profile(id).style) {
      case 'precision': return { control: 1+.08*clean*power };
      case 'pressure': return { depth: .18*clean*power*t(3.2,6.6,c.incoming), pace: 1+.07*clean*t(3.2,6.6,c.incoming) };
      case 'rush': return { depth: .09*clean*power, pace: 1+.10*clean*power*Number(!c.backhand&&!c.hits) };
      case 'curve': return { side: 1+.26*clean*brush, width: 1+.09*clean*brush };
      case 'flick': return c.backhand ? { top: 35*clean*near*brush*(1-t(.94,1.26,c.height)), side: 1+.12*near*brush } : {};
      case 'quick': return { pace: 1+.10*clean*near*power*Number(c.hits>0) };
      case 'heavy': return { depth: .14*clean*t(3,5,c.power), top: 29*clean*t(3,5,c.power) };
      case 'early': { const take=near*clean*power*(1-t(.16,.32,c.age));return { depth:.16*take, pace:1+.12*take }; }
      case 'touch': { const touch=near*clean*brush*Number(c.backhand)*(1-t(3.6,5,c.power));return { depth:-.18*touch, side:1+.26*touch }; }
      case 'change': { const turn=clean*brush*t(.03,.16,-c.targetX*c.previousX);return { depth:-.16*turn, width:1+.20*turn, pace:1-.07*turn }; }
      default: return {};
    }
  }

  function chooseTactic(id,c) {
    const {roll,hitCount,previousX,previousDepth,open,body,direction,near,early,low,incoming,backhand}=c;
    switch(profile(id).style) {
      case 'precision': return roll>.28 ? (previousDepth>.78 ? {x:open*.65,z:.52,pace:.87} : {x:open*.86,z:1.08}) : null;
      case 'pressure': return roll<.64 ? {x:body*.88,z:1.11,pace:incoming>4?1.085:1.03} : null;
      case 'rush': return !hitCount&&roll>.27 ? {x:open,z:.99,pace:1.055,side:direction*46} : null;
      case 'curve': return roll>.24 ? {x:open,z:.85,pace:.86,side:direction*107,top:72} : null;
      case 'flick': return backhand&&near&&low&&roll>.25 ? {x:open*.82,z:.87,side:direction*66,top:116} : null;
      case 'quick': return near&&hitCount>0&&roll>.24 ? {x:body*.30+open*.70,z:1.04,pace:1.09,top:73} : null;
      case 'heavy': return !low&&roll>.22 ? {x:open*.65,z:1.16,pace:1.09,top:158} : null;
      case 'early': return near&&early&&roll>.22 ? {x:open*.86,z:1.08,pace:1.13,top:57} : null;
      case 'touch': return backhand&&near&&roll>.25 ? {x:open*.89,z:.48,pace:.78,side:direction*72,top:60} : null;
      case 'change': return hitCount&&roll>.23 ? {x:previousX>0?-Math.abs(open):Math.abs(open),z:previousDepth>.77?.53:1.02,pace:.85} : null;
      default: return null;
    }
  }

  const SIGNATURE_SHOTS = Object.freeze({
    precision:{pace:1.02,control:1.12,aim:.88,shape:'锁定选定落点'},
    pressure:{pace:1.10,depth:1.18,depthMix:.78,top:40,shape:'借力顶向底线'},
    rush:{pace:1.16,depth:1.02,depthMix:.49,width:1.10,top:46,shape:'第一板快速斜线'},
    curve:{pace:.89,depth:.86,depthMix:.55,width:1.21,side:1.60,shape:'侧旋外拐大角度'},
    flick:{pace:1.04,depth:.86,depthMix:.55,top:88,side:1.32,shape:'反手拧出侧上旋'},
    quick:{pace:1.10,depth:1.01,depthMix:.70,top:22,side:.76,shape:'近台连拍快压'},
    heavy:{pace:1.01,depth:1.18,depthMix:.86,top:92,side:.67,shape:'重上旋压向底线'},
    early:{pace:1.16,depth:1.04,depthMix:.72,top:20,side:.54,netMargin:.034,shape:'抢上升点打低平快球'},
    touch:{pace:.87,depth:.47,depthMix:.90,width:1.12,top:36,side:1.40,shape:'短斜线侧旋轻拧'},
    change:{pace:.89,depth:.63,depthMix:.73,width:1.24,control:1.07,shape:'减速反向拉开角度'}
  });
  const signatureShot=id=>SIGNATURE_SHOTS[profile(id).style];
  function signature(id,c) {
    if(c.used||!c.legal||c.contact>.38)return null;
    const p=profile(id),forward=c.power>=3.2,brush=Math.abs(c.brush)>=1.5;
    const ready={
      precision:c.hits>=1&&c.power>=1.5&&c.contact<.22,
      pressure:c.hits>=1&&c.power>=3.8,
      rush:c.hits===0&&c.power>=4.1&&!c.backhand&&c.z>=1.2,
      curve:forward&&brush,
      flick:c.backhand&&c.z<1.45&&forward&&brush,
      quick:c.hits>=1&&c.z<1.42&&c.power>=3.8,
      heavy:c.power>=4.7,
      early:c.z<1.36&&c.power>=3.4&&(c.age??0)<.30,
      touch:c.backhand&&c.z<1.45&&c.power>=2.8&&brush,
      change:c.hits>=1&&brush&&c.targetX*c.previousX<-.08
    }[p.style];
    if(!ready)return null;
    return {name:p.signature,color:p.color,...SIGNATURE_SHOTS[p.style]};
  }
  const ROSTER=Object.freeze(entries.map(([id,name,initials,region,hand,grip,tactic,bio,source])=>Object.freeze({id,name,initials,region,hand,grip,tactic,bio,source,portrait:`assets/portraits/${id}.webp`,attributes:Object.freeze(Object.fromEntries(AXES.map(([key])=>[key,Math.round(40+(PROFILES[id].multipliers[key]-.65)*75)])))})));
  const BY_ID=Object.freeze(Object.fromEntries(ROSTER.map(p=>[p.id,p])));
  const get=id=>BY_ID[id]||BY_ID['ma-long'];
  function equipment(id, overrides={}) {
    const p=get(id);
    return {hand:['left','right'].includes(overrides.hand)?overrides.hand:p.hand,
      grip:['shakehand','penhold'].includes(overrides.grip)?overrides.grip:p.grip==='直拍'?'penhold':'shakehand'};
  }
  function pair(player='ma-long',ai='fan-zhendong') {player=BY_ID[player]?player:'ma-long';ai=BY_ID[ai]?ai:'fan-zhendong';if(player===ai)ai=ROSTER.find(p=>p.id!==player).id;return {player,ai};}
  const modifier=(id,key)=>profile(id).multipliers[key]||1;
  const rating=(id,key)=>Math.round(40+(modifier(id,key)-.65)*75);
  return {AXES,ROSTER,BY_ID,BLADES,PROFILES,get,pair,modifier,rating,equipment,blade,profile,tactics,style,strokeTrait,chooseTactic,signatureShot,signature};
});
