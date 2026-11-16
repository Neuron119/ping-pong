/* Public playing styles inform the design; all ratings below are game values. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PingCharacters=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const AXES=Object.freeze([['attack','进攻'],['spin','旋转'],['defense','防守'],['speed','速度'],['control','控制'],['variation','变化']]);
  const entries=[
    ['ma-long','马龙','ML','中国','right','横拍','balanced',[96,94,92,91,98,96],'全面衔接、正手进攻与落点控制。','https://tabletennis.guide/player/long-ma'],
    ['fan-zhendong','樊振东','FZD','中国','right','横拍','aggressive',[99,93,96,93,93,88],'两面强攻，快速对抗与稳健反击。','https://www.butterfly-global.com/en/product/fan-zhendong/'],
    ['wang-chuqin','王楚钦','WCQ','中国','left','横拍','aggressive',[96,96,87,98,90,95],'左手抢攻，发接发与近台衔接。','https://tabletennis.guide/player/chuqin-wang'],
    ['xu-xin','许昕','XX','中国','left','直拍','balanced',[93,99,88,94,91,99],'直拍弧圈，侧旋变化与大范围调动。','https://www.stigasports.com/en/players-teams-tt/xu-xin'],
    ['zhang-jike','张继科','ZJK','中国','right','横拍','aggressive',[98,96,92,93,90,91],'反手起板，旋转与爆发衔接。','https://tabletennis.guide/player/jike-zhang'],
    ['lin-gaoyuan','林高远','LGY','中国','left','横拍','balanced',[91,94,91,99,94,92],'左手快节奏，近台两面连续。','https://tabletennis.guide/player/gaoyuan-lin'],
    ['liang-jingkun','梁靖崑','LJK','中国','right','横拍','aggressive',[99,93,97,85,91,86],'厚实两面进攻，中近台力量对抗。','https://tabletennis.guide/player/jingkun-liang'],
    ['harimoto','张本智和','TH','日本','right','横拍','aggressive',[94,89,92,99,93,91],'近台快速反手，抢先衔接与反击。','https://www.butterfly.co.jp/players/detail/harimoto-tomokazu.html'],
    ['lin-yun-ju','林昀儒','LYJ','中华台北','left','横拍','balanced',[92,97,88,97,94,98],'左手拧拉，细腻触球与快速反击。','https://www.butterfly-global.com/en/product/lin_yun-ju/'],
    ['moregard','莫雷加德','TM','瑞典','right','横拍','balanced',[92,90,96,91,95,99],'节奏变化，灵活封挡与多样落点。','https://www.stigasports.com/en/players-teams-tt/truls-moregardh']
  ];
  const ROSTER=Object.freeze(entries.map(([id,name,initials,region,hand,grip,tactic,values,bio,source])=>Object.freeze({id,name,initials,region,hand,grip,tactic,bio,source,portrait:`assets/portraits/${id}.webp`,attributes:Object.freeze(Object.fromEntries(AXES.map(([key],i)=>[key,values[i]])))})));
  const BY_ID=Object.freeze(Object.fromEntries(ROSTER.map(p=>[p.id,p])));
  const get=id=>BY_ID[id]||BY_ID['ma-long'];
  function pair(player='ma-long',ai='fan-zhendong') {player=BY_ID[player]?player:'ma-long';ai=BY_ID[ai]?ai:'fan-zhendong';if(player===ai)ai=ROSTER.find(p=>p.id!==player).id;return {player,ai};}
  // Narrow, symmetric scaling keeps identity meaningful without replacing the
  // chosen AI difficulty. 85–99 ratings yield approximately 0.88–1.12 factors.
  const modifier=(id,key)=>Math.max(.88,Math.min(1.12,1+(get(id).attributes[key]-92)*.017));
  return {AXES,ROSTER,BY_ID,get,pair,modifier};
});
