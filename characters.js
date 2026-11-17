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
    'wang-chuqin':[[1.27,1.06,.72,1.43,.76,.76],'高速抢攻','偏心接球容错较小','王之爆冲','正手拍心接球，快速向前爆发挥拍','#efb25a','rush'],
    'xu-xin':[[.75,1.45,1.28,.77,.80,.95],'强旋大范围','直线球速偏慢','云端弧线','拍心接准，向前同时明显横向擦拍','#83d3b5','curve'],
    'zhang-jike':[[1.17,1.39,.82,.92,.72,.98],'反手强拧','偏心触球较难控制','霸王拧','近台反手拍心接球，快速斜向擦拍','#c3a0ef','flick'],
    'lin-gaoyuan':[[.78,1.00,.74,1.45,1.16,.87],'快速衔接','强攻力量偏低','闪电衔接','近台拍心接球，快速向前挥拍','#94d6d2','quick'],
    'liang-jingkun':[[1.45,1.03,1.30,.65,.80,.77],'厚重力量','大范围移动较慢','厚重弧圈','拍心接准，大力向前挥拍','#f3a18d','heavy'],
    harimoto:[[.96,.76,1.04,1.45,1.05,.74],'迎前快拨','旋转变化偏少','迎前快拨','迎前站位，拍心快速接回','#e4be77','early'],
    'lin-yun-ju':[[.76,1.40,.69,1.12,1.24,.79],'细腻拧拉','接球范围较小','冷静拧拉','近台反手拍心接准，斜向擦拍','#9dc6f4','touch'],
    moregard:[[.71,.78,1.14,.93,.99,1.45],'节奏变线','直接强攻偏慢','魔术变线','连续回球时，拍心打向上一拍另一侧','#d9c783','change']
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
  function signature(id,c) {
    if(c.used||!c.legal||c.contact>.38)return null;
    const p=profile(id),forward=c.power>=3.2,brush=Math.abs(c.brush)>=1.5;
    const ready={
      precision:c.hits>=1&&c.power>=1.5&&c.contact<.22,
      pressure:c.hits>=1&&c.power>=3.8,
      rush:c.power>=4.1&&!c.backhand&&c.z>=1.2,
      curve:forward&&brush,
      flick:c.backhand&&c.z<1.45&&forward&&brush,
      quick:c.z<1.42&&c.power>=3.8,
      heavy:c.power>=4.7,
      early:c.z<1.36&&c.power>=3.4,
      touch:c.backhand&&c.z<1.45&&c.power>=2.8&&brush,
      change:c.hits>=1&&brush&&c.targetX*c.previousX<-.08
    }[p.style];
    if(!ready)return null;
    const boosts={precision:[1.04,1.05,1.55],pressure:[1.12,1.08,1],rush:[1.15,1.14,1],curve:[1.02,1.24,1],flick:[1.08,1.24,1],quick:[1.12,1.04,1],heavy:[1.15,1.10,1],early:[1.13,1.03,1],touch:[1.04,1.23,1.2],change:[1.04,1.10,1.35]}[p.style];
    return {name:p.signature,color:p.color,speed:boosts[0],spin:boosts[1],control:boosts[2]};
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
  return {AXES,ROSTER,BY_ID,BLADES,PROFILES,get,pair,modifier,rating,equipment,blade,profile,tactics,signature};
});
